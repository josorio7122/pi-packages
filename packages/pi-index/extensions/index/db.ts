import type { Connection, Table, OptimizeStats } from "@lancedb/lancedb";
import type { CodeChunk } from "./chunker.js";
import { VECTOR_INDEX_THRESHOLD } from "./constants.js";

/** Summary of the current database state returned by `IndexDB.getStatus`. */
export type DBStatus = {
  chunkCount: number;
};

// Lazy singleton import — same pattern as pi-memory's db.ts
let lancedbImportPromise: Promise<typeof import("@lancedb/lancedb")> | null = null;
const loadLanceDB = async (): Promise<typeof import("@lancedb/lancedb")> => {
  if (!lancedbImportPromise) lancedbImportPromise = import("@lancedb/lancedb");
  try {
    return await lancedbImportPromise;
  } catch (err) {
    lancedbImportPromise = null;
    throw new Error(`pi-index: failed to load LanceDB. ${String(err)}`, { cause: err });
  }
};

const TABLE_NAME = "chunks";

/**
 * Persistence layer for the codebase index, backed by LanceDB.
 *
 * Lazily connects to the database on first use and auto-creates the `chunks` table with
 * an FTS index if it does not already exist. All public methods are safe to call before
 * the first explicit initialisation — they call `ensureInitialized` internally.
 */
