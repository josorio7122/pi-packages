import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { IndexDB } from "./db.js";
import type { CodeChunk } from "./chunker.js";

let tmpDir: string;

function makeChunk(filePath: string, chunkIndex: number, text: string, dim = 4): CodeChunk {
  return {
    id: `${filePath}:${chunkIndex}`,
    text,
    vector: Array.from({ length: dim }, (_, i) => (i === chunkIndex % dim ? 1 : 0.1)),
    filePath,
    chunkIndex,
    startLine: chunkIndex * 10 + 1,
    endLine: chunkIndex * 10 + 10,
    language: "typescript",
    extension: ".ts",
    symbol: `fn${chunkIndex}`,
    mtime: Date.now(),
    createdAt: Date.now(),
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pi-index-db-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("IndexDB", () => {
  it("initializes and has 0 chunks initially", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    expect(await db.count()).toBe(0);
  }, 30_000);

  it("inserts chunks and count increases", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "function login() {}"),
      makeChunk("src/a.ts", 1, "function logout() {}"),
    ]);
    expect(await db.count()).toBe(2);
  }, 30_000);

  it("deleteByFilePath removes all chunks for that file", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "function login() {}"),
      makeChunk("src/b.ts", 0, "function register() {}"),
    ]);
    await db.deleteByFilePath("src/a.ts");
    expect(await db.count()).toBe(1);
  }, 30_000);

  it("deleteByFilePath is a no-op for unknown path", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([makeChunk("src/a.ts", 0, "content")]);
    await db.deleteByFilePath("nonexistent.ts");
    expect(await db.count()).toBe(1);
  }, 30_000);

  it("deleteAll removes every chunk", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "content a"),
      makeChunk("src/b.ts", 0, "content b"),
    ]);
    await db.deleteAll();
    expect(await db.count()).toBe(0);
  }, 30_000);

  it("vectorSearch returns ranked results", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "authentication logic"),
      makeChunk("src/b.ts", 1, "payment processing"),
    ]);
    // Query vector closest to chunk 0 (which has a 1 at index 0)
    const results = await db.vectorSearch([1, 0, 0, 0], 2);
    expect(results.length).toBeGreaterThan(0);
    // Top result should be the closest chunk
    expect(results[0].filePath).toBe("src/a.ts");
    // Every result has a score field
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  }, 30_000);

  it("vectorSearch normalizes scores so the top result is always 1.0", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "authentication logic"),
      makeChunk("src/b.ts", 1, "payment processing"),
    ]);
    const results = await db.vectorSearch([1, 0, 0, 0], 2);
    expect(results.length).toBeGreaterThan(0);
    // After normalization the top result must have score exactly 1.0
    expect(results[0].score).toBe(1.0);
    // Subsequent results must be strictly less than 1.0
    for (const r of results.slice(1)) {
      expect(r.score).toBeLessThan(1.0);
      expect(r.score).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it("insertChunks is a no-op for empty array", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([]);
    expect(await db.count()).toBe(0);
  }, 30_000);

  it("getStatus returns only chunkCount (fileCount/lastIndexedAt come from mtime cache)", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "content a"),
      makeChunk("src/a.ts", 1, "content a2"),
      makeChunk("src/b.ts", 0, "content b"),
    ]);
    const status = await db.getStatus();
    expect(status.chunkCount).toBe(3);
    expect(status).toEqual({ chunkCount: 3 });
  }, 30_000);

  it("getStatus on empty table returns { chunkCount: 0 }", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    const status = await db.getStatus();
    expect(status).toEqual({ chunkCount: 0 });
  }, 30_000);

  it("hybridSearch returns scored results", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "authentication logic"),
      makeChunk("src/b.ts", 1, "payment processing"),
    ]);
    const results = await db.hybridSearch([1, 0, 0, 0], "authentication", 2);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  }, 30_000);

  it("rebuildFtsIndex calls createIndex with replace: true", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    // Initialize by triggering count — ensures table is open
    await db.count();
    // Access internal table to spy on createIndex
    type DbInternal = {
      table: { createIndex: (...args: unknown[]) => Promise<void> };
      ensureInitialized: () => Promise<void>;
    };
    const dbInternal = db as unknown as DbInternal;
    const createIndexSpy = vi
      .spyOn(dbInternal.table, "createIndex")
      .mockResolvedValue(undefined as never);

    await db.rebuildFtsIndex();

    expect(createIndexSpy).toHaveBeenCalledWith(
      "text",
      expect.objectContaining({ replace: true }),
    );
  }, 30_000);

  it("rebuildFtsIndex swallows errors and does not throw", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.count();
    type DbInternal = {
      table: { createIndex: (...args: unknown[]) => Promise<void> };
    };
    const dbInternal = db as unknown as DbInternal;
    vi.spyOn(dbInternal.table, "createIndex").mockRejectedValue(
      new Error("FTS rebuild failed"),
    );

    // Should not throw
    await expect(db.rebuildFtsIndex()).resolves.toBeUndefined();
  }, 30_000);

  it("hybridSearch falls back to vectorSearch when hybrid query throws", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "authentication logic"),
    ]);

    // Mock db.vectorSearch to return canned results — this bypasses table internals
    // so the fallback path doesn't also hit the broken table.query
    const fakeResults = [{ ...makeChunk("src/a.ts", 0, "authentication logic"), score: 0.85 }];
    const vectorSearchSpy = vi.spyOn(db, "vectorSearch").mockResolvedValue(fakeResults);

    // Force the hybrid path to throw by replacing table.query with a throwing stub
    type DbInternal = { table: { query: () => void }; ensureInitialized: () => Promise<void> };
    const dbInternal = db as unknown as DbInternal;
    await dbInternal.ensureInitialized();
    const originalQuery = dbInternal.table.query;
    dbInternal.table.query = () => { throw new Error("FTS not available"); };

    const results = await db.hybridSearch([1, 0, 0, 0], "auth", 2);

    // Restore
    dbInternal.table.query = originalQuery;

    expect(vectorSearchSpy).toHaveBeenCalled();
    expect(results).toEqual(fakeResults);
  }, 30_000);
});

