import { resolve } from "node:path";
import { existsSync } from "node:fs";

export type IndexConfig = {
  apiKey: string;
  model: string;
  dimensions: number;
  dbPath: string;
  mtimeCachePath: string;
  indexDirs: string[];
  indexRoot: string;
  autoIndex: boolean;
  maxFileKB: number;
  minScore: number;
  mmrLambda: number;
};

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

const DEFAULT_MODEL = "text-embedding-3-small";

export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) throw new Error(`Unsupported embedding model: ${model}`);
  return dims;
}

export function resolveDbPath(dbPath: string, indexRoot: string): string {
  if (dbPath.startsWith("/")) return dbPath;
  return resolve(indexRoot, dbPath);
}

export function parseConfig(raw: Record<string, unknown>): IndexConfig {
  if (!raw.apiKey || typeof raw.apiKey !== "string") {
    throw new Error("apiKey is required");
  }
  const indexRoot = typeof raw.indexRoot === "string" ? raw.indexRoot : process.cwd();
  const model = typeof raw.model === "string" ? raw.model : DEFAULT_MODEL;
  const dimensions = vectorDimsForModel(model); // throws for unknown models

  const maxFileKB = typeof raw.maxFileKB === "number" ? raw.maxFileKB : 500;
  if (maxFileKB <= 0) throw new Error("maxFileKB must be greater than 0");

  const minScore = typeof raw.minScore === "number" ? raw.minScore : 0.2;
  if (minScore < 0 || minScore > 1) throw new Error("minScore must be between 0.0 and 1.0");

  const mmrLambda = typeof raw.mmrLambda === "number" ? raw.mmrLambda : 0.5;
  if (mmrLambda < 0 || mmrLambda > 1)
    throw new Error("mmrLambda must be between 0.0 and 1.0 (0 = max diversity, 1 = max relevance)");

  const dbPath =
    typeof raw.dbPath === "string"
      ? resolveDbPath(raw.dbPath, indexRoot)
      : resolve(indexRoot, ".pi/index/lancedb");

  const mtimeCachePath = resolve(indexRoot, ".pi/index/mtime-cache.json");

  // indexDirs: comma-separated string or array
  let indexDirs: string[];
  if (typeof raw.indexDirs === "string" && raw.indexDirs.trim()) {
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
    apiKey: raw.apiKey,
    model,
    dimensions,
    dbPath,
    mtimeCachePath,
    indexDirs,
    indexRoot,
    autoIndex: raw.autoIndex === true,
    maxFileKB,
    minScore,
    mmrLambda,
  };
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

export function loadConfig(indexRoot: string): IndexConfig {
  const apiKey = process.env.PI_INDEX_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CONFIG_MISSING_API_KEY: Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index."
    );
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

  return parseConfig({
    apiKey,
    model: process.env.PI_INDEX_MODEL,
    dbPath: process.env.PI_INDEX_DB_PATH,
    indexDirs: process.env.PI_INDEX_DIRS,
    autoIndex: process.env.PI_INDEX_AUTO === "true",
    maxFileKB,
    minScore,
    mmrLambda,
    indexRoot,
  });
}
