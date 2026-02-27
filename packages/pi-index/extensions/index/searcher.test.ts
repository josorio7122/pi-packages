import { describe, it, expect, vi } from "vitest";
import { parseScopeFilters, buildFilter, formatResults, Searcher } from "./searcher.js";
import type { ScoredChunk } from "./mmr.js";
import type { IndexDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { IndexConfig } from "./config.js";

// --- parseScopeFilters ---

describe("parseScopeFilters", () => {
  it("extracts @dir filter and returns clean query", () => {
    const { cleanQuery, filters } = parseScopeFilters("auth logic @dir:src/auth");
    expect(cleanQuery).toBe("auth logic");
    expect(filters).toEqual([{ scope: "dir", value: "src/auth" }]);
  });

  it("extracts @file filter", () => {
    const { filters } = parseScopeFilters("login @file:auth.ts");
    expect(filters).toEqual([{ scope: "file", value: "auth.ts" }]);
  });

  it("extracts @ext filter", () => {
    const { filters } = parseScopeFilters("schema @ext:.py");
    expect(filters).toEqual([{ scope: "ext", value: ".py" }]);
  });

  it("extracts @lang filter", () => {
    const { filters } = parseScopeFilters("handler @lang:typescript");
    expect(filters).toEqual([{ scope: "lang", value: "typescript" }]);
  });

  it("handles multiple filters", () => {
    const { cleanQuery, filters } = parseScopeFilters("auth @dir:src/auth @lang:typescript");
    expect(cleanQuery).toBe("auth");
    expect(filters).toHaveLength(2);
  });

  it("is case-insensitive for scope name (@FILE: works)", () => {
    const { filters } = parseScopeFilters("test @FILE:auth.ts");
    expect(filters[0].scope).toBe("file");
  });

  it("throws INVALID_SCOPE_FILTER for unknown scope", () => {
    expect(() => parseScopeFilters("auth @module:core")).toThrow("INVALID_SCOPE_FILTER");
  });

  it("returns unchanged query when no filters present", () => {
    const { cleanQuery, filters } = parseScopeFilters("authentication logic");
    expect(cleanQuery).toBe("authentication logic");
    expect(filters).toHaveLength(0);
  });

  it("collapses extra whitespace after filter removal", () => {
    const { cleanQuery } = parseScopeFilters("auth  @dir:src  logic");
    expect(cleanQuery.trim()).toBe("auth logic");
  });
});

// --- buildFilter ---

describe("buildFilter", () => {
  it("returns undefined when no filters", () => {
    expect(buildFilter([])).toBeUndefined();
  });

  it("builds @file filter", () => {
    const f = buildFilter([{ scope: "file", value: "auth.ts" }]);
    expect(f).toBeDefined();
    expect(f).toContain("auth.ts");
  });

  it("builds @dir filter", () => {
    const f = buildFilter([{ scope: "dir", value: "src/auth" }]);
    expect(f).toBeDefined();
    expect(f).toContain("src/auth");
  });

  it("builds @ext filter", () => {
    const f = buildFilter([{ scope: "ext", value: ".py" }]);
    expect(f).toBeDefined();
    expect(f).toContain(".py");
  });

  it("builds @lang filter with lowercase value", () => {
    const f = buildFilter([{ scope: "lang", value: "TypeScript" }]);
    expect(f).toBeDefined();
    expect(f).toContain("typescript");
  });

  it("ORs conditions for same-type filters", () => {
    const f = buildFilter([
      { scope: "lang", value: "typescript" },
      { scope: "lang", value: "python" },
    ]);
    expect(f).toContain("typescript");
    expect(f).toContain("python");
    expect(f).toContain("OR");
    expect(f).not.toContain("AND");
  });

  it("escapes underscore in @file LIKE pattern", () => {
    const f = buildFilter([{ scope: "file", value: "auth_helper.ts" }]);
    expect(f).toBeDefined();
    // LIKE clause must have the underscore escaped as \_
    expect(f).toMatch(/LIKE.*auth\\_helper\.ts/);
    // Must include ESCAPE clause
    expect(f).toContain("ESCAPE");
    // Exact match clause uses unescaped name (= comparison)
    expect(f).toContain("auth_helper.ts");
  });

  it("escapes percent in @file LIKE pattern", () => {
    const f = buildFilter([{ scope: "file", value: "100%_done.ts" }]);
    expect(f).toBeDefined();
    expect(f).toMatch(/LIKE.*100\\%\\_done\.ts/);
    expect(f).toContain("ESCAPE");
  });

  it("escapes underscore in @dir LIKE pattern", () => {
    const f = buildFilter([{ scope: "dir", value: "src/my_module" }]);
    expect(f).toBeDefined();
    expect(f).toMatch(/LIKE.*src\/my\\_module/);
    expect(f).toContain("ESCAPE");
  });

  it("does not add ESCAPE clause to @ext filter (uses = not LIKE)", () => {
    const f = buildFilter([{ scope: "ext", value: ".ts" }]);
    expect(f).toBeDefined();
    expect(f).not.toContain("ESCAPE");
    expect(f).not.toContain("LIKE");
  });

  it("does not add ESCAPE clause to @lang filter (uses = not LIKE)", () => {
    const f = buildFilter([{ scope: "lang", value: "typescript" }]);
    expect(f).toBeDefined();
    expect(f).not.toContain("ESCAPE");
    expect(f).not.toContain("LIKE");
  });
});

// --- formatResults ---

describe("formatResults", () => {
  function makeResult(id: string, filePath: string, score: number): ScoredChunk {
    return {
      id, filePath,
      chunkIndex: 0, startLine: 1, endLine: 10,
      text: `function ${id}() {}`,
      vector: [1, 0],
      language: "typescript", extension: ".ts",
      symbol: id, mtime: 1000, createdAt: 1000, score,
    };
  }

  it("includes file path in output", () => {
    const output = formatResults([makeResult("login", "src/auth.ts", 0.87)], "auth");
    expect(output).toContain("src/auth.ts");
  });

  it("includes score as integer percentage", () => {
    const output = formatResults([makeResult("login", "src/auth.ts", 0.87)], "auth");
    expect(output).toContain("87%");
  });

  it("includes chunk text", () => {
    const output = formatResults([makeResult("login", "src/auth.ts", 0.9)], "auth");
    expect(output).toContain("function login() {}");
  });

  it("returns no-results message when empty", () => {
    const output = formatResults([], "missing query");
    expect(output).toContain("No results found");
    expect(output).toContain("missing query");
  });

  it("numbers results starting at 1", () => {
    const results = [
      makeResult("a", "src/a.ts", 0.9),
      makeResult("b", "src/b.ts", 0.8),
    ];
    const output = formatResults(results, "test");
    expect(output).toMatch(/^1\./m);
    expect(output).toMatch(/^2\./m);
  });

  it("includes line range in output", () => {
    const output = formatResults([makeResult("fn", "src/x.ts", 0.8)], "q");
    expect(output).toContain("lines 1\u201310");
  });
});

// --- Searcher ---

describe("Searcher", () => {
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
      minScore: 0.0, // set low so all results pass threshold in tests
      mmrLambda: 0.5,
      ...override,
    };
  }

  function makeChunk(id: string, score: number): ScoredChunk {
    return {
      id, filePath: `src/${id}.ts`,
      chunkIndex: 0, startLine: 1, endLine: 5,
      text: `function ${id}() {}`,
      vector: [1, 0, 0],
      language: "typescript", extension: ".ts",
      symbol: id, mtime: 1000, createdAt: 1000, score,
    };
  }

  function makeDb(results: ScoredChunk[] = []): IndexDB {
    return {
      hybridSearch: vi.fn().mockResolvedValue(results),
      vectorSearch: vi.fn().mockResolvedValue(results),
      getStatus: vi.fn().mockResolvedValue({ chunkCount: 5, fileCount: 2, lastIndexedAt: Date.now() }),
      count: vi.fn().mockResolvedValue(5),
      insertChunks: vi.fn(),
      deleteByFilePath: vi.fn(),
      deleteAll: vi.fn(),
    } as unknown as IndexDB;
  }

  function makeEmb(vec = [0.1, 0.2, 0.3]): Embeddings {
    return { embed: vi.fn().mockResolvedValue(vec) } as unknown as Embeddings;
  }

  it("returns formatted results from hybridSearch", async () => {
    const searcher = new Searcher(
      makeDb([makeChunk("login", 0.9)]),
      makeEmb(),
      makeConfig(),
    );
    const result = await searcher.search("auth");
    expect(result).toContain("login");
    expect(result).toContain("src/login.ts");
  });

  it("applies default limit of 8", async () => {
    const db = makeDb([makeChunk("a", 0.9)]);
    const searcher = new Searcher(db, makeEmb(), makeConfig());
    await searcher.search("auth");
    expect(db.hybridSearch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      expect.any(Number),
      undefined,
    );
  });

  it("filters results below minScore", async () => {
    const searcher = new Searcher(
      makeDb([makeChunk("a", 0.05)]),  // score below minScore
      makeEmb(),
      makeConfig({ minScore: 0.2 }),
    );
    const result = await searcher.search("auth");
    expect(result).toContain("No results found");
  });

  it("returns INVALID_SCOPE_FILTER error for unknown scope", async () => {
    const searcher = new Searcher(makeDb(), makeEmb(), makeConfig());
    const result = await searcher.search("auth @module:core");
    expect(result).toContain("INVALID_SCOPE_FILTER");
  });

  it("returns error with [CODE] bracket format for invalid scope", async () => {
    const searcher = new Searcher(makeDb(), makeEmb(), makeConfig());
    const result = await searcher.search("auth @module:core");
    expect(result).toBe("Error: [INVALID_SCOPE_FILTER] Unknown scope '@module'. Supported scopes: @file, @dir, @ext, @lang.");
  });

  it("returns EMBEDDING_FAILED when embed throws", async () => {
    const emb = { embed: vi.fn().mockRejectedValue(new Error("API down")) } as unknown as Embeddings;
    const searcher = new Searcher(makeDb(), emb, makeConfig());
    const result = await searcher.search("auth");
    expect(result).toContain("EMBEDDING_FAILED");
  });

  it("strips scope filters before embedding", async () => {
    const emb = makeEmb();
    const searcher = new Searcher(makeDb(), emb, makeConfig());
    await searcher.search("auth logic @dir:src/auth");
    expect(emb.embed).toHaveBeenCalledWith("auth logic");
  });

  it("caps limit at 20", async () => {
    const db = makeDb();
    const searcher = new Searcher(db, makeEmb(), makeConfig());
    await searcher.search("auth", 100);
    // fetch limit passed to hybridSearch should be 20 * 3 = 60 max
    const fetchLimit = (db.hybridSearch as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(fetchLimit).toBeLessThanOrEqual(60);
  });

  it("returns empty result message for limit 0", async () => {
    const searcher = new Searcher(makeDb(), makeEmb(), makeConfig());
    const result = await searcher.search("auth", 0);
    expect(result).toContain("No results found");
  });

  it("minScore override filters more aggressively than config minScore", async () => {
    // Config minScore = 0.0 (allow all), but we pass minScore=0.95 override
    const searcher = new Searcher(
      makeDb([makeChunk("a", 0.9)]), // score 0.9 < override 0.95
      makeEmb(),
      makeConfig({ minScore: 0.0 }),
    );
    const result = await searcher.search("auth", 8, 0.95);
    expect(result).toContain("No results found");
  });

  it("minScore override allows results below config threshold", async () => {
    // Config minScore = 0.5, override = 0.1 — chunk with score 0.3 should pass
    const searcher = new Searcher(
      makeDb([makeChunk("lowscore", 0.3)]),
      makeEmb(),
      makeConfig({ minScore: 0.5 }),
    );
    const result = await searcher.search("auth", 8, 0.1);
    expect(result).toContain("lowscore");
  });

  it("falls back to cfg.minScore when minScore not provided", async () => {
    // Config minScore = 0.5, no override — chunk with score 0.3 should be filtered
    const searcher = new Searcher(
      makeDb([makeChunk("lowscore", 0.3)]),
      makeEmb(),
      makeConfig({ minScore: 0.5 }),
    );
    const result = await searcher.search("auth");
    expect(result).toContain("No results found");
  });

  it("returns [INDEX_EMPTY] when db count is 0", async () => {
    const emptyDb = {
      hybridSearch: vi.fn().mockResolvedValue([]),
      vectorSearch: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({ chunkCount: 0 }),
      count: vi.fn().mockResolvedValue(0),
      insertChunks: vi.fn(),
      deleteByFilePath: vi.fn(),
      deleteAll: vi.fn(),
    } as unknown as IndexDB;
    const searcher = new Searcher(emptyDb, makeEmb(), makeConfig());
    const result = await searcher.search("auth");
    expect(result).toContain("[INDEX_EMPTY]");
  });

  it("[INDEX_EMPTY] message mentions codebase_index or /index-rebuild", async () => {
    const emptyDb = {
      hybridSearch: vi.fn().mockResolvedValue([]),
      vectorSearch: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({ chunkCount: 0 }),
      count: vi.fn().mockResolvedValue(0),
      insertChunks: vi.fn(),
      deleteByFilePath: vi.fn(),
      deleteAll: vi.fn(),
    } as unknown as IndexDB;
    const searcher = new Searcher(emptyDb, makeEmb(), makeConfig());
    const result = await searcher.search("auth");
    expect(result).toMatch(/codebase_index|index-rebuild/);
  });

  it("[INDEX_EMPTY] does not call embed when db is empty", async () => {
    const emptyDb = {
      hybridSearch: vi.fn().mockResolvedValue([]),
      vectorSearch: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({ chunkCount: 0 }),
      count: vi.fn().mockResolvedValue(0),
      insertChunks: vi.fn(),
      deleteByFilePath: vi.fn(),
      deleteAll: vi.fn(),
    } as unknown as IndexDB;
    const emb = makeEmb();
    const searcher = new Searcher(emptyDb, emb, makeConfig());
    await searcher.search("auth");
    expect(emb.embed).not.toHaveBeenCalled();
  });
});