export class IndexDB {
  private db: Connection | null = null;
  private table: Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    try {
      return await this.initPromise;
    } catch (err) {
      this.initPromise = null; // allow retry on next operation
      throw err;
    }
  }

  private async doInitialize(): Promise<void> {
    const lancedb = await loadLanceDB();
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      // Bootstrap schema row then delete it
      const schemaRow: CodeChunk = {
        id: "__schema__",
        text: "",
        vector: Array.from({ length: this.vectorDim }, () => 0),
        filePath: "",
        chunkIndex: 0,
        startLine: 0,
        endLine: 0,
        language: "",
        extension: "",
        symbol: "",
        mtime: 0,
        createdAt: 0,
      };
      this.table = await this.db.createTable(TABLE_NAME, [schemaRow]);
      await this.table.delete('id = "__schema__"');

      // Create FTS index for hybrid search
      try {
        await this.table.createIndex("text", {
          config: lancedb.Index.fts(),
        });
      } catch {
        // FTS index creation may fail on newly empty tables in some LanceDB versions — not fatal
        // Hybrid search will fall back to vector-only if FTS is unavailable
      }
    }

    // Create BTREE scalar indexes for scope-filter acceleration.
    // Idempotent: LanceDB's default replace:true silently rebuilds if index exists (~4ms).
    // Best-effort: queries degrade to full scan if index creation fails.
    try {
      await this.table!.createIndex("filePath", { config: lancedb.Index.btree() });
      await this.table!.createIndex("language", { config: lancedb.Index.btree() });
      await this.table!.createIndex("extension", { config: lancedb.Index.btree() });
    } catch (err) {
      console.warn("[pi-index] scalar index creation skipped:", String(err));
    }
  }

  /**
   * Rebuild the full-text search index on the `text` column.
   *
   * Called after bulk inserts to keep hybrid search current. Failures are logged
   * as warnings but do not propagate — the system degrades gracefully to vector-only search.
   */
  async rebuildFtsIndex(): Promise<void> {
    await this.ensureInitialized();
    const lancedb = await loadLanceDB();
    try {
      await this.table!.createIndex("text", {
        config: lancedb.Index.fts(),
        replace: true,
      });
    } catch (err) {
      // FTS rebuild is best-effort — log but don't fail the indexing operation
      console.warn(
        "[pi-index] FTS index rebuild failed (hybrid search may be degraded):",
        String(err),
      );
    }
  }

  /**
   * Insert an array of fully-embedded chunks into the database.
   *
   * A no-op when `chunks` is empty. All chunks must have their `vector` field populated
   * before calling this method.
   *
   * @param chunks - Chunks to insert (must include non-empty `vector` arrays)
   */
  async insertChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.ensureInitialized();
    await this.table!.add(chunks);
  }

  /**
   * Delete all chunks whose `filePath` matches the given relative path.
   *
   * A no-op when no matching chunks exist (LanceDB `delete` is idempotent).
   *
   * @param filePath - Relative file path (as stored in the `filePath` column)
   */
  async deleteByFilePath(filePath: string): Promise<void> {
    await this.ensureInitialized();
    const escaped = filePath.replace(/'/g, "''");
    await this.table!.delete(`filePath = '${escaped}'`);
  }

  /**
   * Drop and recreate the `chunks` table, erasing all indexed data.
   *
   * Used for forced full rebuilds. After this call the table is empty and the
   * FTS index is recreated by the next call to `rebuildFtsIndex`.
   */
  async deleteAll(): Promise<void> {
    await this.ensureInitialized();
    // Drop and recreate — cleanest way to reset
    await this.db!.dropTable(TABLE_NAME);
    this.table = null;
    this.initPromise = null;
    await this.ensureInitialized();
  }

  /**
   * Run a pure vector-similarity search and return scored results.
   *
   * Scores are normalized to `[0, 1]` relative to the best result in the batch so that
   * thresholds behave consistently with `hybridSearch`.
   *
   * @param queryVector - Embedding vector for the query (must match the table's vector dimension)
   * @param limit - Maximum number of results to return
   * @param filter - Optional SQL WHERE clause to restrict results (e.g. `"language = 'python'"`)
   * @returns Chunks sorted by descending similarity with a `score` field in `[0, 1]`
   */
  async vectorSearch(
    queryVector: number[],
    limit: number,
    filter?: string,
  ): Promise<(CodeChunk & { score: number })[]> {
    await this.ensureInitialized();
    let q = this.table!.vectorSearch(queryVector).limit(limit);
    if (filter) q = q.where(filter) as typeof q;
    const rows = (await q.toArray()) as (CodeChunk & { _distance?: number })[];
    // Compute raw scores, then normalize relative to the best result so that
    // scores span [0, 1] with the same semantics as hybridSearch's RRF normalization.
    // This ensures minScore thresholds behave consistently across both paths.
    const rawScores = rows.map((row) => {
      const distance = row._distance ?? 0;
      return 1 / (1 + distance);
    });
    const maxScore = rawScores.length > 0 ? Math.max(...rawScores) : 1;
    return rows.map((row, i) => ({
      ...row,
      score: maxScore > 0 ? rawScores[i] / maxScore : rawScores[i],
    }));
  }

  /**
   * Run a hybrid vector + full-text search using LanceDB's RRF reranker.
   *
   * Combines dense vector similarity with BM25-style FTS scoring. Automatically falls
   * back to pure `vectorSearch` if the FTS index is unavailable or the hybrid query fails.
   * RRF relevance scores are normalized to `[0, 1]`.
   *
   * @param queryVector - Embedding vector for the query
   * @param queryText - Raw text used for FTS matching
   * @param limit - Maximum number of results to return
   * @param filter - Optional SQL WHERE clause to restrict results
   * @returns Chunks sorted by descending hybrid relevance with a `score` field in `[0, 1]`
   */
  async hybridSearch(
    queryVector: number[],
    queryText: string,
    limit: number,
    filter?: string,
  ): Promise<(CodeChunk & { score: number })[]> {
    await this.ensureInitialized();
    const lancedb = await loadLanceDB();

    try {
      const { RRFReranker } = lancedb.rerankers;
      const reranker = await RRFReranker.create();
      // Order: nearestToText first, then nearestTo — required by LanceDB API
      let q = this.table!
        .query()
        .nearestToText(queryText, ["text"])
        .nearestTo(queryVector)
        .rerank(reranker)
        .limit(limit);
      if (filter) q = q.where(filter) as typeof q;
      const rows = (await q.toArray()) as (CodeChunk & { _relevance_score?: number })[];
      const n = rows.length;
      // Normalize RRF scores to 0-1; fall back to positional when unavailable
      const maxRelevance = Math.max(...rows.map((r) => r._relevance_score ?? 0));
      return rows.map((row, i) => {
        const raw = row._relevance_score;
        const score =
          typeof raw === "number" && raw >= 0 && maxRelevance > 0
            ? raw / maxRelevance
            : n > 1
              ? 1 - i / (n - 1)
              : 1;
        return { ...row, score };
      });
    } catch (err) {
      // Fallback to vector-only if hybrid fails (FTS index not ready, rebuilding, etc.)
      console.warn("[pi-index] hybridSearch fell back to vector-only:", String(err));
      return this.vectorSearch(queryVector, limit, filter);
    }
  }

  /**
   * Return the total number of chunks currently stored in the database.
   *
   * @returns Row count of the `chunks` table (0 when the index is empty)
   */
  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }

  /**
   * Return a `DBStatus` snapshot with the current chunk count.
   *
   * @returns `DBStatus` object containing `chunkCount`
   */
  async getStatus(): Promise<DBStatus> {
    await this.ensureInitialized();
    const chunkCount = await this.table!.countRows();
    return { chunkCount };
  }

  /**
   * Compact table fragments and update indexes for optimal query performance.
   *
   * LanceDB fragments data on repeated inserts and deletes. This method merges small
   * fragments into larger files and prunes old versions. Safe to call frequently —
   * returns immediately when nothing needs compacting.
   *
   * @returns Optimization statistics (compaction and prune details)
   */
  async optimize(): Promise<OptimizeStats> {
    await this.ensureInitialized();
    try {
      return await this.table!.optimize();
    } catch (err) {
      console.warn("[pi-index] table optimization skipped:", String(err));
      return {
        compaction: { fragmentsRemoved: 0, fragmentsAdded: 0, filesRemoved: 0, filesAdded: 0 },
        prune: { bytesRemoved: 0, oldVersionsRemoved: 0 },
      };
    }
  }

  /**
   * Create an IVF-PQ vector index if the table has enough rows and no vector index exists yet.
   *
   * Below the threshold, brute-force scan is faster than maintaining an index.
   * Skips if `vector_idx` already exists to avoid expensive re-training.
   *
   * @param threshold - Minimum row count to trigger index creation (default: `VECTOR_INDEX_THRESHOLD`)
   */
  async createVectorIndexIfNeeded(threshold?: number): Promise<void> {
    await this.ensureInitialized();
    const lancedb = await loadLanceDB();
    const count = await this.count();
    const effectiveThreshold = threshold ?? VECTOR_INDEX_THRESHOLD;
    if (count < effectiveThreshold) return;

    // Skip if vector index already exists — avoid expensive re-training
    const indices = await this.table!.listIndices();
    if (indices.some((i) => i.name === "vector_idx")) return;

    try {
      const numPartitions = Math.min(Math.ceil(Math.sqrt(count)), 256);
      const numSubVectors = Math.floor(this.vectorDim / 16) || Math.floor(this.vectorDim / 8) || 1;
      await this.table!.createIndex("vector", {
        config: lancedb.Index.ivfPq({
          numPartitions,
          numSubVectors,
          distanceType: "cosine",
        }),
      });
    } catch (err) {
      console.warn("[pi-index] vector index creation skipped:", String(err));
    }
  }

  /**
   * List the names of all indexes on the chunks table.
   *
   * @returns Array of index names (e.g. `["text_idx", "filePath_idx", "language_idx", "extension_idx"]`)
   */
  async listIndexes(): Promise<string[]> {
    await this.ensureInitialized();
    const indices = await this.table!.listIndices();
    return indices.map((i) => i.name);
  }
}
