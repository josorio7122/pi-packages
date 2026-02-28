// Shared constants for @josorio/pi-index — single source of truth

export const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".d.ts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".sql": "sql",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".txt": "text",
};

// Derived from LANGUAGE_MAP keys — single source of truth for supported file types
export const SUPPORTED_EXTENSIONS = Object.keys(LANGUAGE_MAP);

// Chunker
export const MAX_CHUNK_LINES = 80;

// Embedder
export const EMBED_BATCH_SIZE = 20;
export const EMBED_CONCURRENCY = 3;

// Retry logic
export const MAX_RETRIES = 4;
export const RETRY_BASE_DELAY_MS = 1000;

// Searcher
export const SEARCH_OVERFETCH_FACTOR = 3;
export const KNOWN_SCOPES = new Set(["file", "dir", "ext", "lang"]);
