import { describe, it, expect, vi } from "vitest";
import { createIndexTools } from "./tools.js";
import type { Indexer, IndexSummary } from "./indexer.js";
import type { Searcher } from "./searcher.js";
import type { IndexDB } from "./db.js";
import type { IndexConfig } from "./config.js";

vi.mock("./walker.js", () => ({
  readMtimeCache: vi.fn().mockResolvedValue(new Map()),
}));

function makeSearcher(result = "Found 1 result"): Searcher {
  return { search: vi.fn().mockResolvedValue(result) } as unknown as Searcher;
}

function makeIndexer(
  summary: Partial<IndexSummary> = {},
  opts: { isRunning?: boolean } = {},
): Indexer {
  const defaults: IndexSummary = {
    added: 1, addedChunks: 3, updated: 0, updatedChunks: 0, removed: 0, skipped: 0,
    skippedTooLarge: 0, failedFiles: [], totalChunks: 5, elapsedMs: 1000,
  };
  return {
    run: vi.fn().mockResolvedValue({ ...defaults, ...summary }),
    isRunning: opts.isRunning ?? false,
  } as unknown as Indexer;
}

function makeDb(
  status = { chunkCount: 5, fileCount: 2, lastIndexedAt: Date.now() }
): IndexDB {
  return {
    getStatus: vi.fn().mockResolvedValue(status),
    count: vi.fn().mockResolvedValue(status.chunkCount),
  } as unknown as IndexDB;
}

function makeConfig(override: Partial<IndexConfig> = {}): IndexConfig {
  return {
    apiKey: "sk-test",
    model: "text-embedding-3-small",
    dimensions: 1536,
    dbPath: "/tmp/lancedb",
    mtimeCachePath: "/tmp/mtime-cache.json",
    indexDirs: ["/project"],
    autoIndex: false,
    maxFileKB: 500,
    minScore: 0.2,
    ...override,
  };
}

