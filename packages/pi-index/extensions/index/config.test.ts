import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseConfig, loadConfig, vectorDimsForModel, resolveDbPath } from "./config.js";
// Note: createProvider is imported dynamically in its describe block to allow TDD
// (avoid TS compile error when the export doesn't exist yet)

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

  // autoIndexInterval tests
  it("autoIndexInterval defaults to 0", () => {
    const cfg = parseConfig({ apiKey: "sk-test", indexRoot: "/project" });
    expect(cfg.autoIndexInterval).toBe(0);
  });

  it("accepts autoIndexInterval: 30", () => {
    const cfg = parseConfig({ apiKey: "sk-test", autoIndexInterval: 30, indexRoot: "/project" });
    expect(cfg.autoIndexInterval).toBe(30);
  });

  it("throws when autoIndexInterval is -1", () => {
    expect(() => parseConfig({ apiKey: "sk-test", autoIndexInterval: -1, indexRoot: "/project" })).toThrow("autoIndexInterval must be >= 0");
  });

  // M-2: non-existent dir warning
  it("accepts indexDirs as an array of valid paths", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // Use a different dir than indexRoot so we can tell if the array was used
    const cfg = parseConfig({ apiKey: "sk-test", indexDirs: ["/custom/dir"], indexRoot: "/project" });
    expect(cfg.indexDirs).toEqual(["/custom/dir"]);
  });

  it("falls back to indexRoot when indexDirs is an empty array", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const cfg = parseConfig({ apiKey: "sk-test", indexDirs: [], indexRoot: "/project" });
    expect(cfg.indexDirs).toEqual(["/project"]);
  });

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
    delete process.env.PI_INDEX_AUTO_INTERVAL;
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

  // NaN guard — invalid env var strings
  it("throws CONFIG_INVALID_VALUE when PI_INDEX_MAX_FILE_KB=abc", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MAX_FILE_KB = "abc";
    expect(() => loadConfig("/project")).toThrow("CONFIG_INVALID_VALUE");
  });

  it("throws CONFIG_INVALID_VALUE when PI_INDEX_MIN_SCORE=notanumber", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MIN_SCORE = "notanumber";
    expect(() => loadConfig("/project")).toThrow("CONFIG_INVALID_VALUE");
  });

  it("throws CONFIG_INVALID_VALUE when PI_INDEX_MMR_LAMBDA=xyz", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MMR_LAMBDA = "xyz";
    expect(() => loadConfig("/project")).toThrow("CONFIG_INVALID_VALUE");
  });

  // Happy paths for env vars
  it("sets maxFileKB=200 when PI_INDEX_MAX_FILE_KB=200", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MAX_FILE_KB = "200";
    const cfg = loadConfig("/project");
    expect(cfg.maxFileKB).toBe(200);
  });

  it("sets minScore=0.5 when PI_INDEX_MIN_SCORE=0.5", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MIN_SCORE = "0.5";
    const cfg = loadConfig("/project");
    expect(cfg.minScore).toBe(0.5);
  });

  it("sets mmrLambda=0.8 when PI_INDEX_MMR_LAMBDA=0.8", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_MMR_LAMBDA = "0.8";
    const cfg = loadConfig("/project");
    expect(cfg.mmrLambda).toBe(0.8);
  });

  it("sets autoIndexInterval=45 when PI_INDEX_AUTO_INTERVAL=45", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_AUTO_INTERVAL = "45";
    const cfg = loadConfig("/project");
    expect(cfg.autoIndexInterval).toBe(45);
  });

  it("throws CONFIG_INVALID_VALUE when PI_INDEX_AUTO_INTERVAL=abc", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PI_INDEX_AUTO_INTERVAL = "abc";
    expect(() => loadConfig("/project")).toThrow("CONFIG_INVALID_VALUE");
  });
});

describe("provider configuration", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("defaults provider to 'openai' when PI_INDEX_PROVIDER is not set", () => {
    const cfg = parseConfig({ apiKey: "sk-test" });
    expect(cfg.provider).toBe("openai");
  });

  it("accepts provider 'ollama' without requiring apiKey", () => {
    const cfg = parseConfig({ provider: "ollama" });
    expect(cfg.provider).toBe("ollama");
    expect(cfg.apiKey).toBe(""); // no key needed
    expect(cfg.ollamaHost).toBe("http://127.0.0.1:11434");
    expect(cfg.ollamaModel).toBe("nomic-embed-text");
  });

  it("accepts provider 'voyage' with voyage-specific API key", () => {
    const cfg = parseConfig({ provider: "voyage", voyageApiKey: "voy-key-123" });
    expect(cfg.provider).toBe("voyage");
    expect(cfg.voyageApiKey).toBe("voy-key-123");
    expect(cfg.voyageModel).toBe("voyage-code-3");
  });

  it("throws for provider 'voyage' without API key", () => {
    expect(() => parseConfig({ provider: "voyage" }))
      .toThrow(/Voyage.*API key/i);
  });

  it("throws for unknown provider value", () => {
    expect(() => parseConfig({ apiKey: "sk-test", provider: "gemini" }))
      .toThrow(/unsupported.*provider/i);
  });

  it("sets dimensions to 0 for non-OpenAI providers", () => {
    const cfg = parseConfig({ provider: "ollama" });
    expect(cfg.dimensions).toBe(0);
  });

  it("custom Ollama host and model from config", () => {
    const cfg = parseConfig({
      provider: "ollama",
      ollamaHost: "http://my-server:11434",
      ollamaModel: "mxbai-embed-large",
    });
    expect(cfg.ollamaHost).toBe("http://my-server:11434");
    expect(cfg.ollamaModel).toBe("mxbai-embed-large");
  });

  it("custom Voyage model from config", () => {
    const cfg = parseConfig({
      provider: "voyage",
      voyageApiKey: "voy-key",
      voyageModel: "voyage-3-lite",
    });
    expect(cfg.voyageModel).toBe("voyage-3-lite");
  });
});

