import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Embeddings } from "./embeddings.js";
import { OllamaProvider } from "./ollama-provider.js";
import { VoyageProvider } from "./voyage-provider.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

/**
 * Supported embedding providers.
 */
export type Provider = "openai" | "ollama" | "voyage";

/**
 * Resolved, validated configuration for the pi-index extension.
 *
 * Produced by `loadConfig` (from environment variables) or `parseConfig` (from a raw
 * options object). All paths are absolute; all numeric fields are within their valid ranges.
 */
export type IndexConfig = {
  provider: Provider;
  apiKey: string;
  model: string;
  dimensions: number;
  dbPath: string;
  mtimeCachePath: string;
  indexDirs: string[];
  indexRoot: string;
  autoIndex: boolean;
  autoIndexInterval: number; // minutes between auto re-index (0 = once per session)
  maxFileKB: number;
  minScore: number;
  mmrLambda: number;
  // Ollama-specific
  ollamaHost: string;
  ollamaModel: string;
  // Voyage-specific
  voyageApiKey: string;
  voyageModel: string;
};

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";
const DEFAULT_VOYAGE_MODEL = "voyage-code-3";

/**
 * Look up the vector dimension for a supported embedding model.
 *
 * @param model - OpenAI embedding model name (e.g. `"text-embedding-3-small"`)
 * @returns Number of dimensions produced by that model
 * @throws {Error} When the model name is not in the supported model registry
 */
export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) throw new Error(`Unsupported embedding model: ${model}`);
  return dims;
}

/**
 * Resolve a `dbPath` value to an absolute path.
 *
 * Paths already starting with `/` are returned unchanged; relative paths are resolved
 * against `indexRoot`.
 *
 * @param dbPath - Raw `dbPath` string from config (absolute or relative)
 * @param indexRoot - Absolute path used as the base for relative resolution
 * @returns Absolute path to the LanceDB directory
 */
export function resolveDbPath(dbPath: string, indexRoot: string): string {
  if (dbPath.startsWith("/")) return dbPath;
  return resolve(indexRoot, dbPath);
}

/**
 * Parse and validate a raw options object into a fully resolved `IndexConfig`.
 *
 * Applies defaults for all optional fields, validates numeric ranges, resolves
 * `dbPath` to an absolute path, and warns about non-existent `indexDirs` entries.
 *
 * @param raw - Raw configuration map (e.g. from a pi extension options block)
 * @returns Validated `IndexConfig` ready for use by `Indexer`, `Searcher`, and `IndexDB`
 * @throws {Error} When required keys are missing, an unsupported provider/model is specified,
 *   or any numeric option falls outside its valid range
 */
