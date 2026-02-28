# pi-index — Data Model

**Version:** 0.2.0
**Status:** Current

---

## Entity Overview

```
IndexConfig (1)
    │
    └── governs ──► Index Root (1)
                        │
                        ├── contains ──► CodeChunk (0..N)   one per chunk of each indexed file
                        └── mirrors  ──► MtimeEntry (0..N)  one per indexed file
```

`IndexConfig` is the runtime configuration — it defines where the index lives and how it behaves. The index root is the project directory. For every file the indexer processes, it produces zero or more `CodeChunk` records (stored in the vector+FTS database) and exactly one `MtimeEntry` (stored in the mtime cache). The `MtimeEntry` is the indexer's memory of what it last saw for that file; the `CodeChunk` records are the searchable knowledge derived from it. Empty files produce zero `CodeChunk` records but still get a `MtimeEntry` with `chunkCount: 0`.

---

## Entity: CodeChunk

A single searchable excerpt of a source file. The smallest unit stored in and retrieved from the index.

**ID assignment:** Server-assigned. Computed as `{filePath}:{chunkIndex}` (e.g., `src/auth/login.ts:3`). Deterministic within a single index run — the same file at the same chunking always produces the same IDs.

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Unique identifier. Format: `{filePath}:{chunkIndex}`. Server-assigned. |
| `text` | string | Yes | Raw source lines from `startLine` to `endLine` (inclusive). Never empty. Never preprocessed or modified. |
| `vector` | float[] | Yes | Embedding of the enriched input (see Embedding Input below). Server-assigned. Length equals the model's dimension count. |
| `filePath` | string | Yes | Relative path from the index root. Forward slashes. E.g. `src/auth/login.ts`. |
| `chunkIndex` | number | Yes | 0-based position of this chunk within the file. Monotonically increasing. No gaps. |
| `startLine` | number | Yes | First line of this chunk. 1-based, inclusive. |
| `endLine` | number | Yes | Last line of this chunk. 1-based, inclusive. Always `>= startLine`. |
| `language` | string | Yes | Language label derived from the file extension. See Supported Languages table. |
| `extension` | string | Yes | File extension including the dot. E.g. `.ts`, `.py`. |
| `symbol` | string | Yes | Best-effort function or class name extracted from the chunk's first structural boundary. Empty string if none detected. |
| `mtime` | number | Yes | File modification time in Unix milliseconds at the time this chunk was indexed. |
| `createdAt` | number | Yes | Unix milliseconds when this chunk was written to the index. Server-assigned. |

### Embedding Input

The text sent to the embedding service is an enriched version of the chunk — not the raw `text` field. The enriched form prepends a context header:

```
File: {filePath} ({language})
Symbol: {symbol}
---
{text}
```

This improves retrieval quality because the embedding encodes both the file context and the code content. The stored `text` field is always the raw source lines — never the enriched form.

### Constraints

- `id` is never updated in place — re-indexing deletes all chunks for the file and inserts fresh ones.
- `text` is immutable once written.
- `vector` is immutable once written.
- `filePath` is always relative. Absolute paths are never stored.
- `chunkIndex` values within a file form a contiguous sequence starting at 0.
- `endLine >= startLine` is always true.
- `endLine - startLine + 1 <= 80` — no chunk exceeds 80 lines (see CONSTITUTION.md § 5).
- When a file changes: all `CodeChunk` records where `filePath` matches that file are deleted, then new records are inserted.
- When a file is deleted from disk or becomes empty: all `CodeChunk` records where `filePath` matches are deleted.

---

## Entity: MtimeEntry

A record of the last-known state of an indexed file. Stored in the mtime cache alongside the index. Used by the indexer to determine which files need re-indexing.

**ID assignment:** `filePath` serves as the natural key. No separate ID field.

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `filePath` | string | Yes | Relative path from the index root. Same format as `CodeChunk.filePath`. Natural key — unique per file. |
| `mtime` | number | Yes | File modification time in Unix milliseconds at the time this file was last indexed. |
| `chunkCount` | number | Yes | Number of chunks produced from this file during its last index run. May be 0 for empty files. |
| `indexedAt` | number | Yes | Unix milliseconds when this file was last indexed. |

### Constraints

- Exactly one `MtimeEntry` per indexed file (including empty files with `chunkCount: 0`).
- Updated only after the corresponding `CodeChunk` records have been successfully written (or deleted, for empty files).
- Deleted when the corresponding file is deleted from disk.
- The mtime cache as a whole is written atomically (CONSTITUTION.md § 6).

---

## Entity: IndexConfig

The runtime configuration derived from environment variables at extension startup. Not persisted — rebuilt on every session from the environment.

**ID assignment:** Not applicable — there is exactly one `IndexConfig` per session.

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `apiKey` | string | Yes | OpenAI API key for embeddings. Sourced from `PI_INDEX_API_KEY` or `OPENAI_API_KEY`. |
| `model` | string | Yes | Embedding model name. Default: `text-embedding-3-small`. |
| `dimensions` | number | Yes | Vector dimension count for the configured model. Derived — not set by the user. |
| `dbPath` | string | Yes | Absolute path to the index database directory. |
| `mtimeCachePath` | string | Yes | Absolute path to the mtime-cache.json file. Always `.pi/index/mtime-cache.json` relative to `indexRoot`. |
| `indexRoot` | string | Yes | Absolute path to the project root directory (where `process.cwd()` points when pi starts). |
| `indexDirs` | string[] | Yes | Paths of directories to walk during indexing. At least one entry. Defaults to `[indexRoot]`. May be absolute or relative to `process.cwd()`. |
| `autoIndex` | boolean | Yes | Whether to trigger incremental indexing on session start. Default: `false`. |
| `autoIndexInterval` | number | Yes | Minutes between automatic re-indexes when `autoIndex` is true. `0` = once per session only. Default: `0`. |
| `maxFileKB` | number | Yes | Maximum file size in kilobytes. Files larger than this are skipped. Default: `500`. |
| `minScore` | number | Yes | Minimum relevance score for search results. Default: `0.2`. |
| `mmrLambda` | number | Yes | MMR diversity weight. `1.0` = pure relevance, `0.0` = maximum diversity. Default: `0.5`. |

