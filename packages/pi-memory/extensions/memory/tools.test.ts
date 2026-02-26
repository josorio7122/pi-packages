import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { MemoryDB } from "./db.js";
import type { MemoryConfig } from "./config.js";

const DIMS = 8; // tiny vectors for fast tests
const FIXED_VEC = Array(DIMS).fill(0.5);

describe("createMemoryTools", () => {
  let tmpPath: string;
  let db: MemoryDB;
  let mockEmb: { embed: ReturnType<typeof vi.fn> };
  let cfg: MemoryConfig;

  beforeEach(async () => {
    tmpPath = `${tmpdir()}/pi-memory-tools-test-${randomUUID()}`;
    const { MemoryDB } = await import("./db.js");
    db = new MemoryDB(tmpPath, DIMS);
    mockEmb = { embed: vi.fn().mockResolvedValue(FIXED_VEC) };
    cfg = {
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      dbPath: tmpPath,
      autoCapture: false,
      autoRecall: true,
      captureMaxChars: 500,
    };
  });

  afterEach(async () => {
    await rm(tmpPath, { recursive: true, force: true });
  });

  // Helper to call execute with minimal args
  const exec = (tool: { execute: Function }, params: Record<string, unknown>) =>
    tool.execute("test-call-id", params, undefined, undefined, {});

  // ─── memory_recall ─────────────────────────────────────────────────────────

  describe("memory_recall", () => {
    it('returns "No relevant memories found" when DB is empty', async () => {
      const { createMemoryTools } = await import("./tools.js");
      const { recallTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(recallTool, { query: "dark mode" });
      expect(result.content[0].text).toBe("No relevant memories found.");
      expect(result.details).toEqual({ count: 0 });
    });

    it("returns formatted memories when found", async () => {
      await db.store({
        text: "I prefer dark mode",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "preference",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { recallTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(recallTool, { query: "dark mode" });
      expect(result.content[0].text).toContain("1. [preference]");
      expect(result.content[0].text).toContain("I prefer dark mode");
    });

    it("details.count matches length of results array", async () => {
      await db.store({
        text: "Entry one",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "fact",
      });
      await db.store({
        text: "Entry two",
        vector: FIXED_VEC,
        importance: 0.6,
        category: "other",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { recallTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(recallTool, { query: "entry", limit: 5 });
      expect(result.details.count).toBe(result.details.memories.length);
      expect(result.details.count).toBeGreaterThan(0);
    });

    it("sanitized results do NOT include the vector field", async () => {
      await db.store({
        text: "Some memory",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "other",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { recallTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(recallTool, { query: "memory" });
      expect(result.details.count).toBeGreaterThan(0);
      for (const mem of result.details.memories) {
        expect(mem).not.toHaveProperty("vector");
      }
    });
  });

  // ─── memory_store ──────────────────────────────────────────────────────────

  describe("memory_store", () => {
    it('stores a new memory and returns action: "created"', async () => {
      const { createMemoryTools } = await import("./tools.js");
      const { storeTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(storeTool, { text: "I love TypeScript" });
      expect(result.details.action).toBe("created");
      expect(result.details.id).toBeTruthy();
    });

    it('returns action: "duplicate" when similar memory exists', async () => {
      // Pre-store with the exact same vector the mock returns
      await db.store({
        text: "I love TypeScript",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "preference",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { storeTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(storeTool, { text: "I love TypeScript" });
      expect(result.details.action).toBe("duplicate");
    });

    it("stored entry count increases by 1", async () => {
      const countBefore = await db.count();
      const { createMemoryTools } = await import("./tools.js");
      const { storeTool } = createMemoryTools(db, mockEmb as any, cfg);
      await exec(storeTool, { text: "New unique memory about Python" });
      // Make mock return a different vector for second call to avoid duplicate
      mockEmb.embed.mockResolvedValueOnce(Array(DIMS).fill(0.9));
      const countAfter = await db.count();
      expect(countAfter).toBe(countBefore + 1);
    });

    it("rejects empty text in memory_store", async () => {
      const { createMemoryTools } = await import("./tools.js");
      const { storeTool } = createMemoryTools(db as any, mockEmb as any, cfg);
      const result = await exec(storeTool, { text: "" });
      expect(result.details?.error).toBe("empty_text");
    });
  });

  // ─── memory_forget ─────────────────────────────────────────────────────────

  describe("memory_forget", () => {
    it("deletes by memoryId directly, returns action: deleted", async () => {
      const entry = await db.store({
        text: "To be deleted",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "other",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { forgetTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(forgetTool, { memoryId: entry.id });
      expect(result.details.action).toBe("deleted");
      expect(await db.count()).toBe(0);
    });

    it('returns error: "missing_param" when neither query nor memoryId provided', async () => {
      const { createMemoryTools } = await import("./tools.js");
      const { forgetTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(forgetTool, {});
      expect(result.details.error).toBe("missing_param");
    });

    it("finds and auto-deletes when exactly one high-confidence match (score > 0.9)", async () => {
      await db.store({
        text: "Single matching memory",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "other",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { forgetTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(forgetTool, { query: "matching memory" });
      expect(result.details.action).toBe("deleted");
      expect(await db.count()).toBe(0);
    });

    it("returns found: 0 when query matches nothing", async () => {
      // DB is empty — no memories stored, search returns []
      const { createMemoryTools } = await import("./tools.js");
      const { forgetTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(forgetTool, { query: "something not in memory" });
      expect(result.details.found).toBe(0);
      expect(result.content[0].text).toContain("No matching");
    });

    it("returns candidates list when multiple matches", async () => {
      await db.store({
        text: "Memory alpha",
        vector: FIXED_VEC,
        importance: 0.7,
        category: "other",
      });
      await db.store({
        text: "Memory beta",
        vector: FIXED_VEC,
        importance: 0.6,
        category: "other",
      });
      await db.store({
        text: "Memory gamma",
        vector: FIXED_VEC,
        importance: 0.5,
        category: "other",
      });
      const { createMemoryTools } = await import("./tools.js");
      const { forgetTool } = createMemoryTools(db, mockEmb as any, cfg);
      const result = await exec(forgetTool, { query: "memory" });
      expect(result.details.action).toBe("candidates");
      expect(Array.isArray(result.details.candidates)).toBe(true);
      expect(result.details.candidates.length).toBeGreaterThan(1);
    });
  });
});