export function parseConfig(raw: Record<string, unknown>): IndexConfig {
  // --- Provider ---
  const providerRaw = typeof raw.provider === "string" ? raw.provider : "openai";
  const VALID_PROVIDERS: Provider[] = ["openai", "ollama", "voyage"];
  if (!VALID_PROVIDERS.includes(providerRaw as Provider)) {
    throw new Error(`Unsupported provider: "${providerRaw}". Valid values: openai, ollama, voyage`);
  }
  const provider = providerRaw as Provider;

  // --- API key validation (provider-specific) ---
  let apiKey = "";
  if (provider === "openai") {
    if (!raw.apiKey || typeof raw.apiKey !== "string") {
      throw new Error("apiKey is required");
    }
    apiKey = raw.apiKey;
  } else if (provider === "ollama") {
    // No API key needed
    apiKey = "";
  } else if (provider === "voyage") {
    // voyageApiKey is required; apiKey is not used
    apiKey = "";
  }

  // --- Voyage API key ---
  const voyageApiKey =
    typeof raw.voyageApiKey === "string" ? raw.voyageApiKey : "";
  if (provider === "voyage" && !voyageApiKey) {
    throw new Error("Voyage API key is required when using the voyage provider");
  }
  const voyageModel =
    typeof raw.voyageModel === "string" ? raw.voyageModel : DEFAULT_VOYAGE_MODEL;

  // --- Ollama fields ---
  const ollamaHost =
    typeof raw.ollamaHost === "string" ? raw.ollamaHost : DEFAULT_OLLAMA_HOST;
  const ollamaModel =
    typeof raw.ollamaModel === "string" ? raw.ollamaModel : DEFAULT_OLLAMA_MODEL;

  // --- OpenAI model + dimensions ---
  const model = typeof raw.model === "string" ? raw.model : DEFAULT_MODEL;
  // For non-OpenAI providers, dimensions are lazy (0) — resolved via getDimension() at runtime
  const dimensions = provider === "openai" ? vectorDimsForModel(model) : 0;

  // --- Numeric options ---
  const maxFileKB = typeof raw.maxFileKB === "number" ? raw.maxFileKB : 500;
  if (maxFileKB <= 0) throw new Error("maxFileKB must be greater than 0");

  const minScore = typeof raw.minScore === "number" ? raw.minScore : 0.2;
  if (minScore < 0 || minScore > 1) throw new Error("minScore must be between 0.0 and 1.0");

  const mmrLambda = typeof raw.mmrLambda === "number" ? raw.mmrLambda : 0.5;
  if (mmrLambda < 0 || mmrLambda > 1)
    throw new Error("mmrLambda must be between 0.0 and 1.0 (0 = max diversity, 1 = max relevance)");

  const autoIndexInterval = typeof raw.autoIndexInterval === "number" ? raw.autoIndexInterval : 0;
  if (autoIndexInterval < 0) throw new Error("autoIndexInterval must be >= 0");

  // --- Paths ---
  const indexRoot = typeof raw.indexRoot === "string" ? raw.indexRoot : process.cwd();

  const dbPath =
    typeof raw.dbPath === "string"
      ? resolveDbPath(raw.dbPath, indexRoot)
      : resolve(indexRoot, ".pi/index/lancedb");

  const mtimeCachePath = resolve(indexRoot, ".pi/index/mtime-cache.json");

  // --- indexDirs: comma-separated string, array of strings, or default to indexRoot ---
  let indexDirs: string[];
  if (Array.isArray(raw.indexDirs) && raw.indexDirs.length > 0) {
    indexDirs = (raw.indexDirs as unknown[]).filter((d) => typeof d === "string") as string[];
    if (indexDirs.length === 0) indexDirs = [indexRoot];
  } else if (typeof raw.indexDirs === "string" && raw.indexDirs.trim()) {
    indexDirs = raw.indexDirs.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    indexDirs = [indexRoot];
  }

  // Warn and filter out non-existent dirs
  indexDirs = indexDirs.filter((dir) => {
    if (!existsSync(dir)) {
      console.warn(
        `[pi-index] Warning: index directory does not exist and will be skipped: ${dir}`
      );
      return false;
    }
    return true;
  });
  // If all dirs were removed, default to indexRoot
  if (indexDirs.length === 0) indexDirs = [indexRoot];

  return {
    provider,
    apiKey,
    model,
    dimensions,
    dbPath,
    mtimeCachePath,
    indexDirs,
    indexRoot,
    autoIndex: raw.autoIndex === true,
    autoIndexInterval,
    maxFileKB,
    minScore,
    mmrLambda,
    ollamaHost,
    ollamaModel,
    voyageApiKey,
    voyageModel,
  };
}

/**
 * Create the appropriate `EmbeddingProvider` based on the resolved config.
 *
 * @param cfg - Fully resolved `IndexConfig` (from `parseConfig` or `loadConfig`)
 * @returns The correct `EmbeddingProvider` implementation for the configured provider
 */
export function createProvider(cfg: IndexConfig): EmbeddingProvider {
  switch (cfg.provider) {
    case "openai":
      return new Embeddings(cfg.apiKey, cfg.model);
    case "ollama":
      return new OllamaProvider(cfg.ollamaHost, cfg.ollamaModel);
    case "voyage":
      return new VoyageProvider(cfg.voyageApiKey, cfg.voyageModel);
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = cfg.provider;
      throw new Error(`[pi-index] Unknown provider: ${_exhaustive}`);
    }
  }
}

