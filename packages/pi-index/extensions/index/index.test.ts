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

vi.mock("./utils.js", () => ({
  relativeTime: vi.fn().mockReturnValue("1 hour ago"),
}));

// ─── Happy-path tests (config succeeds) ────────────────────────────────────

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

  // Fix 1+2: RULE is 39 chars and content lines have no leading indent
  it("/index-status not-built output uses 39-char separator and no indent on content lines", async () => {
    const statusCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-status");
    expect(statusCall).toBeDefined();
    const handler = statusCall![1].handler;

    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(1);
    const [msg] = notified[0];
    const lines = msg.split("\n");
    // separator is exactly 39 ─ chars
    const RULE = "─".repeat(39);
    expect(lines[1]).toBe(RULE);
    expect(lines[lines.length - 1]).toBe(RULE);
    // content lines must NOT start with spaces (no 2-space indent)
    // Exclude the continuation line which intentionally has 15-space alignment indent
    const contentLines = lines.slice(2, -1).filter((l: string) => !l.includes("Run /index-rebuild"));
    for (const line of contentLines) {
      expect(line).not.toMatch(/^ /);
    }
  });

  // Fix 3: continuation line uses 15 spaces (aligns under "Not built")
  it("/index-status not-built continuation line has 15-space indent", async () => {
    const statusCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-status");
    const handler = statusCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    const [msg] = notified[0];
    const lines = msg.split("\n");
    // Find the continuation line (contains "Run /index-rebuild")
    const contLine = lines.find((l: string) => l.includes("Run /index-rebuild"));
    expect(contLine).toBeDefined();
    expect(contLine).toMatch(/^ {15}Run/);
  });

  // Fix 7: /index-rebuild skipped uses skippedTooLarge and label "(too large)"
  it("/index-rebuild output shows skippedTooLarge with '(too large)' label, not failedFiles", async () => {
    // Use vi.doMock (not hoisted) + vi.resetModules to override indexer for this test
    vi.resetModules();
    vi.doMock("./indexer.js", () => ({
      Indexer: function (this: Record<string, unknown>) {
        // skippedTooLarge=3 but failedFiles has 2 entries — verifies correct field is used
        this.run = vi.fn().mockResolvedValue({
          added: 5, addedChunks: 20, updated: 0, updatedChunks: 0,
          removed: 0, skipped: 0, skippedTooLarge: 3,
          failedFiles: ["a.ts", "b.ts"], totalChunks: 20, elapsedMs: 2500,
        });
        Object.defineProperty(this, "isRunning", { get: () => false });
      },
    }));
    const mod2 = await import("./index.js");
    const ext2 = mod2.default as typeof extension;
    const rt2 = vi.fn();
    const rc2 = vi.fn();
    ext2({ registerTool: rt2, registerCommand: rc2, on: vi.fn() } as never);

    const rebuildCall = rc2.mock.calls.find((c: [string]) => c[0] === "index-rebuild");
    expect(rebuildCall).toBeDefined();
    const handler = rebuildCall![1].handler;

    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    // First notify is "Rebuilding...", second is the summary
    expect(notified.length).toBe(2);
    const summaryMsg = notified[1][0];
    expect(summaryMsg).toContain("3 files (too large)");
    expect(summaryMsg).not.toContain("2 files");
    expect(summaryMsg).not.toContain("(errors)");
  });

  // Fix 8: /index-rebuild time uses integer seconds (Math.round)
  it("/index-rebuild time is formatted as integer seconds (Math.round)", async () => {
    vi.resetModules();
    vi.doMock("./indexer.js", () => ({
      Indexer: function (this: Record<string, unknown>) {
        this.run = vi.fn().mockResolvedValue({
          added: 1, addedChunks: 4, updated: 0, updatedChunks: 0,
          removed: 0, skipped: 0, skippedTooLarge: 0,
          failedFiles: [], totalChunks: 4, elapsedMs: 47400, // 47.4s → rounds to 47s
        });
        Object.defineProperty(this, "isRunning", { get: () => false });
      },
    }));
    const mod2 = await import("./index.js");
    const ext2 = mod2.default as typeof extension;
    const rt2 = vi.fn();
    const rc2 = vi.fn();
    ext2({ registerTool: rt2, registerCommand: rc2, on: vi.fn() } as never);

    const rebuildCall = rc2.mock.calls.find((c: [string]) => c[0] === "index-rebuild");
    const handler = rebuildCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(2);
    const summaryMsg = notified[1][0];
    // Must be "47s" not "47.4s"
    expect(summaryMsg).toContain("47s");
    expect(summaryMsg).not.toMatch(/\d+\.\d+s/);
  });

  it("/index-rebuild success shows rebuilt summary", async () => {
    const cmdCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-rebuild");
    const handler = cmdCall![1].handler as (args: unknown, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
    const localCtx = { ui: { notify: vi.fn() } };
    await handler({}, localCtx);
    expect(localCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Index rebuilt:"),
      "info",
    );
  });

  it("/index-clear success shows cleared message", async () => {
    const cmdCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-clear");
    const handler = cmdCall![1].handler as (args: unknown, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
    const localCtx = { ui: { notify: vi.fn() } };
    await handler({}, localCtx);
    expect(localCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Index cleared"),
      "info",
    );
  });

  it("registers before_agent_start hook when autoIndex is true", async () => {
    vi.resetModules();
    vi.doMock("./config.js", () => ({
      loadConfig: vi.fn().mockReturnValue({
        apiKey: "sk-test", model: "text-embedding-3-small", dimensions: 1536,
        dbPath: "/tmp/lancedb", mtimeCachePath: "/tmp/mtime-cache.json",
        indexDirs: ["/project"], autoIndex: true, maxFileKB: 500, minScore: 0.2,
      }),
    }));
    const mod2 = await import("./index.js");
    const ext2 = mod2.default as (pi: typeof pi) => void;
    const newOnFn = vi.fn();
    const newPi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: newOnFn };
    ext2(newPi as never);
    expect(newOnFn).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
  });

  it("/index-status shows chunk count when index has data", async () => {
    vi.resetModules();
    vi.doMock("./db.js", () => ({
      IndexDB: function (this: Record<string, unknown>) {
        this.getStatus = vi.fn().mockResolvedValue({ chunkCount: 50, fileCount: 10, lastIndexedAt: 1700000000000 });
        this.deleteAll = vi.fn().mockResolvedValue(undefined);
        this.vectorSearch = vi.fn().mockResolvedValue([]);
        this.hybridSearch = vi.fn().mockResolvedValue([]);
        this.insertChunks = vi.fn().mockResolvedValue(undefined);
        this.deleteByFilePath = vi.fn().mockResolvedValue(undefined);
      },
    }));
    const mod2 = await import("./index.js");
    const ext2 = mod2.default as (pi: typeof pi) => void;
    const rc2 = vi.fn();
    ext2({ registerTool: vi.fn(), registerCommand: rc2, on: vi.fn() } as never);

    const statusCall = rc2.mock.calls.find((c: [string]) => c[0] === "index-status");
    const handler = statusCall![1].handler as (args: unknown, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
    const localCtx = { ui: { notify: vi.fn() } };
    await handler({}, localCtx);
    expect(localCtx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("50"),
      "info",
    );
  });

  // Fix 6: /index-status error is reported gracefully (not as "error" level)
  it("/index-status reports unreadable state gracefully with info level", async () => {
    vi.resetModules();
    vi.doMock("./db.js", () => ({
      IndexDB: function (this: Record<string, unknown>) {
        this.getStatus = vi.fn().mockRejectedValue(new Error("disk read failure"));
        this.deleteAll = vi.fn().mockResolvedValue(undefined);
      },
    }));
    const mod2 = await import("./index.js");
    const ext2 = mod2.default as typeof extension;
    const rt2 = vi.fn();
    const rc2 = vi.fn();
    ext2({ registerTool: rt2, registerCommand: rc2, on: vi.fn() } as never);

    const statusCall = rc2.mock.calls.find((c: [string]) => c[0] === "index-status");
    const handler = statusCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(1);
    const [msg, level] = notified[0];
    expect(level).toBe("info"); // not "error"
    expect(msg).toContain("Could not read index state");
  });
});

