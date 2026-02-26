import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseConfig, loadConfig, vectorDimsForModel, resolveDbPath } from "./config.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Imported after mock so we get the mocked version
const { existsSync } = await import("node:fs");

describe("vectorDimsForModel", () => {
  it("returns 1536 for text-embedding-3-small", () => {
    expect(vectorDimsForModel("text-embedding-3-small")).toBe(1536);
  });

  it("returns 3072 for text-embedding-3-large", () => {
    expect(vectorDimsForModel("text-embedding-3-large")).toBe(3072);
  });

  it("throws for unknown model", () => {
    expect(() => vectorDimsForModel("gpt-4")).toThrow("Unsupported embedding model");
  });
});

describe("resolveDbPath", () => {
  it("resolves relative paths against the indexRoot", () => {
    const result = resolveDbPath(".pi/index/lancedb", "/some/project");
    expect(result).toBe("/some/project/.pi/index/lancedb");
  });

  it("returns absolute paths unchanged", () => {
    const result = resolveDbPath("/abs/path/lancedb", "/some/project");
    expect(result).toBe("/abs/path/lancedb");
  });
});

describe("parseConfig", () => {
  beforeEach(() => {
    // All dirs exist by default so existing tests don't break
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("returns valid config with required fields only", () => {
    const cfg = parseConfig({ apiKey: "sk-test", indexRoot: "/project" });
    expect(cfg.apiKey).toBe("sk-test");
    expect(cfg.model).toBe("text-embedding-3-small");
    expect(cfg.dimensions).toBe(1536);
    expect(cfg.autoIndex).toBe(false);
    expect(cfg.maxFileKB).toBe(500);
    expect(cfg.minScore).toBe(0.2);
    expect(cfg.dbPath).toContain(".pi/index/lancedb");
    expect(cfg.mtimeCachePath).toContain(".pi/index/mtime-cache.json");
    expect(cfg.indexDirs).toEqual(["/project"]);
  });

  it("throws when apiKey is missing", () => {
    expect(() => parseConfig({ apiKey: "", indexRoot: "/project" })).toThrow("apiKey is required");
  });

  it("throws for invalid model", () => {
    expect(() => parseConfig({ apiKey: "sk-test", model: "gpt-4", indexRoot: "/project" })).toThrow("Unsupported embedding model");
  });

  it("throws when minScore is out of range", () => {
    expect(() => parseConfig({ apiKey: "sk-test", minScore: 1.5, indexRoot: "/project" })).toThrow("minScore");
  });

  it("throws when maxFileKB is 0", () => {
    expect(() => parseConfig({ apiKey: "sk-test", maxFileKB: 0, indexRoot: "/project" })).toThrow("maxFileKB");
  });

  it("accepts explicit model and sets correct dimensions", () => {
    const cfg = parseConfig({ apiKey: "sk-test", model: "text-embedding-3-large", indexRoot: "/p" });
    expect(cfg.dimensions).toBe(3072);
  });

  it("accepts custom indexDirs as comma-separated string", () => {
    const cfg = parseConfig({
      apiKey: "sk-test",
      indexDirs: "/project/src,/project/assets",
      indexRoot: "/project",
    });
    expect(cfg.indexDirs).toEqual(["/project/src", "/project/assets"]);
  });

  // M-1: mmrLambda tests
  it("mmrLambda defaults to 0.5", () => {
    const cfg = parseConfig({ apiKey: "sk-test", indexRoot: "/project" });
    expect(cfg.mmrLambda).toBe(0.5);
  });

  it("accepts mmrLambda: 0.8", () => {
    const cfg = parseConfig({ apiKey: "sk-test", mmrLambda: 0.8, indexRoot: "/project" });
    expect(cfg.mmrLambda).toBe(0.8);
  });

  it("throws when mmrLambda is -0.1", () => {
    expect(() => parseConfig({ apiKey: "sk-test", mmrLambda: -0.1, indexRoot: "/project" })).toThrow("mmrLambda");
  });

  it("throws when mmrLambda is 1.1", () => {
    expect(() => parseConfig({ apiKey: "sk-test", mmrLambda: 1.1, indexRoot: "/project" })).toThrow("mmrLambda");
  });

  // M-2: non-existent dir warning
  it("warns and removes a non-existent dir, falls back to indexRoot when all removed", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const cfg = parseConfig({
      apiKey: "sk-test",
      indexDirs: "/nonexistent/dir",
      indexRoot: "/project",
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("/nonexistent/dir"));
    expect(cfg.indexDirs).toEqual(["/project"]);
    warnSpy.mockRestore();
  });

  it("warns and removes only the missing dir, keeps existing ones", () => {
    vi.mocked(existsSync).mockImplementation((p) => p !== "/missing/dir");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const cfg = parseConfig({
      apiKey: "sk-test",
      indexDirs: "/missing/dir,/exists/dir",
      indexRoot: "/project",
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("/missing/dir"));
    expect(cfg.indexDirs).toEqual(["/exists/dir"]);
    warnSpy.mockRestore();
  });
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
    delete process.env.OPENAI_API_KEY;
    delete process.env.PI_INDEX_API_KEY;
    delete process.env.PI_INDEX_MODEL;
    delete process.env.PI_INDEX_DB_PATH;
    delete process.env.PI_INDEX_DIRS;
    delete process.env.PI_INDEX_AUTO;
    delete process.env.PI_INDEX_MAX_FILE_KB;
    delete process.env.PI_INDEX_MIN_SCORE;
    delete process.env.PI_INDEX_MMR_LAMBDA;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("throws when no API key env var is set", () => {
    expect(() => loadConfig("/project")).toThrow("CONFIG_MISSING_API_KEY");
  });

  it("uses OPENAI_API_KEY when PI_INDEX_API_KEY is absent", () => {
    process.env.OPENAI_API_KEY = "sk-shared";
    const cfg = loadConfig("/project");
    expect(cfg.apiKey).toBe("sk-shared");
  });

  it("PI_INDEX_API_KEY takes precedence over OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-shared";
    process.env.PI_INDEX_API_KEY = "sk-index";
    const cfg = loadConfig("/project");
    expect(cfg.apiKey).toBe("sk-index");
  });

  it("reads PI_INDEX_AUTO=true", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_AUTO = "true";
    const cfg = loadConfig("/project");
    expect(cfg.autoIndex).toBe(true);
  });

  // M-1: PI_INDEX_MMR_LAMBDA env var
  it("reads PI_INDEX_MMR_LAMBDA env var", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MMR_LAMBDA = "0.7";
    const cfg = loadConfig("/project");
    expect(cfg.mmrLambda).toBe(0.7);
  });
});
