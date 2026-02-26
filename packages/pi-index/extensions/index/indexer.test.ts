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
});

describe("Indexer", () => {
  it("returns summary with added count for new files", async () => {
    writeFileSync(join(tmpDir, "hello.ts"), "export function hello() {}");
    const indexer = new Indexer(makeConfig(), makeDb(), makeEmb());
    const summary = await indexer.run();
    expect(summary.added).toBe(1);
    expect(summary.skipped).toBe(0);
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
});