function parseEnvInt(name: string, value: string): number {
  const v = parseInt(value, 10);
  if (Number.isNaN(v)) throw new Error(`CONFIG_INVALID_VALUE: ${name} must be a valid integer (got "${value}")`);
  return v;
}

function parseEnvFloat(name: string, value: string): number {
  const v = parseFloat(value);
  if (Number.isNaN(v)) throw new Error(`CONFIG_INVALID_VALUE: ${name} must be a valid number (got "${value}")`);
  return v;
}

/**
 * Build an `IndexConfig` from environment variables.
 *
 * Reads `PI_INDEX_PROVIDER`, `PI_INDEX_API_KEY` (or `OPENAI_API_KEY`), `PI_INDEX_MODEL`,
 * `PI_INDEX_DB_PATH`, `PI_INDEX_DIRS`, `PI_INDEX_AUTO`, `PI_INDEX_AUTO_INTERVAL`,
 * `PI_INDEX_MAX_FILE_KB`, `PI_INDEX_MIN_SCORE`, `PI_INDEX_MMR_LAMBDA`,
 * `PI_INDEX_OLLAMA_HOST`, `PI_INDEX_OLLAMA_MODEL`, `PI_INDEX_VOYAGE_API_KEY` (or `VOYAGEAI_API_KEY`),
 * and `PI_INDEX_VOYAGE_MODEL`. Delegates validation to `parseConfig`.
 *
 * @param indexRoot - Absolute path to the project root; used as the default `indexDir` and
 *   base for relative `dbPath` resolution
 * @returns Validated `IndexConfig`
 * @throws {Error} With code `CONFIG_MISSING_API_KEY` when no API key env var is set (openai provider)
 * @throws {Error} With code `CONFIG_INVALID_VALUE` when an env var contains an invalid value
 */
export function loadConfig(indexRoot: string): IndexConfig {
  const provider = (process.env.PI_INDEX_PROVIDER ?? "openai") as string;

  // API key handling is provider-specific
  let apiKey: string | undefined;
  let voyageApiKey: string | undefined;

  if (provider === "openai") {
    apiKey = process.env.PI_INDEX_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CONFIG_MISSING_API_KEY: Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index."
      );
    }
  } else if (provider === "ollama") {
    // No API key required for Ollama
    apiKey = "";
  } else if (provider === "voyage") {
    // voyageApiKey will be validated by parseConfig
    voyageApiKey = process.env.PI_INDEX_VOYAGE_API_KEY ?? process.env.VOYAGEAI_API_KEY;
    apiKey = "";
  }

  const maxFileKB = process.env.PI_INDEX_MAX_FILE_KB
    ? parseEnvInt("PI_INDEX_MAX_FILE_KB", process.env.PI_INDEX_MAX_FILE_KB)
    : undefined;
  const minScore = process.env.PI_INDEX_MIN_SCORE
    ? parseEnvFloat("PI_INDEX_MIN_SCORE", process.env.PI_INDEX_MIN_SCORE)
    : undefined;
  const mmrLambda = process.env.PI_INDEX_MMR_LAMBDA
    ? parseEnvFloat("PI_INDEX_MMR_LAMBDA", process.env.PI_INDEX_MMR_LAMBDA)
    : undefined;
  const autoIndexInterval = process.env.PI_INDEX_AUTO_INTERVAL
    ? parseEnvInt("PI_INDEX_AUTO_INTERVAL", process.env.PI_INDEX_AUTO_INTERVAL)
    : undefined;

  return parseConfig({
    provider,
    apiKey,
    voyageApiKey,
    model: process.env.PI_INDEX_MODEL,
    dbPath: process.env.PI_INDEX_DB_PATH,
    indexDirs: process.env.PI_INDEX_DIRS,
    autoIndex: process.env.PI_INDEX_AUTO === "true",
    autoIndexInterval,
    maxFileKB,
    minScore,
    mmrLambda,
    indexRoot,
    ollamaHost: process.env.PI_INDEX_OLLAMA_HOST,
    ollamaModel: process.env.PI_INDEX_OLLAMA_MODEL,
    voyageModel: process.env.PI_INDEX_VOYAGE_MODEL,
  });
}
