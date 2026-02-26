import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Real LanceDB, no mocking
const DIMS = 8; // Use tiny vectors for fast tests

describe("MemoryDB", () => {
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = `${tmpdir()}/pi-memory-test-${randomUUID()}`;
  });

  afterEach(async () => {
    await rm(tmpPath, { recursive: true, force: true });
  });

  it("stores a memory entry and returns it with id and createdAt", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    const result = await db.store({
      text: "I prefer dark mode",
      vector: Array(DIMS).fill(0.1),
      importance: 0.7,
      category: "preference",
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.text).toBe("I prefer dark mode");
    expect(result.category).toBe("preference");
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it("returns results from search after storing", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    await db.store({
      text: "I prefer dark mode",
      vector: Array(DIMS).fill(0.9),
      importance: 0.7,
      category: "preference",
    });
    // Search with same vector should return high similarity
    const results = await db.search(Array(DIMS).fill(0.9), 5, 0.0);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.text).toBe("I prefer dark mode");
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });

  it("returns empty array when no entries exist", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    const results = await db.search(Array(DIMS).fill(0.1));
    expect(results).toEqual([]);
  });

  it("filters results below minScore", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    await db.store({
      text: "Some entry",
      vector: Array(DIMS).fill(0.1),
      importance: 0.5,
      category: "other",
    });
    // Search with completely opposite vector (high distance = low score)
    const results = await db.search(Array(DIMS).fill(1.0), 5, 0.9999);
    // The score from an opposite vector will be well below 0.9999
    expect(results).toHaveLength(0);
  });

  it("deletes a stored entry by valid UUID", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    const entry = await db.store({
      text: "To be deleted",
      vector: Array(DIMS).fill(0.5),
      importance: 0.5,
      category: "other",
    });
    const countBefore = await db.count();
    await db.delete(entry.id);
    const countAfter = await db.count();
    expect(countBefore).toBe(1);
    expect(countAfter).toBe(0);
  });

  it("throws for invalid UUID to prevent injection", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    await expect(db.delete("'; DROP TABLE memories; --")).rejects.toThrow(
      "Invalid memory ID format"
    );
  });

  it("returns correct count", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    expect(await db.count()).toBe(0);
    await db.store({ text: "one", vector: Array(DIMS).fill(0.1), importance: 0.5, category: "other" });
    await db.store({ text: "two", vector: Array(DIMS).fill(0.2), importance: 0.5, category: "other" });
    expect(await db.count()).toBe(2);
  });

  it("reuses the same connection for multiple operations (initPromise idempotent)", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);
    // Trigger concurrent inits
    const [r1, r2] = await Promise.all([
      db.store({ text: "a", vector: Array(DIMS).fill(0.1), importance: 0.5, category: "other" }),
      db.store({ text: "b", vector: Array(DIMS).fill(0.2), importance: 0.5, category: "other" }),
    ]);
    expect(r1.id).toBeTruthy();
    expect(r2.id).toBeTruthy();
    expect(await db.count()).toBe(2);
  });

  it("allows retry after a transient initialization error", async () => {
    const { MemoryDB } = await import("./db.js");
    const db = new MemoryDB(tmpPath, DIMS);

    // Patch doInitialize to fail once, then succeed
    let failCount = 0;
    const original = (db as any).doInitialize.bind(db);
    (db as any).doInitialize = async () => {
      if (failCount === 0) {
        failCount++;
        throw new Error("Transient error");
      }
      return original();
    };

    // First call throws
    await expect(db.count()).rejects.toThrow("Transient error");

    // initPromise should be reset — second call should work
    const count = await db.count();
    expect(count).toBe(0);
  });
});
