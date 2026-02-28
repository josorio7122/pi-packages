// Shared constants for @josorio/pi-index — single source of truth

/** Maps file extensions to their canonical language name used by the chunker and DB. */
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

/** Derived from LANGUAGE_MAP keys — single source of truth for supported file types. */
export const SUPPORTED_EXTENSIONS = Object.keys(LANGUAGE_MAP);

/** Maximum number of lines per chunk. Longer logical blocks are sub-split at this boundary. */
export const MAX_CHUNK_LINES = 80;

/** Number of text inputs sent to the embedding API in a single batch request. */
export const EMBED_BATCH_SIZE = 20;

/** Maximum number of embedding batches processed concurrently (limits API parallelism). */
export const EMBED_CONCURRENCY = 3;

/** Maximum number of retry attempts for rate-limited embedding API calls. */
export const MAX_RETRIES = 4;

/** Base delay in milliseconds for exponential-backoff retry logic (doubles each attempt). */
export const RETRY_BASE_DELAY_MS = 1000;

/** Multiplier applied to `limit` when fetching candidates before MMR reranking. */
export const SEARCH_OVERFETCH_FACTOR = 3;

/** Set of valid @scope tokens accepted by the query parser (file, dir, ext, lang). */
export const KNOWN_SCOPES = new Set(["file", "dir", "ext", "lang"]);

/** Minimum chunk count before creating an IVF-PQ vector index. Below this, brute-force scan is fast enough. */
export const VECTOR_INDEX_THRESHOLD = 10_000;
