import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Indexer } from "./indexer.js";
import type { IndexDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { IndexConfig } from "./config.js";

let tmpDir: string;

function makeConfig(override: Partial<IndexConfig> = {}): IndexConfig {
  return {
    apiKey: "sk-test",
    model: "text-embedding-3-small",
    dimensions: 4,
    dbPath: join(tmpDir, "lancedb"),
    mtimeCachePath: join(tmpDir, "mtime-cache.json"),
    indexDirs: [tmpDir],
    indexRoot: tmpDir,
    autoIndex: false,
    maxFileKB: 500,
    minScore: 0.2,
    mmrLambda: 0.5,
    ...override,
  };
}

function makeDb(): IndexDB {
  return {
    insertChunks: vi.fn().mockResolvedValue(undefined),
    deleteByFilePath: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    vectorSearch: vi.fn().mockResolvedValue([]),
    hybridSearch: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn().mockResolvedValue({ chunkCount: 0, fileCount: 0, lastIndexedAt: null }),
    rebuildFtsIndex: vi.fn().mockResolvedValue(undefined),
  } as unknown as IndexDB;
}

function makeEmb(): Embeddings {
  return {
    embed: vi.fn().mockImplementation(async (texts: string | string[]) => {
      if (Array.isArray(texts)) return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
      return [0.1, 0.2, 0.3, 0.4];
    }),
  } as unknown as Embeddings;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pi-index-indexer-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Indexer", () => {
  it("returns summary with added count for new files", async () => {
    writeFileSync(join(tmpDir, "hello.ts"), "export function hello() {}");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    const summary = await indexer.run();
    expect(summary.added).toBe(1);
    expect(summary.skipped).toBe(0);
  });

  it("summary includes addedChunks > 0 when new files are indexed", async () => {
    writeFileSync(join(tmpDir, "hello.ts"), "export function hello() {}");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    const summary = await indexer.run();
    expect(summary.addedChunks).toBeGreaterThan(0);
    expect(summary.updatedChunks).toBe(0);
  });

  it("summary includes updatedChunks > 0 when changed files are re-indexed", async () => {
    const filePath = join(tmpDir, "hello.ts");
    writeFileSync(filePath, "export function hello() {}");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    await indexer.run();
    writeFileSync(filePath, "export function hello2() {}");
    const summary = await indexer.run();
    expect(summary.updatedChunks).toBeGreaterThan(0);
    expect(summary.addedChunks).toBe(0);
  });

  it("summary includes skippedTooLarge count for oversized files", async () => {
    const bigContent = "x".repeat(501 * 1024);
    writeFileSync(join(tmpDir, "big.ts"), bigContent);
    writeFileSync(join(tmpDir, "small.ts"), "const x = 1;");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    const summary = await indexer.run();
    expect(summary.skippedTooLarge).toBe(1);
  });

  it("isRunning is false when not indexing", () => {
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    expect(indexer.isRunning).toBe(false);
  });

  it("isRunning is true while run() is in progress", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const x = 1;");
    const db = makeDb();
    vi.mocked(db.insertChunks).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    const runPromise = indexer.run();
    // give the run a tick to start
    await new Promise((r) => setTimeout(r, 10));
    expect(indexer.isRunning).toBe(true);
    await runPromise;
    expect(indexer.isRunning).toBe(false);
  });

  it("calls db.insertChunks for new files", async () => {
    writeFileSync(join(tmpDir, "test.ts"), "const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();
    expect(db.insertChunks).toHaveBeenCalled();
  });

  it("calls db.deleteByFilePath before re-inserting a changed file", async () => {
    const filePath = join(tmpDir, "changed.ts");
    writeFileSync(filePath, "const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    // Touch the file to change its mtime
    writeFileSync(filePath, "const y = 2;");
    await indexer.run();

    expect(db.deleteByFilePath).toHaveBeenCalledWith("changed.ts");
  });

  it("skips unchanged files on second run", async () => {
    writeFileSync(join(tmpDir, "stable.ts"), "const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    vi.mocked(db.insertChunks).mockClear();
    vi.mocked(db.deleteByFilePath).mockClear();

    await indexer.run();
    expect(db.insertChunks).not.toHaveBeenCalled();
    expect(db.deleteByFilePath).not.toHaveBeenCalled();
  });

  it("throws INDEX_ALREADY_RUNNING when called while running", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const x = 1;");
    const db = makeDb();
    vi.mocked(db.insertChunks).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    const first = indexer.run();
    await expect(indexer.run()).rejects.toThrow("INDEX_ALREADY_RUNNING");
    await first;
  });

  it("reports removed count when a file is deleted from disk", async () => {
    const filePath = join(tmpDir, "todelete.ts");
    writeFileSync(filePath, "const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    rmSync(filePath);
    const summary = await indexer.run();
    expect(summary.removed).toBe(1);
    expect(db.deleteByFilePath).toHaveBeenCalledWith("todelete.ts");
  });

  it("force:true calls db.deleteAll and re-indexes everything", async () => {
    writeFileSync(join(tmpDir, "a.ts"), "const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    vi.mocked(db.insertChunks).mockClear();
    const summary = await indexer.run({ force: true });
    expect(db.deleteAll).toHaveBeenCalled();
    expect(summary.added).toBe(1);
  });

  it("force=true calls db.deleteAll before indexing even when files are unchanged", async () => {
    // Run once to populate mtime cache — second run would normally skip (unchanged)
    writeFileSync(join(tmpDir, "cached.ts"), "export const x = 1;");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    await indexer.run();

    // Second run with a fresh indexer (cache on disk persists, so files look unchanged)
    const db2 = makeDb();
    const indexer2 = new Indexer(makeConfig(), db2, makeEmb());
    const deleteAllSpy = vi.spyOn(db2, "deleteAll");
    const insertChunksSpy = vi.spyOn(db2, "insertChunks");

    await indexer2.run({ force: true });

    // Assert: deleteAll was called even though files were unchanged
    expect(deleteAllSpy).toHaveBeenCalledOnce();
    // Assert: insertChunks was called (files were re-indexed despite being in cache)
    expect(insertChunksSpy).toHaveBeenCalled();
  });

  it("only indexes files with supported extensions", async () => {
    writeFileSync(join(tmpDir, "code.ts"), "const x = 1;");
    writeFileSync(join(tmpDir, "ignored.rb"), "# ruby");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    const summary = await indexer.run();
    expect(summary.added).toBe(1); // only the .ts file
  });

  it("added count excludes files that failed to read/process", async () => {
    writeFileSync(join(tmpDir, "good.ts"), "export const x = 1;");
    const badPath = join(tmpDir, "bad.ts");
    writeFileSync(badPath, "export const y = 2;");
    // Make bad.ts unreadable so readFile throws — no retry delays involved
    const { chmodSync } = await import("node:fs");
    chmodSync(badPath, 0o000);
    const db = makeDb();
    const emb = makeEmb();
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // Restore permissions so afterEach cleanup can delete it
    chmodSync(badPath, 0o644);
    expect(summary.failedFiles).toContain("bad.ts");
    expect(summary.added).toBe(1); // only good.ts succeeded, not 2
  });

  it("non-429 embed errors fail immediately without retrying", async () => {
    writeFileSync(join(tmpDir, "fail.ts"), "export const x = 1;");
    const db = makeDb();
    const emb = makeEmb();
    const authError = Object.assign(new Error("Unauthorized"), { status: 401 });
    vi.mocked(emb.embed).mockRejectedValue(authError);
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // embed should only be called once — no retries for non-429
    expect(emb.embed).toHaveBeenCalledTimes(1);
    expect(summary.failedFiles).toContain("fail.ts");
  });

  it("embed errors including 429 are treated as file failures (retry is inside embeddings.ts)", async () => {
    // Retry logic has been moved into embeddings.ts#embed(). From indexer's perspective,
    // a 429 from emb.embed() is a plain failure — the real Embeddings class handles retrying
    // internally before ever throwing. This mock simulates a failure that exhausted all retries.
    writeFileSync(join(tmpDir, "rate.ts"), "export const x = 1;");
    const db = makeDb();
    const emb = makeEmb();
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
    vi.mocked(emb.embed).mockRejectedValue(rateLimitError);
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // embed called once — indexer no longer retries (retry moved to embeddings.ts)
    expect(emb.embed).toHaveBeenCalledTimes(1);
    expect(summary.failedFiles).toContain("rate.ts");
  });

  it("file with any failed chunk embedding is not partially inserted to DB", async () => {
    // Create a file that produces multiple chunks — fail the entire batch embed call
    // (With batch embed, a batch either fully succeeds or fully fails — no partial writes possible)
    writeFileSync(
      join(tmpDir, "multi.ts"),
      Array.from({ length: 100 }, (_, i) => `export const v${i} = ${i};`).join("\n"),
    );
    const db = makeDb();
    const emb = makeEmb();
    const authError = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(emb.embed).mockRejectedValue(authError);
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // insertChunks must NOT be called — the failed batch must not produce partial writes
    expect(db.insertChunks).not.toHaveBeenCalled();
    expect(summary.failedFiles).toContain("multi.ts");
  });

  it("preserves stale chunks when embedding fails for a changed file", async () => {
    const filePath = join(tmpDir, "stale.ts");
    writeFileSync(filePath, "const x = 1;");
    const db = makeDb();
    const emb = makeEmb();
    const indexer = new Indexer(makeConfig(), db, emb);
    await indexer.run(); // first run: stale.ts is new, no deleteByFilePath

    // Modify file so it appears changed
    writeFileSync(filePath, "const y = 2;");

    // Make embedding fail on second run
    const failingError = Object.assign(new Error("API error"), { status: 500 });
    vi.mocked(emb.embed).mockRejectedValue(failingError);

    vi.mocked(db.deleteByFilePath).mockClear();
    await indexer.run();

    // deleteByFilePath must NOT have been called — stale chunks should be preserved
    expect(db.deleteByFilePath).not.toHaveBeenCalledWith("stale.ts");
  });

  it("updated count excludes files that failed to embed", async () => {
    // First run: index two files successfully
    const goodPath = join(tmpDir, "good.ts");
    const badPath = join(tmpDir, "bad.ts");
    writeFileSync(goodPath, "export const x = 1;");
    writeFileSync(badPath, "export const y = 2;");

    const db = makeDb();
    const emb = makeEmb();
    const indexer = new Indexer(makeConfig(), db, emb);
    await indexer.run(); // first run: both files added

    // Modify both files so they appear changed on next run
    writeFileSync(goodPath, "export const x = 2;");
    writeFileSync(badPath, "export const y = 3;");

    // Fail the embed batch that contains bad.ts chunks.
    // Both good.ts and bad.ts are small (1 chunk each) so they land in the same batch;
    // rejecting that batch marks both files as failed.
    vi.mocked(emb.embed).mockImplementation(async (texts: string | string[]) => {
      const arr = Array.isArray(texts) ? texts : [texts];
      if (arr.some((t) => t.includes("bad.ts"))) throw new Error("Embed error for bad.ts");
      return arr.map(() => [0.1, 0.2, 0.3, 0.4]);
    });

    const summary = await indexer.run();
    // Both files were in the failing batch, so neither counts as updated
    expect(summary.failedFiles).toContain("bad.ts");
    expect(summary.updated).toBe(0);
  });

  it("calls embed once per batch with all chunk texts as array (not once per chunk)", async () => {
    // Three small files → ~3 chunks total, well within one batch of 20
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(tmpDir, `batch${i}.ts`), `export const v${i} = ${i};`);
    }
    const db = makeDb();
    const batchEmb: Embeddings = {
      embed: vi.fn().mockImplementation(async (texts: string | string[]) => {
        if (Array.isArray(texts)) return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
        return [0.1, 0.2, 0.3, 0.4];
      }),
    } as unknown as Embeddings;
    const indexer = new Indexer(makeConfig(), db, batchEmb);
    await indexer.run();
    // embed must be called once (one batch for all chunks), not once per chunk
    expect(batchEmb.embed).toHaveBeenCalledTimes(1);
    // The single argument must be an array of strings (batch embed), not a bare string
    const [arg] = vi.mocked(batchEmb.embed).mock.calls[0];
    expect(Array.isArray(arg)).toBe(true);
    expect((arg as string[]).length).toBeGreaterThan(0);
  });

  it("calls db.rebuildFtsIndex after processing files with changes", async () => {
    writeFileSync(join(tmpDir, "new.ts"), "export const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();
    expect(db.rebuildFtsIndex).toHaveBeenCalledOnce();
  });

  it("does not call db.rebuildFtsIndex when no files were added or updated", async () => {
    // First run indexes the file
    writeFileSync(join(tmpDir, "stable.ts"), "export const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    // Second run: file unchanged — no toProcess entries, no rebuildFtsIndex
    vi.mocked(db.rebuildFtsIndex).mockClear();
    await indexer.run();
    expect(db.rebuildFtsIndex).not.toHaveBeenCalled();
  });

  it("does not call db.rebuildFtsIndex on a delete-only run", async () => {
    // First run: index a file
    const filePath = join(tmpDir, "to-delete.ts");
    writeFileSync(filePath, "export const x = 1;");
    const db = makeDb();
    const indexer = new Indexer(makeConfig(), db, makeEmb());
    await indexer.run();

    // Remove the file from disk — next run is delete-only (toProcess.length === 0)
    rmSync(filePath);
    vi.mocked(db.rebuildFtsIndex).mockClear();
    const summary = await indexer.run();

    expect(summary.removed).toBe(1);
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(0);
    // No new data was indexed — FTS rebuild is unnecessary
    expect(db.rebuildFtsIndex).not.toHaveBeenCalled();
  });

  it("embed concurrency never exceeds EMBED_CONCURRENCY batches at once", async () => {
    // Create 25 small files so we get ≥ 25 chunks total (more than one batch of 20)
    for (let i = 0; i < 25; i++) {
      writeFileSync(join(tmpDir, `f${i}.ts`), `export const v${i} = ${i};`);
    }
    const db = makeDb();
    const emb = makeEmb();
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.mocked(emb.embed).mockImplementation(async (texts: string | string[]) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      const arr = Array.isArray(texts) ? texts : [texts];
      return arr.map(() => [0.1, 0.2, 0.3, 0.4]);
    });
    const indexer = new Indexer(makeConfig(), db, emb);
    await indexer.run();
    // At most EMBED_CONCURRENCY (3) batches, each processes chunks sequentially
    // So max concurrent embed calls should be ≤ 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