// ─── Config-fail (missing API key) tests ────────────────────────────────────

describe("pi-index extension — config fails (missing API key)", () => {
  let registerTool: ReturnType<typeof vi.fn>;
  let registerCommand: ReturnType<typeof vi.fn>;
  let pi: { registerTool: typeof registerTool; registerCommand: typeof registerCommand; on: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    // Override loadConfig to throw using vi.doMock (not hoisted)
    vi.doMock("./config.js", () => ({
      loadConfig: vi.fn().mockImplementation(() => {
        throw new Error("CONFIG_MISSING_API_KEY");
      }),
    }));
    registerTool = vi.fn();
    registerCommand = vi.fn();
    pi = { registerTool, registerCommand, on: vi.fn() };

    const mod = await import("./index.js");
    const extension = mod.default as (pi: typeof pi) => void;
    extension(pi as never);
  });

  it("registers stub codebase_search tool when config fails", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_search");
  });

  it("registers stub codebase_index tool when config fails", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_index");
  });

  it("registers stub codebase_status tool when config fails", () => {
    const names = registerTool.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(names).toContain("codebase_status");
  });

  // Fix 5: /index-status must be registered even when config fails
  it("registers /index-status command when config fails", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-status");
  });

  // Fix 5: /index-rebuild must be registered even when config fails
  it("registers /index-rebuild command when config fails", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-rebuild");
  });

  // Fix 5: /index-clear must be registered even when config fails
  it("registers /index-clear command when config fails", () => {
    const names = registerCommand.mock.calls.map((c: [string]) => c[0]);
    expect(names).toContain("index-clear");
  });

  // Fix 5: /index-status shows warning about missing API key
  it("/index-status shows API key warning when config fails", async () => {
    const statusCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-status");
    expect(statusCall).toBeDefined();
    const handler = statusCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(1);
    const [msg, level] = notified[0];
    expect(level).toBe("info");
    expect(msg).toContain("⚠ Warning: OPENAI_API_KEY is not set. Indexing and search are disabled.");
    expect(msg).toContain("Status:        Not built");
    // separator is 39 chars
    expect(msg).toContain("─".repeat(39));
  });

  // Fix 5: /index-rebuild shows error message when config fails
  it("/index-rebuild shows CONFIG_MISSING_API_KEY error when config fails", async () => {
    const rebuildCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-rebuild");
    expect(rebuildCall).toBeDefined();
    const handler = rebuildCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(1);
    const [msg, level] = notified[0];
    expect(level).toBe("error");
    expect(msg).toContain("CONFIG_MISSING_API_KEY");
  });

  // Fix 5: /index-clear shows error message when config fails
  it("/index-clear shows CONFIG_MISSING_API_KEY error when config fails", async () => {
    const clearCall = registerCommand.mock.calls.find((c: [string]) => c[0] === "index-clear");
    expect(clearCall).toBeDefined();
    const handler = clearCall![1].handler;
    const notified: Array<[string, string]> = [];
    const ctx = { ui: { notify: (msg: string, level: string) => notified.push([msg, level]) } };
    await handler([], ctx);

    expect(notified.length).toBe(1);
    const [msg, level] = notified[0];
    expect(level).toBe("error");
    expect(msg).toContain("CONFIG_MISSING_API_KEY");
  });
});