### Constraints

- `apiKey` must be non-empty or `CONFIG_MISSING_API_KEY` is raised and all tools are disabled.
- `dimensions` must match the model: 1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`.
- `minScore` must be in `[0.0, 1.0]`.
- `maxFileKB` must be greater than 0.
- `mmrLambda` must be in `[0.0, 1.0]`.
- `autoIndexInterval` must be >= 0.
- `indexDirs` contains only directories that exist at config load time. Non-existent directories are filtered out with a console warning. Paths are resolved from `process.cwd()` if relative.

---

## Database Indexes

The `chunks` table has several indexes that are created and maintained automatically:

| Index Name | Type | Column(s) | Created When | Purpose |
| --- | --- | --- | --- | --- |
| `text_idx` | FTS (tantivy) | `text` | Table creation; rebuilt after every indexing run | BM25 full-text search for hybrid queries |
| `filePath_idx` | BTREE | `filePath` | DB initialization (both new and existing tables) | Accelerates `@file:` and `@dir:` scope filter queries |
| `language_idx` | BTREE | `language` | DB initialization (both new and existing tables) | Accelerates `@lang:` scope filter queries |
| `extension_idx` | BTREE | `extension` | DB initialization (both new and existing tables) | Accelerates `@ext:` scope filter queries |
| `vector_idx` | IVF-PQ | `vector` | After indexing, when chunk count ≥ 10,000 | Approximate nearest-neighbor search for large codebases |

**Scalar indexes (BTREE):**
- Created idempotently during `doInitialize()` on both the `createTable` (new DB) and `openTable` (existing DB) paths.
- LanceDB's default `replace: true` silently rebuilds an existing index (~4ms).
- Best-effort: if creation fails, queries degrade to full column scans — slower but correct.
- LanceDB v0.26.2 uses scalar indexes for prefiltering automatically when a `WHERE` clause references an indexed column.

**Vector index (IVF-PQ):**
- Created only when chunk count ≥ `VECTOR_INDEX_THRESHOLD` (10,000) and no `vector_idx` exists yet.
- Parameters: `numPartitions = min(ceil(sqrt(count)), 256)`, `numSubVectors = floor(vectorDim / 16)`, `distanceType = "cosine"`.
- Updated incrementally by `table.optimize()` — no need to rebuild on every indexing run.
- Best-effort: if creation fails, vector search falls back to brute-force — slower but correct.

---

## Supported Languages

| Extension | Language Label |
| --- | --- |
| `.ts` | `typescript` |
| `.tsx` | `typescript` |
| `.d.ts` | `typescript` |
| `.js` | `javascript` |
| `.jsx` | `javascript` |
| `.py` | `python` |
| `.sql` | `sql` |
| `.md` | `markdown` |
| `.css` | `css` |
| `.html` | `html` |
| `.txt` | `text` |

Files with extensions not in this table are silently skipped during indexing. The `@lang:` scope filter matches against the language label column.

**Note on `.d.ts`:** TypeScript declaration files use the extension `.d.ts`. Since `path.extname("foo.d.ts")` returns `.ts`, the walker and chunker use `basename.endsWith(".d.ts")` to detect this extension correctly before falling back to `extname`.

---

## Supported Embedding Models

| Model Name | Dimensions |
| --- | --- |
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |

Changing the model after an index has been built produces a mixed-dimension index that will return incorrect results. The index must be cleared (`/index-clear`) and rebuilt after changing the model.

---

## File Inclusion Rules

The indexer applies these rules in order when deciding whether to process a file:

1. The directory `node_modules` and `.git` are always excluded, regardless of `.gitignore` settings.
2. Directories and files matching patterns in `.gitignore` files are excluded. Both the root `.gitignore` and per-subdirectory `.gitignore` files are respected. Patterns are scoped to the directory that contains the `.gitignore` file.
3. The file's extension must be in the Supported Languages table. If not → silently skip.
4. The file size must be `<= maxFileKB` kilobytes. If greater → skip, increment `skippedTooLarge` counter.
5. The file must be reachable from one of the configured `indexDirs`.

Files passing all rules are eligible for indexing. Files failing rule 1, 2, or 3 are not counted in any summary metric. Files failing rule 4 are counted in `skippedTooLarge`.

**Gitignore support details:**
- Patterns are read from `.gitignore` at each directory level as the walker descends.
- Subdirectory patterns apply only to files under that subdirectory (scoped matching).
- `**` patterns cross directory boundaries. `*` matches within a single path segment.
- `?` matches exactly one non-separator character.
- Negation patterns (`!pattern`) are not supported and are skipped with a warning.
- Rooted patterns (starting with `/`) are anchored to the directory containing the `.gitignore`.
