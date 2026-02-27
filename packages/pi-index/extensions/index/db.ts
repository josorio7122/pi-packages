import type { Connection, Table } from "@lancedb/lancedb";
import type { CodeChunk } from "./chunker.js";

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
  }

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

  async insertChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.ensureInitialized();
    await this.table!.add(chunks);
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    await this.ensureInitialized();
    const escaped = filePath.replace(/'/g, "''");
    await this.table!.delete(`filePath = '${escaped}'`);
  }

  async deleteAll(): Promise<void> {
    await this.ensureInitialized();
    // Drop and recreate — cleanest way to reset
    await this.db!.dropTable(TABLE_NAME);
    this.table = null;
    this.initPromise = null;
    await this.ensureInitialized();
  }

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
    } catch {
      // Fallback to vector-only if hybrid fails (FTS index not ready, etc.)
      return this.vectorSearch(queryVector, limit, filter);
    }
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }

  async getStatus(): Promise<DBStatus> {
    await this.ensureInitialized();
    const chunkCount = await this.table!.countRows();
    return { chunkCount };
  }
}