describe("createIndexTools", () => {
  it("creates exactly three tools", () => {
    const { tools } = createIndexTools(makeSearcher(), makeIndexer(), makeDb(), makeConfig());
    expect(tools).toHaveLength(3);
  });

  it("creates tools named codebase_search, codebase_index, codebase_status", () => {
    const { tools } = createIndexTools(makeSearcher(), makeIndexer(), makeDb(), makeConfig());
    const names = tools.map((t) => t.name);
    expect(names).toContain("codebase_search");
    expect(names).toContain("codebase_index");
    expect(names).toContain("codebase_status");
  });

  describe("codebase_search", () => {
    it("calls searcher.search with query and default limit 8", async () => {
      const searcher = makeSearcher();
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth logic" });
      expect(searcher.search).toHaveBeenCalledWith("auth logic", 8);
    });

    it("passes custom limit to searcher", async () => {
      const searcher = makeSearcher();
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth", limit: 5 });
      expect(searcher.search).toHaveBeenCalledWith("auth", 5);
    });

    it("returns INDEX_NOT_INITIALIZED when chunkCount is 0", async () => {
      const db = makeDb({ chunkCount: 0, fileCount: 0, lastIndexedAt: null });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "anything" });
      expect(result).toContain("[INDEX_NOT_INITIALIZED]");
    });

    it("returns the searcher result when index exists", async () => {
      const searcher = makeSearcher("Found 3 results for auth");
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "auth" });
      expect(result).toBe("Found 3 results for auth");
    });

    it("returns INDEX_NOT_INITIALIZED when db.getStatus throws", async () => {
      const db = {
        getStatus: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      } as unknown as IndexDB;
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "auth" });
      expect(result).toContain("[INDEX_NOT_INITIALIZED]");
    });

    it("codebase_search returns SEARCH_FAILED for unexpected errors", async () => {
      const searcher = {
        search: vi.fn().mockRejectedValue(new Error("unexpected DB error")),
      } as unknown as Searcher;
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "auth" });
      expect(result).toContain("[SEARCH_FAILED]");
    });
  });

  describe("codebase_index", () => {
    it("calls indexer.run() with no options by default", async () => {
      const indexer = makeIndexer();
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({});
      expect(indexer.run).toHaveBeenCalledWith({ force: false });
    });

    it("calls indexer.run({ force: true }) when force is true", async () => {
      const indexer = makeIndexer();
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({ force: true });
      expect(indexer.run).toHaveBeenCalledWith({ force: true });
    });

    it("returns a summary string with Added/Updated/Skipped", async () => {
      const indexer = makeIndexer({ added: 3, addedChunks: 12, updated: 1, updatedChunks: 4, removed: 0, skipped: 95, skippedTooLarge: 0, totalChunks: 200, elapsedMs: 5000 });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("Added:");
      expect(result).toContain("Updated:");
      expect(result).toContain("Skipped:");
    });

    it("includes chunk counts in Added and Updated lines", async () => {
      const indexer = makeIndexer({ added: 3, addedChunks: 12, updated: 1, updatedChunks: 4, skippedTooLarge: 0 });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("3 files (12 chunks)");
      expect(result).toContain("1 file (4 chunks)");
    });

    it("shows skippedTooLarge line when files were skipped for size", async () => {
      const indexer = makeIndexer({ skippedTooLarge: 2 });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("2 files (too large)");
    });

    it("does not include Failed: line even when failedFiles is non-empty", async () => {
      const indexer = makeIndexer({ failedFiles: ["bad.ts", "broken.ts"] });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).not.toContain("Failed:");
    });

    it("returns INDEX_ALREADY_RUNNING error when indexer throws that", async () => {
      const indexer = {
        run: vi.fn().mockRejectedValue(new Error("INDEX_ALREADY_RUNNING: still running")),
        isRunning: false,
      } as unknown as Indexer;
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("[INDEX_ALREADY_RUNNING]");
    });

    it("returns CONFIG_MISSING_API_KEY error when indexer throws it", async () => {
      const indexer = {
        run: vi.fn().mockRejectedValue(new Error("CONFIG_MISSING_API_KEY: no key set")),
      } as unknown as Indexer;
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("[CONFIG_MISSING_API_KEY]");
    });

    it("codebase_index returns INDEX_FAILED for unexpected errors", async () => {
      const indexer = {
        run: vi.fn().mockRejectedValue(new Error("disk full")),
        isRunning: false,
      } as unknown as Indexer;
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("[INDEX_FAILED]");
    });
  });

  describe("codebase_status", () => {
    it("returns status string with chunk count and file count", async () => {
      const db = makeDb({ chunkCount: 1234, fileCount: 88, lastIndexedAt: Date.now() });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("1234");
      expect(result).toContain("88");
    });

    it("shows Not built message when chunkCount is 0 and cache is empty", async () => {
      const db = makeDb({ chunkCount: 0, fileCount: 0, lastIndexedAt: null });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("Not built");
    });

    it("shows auto-index setting", async () => {
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), makeDb(), makeConfig({ autoIndex: true }));
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("on");
    });

    it("shows relative time for lastIndexedAt (just now)", async () => {
      const db = makeDb({ chunkCount: 5, fileCount: 2, lastIndexedAt: Date.now() - 5000 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("just now");
    });

    it("shows relative time in minutes", async () => {
      const db = makeDb({ chunkCount: 5, fileCount: 2, lastIndexedAt: Date.now() - 5 * 60 * 1000 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("5 minutes ago");
    });

    it("appends rebuilding note when indexer.isRunning is true", async () => {
      const indexer = makeIndexer({}, { isRunning: true });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("(Index currently rebuilding in background)");
    });

    it("does not append rebuilding note when indexer.isRunning is false", async () => {
      const indexer = makeIndexer({}, { isRunning: false });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).not.toContain("rebuilding");
    });

    it("codebase_status not-built includes dbPath", async () => {
      const db = makeDb({ chunkCount: 0, fileCount: 0, lastIndexedAt: null });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("/tmp/lancedb");
      expect(result).toContain("Not built");
    });

    it("codebase_status shows relative time in hours", async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const db = makeDb({ chunkCount: 10, fileCount: 3, lastIndexedAt: twoHoursAgo });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("hours ago");
    });

    it("codebase_status shows relative time in days", async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const db = makeDb({ chunkCount: 10, fileCount: 3, lastIndexedAt: threeDaysAgo });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("days ago");
    });

    it("codebase_status returns STATUS_FAILED for unexpected errors", async () => {
      const db = {
        getStatus: vi.fn().mockRejectedValue(new Error("connection lost")),
      } as unknown as IndexDB;
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("[STATUS_FAILED]");
    });
  });

  describe("codebase_search CONFIG_MISSING_API_KEY", () => {
    it("returns CONFIG_MISSING_API_KEY error when searcher throws it", async () => {
      const searcher = {
        search: vi.fn().mockRejectedValue(new Error("CONFIG_MISSING_API_KEY")),
      } as unknown as Searcher;
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "auth" });
      expect(result).toContain("[CONFIG_MISSING_API_KEY]");
    });
  });

});
