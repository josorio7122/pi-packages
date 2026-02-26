import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig, loadConfig, vectorDimsForModel, resolveDbPath } from "./config.js";

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
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.PI_INDEX_API_KEY;
    delete process.env.PI_INDEX_MODEL;
    delete process.env.PI_INDEX_DB_PATH;
    delete process.env.PI_INDEX_DIRS;
    delete process.env.PI_INDEX_AUTO;
    delete process.env.PI_INDEX_MAX_FILE_KB;
    delete process.env.PI_INDEX_MIN_SCORE;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
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
});