describe("createProvider", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("creates Embeddings for openai provider", async () => {
    const { createProvider } = await import("./config.js");
    const cfg = parseConfig({ apiKey: "sk-test" });
    const provider = createProvider(cfg);
    expect(provider.getProvider()).toBe("openai");
  });

  it("creates OllamaProvider for ollama provider", async () => {
    const { createProvider } = await import("./config.js");
    const cfg = parseConfig({ provider: "ollama" });
    const provider = createProvider(cfg);
    expect(provider.getProvider()).toBe("ollama");
  });

  it("creates VoyageProvider for voyage provider", async () => {
    const { createProvider } = await import("./config.js");
    const cfg = parseConfig({ provider: "voyage", voyageApiKey: "voy-key" });
    const provider = createProvider(cfg);
    expect(provider.getProvider()).toBe("voyage");
  });
});

describe("loadConfig with provider env vars", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
    // Clear all env vars that loadConfig reads (including those from prior describe blocks)
    delete process.env.OPENAI_API_KEY;
    delete process.env.PI_INDEX_API_KEY;
    delete process.env.PI_INDEX_MODEL;
    delete process.env.PI_INDEX_DB_PATH;
    delete process.env.PI_INDEX_DIRS;
    delete process.env.PI_INDEX_AUTO;
    delete process.env.PI_INDEX_MAX_FILE_KB;
    delete process.env.PI_INDEX_MIN_SCORE;
    delete process.env.PI_INDEX_MMR_LAMBDA;
    delete process.env.PI_INDEX_AUTO_INTERVAL;
    delete process.env.PI_INDEX_PROVIDER;
    delete process.env.PI_INDEX_OLLAMA_HOST;
    delete process.env.PI_INDEX_OLLAMA_MODEL;
    delete process.env.PI_INDEX_VOYAGE_API_KEY;
    delete process.env.VOYAGEAI_API_KEY;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it("reads PI_INDEX_PROVIDER from env", () => {
    process.env.PI_INDEX_PROVIDER = "ollama";
    try {
      const cfg = loadConfig("/tmp");
      expect(cfg.provider).toBe("ollama");
    } finally {
      delete process.env.PI_INDEX_PROVIDER;
    }
  });

  it("reads PI_INDEX_OLLAMA_HOST and PI_INDEX_OLLAMA_MODEL from env", () => {
    process.env.PI_INDEX_PROVIDER = "ollama";
    process.env.PI_INDEX_OLLAMA_HOST = "http://gpu:11434";
    process.env.PI_INDEX_OLLAMA_MODEL = "mxbai-embed-large";
    try {
      const cfg = loadConfig("/tmp");
      expect(cfg.ollamaHost).toBe("http://gpu:11434");
      expect(cfg.ollamaModel).toBe("mxbai-embed-large");
    } finally {
      delete process.env.PI_INDEX_PROVIDER;
      delete process.env.PI_INDEX_OLLAMA_HOST;
      delete process.env.PI_INDEX_OLLAMA_MODEL;
    }
  });

  it("reads PI_INDEX_VOYAGE_API_KEY from env", () => {
    process.env.PI_INDEX_PROVIDER = "voyage";
    process.env.PI_INDEX_VOYAGE_API_KEY = "voy-test-123";
    try {
      const cfg = loadConfig("/tmp");
      expect(cfg.provider).toBe("voyage");
      expect(cfg.voyageApiKey).toBe("voy-test-123");
    } finally {
      delete process.env.PI_INDEX_PROVIDER;
      delete process.env.PI_INDEX_VOYAGE_API_KEY;
    }
  });

  it("reads VOYAGEAI_API_KEY as fallback for voyage key", () => {
    process.env.PI_INDEX_PROVIDER = "voyage";
    process.env.VOYAGEAI_API_KEY = "voy-fallback";
    try {
      const cfg = loadConfig("/tmp");
      expect(cfg.voyageApiKey).toBe("voy-fallback");
    } finally {
      delete process.env.PI_INDEX_PROVIDER;
      delete process.env.VOYAGEAI_API_KEY;
    }
  });
});
