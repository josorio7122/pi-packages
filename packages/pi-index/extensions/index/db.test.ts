import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("insertChunks is a no-op for empty array", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([]);
    expect(await db.count()).toBe(0);
  }, 30_000);

  it("getStatus returns correct chunk and file counts", async () => {
    const db = new IndexDB(join(tmpDir, "lancedb"), 4);
    await db.insertChunks([
      makeChunk("src/a.ts", 0, "content a"),
      makeChunk("src/a.ts", 1, "content a2"),
      makeChunk("src/b.ts", 0, "content b"),
    ]);
    const status = await db.getStatus();
    expect(status.chunkCount).toBe(3);
    expect(status.fileCount).toBe(2);
  }, 30_000);
});
