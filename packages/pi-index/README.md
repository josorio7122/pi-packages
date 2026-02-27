# @josorio/pi-index

Semantic codebase search for [pi](https://github.com/mariozechner/pi) — the AI coding agent.

`pi-index` indexes your codebase into a local [LanceDB](https://lancedb.com) vector database and exposes hybrid search (vector + BM25) as LLM tools and slash commands. The index lives in `.pi/index/` inside your project — never globally.

---

## Features

- **Hybrid search** — vector similarity + BM25 full-text via LanceDB's built-in tantivy FTS
- **Structural chunking** — splits at function/class/section boundaries (not arbitrary line counts)
- **MMR reranking** — Maximal Marginal Relevance prevents result clustering
- **Scope filters** — `@file:`, `@dir:`, `@ext:`, `@lang:` narrow searches precisely
- **Incremental indexing** — mtime-based cache skips unchanged files
- **Zero extra dependencies** — reuses `@lancedb/lancedb` and `openai` from `@josorio/pi-memory`

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

| Variable / Key | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` or `PI_INDEX_API_KEY` | — | **Required.** OpenAI API key |
| `PI_INDEX_MODEL` | `text-embedding-3-small` | Embedding model. Dimensions are derived automatically from the model (`text-embedding-3-small` = 1536, `text-embedding-3-large` = 3072). |
| `PI_INDEX_DB_PATH` | `.pi/index/lancedb` | LanceDB path (relative to project root) |
| `PI_INDEX_DIRS` | current directory | Comma-separated list of directories to index |
| `PI_INDEX_AUTO` | `false` | Auto-index on every session start when set to `true`. |
| `PI_INDEX_AUTO_INTERVAL` | `0` | Minutes between automatic re-indexes when `PI_INDEX_AUTO=true`. `0` = once per session only. Example: `30` re-indexes every 30 minutes if files change. |
| `PI_INDEX_MAX_FILE_KB` | `500` | Skip files larger than this (KB) |
| `PI_INDEX_MIN_SCORE` | `0.2` | Minimum relevance score 0–1. Scores are normalized per-query (top result = 1.0). Values below 0.3 rarely filter anything; `0.4`–`0.6` is a useful range. |
| `PI_INDEX_MMR_LAMBDA` | `0.5` | MMR diversity weight 0–1. `1.0` = pure relevance ranking; `0.0` = maximum diversity; `0.5` = balanced (default). |

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

Index or re-index the codebase.

```
force?: boolean     — force full rebuild (default: false = incremental)
```

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

`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.sql`, `.d.ts`, `.md`, `.txt`, `.css`, `.html`

Structural chunking uses language-specific boundary detection (function/class signatures for code, section headers for Markdown, rule blocks for CSS).

---

## Architecture

```
index.ts               — extension entry point (registers tools + commands)
config.ts              — configuration loading + validation
embeddings.ts          — OpenAI embeddings wrapper (encoding_format: float)
chunker.ts             — structural boundary splitting, 80-line max
walker.ts              — file discovery + mtime-based incremental cache
mmr.ts                 — Maximal Marginal Relevance reranking
db.ts                  — LanceDB wrapper (schema, FTS index, hybrid search)
indexer.ts             — full indexing pipeline (batching, retries, progress)
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
