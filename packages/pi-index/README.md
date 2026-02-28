# @josorio/pi-index

Semantic codebase search for [pi](https://github.com/mariozechner/pi) — the AI coding agent.

`pi-index` indexes your codebase into a local [LanceDB](https://lancedb.com) vector database and exposes hybrid search (vector + BM25) as LLM tools and slash commands. The index lives in `.pi/index/` inside your project — never globally.

---

## Features

- **Hybrid search** — vector similarity + BM25 full-text via LanceDB's built-in tantivy FTS
- **Tree-sitter AST chunking** — proper syntax-tree parsing for JS, TS, Python, Ruby, CSS, SCSS. LangChain text splitter fallback for other languages.
- **Multi-provider embeddings** — OpenAI (default), Ollama (local/offline), Voyage AI (code-optimized)
- **MMR reranking** — Maximal Marginal Relevance prevents result clustering
- **Scope filters** — `@file:`, `@dir:`, `@ext:`, `@lang:` narrow searches precisely
- **Contextual enrichment** — file-level context (symbols, imports, position) injected into embeddings at zero LLM cost
- **Incremental indexing** — mtime-based cache skips unchanged files

---

## Prerequisites

pi-index uses [LanceDB](https://lancedb.github.io/lancedb/) which compiles a native Node.js addon from Rust. Before installing, make sure your machine has:

| Platform | Required |
|---|---|
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Linux** | `build-essential`, `python3`: `apt install build-essential python3` |
| **Windows** | [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with "Desktop development with C++" |

> **CI/CD**: Ensure your runner has the build tools above. GitHub Actions `ubuntu-latest` and `macos-latest` include them by default.

---

## Installation

Install from the pi-packages monorepo:

```bash
# In your pi config directory (e.g. ~/.pi)
pnpm add @josorio/pi-index
```

Then add to your pi config:

```json
{
  "extensions": ["@josorio/pi-index"]
}
```

---

## Configuration

pi-index is configured entirely via environment variables:

### Embedding Provider

| Variable | Default | Description |
|---|---|---|
| `PI_INDEX_PROVIDER` | `openai` | Embedding provider: `openai`, `ollama`, or `voyage` |
| `OPENAI_API_KEY` or `PI_INDEX_API_KEY` | — | **Required for OpenAI.** OpenAI API key |
| `PI_INDEX_MODEL` | `text-embedding-3-small` | OpenAI embedding model (`text-embedding-3-small` = 1536d, `text-embedding-3-large` = 3072d) |
| `PI_INDEX_OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `PI_INDEX_OLLAMA_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `PI_INDEX_VOYAGE_API_KEY` or `VOYAGEAI_API_KEY` | — | **Required for Voyage.** Voyage AI API key |
| `PI_INDEX_VOYAGE_MODEL` | `voyage-code-3` | Voyage AI model (code-optimized) |

### Indexing & Search

| Variable | Default | Description |
|---|---|---|
| `PI_INDEX_DB_PATH` | `.pi/index/lancedb` | LanceDB path (relative to project root) |
| `PI_INDEX_DIRS` | current directory | Comma-separated list of directories to index |
| `PI_INDEX_AUTO` | `false` | Auto-index on every session start when set to `true`. |
| `PI_INDEX_AUTO_INTERVAL` | `0` | Minutes between automatic re-indexes when `PI_INDEX_AUTO=true`. `0` = once per session only. Example: `30` re-indexes every 30 minutes if files change. |
| `PI_INDEX_MAX_FILE_KB` | `500` | Skip files larger than this (KB) |
| `PI_INDEX_MIN_SCORE` | `0.2` | Minimum relevance score 0–1. Scores are normalized per-query (top result = 1.0). Values below 0.3 rarely filter anything; `0.4`–`0.6` is a useful range. |
| `PI_INDEX_MMR_LAMBDA` | `0.5` | MMR diversity weight 0–1. `1.0` = pure relevance ranking; `0.0` = maximum diversity; `0.5` = balanced (default). |

### Provider Examples

```bash
# OpenAI (default — just set the key)
export OPENAI_API_KEY=sk-...

# Ollama (local, no API key needed)
export PI_INDEX_PROVIDER=ollama
# Optional: export PI_INDEX_OLLAMA_MODEL=mxbai-embed-large

# Voyage AI (code-optimized embeddings)
export PI_INDEX_PROVIDER=voyage
export PI_INDEX_VOYAGE_API_KEY=voy-...
```

---

## .gitignore Support

pi-index respects `.gitignore` files at **all levels** of your project:

- The root `.gitignore` applies to the entire project
- Subdirectory `.gitignore` files (e.g., `packages/frontend/.gitignore`) apply only to their subtree

This means nested `node_modules/`, `dist/`, `.venv/`, and `__pycache__/` directories are automatically excluded if your per-package `.gitignore` files list them.

> **Note:** Negation patterns (`!pattern`) are not supported. Lines starting with `!` are skipped with a warning.

Add the index storage directory to your root `.gitignore`:

```
# pi-index
.pi/index/
```

---

## Tools

### `codebase_search`

Search the codebase for semantically similar code.

```
query: string       — natural language search query
limit?: number      — max results (default: 8, max: 20)
minScore?: number   — min score override (default: config value)
```

Supports scope filters in the query:
- `@file:auth/login.ts` — search only in specific file
- `@dir:src/api` — search only in directory
- `@ext:.ts` — search only TypeScript files
- `@lang:python` — search only Python files

### `codebase_index`

Start indexing in the background. Returns immediately — search works with partial results during indexing.

```
force?: boolean     — force full rebuild (default: false = incremental)
```

Returns `"⚡ Started indexing..."` or `"⏳ Already in progress..."`. Use `codebase_status` to check progress.

### `codebase_status`

Show indexing status — chunk count, files indexed, last indexed time, and configuration.

---

## Slash Commands

| Command | Description |
|---|---|
| `/index-status` | Show current index status and configuration |
| `/index-rebuild` | Force-rebuild the entire index from scratch |
| `/index-clear` | Delete all index data (chunks + mtime cache) |

---

## Supported Languages

### Tree-sitter AST splitting (structural boundaries)

| Language | Extensions | Boundaries |
|---|---|---|
| TypeScript | `.ts` `.tsx` `.d.ts` | `function`, `class`, `interface`, `type`, `export const` |
| JavaScript | `.js` `.jsx` | `function`, `class`, `export`, `const` |
| Python | `.py` `.pyi` | `def`, `class`, `@decorator` |
| Ruby | `.rb` `.rake` `.gemspec` `.ru` | `class`, `module`, `def`, `def self.` |
| CSS | `.css` | selectors, `@media`, `@keyframes` |
| SCSS | `.scss` `.sass` | selectors, `@mixin`, `@media` |

### LangChain text splitter fallback

| Language | Extensions | Splitting |
|---|---|---|
| Markdown | `.md` | Language-aware (heading/paragraph separators) |
| HTML | `.html` | Language-aware (tag-based separators) |
| ERB | `.erb` | HTML-style splitting |
| SQL | `.sql` | Generic line-based |
| LESS | `.less` | Generic line-based |
| JSON | `.json` | Generic line-based |
| YAML | `.yaml` `.yml` | Generic line-based |
| TOML | `.toml` | Generic line-based |
| Text | `.txt` | Generic line-based |

All chunks are capped at 80 lines. Longer structural blocks are sub-split.

---

## Architecture

```
index.ts               — extension entry point (registers tools + commands)
config.ts              — configuration loading + validation + provider factory
constants.ts           — shared constants (batch sizes, thresholds, language map)
embedding-provider.ts  — abstract EmbeddingProvider interface
embeddings.ts          — OpenAI embedding provider (default)
ollama-provider.ts     — Ollama embedding provider (local/offline)
voyage-provider.ts     — Voyage AI embedding provider (code-optimized)
ast-chunker.ts         — tree-sitter AST splitting + LangChain text splitter fallback
chunker.ts             — file chunking orchestrator (AST → LangChain → line-count)
context-enricher.ts    — contextual enrichment for embeddings (symbols, imports, position)
walker.ts              — file discovery + mtime-based incremental cache
mmr.ts                 — Maximal Marginal Relevance reranking
db.ts                  — LanceDB wrapper (schema, indexes, hybrid search, optimization)
indexer.ts             — full indexing pipeline (batching, retries, progress, post-index optimization)
searcher.ts            — query parsing, scope filters, result formatting
tools.ts               — LLM tool definitions + handlers
utils.ts               — shared helpers (relativeTime)
```

### Scoring

All search paths normalize result scores to a **relative 0–1 scale per query**:

- **Hybrid search** — RRF (Reciprocal Rank Fusion) scores from LanceDB are divided by the maximum score in the result set. The top result always receives score `1.0`.
- **Vector-only search** — raw `1/(1+distance)` scores are divided by the maximum score in the result set, giving the same relative semantics.

Because both paths normalize to `[0, 1]` relative to the best result, `minScore` behaves consistently: a value of `0.2` filters results scoring below 20% of the top result, regardless of which search path is used.

### Chunk IDs

Chunk IDs use the format `{filePath}:{chunkIndex}` (e.g., `src/auth/login.ts:3`). IDs are **not stable across re-indexing** — if a file is modified and re-indexed, chunk indices may shift. Do not use chunk IDs as persistent external references.

The index is stored at `.pi/index/lancedb` (LanceDB) and `.pi/index/mtime-cache.json` (file cache). Both are project-local and should be added to `.gitignore`.

---

## Performance

pi-index automatically manages LanceDB indexes and optimization for best query performance:

- **Scalar indexes** — BTREE indexes on `filePath`, `language`, and `extension` columns are created during database initialization. Scope filter queries (`@file:`, `@dir:`, `@lang:`, `@ext:`) use indexed lookups instead of full column scans. Idempotent — safe to recreate on every session.
- **Table compaction** — after each indexing run that modifies data, `optimize()` compacts fragmented data files created by per-file delete+insert cycles. This keeps query I/O efficient.
- **Auto vector index** — when the chunk count exceeds 10,000, an IVF-PQ (Inverted File with Product Quantization) vector index is created automatically. This speeds up vector search from brute-force O(n) to approximate O(√n). Skipped if the index already exists or the codebase is below threshold.
- **FTS index** — LanceDB's tantivy-based full-text search index on the `text` column is rebuilt after every indexing run for current BM25 search.

All index operations are best-effort — if any fails, the system degrades gracefully (slower queries, not incorrect results).

---

## Development

```bash
# Run tests
pnpm --filter @josorio/pi-index exec vitest run

# Type check
pnpm --filter @josorio/pi-index exec tsc --noEmit

# Build all packages
pnpm turbo build
```

---

## License

MIT
