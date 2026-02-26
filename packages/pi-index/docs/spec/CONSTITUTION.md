# pi-index — Constitution

**Version:** 0.1.0
**Status:** Draft

Cross-cutting rules that apply to every part of `pi-index`. Subsystem specs reference this document rather than restating these rules.

---

## 1. Design Principles

**Token efficiency first.** Every design decision optimizes for reducing LLM token consumption. The entire reason pi-index exists is to replace expensive grep/bash file exploration with a compact, ranked set of relevant excerpts.

**Zero new dependencies.** The extension reuses the same packages already present in `pi-memory` — the vector store and the embedding client. No additional native binaries or npm packages are introduced.

**Incremental by default.** The extension never re-embeds a file that has not changed. The first index build is the only expensive operation; all subsequent runs process only the diff.

**Project-local storage.** The index lives inside `.pi/index/` in the project directory, not in a global user directory. Different projects have independent indexes. The index is gitignored — it is a build artifact, not source.

**Implementation-agnostic.** This spec describes behavior and contracts. It does not prescribe data structures, algorithms, or source file organization.

**Composable.** pi-index works as a standalone extension. It does not require pi-memory to be installed. Future integration with pi-memory is out of scope for v1.

**Human-readable state.** The mtime cache is stored as plain JSON. A developer can inspect it, edit it, or delete it without any tooling.

---

## 2. Error Handling

Tools return structured error strings when a failure occurs. Errors are not thrown as exceptions visible to the developer during normal operation — they are returned as the tool's result so the LLM can read and act on them.

**Error format:**

```
Error: [CODE] Human-readable message describing what failed and what to do.
```

**Global error codes:**

| Code | Meaning | When it occurs |
| --- | --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key is configured | `OPENAI_API_KEY` and `PI_INDEX_API_KEY` are both absent at startup |
| `INDEX_NOT_INITIALIZED` | The index has not been built yet | `codebase_search` is called before `codebase_index` has completed successfully |
| `INDEX_ALREADY_RUNNING` | An index operation is already in progress | `codebase_index` is called while a previous call has not finished |
| `EMBEDDING_FAILED` | The embedding service returned an error | The embedding API call failed after all retries are exhausted |
| `SEARCH_FAILED` | The search operation failed | An unexpected error occurred during vector or full-text search |
| `FILE_TOO_LARGE` | A file exceeds the configured size limit | A file is larger than `PI_INDEX_MAX_FILE_KB` kilobytes |
| `UNSUPPORTED_EXTENSION` | A file's extension is not in the supported list | `codebase_index` was pointed at a file with an unsupported extension |
| `INVALID_SCOPE_FILTER` | A scope filter in the query is not recognized | A `@scope:` token in the query does not match any known scope |

---

## 3. Configuration

All configuration is via environment variables. There is no configuration file. Variables are read once at extension startup.

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | — | Yes (or `PI_INDEX_API_KEY`) | Shared with pi-memory. Used for embedding calls. |
| `PI_INDEX_API_KEY` | — | Alternative | Takes precedence over `OPENAI_API_KEY` if set. Allows a separate key for indexing. |
| `PI_INDEX_MODEL` | `text-embedding-3-small` | No | Embedding model. Must be a supported model (see DATA-MODEL.md). |
| `PI_INDEX_DB_PATH` | `.pi/index/lancedb` | No | Path to the index database. Resolved relative to the index root. |
| `PI_INDEX_DIRS` | _(index root)_ | No | Comma-separated list of directories to index. Defaults to the project root. |
| `PI_INDEX_AUTO` | `false` | No | If `true`, triggers incremental indexing on every session start. |
| `PI_INDEX_MAX_FILE_KB` | `500` | No | Files larger than this many kilobytes are skipped. Must be greater than 0. |
| `PI_INDEX_MIN_SCORE` | `0.2` | No | Relevance score threshold. Results below this value are excluded. Must be between 0.0 and 1.0. |

**Validation:** If `OPENAI_API_KEY` and `PI_INDEX_API_KEY` are both absent, all tool calls return `Error: [CONFIG_MISSING_API_KEY] ...`. The extension loads but does not crash.

**Model change warning:** Changing `PI_INDEX_MODEL` after an index has been built produces results with mixed vector dimensions. The index must be cleared and rebuilt after changing the model.

