import { describe, it, expect, vi } from "vitest";
import { createIndexTools, formatSummary } from "./tools.js";
import { readMtimeCache } from "./walker.js";
import type { Indexer, IndexSummary, AsyncIndexResult } from "./indexer.js";
import type { Searcher } from "./searcher.js";
import type { IndexDB } from "./db.js";
import type { IndexConfig } from "./config.js";
import type { MtimeEntry } from "./walker.js";

vi.mock("./walker.js", () => ({
  readMtimeCache: vi.fn().mockResolvedValue(new Map()),
}));

/** Build a fake mtime cache with `size` entries all having `indexedAt = maxIndexedAt`. */
function makeMtimeCache(size: number, maxIndexedAt = Date.now()): Map<string, MtimeEntry> {
  const cache = new Map<string, MtimeEntry>();
  for (let i = 0; i < size; i++) {
    const fp = `file${i}.ts`;
    cache.set(fp, { filePath: fp, mtime: 1000, chunkCount: 1, indexedAt: maxIndexedAt });
  }
  return cache;
}

function makeSearcher(result = "Found 1 result"): Searcher {
  return { search: vi.fn().mockResolvedValue(result) } as unknown as Searcher;
}

function makeIndexer(
  summary: Partial<IndexSummary> = {},
  opts: {
    isRunning?: boolean;
    runAsyncStatus?: "started" | "already_running";
    progress?: string | null;
    lastError?: string | null;
  } = {},
): Indexer {
  const defaults: IndexSummary = {
    added: 1, addedChunks: 3, updated: 0, updatedChunks: 0, removed: 0, skipped: 0,
    skippedTooLarge: 0, failedFiles: [], totalChunks: 5, elapsedMs: 1000,
  };
  const runAsyncResult: AsyncIndexResult =
    opts.runAsyncStatus === "already_running"
      ? { status: "already_running", progress: opts.progress ?? null }
      : { status: "started" };
  return {
    run: vi.fn().mockResolvedValue({ ...defaults, ...summary }),
    runAsync: vi.fn().mockReturnValue(runAsyncResult),
    isRunning: opts.isRunning ?? false,
    lastResult: null,
    lastError: opts.lastError ?? null,
    progress: opts.progress ?? null,
  } as unknown as Indexer;
}