describe("IndexDB integration", () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `pi-index-test-${randomUUID()}`);
    await mkdir(dbPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(dbPath, { recursive: true, force: true });
  });

  it("inserts chunks and retrieves status", async () => {
    const db = new IndexDB(dbPath, 4); // small 4-dim vectors for speed
    const now = Date.now();
    const chunk: CodeChunk = {
      id: "src/foo.ts:0",
      text: "export function greet(name: string) { return `Hello ${name}`; }",
      vector: [0.1, 0.2, 0.3, 0.4],
      filePath: "src/foo.ts",
      chunkIndex: 0,
      startLine: 1,
      endLine: 3,
      language: "typescript",
      extension: ".ts",
      symbol: "greet",
      mtime: now,
      createdAt: now,
    };
    await db.insertChunks([chunk]);
    const status = await db.getStatus();
    expect(status.chunkCount).toBe(1);
    expect(status).toEqual({ chunkCount: 1 });
  }, 30_000);

  it("deleteByFilePath removes only matching chunks", async () => {
    const db = new IndexDB(dbPath, 4);
    const now = Date.now();
    await db.insertChunks([
      { id: "a.ts:0", text: "a", vector: [1, 0, 0, 0], filePath: "a.ts", chunkIndex: 0, startLine: 1, endLine: 1, language: "typescript", extension: ".ts", symbol: "", mtime: now, createdAt: now },
      { id: "b.ts:0", text: "b", vector: [0, 1, 0, 0], filePath: "b.ts", chunkIndex: 0, startLine: 1, endLine: 1, language: "typescript", extension: ".ts", symbol: "", mtime: now, createdAt: now },
    ]);
    await db.deleteByFilePath("a.ts");
    const status = await db.getStatus();
    expect(status.chunkCount).toBe(1);
    expect(status).toEqual({ chunkCount: 1 });
  }, 30_000);
});
