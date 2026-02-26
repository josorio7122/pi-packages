# pi-index — Data Model

**Version:** 0.1.0
**Status:** Draft

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

`IndexConfig` is the runtime configuration — it defines where the index lives and how it behaves. The index root is the project directory. For every file the indexer processes, it produces one or more `CodeChunk` records (stored in the vector+FTS database) and exactly one `MtimeEntry` (stored in the mtime cache). The `MtimeEntry` is the indexer's memory of what it last saw for that file; the `CodeChunk` records are the searchable knowledge derived from it.

---

## Entity: CodeChunk

A single searchable excerpt of a source file. The smallest unit stored in and retrieved from the index.

**ID assignment:** Server-assigned. Computed as `{filePath}:{chunkIndex}` (e.g., `src/auth/login.ts:3`). Deterministic — the same file at the same chunking always produces the same IDs, enabling upsert without a separate lookup.

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Unique identifier. Format: `{filePath}:{chunkIndex}`. Server-assigned. Immutable after creation. |
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

- `id` is immutable. It is never updated in place — re-indexing deletes all chunks for the file and inserts fresh ones.
- `text` is immutable once written.
- `vector` is immutable once written.
- `filePath` is always relative. Absolute paths are never stored.
- `chunkIndex` values within a file form a contiguous sequence starting at 0.
- `endLine >= startLine` is always true.
- `endLine - startLine + 1 <= 80` — no chunk exceeds 80 lines (see CONSTITUTION.md § 5).
- When a file changes: all `CodeChunk` records where `filePath` matches that file are deleted, then new records are inserted.
- When a file is deleted from disk: all `CodeChunk` records where `filePath` matches are deleted.

---

## Entity: MtimeEntry

A record of the last-known state of an indexed file. Stored in the mtime cache alongside the index. Used by the indexer to determine which files need re-indexing.

**ID assignment:** `filePath` serves as the natural key. No separate ID field.

### Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `filePath` | string | Yes | Relative path from the index root. Same format as `CodeChunk.filePath`. Natural key — unique per file. |
| `mtime` | number | Yes | File modification time in Unix milliseconds at the time this file was last indexed. |
| `chunkCount` | number | Yes | Number of chunks produced from this file during its last index run. |
| `indexedAt` | number | Yes | Unix milliseconds when this file was last indexed. |

### Constraints

- Exactly one `MtimeEntry` per indexed file.
- Updated only after the corresponding `CodeChunk` records have been successfully written.
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
| `mtimeCachePath` | string | Yes | Absolute path to the mtime-cache.json file. |
| `indexDirs` | string[] | Yes | Absolute paths of directories to walk during indexing. At least one entry. |
| `autoIndex` | boolean | Yes | Whether to trigger incremental indexing on session start. Default: `false`. |
| `maxFileKB` | number | Yes | Maximum file size in kilobytes. Files larger than this are skipped. Default: `500`. |
| `minScore` | number | Yes | Minimum relevance score for search results. Default: `0.2`. |

### Constraints

- `apiKey` must be non-empty or `CONFIG_MISSING_API_KEY` is raised and all tools are disabled.
- `dimensions` must match the model: 1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`.
- `minScore` must be in `[0.0, 1.0]`.
- `maxFileKB` must be greater than 0.
- `indexDirs` must contain at least one entry.

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

Files with extensions not in this table are skipped during indexing. The `@lang:` scope filter matches against the language label column.

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

1. The file's extension must be in the Supported Languages table. If not → skip.
2. The file size must be `<= maxFileKB` kilobytes. If not → skip (emit `FILE_TOO_LARGE`).
3. The file must be reachable from one of the configured `indexDirs`. If not → skip.

There are no directory exclusions defined at the spec level. All files within the configured `indexDirs` that pass the above checks are indexed, including files in `migrations/`, `node_modules/`, `.git/`, or any other subdirectory. Callers configure `indexDirs` to control scope.
