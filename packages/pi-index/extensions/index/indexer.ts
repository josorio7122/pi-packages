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

      // Process new/changed files in batches
      for (let i = 0; i < toProcess.length; i += EMBED_BATCH_SIZE * EMBED_CONCURRENCY) {
        const batchGroup = toProcess.slice(i, i + EMBED_BATCH_SIZE * EMBED_CONCURRENCY);
        const subBatches: FileRecord[][] = [];
        for (let j = 0; j < batchGroup.length; j += EMBED_BATCH_SIZE) {
          subBatches.push(batchGroup.slice(j, j + EMBED_BATCH_SIZE));
        }
        await Promise.all(
          subBatches.map((batch) => this.processBatch(batch, cache, failedFiles)),
        );
      }

      // Persist updated mtime cache atomically
      await writeMtimeCache(this.cfg.mtimeCachePath, cache);

      const totalChunks = await this.db.count();

      return {
        added: diff.toAdd.length,
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
    for (const file of files) {
      try {
        const content = await readFile(file.absolutePath, "utf-8");
        const rawChunks = chunkFile(file.relativePath, content, file.mtime);
        if (rawChunks.length === 0) continue;

        // Embed with retry
        const chunks = await this.embedWithRetry(rawChunks, file.relativePath, failedFiles);
        if (!chunks) continue;

        await this.db.insertChunks(chunks);

        // Only update cache after successful write (CONSTITUTION.md §6 invariant 5)
        cache.set(file.relativePath, {
          filePath: file.relativePath,
          mtime: file.mtime,
          chunkCount: chunks.length,
          indexedAt: Date.now(),
        });
      } catch (err) {
        failedFiles.push(file.relativePath);
      }
    }
  }

  private async embedWithRetry(
    chunks: ReturnType<typeof chunkFile>,
    filePath: string,
    failedFiles: string[],
  ): Promise<ReturnType<typeof chunkFile> | null> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const embedded = await Promise.all(
          chunks.map(async (chunk) => {
            // Enriched input: prepend file context for better embedding quality
            const enriched = `File: ${chunk.filePath} (${chunk.language})\nSymbol: ${chunk.symbol}\n---\n${chunk.text}`;
            const vector = await this.emb.embed(enriched);
            return { ...chunk, vector, createdAt: Date.now() };
          }),
        );
        return embedded;
      } catch (err) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        } else {
          failedFiles.push(filePath);
          return null;
        }
      }
    }
    return null;
  }
}
