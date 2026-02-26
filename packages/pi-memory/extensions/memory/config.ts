import { homedir } from "node:os";
import { resolve, join } from "node:path";

export type MemoryConfig = {
  apiKey: string;
  model: string;
  dbPath: string;
  autoCapture: boolean;
  autoRecall: boolean;
  captureMaxChars: number;
};

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_CAPTURE_MAX_CHARS = 500;

export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) throw new Error(`Unsupported embedding model: ${model}`);
  return dims;
}

export function resolveDbPath(dbPath: string): string {
  if (dbPath.startsWith("~")) {
    return join(homedir(), dbPath.slice(1));
  }
  return resolve(dbPath);
}

export function parseConfig(raw: Record<string, unknown>): MemoryConfig {
  if (!raw.apiKey || typeof raw.apiKey !== "string") {
    throw new Error("apiKey is required");
  }
  const model = typeof raw.model === "string" ? raw.model : DEFAULT_MODEL;
  vectorDimsForModel(model); // validate — throws if unknown

  const captureMaxChars =
    typeof raw.captureMaxChars === "number"
      ? Math.floor(raw.captureMaxChars)
      : DEFAULT_CAPTURE_MAX_CHARS;
  if (captureMaxChars < 100 || captureMaxChars > 10_000) {
    throw new Error("captureMaxChars must be between 100 and 10000");
  }

  const dbPath =
    typeof raw.dbPath === "string"
      ? resolveDbPath(raw.dbPath)
      : resolveDbPath("~/.pi-memory/lancedb");

  return {
    apiKey: raw.apiKey,
    model,
    dbPath,
    autoCapture: raw.autoCapture === true,
    autoRecall: raw.autoRecall !== false,
    captureMaxChars,
  };
}

export function loadConfig(): MemoryConfig {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.PI_MEMORY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "pi-memory: OPENAI_API_KEY or PI_MEMORY_API_KEY env var is required"
    );
  }
  return parseConfig({
    apiKey,
    model: process.env.PI_MEMORY_MODEL,
    dbPath: process.env.PI_MEMORY_DB_PATH,
    autoCapture: process.env.PI_MEMORY_AUTO_CAPTURE === "true",
    autoRecall: process.env.PI_MEMORY_AUTO_RECALL !== "false",
  });
}