function makeDb(status = { chunkCount: 5 }): IndexDB {
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
    indexRoot: "/project",
    autoIndex: false,
    maxFileKB: 500,
    minScore: 0.2,
    mmrLambda: 0.5,
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
      expect(searcher.search).toHaveBeenCalledWith("auth logic", 8, undefined);
    });

    it("passes custom limit to searcher", async () => {
      const searcher = makeSearcher();
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth", limit: 5 });
      expect(searcher.search).toHaveBeenCalledWith("auth", 5, undefined);
    });

    it("passes minScore to searcher.search when provided", async () => {
      const searcher = makeSearcher();
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth", minScore: 0.7 });
      expect(searcher.search).toHaveBeenCalledWith("auth", 8, 0.7);
    });

    it("passes undefined minScore when not provided in args", async () => {
      const searcher = makeSearcher();
      const { tools } = createIndexTools(searcher, makeIndexer(), makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth" });
      expect(searcher.search).toHaveBeenCalledWith("auth", 8, undefined);
    });

    it("returns INDEX_NOT_INITIALIZED when searcher reports empty index", async () => {
      // After Fix 4: tools.ts no longer calls db.getStatus(). The searcher (via db.count())
      // returns [INDEX_EMPTY] when the index is empty, and tools.ts normalizes it.
      const emptyIndexSearcher = {
        search: vi.fn().mockResolvedValue(
          "[INDEX_EMPTY] The codebase index is empty. Run codebase_index (or /index-rebuild) to build the index first."
        ),
      } as unknown as Searcher;
      const db = makeDb({ chunkCount: 0 });
      const { tools } = createIndexTools(emptyIndexSearcher, makeIndexer(), db, makeConfig());
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

    it("does not call db.getStatus before search (Fix 4: no pre-check in tools layer)", async () => {
      // After Fix 4: db.getStatus() is not called — searcher handles the empty-index check
      const db = makeDb({ chunkCount: 5 });
      const searcher = makeSearcher("Found 1 result");
      const { tools } = createIndexTools(searcher, makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      await tool.handler({ query: "auth" });
      expect(db.getStatus).not.toHaveBeenCalled();
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

    it("appends indexing-in-progress warning when indexer.isRunning is true", async () => {
      const searcher = makeSearcher("Found 2 results");
      const indexer = makeIndexer({}, { isRunning: true });
      const { tools } = createIndexTools(searcher, indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "test" });
      expect(result).toContain("Found 2 results");
      expect(result).toContain("ndexing is currently in progress");
    });

    it("does not append warning when indexer.isRunning is false", async () => {
      const searcher = makeSearcher("Found 1 result");
      const indexer = makeIndexer({}, { isRunning: false });
      const { tools } = createIndexTools(searcher, indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_search")!;
      const result = await tool.handler({ query: "test" });
      expect(result).toBe("Found 1 result");
      expect(result).not.toContain("in progress");
    });
  });

  describe("codebase_index", () => {
    it("calls indexer.runAsync() with force false by default", async () => {
      const indexer = makeIndexer();
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({});
      expect(indexer.runAsync).toHaveBeenCalledWith(
        expect.objectContaining({ force: false }),
      );
    });

    it("calls indexer.runAsync({ force: true }) when force is true", async () => {
      const indexer = makeIndexer();
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({ force: true });
      expect(indexer.runAsync).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      );
    });

    it("returns 'Started indexing' message when runAsync returns started", async () => {
      const indexer = makeIndexer({}, { runAsyncStatus: "started" });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("Started indexing");
    });

    it("returns 'already in progress' message when runAsync returns already_running", async () => {
      const indexer = makeIndexer({}, { runAsyncStatus: "already_running" });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      const result = await tool.handler({});
      expect(result).toContain("already in progress");
    });

    it("passes onProgress to runAsync when notify is provided", async () => {
      const notifications: string[] = [];
      const notify = (msg: string, level: string) => notifications.push(`${level}:${msg}`);
      const indexer = makeIndexer();
      // Capture the onProgress callback and invoke it
      vi.mocked(indexer.runAsync).mockImplementation((opts) => {
        opts?.onProgress?.("⚡ Test progress");
        return { status: "started" };
      });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({}, notify);
      expect(notifications).toContain("info:⚡ Test progress");
    });

    it("passes onProgress from opts.notify when no per-call notify provided", async () => {
      const notifications: string[] = [];
      const globalNotify = (msg: string, level: string) => notifications.push(`${level}:${msg}`);
      const indexer = makeIndexer();
      vi.mocked(indexer.runAsync).mockImplementation((opts) => {
        opts?.onProgress?.("⚡ Global progress");
        return { status: "started" };
      });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig(), { notify: globalNotify });
      const tool = tools.find((t) => t.name === "codebase_index")!;
      await tool.handler({});
      expect(notifications).toContain("info:⚡ Global progress");
    });
  });

  describe("codebase_status", () => {
    it("returns status string with chunk count and file count", async () => {
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(88));
      const db = makeDb({ chunkCount: 1234 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("1234");
      expect(result).toContain("88");
    });

    it("shows Not built message when chunkCount is 0 and cache is empty", async () => {
      const db = makeDb({ chunkCount: 0 });
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
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(2, Date.now() - 5000));
      const db = makeDb({ chunkCount: 5 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("just now");
    });

    it("shows relative time in minutes", async () => {
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(2, Date.now() - 5 * 60 * 1000));
      const db = makeDb({ chunkCount: 5 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("5 minutes ago");
    });

    it("appends 'Indexing: In progress' when indexer.isRunning is true", async () => {
      const indexer = makeIndexer({}, { isRunning: true });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("Indexing:");
      expect(result).toContain("In progress");
    });

    it("includes progress message in Indexing line when progress is set", async () => {
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(2));
      const indexer = makeIndexer({}, { isRunning: true, progress: "⚡ Embedding 10/50" });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb({ chunkCount: 5 }), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("⚡ Embedding 10/50");
    });

    it("does not include Indexing line when indexer.isRunning is false", async () => {
      const indexer = makeIndexer({}, { isRunning: false });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb(), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).not.toContain("In progress");
    });

    it("shows Last error line when indexer.lastError is set", async () => {
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(2));
      const indexer = makeIndexer({}, { lastError: "API key missing" });
      const { tools } = createIndexTools(makeSearcher(), indexer, makeDb({ chunkCount: 5 }), makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("Last error:");
      expect(result).toContain("API key missing");
    });

    it("codebase_status not-built includes dbPath", async () => {
      const db = makeDb({ chunkCount: 0 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("/tmp/lancedb");
      expect(result).toContain("Not built");
    });

    it("codebase_status shows relative time in hours", async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(3, twoHoursAgo));
      const db = makeDb({ chunkCount: 10 });
      const { tools } = createIndexTools(makeSearcher(), makeIndexer(), db, makeConfig());
      const tool = tools.find((t) => t.name === "codebase_status")!;
      const result = await tool.handler({});
      expect(result).toContain("hours ago");
    });

    it("codebase_status shows relative time in days", async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      vi.mocked(readMtimeCache).mockResolvedValueOnce(makeMtimeCache(3, threeDaysAgo));
      const db = makeDb({ chunkCount: 10 });
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

describe("formatSummary", () => {
  it("formatSummary includes Removed line", () => {
    const summary: IndexSummary = {
      added: 3, addedChunks: 12,
      updated: 1, updatedChunks: 4,
      removed: 2,
      skipped: 50, skippedTooLarge: 0,
      failedFiles: [],
      totalChunks: 100,
      elapsedMs: 5000,
    };
    const output = formatSummary(summary);
    expect(output).toContain("Removed: 2 files");
  });

  it("formatSummary uses singular for Removed: 1 file", () => {
    const summary: IndexSummary = {
      added: 0, addedChunks: 0,
      updated: 0, updatedChunks: 0,
      removed: 1,
      skipped: 0, skippedTooLarge: 0,
      failedFiles: [],
      totalChunks: 10,
      elapsedMs: 1000,
    };
    expect(formatSummary(summary)).toContain("Removed: 1 file");
    expect(formatSummary(summary)).not.toContain("1 files");
  });
});
