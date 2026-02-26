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
    autoIndex: false,
    maxFileKB: 500,
    minScore: 0.2,
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
  } as unknown as IndexDB;
}

function makeEmb(): Embeddings {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]),
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

  it("HTTP 429 errors are retried and can succeed on a subsequent attempt", async () => {
    writeFileSync(join(tmpDir, "rate.ts"), "export const x = 1;");
    const db = makeDb();
    const emb = makeEmb();
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
    let calls = 0;
    vi.mocked(emb.embed).mockImplementation(async () => {
      calls++;
      if (calls === 1) throw rateLimitError; // first attempt fails with 429
      return [0.1, 0.2, 0.3, 0.4];           // second attempt succeeds
    });
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // embed called twice: initial attempt + 1 retry after 429
    expect(emb.embed).toHaveBeenCalledTimes(2);
    // File should succeed (not in failedFiles) because the retry succeeded
    expect(summary.failedFiles).not.toContain("rate.ts");
  }, 5000); // 5s timeout: allows for the 1-second retry delay

  it("file with any failed chunk embedding is not partially inserted to DB", async () => {
    // Create a file that produces multiple chunks — fail the second one
    writeFileSync(
      join(tmpDir, "multi.ts"),
      // Large enough content to produce multiple chunks
      Array.from({ length: 100 }, (_, i) => `export const v${i} = ${i};`).join("\n"),
    );
    const db = makeDb();
    const emb = makeEmb();
    let callCount = 0;
    const authError = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(emb.embed).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw authError; // fail the 2nd chunk
      return [0.1, 0.2, 0.3, 0.4];
    });
    const indexer = new Indexer(makeConfig(), db, emb);
    const summary = await indexer.run();
    // insertChunks must NOT be called for multi.ts — no partial writes
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

  it("embed concurrency never exceeds EMBED_CONCURRENCY batches at once", async () => {
    // Create 25 small files so we get ≥ 25 chunks total (more than one batch of 20)
    for (let i = 0; i < 25; i++) {
      writeFileSync(join(tmpDir, `f${i}.ts`), `export const v${i} = ${i};`);
    }
    const db = makeDb();
    const emb = makeEmb();
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.mocked(emb.embed).mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return [0.1, 0.2, 0.3, 0.4];
    });
    const indexer = new Indexer(makeConfig(), db, emb);
    await indexer.run();
    // At most EMBED_CONCURRENCY (3) batches, each processes chunks sequentially
    // So max concurrent embed calls should be ≤ 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
