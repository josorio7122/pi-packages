import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all internal modules before importing the extension
vi.mock("./config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    apiKey: "sk-test",
    model: "text-embedding-3-small",
    dimensions: 1536,
    dbPath: "/tmp/lancedb",
    mtimeCachePath: "/tmp/mtime-cache.json",
    indexDirs: ["/project"],
    autoIndex: false,
    maxFileKB: 500,
    minScore: 0.2,
  }),
}));

vi.mock("./db.js", () => ({
  IndexDB: function (this: Record<string, unknown>) {
    this.count = vi.fn().mockResolvedValue(0);
    this.getStatus = vi.fn().mockResolvedValue({ chunkCount: 0, fileCount: 0, lastIndexedAt: null });
    this.insertChunks = vi.fn().mockResolvedValue(undefined);
    this.deleteByFilePath = vi.fn().mockResolvedValue(undefined);
    this.deleteAll = vi.fn().mockResolvedValue(undefined);
    this.vectorSearch = vi.fn().mockResolvedValue([]);
    this.hybridSearch = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("./embeddings.js", () => ({
  Embeddings: function (this: Record<string, unknown>) {
    this.embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  },
}));

vi.mock("./indexer.js", () => ({
  Indexer: function (this: Record<string, unknown>) {
    this.run = vi.fn().mockResolvedValue({
      added: 0, addedChunks: 0, updated: 0, updatedChunks: 0,
      removed: 0, skipped: 0, skippedTooLarge: 0,
      failedFiles: [], totalChunks: 0, elapsedMs: 1,
    });
    Object.defineProperty(this, "isRunning", { get: () => false });
  },
}));

vi.mock("./searcher.js", () => ({
  Searcher: function (this: Record<string, unknown>) {
    this.search = vi.fn().mockResolvedValue("No results found.");
  },
}));

vi.mock("./walker.js", () => ({
  readMtimeCache: vi.fn().mockResolvedValue(new Map()),
  writeMtimeCache: vi.fn().mockResolvedValue(undefined),
  walkDirs: vi.fn().mockResolvedValue({ files: [], skippedLarge: 0 }),
  diffFileSet: vi.fn().mockReturnValue({ toAdd: [], toUpdate: [], toDelete: [] }),
}));

vi.mock("./tools.js", () => ({
  createIndexTools: vi.fn().mockReturnValue({
    tools: [
      { name: "codebase_search", description: "search", parameters: {}, handler: vi.fn() },
      { name: "codebase_index", description: "index", parameters: {}, handler: vi.fn() },
      { name: "codebase_status", description: "status", parameters: {}, handler: vi.fn() },
    ],
  }),
}));

describe("pi-index extension entry point", () => {
  let registerTool: ReturnType<typeof vi.fn>;
  let registerCommand: ReturnType<typeof vi.fn>;
  let onFn: ReturnType<typeof vi.fn>;
  let pi: { registerTool: typeof registerTool; registerCommand: typeof registerCommand; on: typeof onFn };
  let extension: (pi: typeof pi) => void;

  beforeEach(async () => {
    vi.resetModules(); // clear module cache so each test gets fresh mocks
    registerTool = vi.fn();
    registerCommand = vi.fn();
    onFn = vi.fn();
    pi = { registerTool, registerCommand, on: onFn };

    // Dynamic import AFTER mocks are set up
    const mod = await import("./index.js");
    extension = mod.default as typeof extension;
    extension(pi as never);
  });

  it("registers the codebase_search tool", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_search");
  });

  it("registers the codebase_index tool", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_index");
  });

  it("registers the codebase_status tool", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_status");
  });

  it("registers /index-status slash command", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-status");
  });

  it("registers /index-rebuild slash command", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-rebuild");
  });

  it("registers /index-clear slash command", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-clear");
  });

  it("does NOT register before_agent_start hook when autoIndex is false", () => {
    expect(onFn).not.toHaveBeenCalled();
  });
});