---

## 4. Relevance Scoring

A relevance score is a float in the range `[0.0, 1.0]` produced by RRF fusion of the vector similarity ranking and the BM25 full-text ranking. It is not a probability — it is a relative ranking signal.

- Higher scores indicate a stronger match for the query.
- Scores are not comparable across different queries.
- Results with a score below `PI_INDEX_MIN_SCORE` are excluded before being returned to the caller.
- MMR reranking may reorder results after score-based filtering, but does not change scores.

---

## 5. Chunking Contract

All chunking implementations must satisfy these invariants:

1. Each chunk has a stable identity: the combination of `filePath` and `chunkIndex` uniquely identifies a chunk within the index.
2. `startLine` and `endLine` are 1-based and inclusive. `endLine >= startLine` always.
3. A chunk never spans multiple files.
4. Chunk text is the raw source lines with no preprocessing, stripping, or modification.
5. The maximum chunk size is 80 lines. No chunk may exceed this limit regardless of content.
6. `chunkIndex` values within a file start at 0 and increase by 1 with no gaps.
7. The full file is covered: every line of every indexed file belongs to exactly one chunk (no lines are skipped, no lines appear in two chunks).

---

## 6. Incremental Indexing Contract

The indexer must satisfy these invariants on every `codebase_index` call:

1. A file is re-indexed if and only if its current mtime differs from the stored mtime in the mtime cache.
2. When a file is re-indexed, all its previous chunks are deleted from the index before new chunks are inserted.
3. When a file no longer exists on disk, all its chunks are deleted from the index and its mtime entry is removed.
4. The mtime cache is written atomically: the extension writes to a temporary file then renames it to the final path. A crash mid-write leaves the old cache intact.
5. The mtime cache entry for a file is only updated after its chunks have been successfully written to the index.

---

## 7. Scope Filter Syntax

Scope filters are appended to a query string and restrict search results to a subset of indexed files.

**Format:** `<query> @scope:value`

**Rules:**

- Filters are separated from the query and from each other by whitespace.
- Multiple filters may be combined: `auth logic @dir:src/auth @lang:typescript`
- Filter extraction is case-insensitive for the scope name: `@FILE:` and `@file:` are equivalent.
- Filter values are case-sensitive for path matching; case-insensitive for language matching.
- Unrecognized scope names (any `@word:` token that is not in the table below) cause the tool to return `Error: [INVALID_SCOPE_FILTER] ...`
- After extraction, the remaining text is the clean query used for search.

**Supported scopes:**

| Scope | Match type | Example | Behavior |
| --- | --- | --- | --- |
| `@file:` | Basename exact match | `@file:auth.ts` | Only chunks from files whose basename equals `auth.ts` |
| `@dir:` | Path prefix match | `@dir:src/payments` | Only chunks from files whose `filePath` starts with `src/payments` |
| `@ext:` | Extension exact match | `@ext:.py` | Only chunks from files with that extension (include the dot) |
| `@lang:` | Language label match | `@lang:typescript` | Only chunks with that language label (see DATA-MODEL.md) |

---

## 8. Out of Scope for v1

The following are explicitly excluded from this spec and must not appear in any subsystem spec, acceptance criterion, or tool definition:

- **Real-time file watching** — no filesystem watchers, no chokidar, no `fs.watch`. The index is refreshed only when `codebase_index` is explicitly called or when `PI_INDEX_AUTO=true` and a session starts.
- **Cross-project indexing** — each project has one index. There is no mechanism to search across multiple projects.
- **AST-level chunking** — no symbol graph, no type resolution, no call hierarchy. Chunking uses line-count boundaries with best-effort structural boundary detection.
- **pi-memory integration** — pi-index does not share a connection, event bus, or data with pi-memory in v1. The two extensions are independent.
- **Query expansion** — no LLM calls are made during search. The query is used as-is.
- **Temporal decay scoring** — result scores are not adjusted based on file age or modification recency.
- **npm publishing** — pi-index is installed from the GitHub repository, not from npm.
- **Web UI or HTTP API** — pi-index has no server component.
- **Cross-file deduplication** — two chunks from different files with identical content are both stored. Deduplication is only prevented within a single file's re-index cycle (delete-then-insert).
