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

export type ProgressCallback = (message: string) => void;

/** Returns a wrapper that calls cb at most once per `minIntervalMs`. */
function throttle(cb: ProgressCallback, minIntervalMs = 1000): ProgressCallback {
  let lastCallMs = 0;
  return (msg: string) => {
    const now = Date.now();
    if (now - lastCallMs >= minIntervalMs) {
      lastCallMs = now;
      cb(msg);
    }
  };
}

export type IndexSummary = {
  added: number;
  addedChunks: number;
  updated: number;
  updatedChunks: number;
  removed: number;
  skipped: number;
  skippedTooLarge: number;
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

export class Indexer {
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  constructor(
    private readonly cfg: IndexConfig,
    private readonly db: IndexDB,
    private readonly emb: Embeddings,
  ) {}

  async run(opts: { force?: boolean; onProgress?: ProgressCallback } = {}): Promise<IndexSummary> {
    if (this.running) {
      throw new Error(
        "INDEX_ALREADY_RUNNING: A previous index operation is still in progress.",
      );
    }
    this.running = true;
    const start = Date.now();

    try {
      // Set up throttled progress notifier (for intermediate updates) and an unthrottled one for completion
      const notify: ProgressCallback = opts.onProgress ? throttle(opts.onProgress) : () => {};
      const complete: ProgressCallback = opts.onProgress ?? (() => {});

      // Load mtime cache from disk (or start fresh on force rebuild)
      let cache: Map<string, MtimeEntry>;
      if (opts.force) {
        await this.db.deleteAll();
        cache = new Map();
        await writeMtimeCache(this.cfg.mtimeCachePath, cache);
      } else {
        cache = await readMtimeCache(this.cfg.mtimeCachePath);
      }

      // Discover all eligible files
      const indexRoot = this.cfg.indexRoot;
      const walkResult = await walkDirs(
        this.cfg.indexDirs,
        indexRoot,
        SUPPORTED_EXTENSIONS,
        this.cfg.maxFileKB,
      );
      const allFiles = walkResult.files;
      notify(`🔍 Scanned — ${allFiles.length} file(s) to check`);

      // Three-way diff
      const diff = diffFileSet(allFiles, cache);
      const toProcess: FileRecord[] = [...diff.toAdd, ...diff.toUpdate];
      const failedFiles: string[] = [];

      if (toProcess.length > 0) {
        notify(`⚡ Indexing ${toProcess.length} file(s) (${diff.toAdd.length} new, ${diff.toUpdate.length} changed)...`);
      }

      // Delete chunks for files that no longer exist on disk
      for (const filePath of diff.toDelete) {
        await this.db.deleteByFilePath(filePath);
        cache.delete(filePath);
      }
      // Note: changed files (toUpdate) are deleted per-file in processBatch
      // after embedding succeeds, to preserve stale-but-present data on failure

      // Process all new/changed files: chunk-level batching with bounded concurrency
      await this.processBatch(toProcess, cache, failedFiles, notify);

      // Persist updated mtime cache atomically
      await writeMtimeCache(this.cfg.mtimeCachePath, cache);

      // Rebuild FTS index after any inserts so hybrid search stays current
      if (toProcess.length > 0) {
        await this.db.rebuildFtsIndex();
      }

      const totalChunks = await this.db.count();
      if (toProcess.length > 0) {
        complete(`✅ Index updated — ${totalChunks} chunks across ${toProcess.length - failedFiles.length} file(s)`);
      } else if (diff.toDelete.length > 0) {
        complete(`✅ Removed ${diff.toDelete.length} deleted file(s) — ${totalChunks} chunks total`);
      } else {
        complete(`✅ Index is up to date — ${totalChunks} chunks, no changes detected`);
      }

      // added/updated = files processed minus those that failed (spec: failedFiles excluded)
      const addedSet = new Set(diff.toAdd.map((f) => f.relativePath));
      const updateSet = new Set(diff.toUpdate.map((f) => f.relativePath));
      const failedAddedCount = failedFiles.filter((f) => addedSet.has(f)).length;
      const failedUpdatedCount = failedFiles.filter((f) => updateSet.has(f)).length;

      // Count chunks created for added vs updated files
      let addedChunks = 0;
      let updatedChunks = 0;
      for (const [path, entry] of cache.entries()) {
        if (addedSet.has(path)) addedChunks += entry.chunkCount;
        else if (updateSet.has(path)) updatedChunks += entry.chunkCount;
      }

      return {
        added: diff.toAdd.length - failedAddedCount,
        addedChunks,
        updated: diff.toUpdate.length - failedUpdatedCount,
        updatedChunks,
        removed: diff.toDelete.length,
        skipped: allFiles.length - toProcess.length,
        skippedTooLarge: walkResult.skippedLarge,
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
    notify: ProgressCallback,
  ): Promise<void> {
    // O(1) deduplication guard — kept in sync with failedFiles array
    const failedSet = new Set<string>(failedFiles);

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
    notify(`📚 Reading files... (${fileChunks.length}/${files.length})`);

    // Step 2: flatten all chunks, embed in batches of EMBED_BATCH_SIZE with EMBED_CONCURRENCY
    const allRaw = fileChunks.flatMap(({ file, chunks }) =>
      chunks.map((chunk) => ({ file, chunk }))
    );

    // Build chunk batches (up to 20 chunks per batch)
    const chunkBatches: { file: FileRecord; chunk: ReturnType<typeof chunkFile>[number] }[][] = [];
    for (let i = 0; i < allRaw.length; i += EMBED_BATCH_SIZE) {
      chunkBatches.push(allRaw.slice(i, i + EMBED_BATCH_SIZE));
    }

    // Track files where any chunk failed to embed — these must not be partially written
    const embedFailedFiles = new Set<string>();

    // Embed with limited concurrency (up to 3 batches concurrent, sequential within each batch)
    const embedded: { file: FileRecord; chunk: ReturnType<typeof chunkFile>[number]; vector: number[] }[] = [];
    for (let i = 0; i < chunkBatches.length; i += EMBED_CONCURRENCY) {
      const batchGroup = chunkBatches.slice(i, i + EMBED_CONCURRENCY);
      const results = await Promise.all(
        batchGroup.map(async (batch) => {
          const batchResults: typeof embedded = [];
          try {
            // Build enriched texts for all chunks in the batch
            const enrichedTexts = batch.map(({ chunk }) =>
              `File: ${chunk.filePath} (${chunk.language})\nSymbol: ${chunk.symbol}\n---\n${chunk.text}`
            );
            // ONE API call for the whole batch
            const vectors = await this.emb.embed(enrichedTexts);
            // Zip vectors back to their chunks
            for (let j = 0; j < batch.length; j++) {
              const { file, chunk } = batch[j];
              batchResults.push({ file, chunk, vector: vectors[j] });
            }
          } catch {
            // Entire batch failed — mark ALL files in this batch as failed
            for (const { file } of batch) {
              if (!failedSet.has(file.relativePath)) {
                failedSet.add(file.relativePath);
                failedFiles.push(file.relativePath);
              }
              embedFailedFiles.add(file.relativePath);
            }
          }
          return batchResults;
        }),
      );
      embedded.push(...results.flat());
      const embeddedSoFar = Math.min((i + EMBED_CONCURRENCY) * EMBED_BATCH_SIZE, allRaw.length);
      notify(`🧠 Embedding chunks... (${embeddedSoFar}/${allRaw.length})`);
    }

    // Step 3: group embedded chunks by file and write to DB
    // Skip files that had any chunk embedding failure to avoid partial writes
    const byFile = new Map<string, typeof embedded>();
    for (const item of embedded) {
      const key = item.file.relativePath;
      if (embedFailedFiles.has(key)) continue; // skip — file already marked failed
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
        // Delete old chunks then insert new ones (spec §Writing)
        await this.db.deleteByFilePath(file.relativePath);
        await this.db.insertChunks(chunks);
        // Only update cache after successful write (CONSTITUTION.md §6 invariant 5)
        cache.set(file.relativePath, {
          filePath: file.relativePath,
          mtime: file.mtime,
          chunkCount: chunks.length,
          indexedAt: Date.now(),
        });
      } catch {
        if (!failedSet.has(file.relativePath)) {
          failedSet.add(file.relativePath);
          failedFiles.push(file.relativePath);
        }
      }
    }
  }
}
