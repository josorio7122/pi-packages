import { readFile } from "node:fs/promises";
import type { IndexConfig } from "./config.js";
import type { IndexDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import { chunkFile } from "./chunker.js";
import {
  walkDirs,
  readMtimeCache,
  writeMtimeCache,
  diffFileSet,
  type MtimeEntry,
  type FileRecord,
} from "./walker.js";

export type IndexSummary = {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  failedFiles: string[];
  totalChunks: number;
  elapsedMs: number;
};

// Extensions the indexer will process (matches DATA-MODEL.md Supported Languages)
const SUPPORTED_EXTENSIONS = [
  ".ts", ".tsx", ".d.ts", ".js", ".jsx",
  ".py", ".sql", ".md", ".css", ".html", ".txt",
];

const EMBED_BATCH_SIZE = 20;
const EMBED_CONCURRENCY = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]; // 4 attempts = 15 seconds max wait

export class Indexer {
  private running = false;
  private mtimeCache: Map<string, MtimeEntry> | null = null;

  constructor(
    private readonly cfg: IndexConfig,
    private readonly db: IndexDB,
    private readonly emb: Embeddings,
  ) {}

  async run(opts: { force?: boolean } = {}): Promise<IndexSummary> {
    if (this.running) {
      throw new Error(
        "INDEX_ALREADY_RUNNING: A previous index operation is still in progress.",
      );
    }
    this.running = true;
    const start = Date.now();

    try {
      // force: wipe everything and start fresh
      if (opts.force) {
        await this.db.deleteAll();
        this.mtimeCache = new Map();
        await writeMtimeCache(this.cfg.mtimeCachePath, this.mtimeCache);
      }

      // Load mtime cache from disk
      const cache = await readMtimeCache(this.cfg.mtimeCachePath);
      this.mtimeCache = cache;

      // Discover all eligible files
      // Use the first configured dir as the index root for relative paths
      const indexRoot = this.cfg.indexDirs[0];
      const allFiles = await walkDirs(
        this.cfg.indexDirs,
        indexRoot,
        SUPPORTED_EXTENSIONS,
        this.cfg.maxFileKB,
      );

      // Three-way diff
      const diff = diffFileSet(allFiles, cache);
      const toProcess: FileRecord[] = [...diff.toAdd, ...diff.toUpdate];
      const failedFiles: string[] = [];

      // Delete stale chunks for changed and deleted files
      for (const filePath of [
        ...diff.toUpdate.map((f) => f.relativePath),
        ...diff.toDelete,
      ]) {
        await this.db.deleteByFilePath(filePath);
        cache.delete(filePath);
      }

      // Process all new/changed files: chunk-level batching with bounded concurrency
      await this.processBatch(toProcess, cache, failedFiles);

      // Persist updated mtime cache atomically
      await writeMtimeCache(this.cfg.mtimeCachePath, cache);

      const totalChunks = await this.db.count();

      // added = files newly discovered minus those that failed (spec: failedFiles excluded)
      const addedSet = new Set(diff.toAdd.map((f) => f.relativePath));
      const failedAddedCount = failedFiles.filter((f) => addedSet.has(f)).length;

      return {
        added: diff.toAdd.length - failedAddedCount,
        updated: diff.toUpdate.length,
        removed: diff.toDelete.length,
        skipped: allFiles.length - toProcess.length,
        failedFiles,
        totalChunks,
        elapsedMs: Date.now() - start,
      };
    } finally {
      this.running = false;
    }
  }

  private async processBatch(
    files: FileRecord[],
    cache: Map<string, MtimeEntry>,
    failedFiles: string[],
  ): Promise<void> {
    // Step 1: read all files and produce raw chunks
    const fileChunks: { file: FileRecord; chunks: ReturnType<typeof chunkFile> }[] = [];
    for (const file of files) {
      try {
        const content = await readFile(file.absolutePath, "utf-8");
        const chunks = chunkFile(file.relativePath, content, file.mtime);
        if (chunks.length > 0) {
          fileChunks.push({ file, chunks });
        }
      } catch {
        failedFiles.push(file.relativePath);
      }
    }

    // Step 2: flatten all chunks, embed in batches of EMBED_BATCH_SIZE with EMBED_CONCURRENCY
    const allRaw = fileChunks.flatMap(({ file, chunks }) =>
      chunks.map((chunk) => ({ file, chunk }))
    );

    // Build chunk batches (up to 20 chunks per batch)
    const chunkBatches: { file: FileRecord; chunk: ReturnType<typeof chunkFile>[number] }[][] = [];
    for (let i = 0; i < allRaw.length; i += EMBED_BATCH_SIZE) {
      chunkBatches.push(allRaw.slice(i, i + EMBED_BATCH_SIZE));
    }

    // Embed with limited concurrency (up to 3 batches concurrent, sequential within each batch)
    const embedded: { file: FileRecord; chunk: ReturnType<typeof chunkFile>[number]; vector: number[] }[] = [];
    for (let i = 0; i < chunkBatches.length; i += EMBED_CONCURRENCY) {
      const batchGroup = chunkBatches.slice(i, i + EMBED_CONCURRENCY);
      const results = await Promise.all(
        batchGroup.map(async (batch) => {
          const batchResults: typeof embedded = [];
          for (const { file, chunk } of batch) {
            for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
              try {
                const enriched = `File: ${chunk.filePath} (${chunk.language})\nSymbol: ${chunk.symbol}\n---\n${chunk.text}`;
                const vector = await this.emb.embed(enriched);
                batchResults.push({ file, chunk, vector });
                break;
              } catch {
                if (attempt < RETRY_DELAYS_MS.length) {
                  await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
                } else {
                  if (!failedFiles.includes(file.relativePath)) {
                    failedFiles.push(file.relativePath);
                  }
                }
              }
            }
          }
          return batchResults;
        }),
      );
      embedded.push(...results.flat());
    }

    // Step 3: group embedded chunks by file and write to DB
    const byFile = new Map<string, typeof embedded>();
    for (const item of embedded) {
      const key = item.file.relativePath;
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(item);
    }

    for (const [, items] of byFile) {
      const { file } = items[0];
      const chunks = items.map(({ chunk, vector }) => ({
        ...chunk,
        vector,
        createdAt: Date.now(),
      }));
      try {
        await this.db.insertChunks(chunks);
        // Only update cache after successful write (CONSTITUTION.md §6 invariant 5)
        cache.set(file.relativePath, {
          filePath: file.relativePath,
          mtime: file.mtime,
          chunkCount: chunks.length,
          indexedAt: Date.now(),
        });
      } catch {
        if (!failedFiles.includes(file.relativePath)) {
          failedFiles.push(file.relativePath);
        }
      }
    }
  }
}
