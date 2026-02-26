# Subsystem Spec: Indexing

**Version:** 0.1.0
**File:** `specs/01-indexing.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md

---

## Overview

The indexing subsystem is responsible for reading source files from disk, splitting them into chunks, producing an embedding for each chunk, and writing the results to the index. It also maintains the mtime cache — the record of what was last indexed — which enables incremental updates on subsequent runs.

The indexing subsystem runs when the developer or LLM calls `codebase_index`, or automatically on session start when `PI_INDEX_AUTO=true`. It never runs in the background unprompted. The subsystem is designed so that re-running it on an unchanged codebase is nearly instantaneous: only modified files generate any work.

The indexing subsystem connects to the search subsystem (`specs/02-search.md`) by producing the `CodeChunk` records that search reads. It connects to the tool API (`specs/03-tool-api.md`) because `codebase_index` is the public trigger for this subsystem.

---

## User Stories

1. As a developer, I can call `codebase_index` to build the index for the first time, so that the LLM can search my codebase semantically without reading individual files.

2. As a developer, I can call `codebase_index` again after making code changes, so that the index reflects the current state of the codebase without paying to re-embed files that have not changed.

3. As a developer, I can set `PI_INDEX_DIRS` to specific subdirectories, so that I can control which parts of the project are indexed and exclude directories I don't want to pay to embed.

4. As the LLM agent, I can call `codebase_index` when the user asks me to refresh the index, so that I can ensure search results reflect recent changes before starting a research task.

5. As a developer, I can see a summary of what the indexer did — how many files were added, updated, removed, and skipped — so that I can verify the index reflects what I expect.

---

## Behavior

### File Walking

The indexer walks each directory in `IndexConfig.indexDirs` recursively. For each file encountered, it applies the inclusion rules in order (DATA-MODEL.md § File Inclusion Rules):

1. Skip files whose extension is not in the Supported Languages table.
2. Skip files whose size exceeds `IndexConfig.maxFileKB` kilobytes (emit `FILE_TOO_LARGE` in the summary, not as an error).
3. Accept all other files.

The indexer collects the relative path (relative to the index root) and the current mtime for each accepted file.

### Incremental Diff

After collecting the current file set, the indexer computes a three-way diff against the mtime cache:

- **New files**: present on disk, absent from the mtime cache → must be indexed.
- **Changed files**: present on disk and in the mtime cache, but current mtime differs from stored mtime → must be re-indexed.
- **Deleted files**: absent from disk, present in the mtime cache → chunks must be deleted.
- **Unchanged files**: present on disk and in the mtime cache, current mtime matches stored mtime → skipped entirely.

### Chunking

For each new or changed file, the indexer reads the file content and splits it into chunks. Chunks must satisfy all invariants in CONSTITUTION.md § 5 (Chunking Contract).

The chunking algorithm uses structural boundary detection to align chunk boundaries with function and class definitions where possible. The detection uses pattern matching on line content — it does not parse the file's syntax tree. Detection is best-effort: missed boundaries produce larger chunks, not incorrect behavior.

**Boundary detection patterns by language:**

| Language | Patterns that start a new chunk |
| --- | --- |
| `typescript` / `javascript` | Lines matching `export function`, `export async function`, `export const ... =`, `export class`, `export abstract class`, `function `, `class `, `const ... = (`, `const ... = async (` at the start of the line |
| `python` | Lines matching `def ` or `async def ` or `class ` at column 0 (top-level only) |
| `sql` | Lines matching `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` at the start of the line |
| `markdown` | Lines starting with `##` or `###` (section boundaries) |
| `css` | Lines matching a CSS selector pattern followed by `{` |
| All others | No structural detection — file is split by line count only |

**Split algorithm:**

1. Collect all line indices where a boundary pattern matches. These are candidate chunk starts.
2. Group consecutive lines between boundaries. If a group exceeds 80 lines, sub-split at the next inner boundary pattern. If no inner boundary is found, hard-split at 80 lines.
3. Lines before the first boundary (imports, module-level declarations) are collected as a preamble chunk. If the preamble exceeds 40 lines, it is split at blank-line boundaries first.
4. Assign `chunkIndex` values sequentially starting at 0.
5. Set `symbol` to the first detected identifier name from the boundary pattern on the chunk's first line. If no boundary was detected on the first line, `symbol` is an empty string.

### Embedding

For each chunk produced, the indexer constructs an enriched input string (DATA-MODEL.md § Embedding Input) and sends it to the embedding service.

Embedding calls are batched: up to 20 chunks per API call. Up to 3 API calls are made concurrently. If the embedding service returns a rate-limit error (HTTP 429), the indexer retries with exponential backoff: 1 second, 2 seconds, 4 seconds, 8 seconds. After 4 failed attempts, the error is recorded in the summary and the affected file is skipped (its mtime entry is not updated).

### Writing

For each successfully embedded chunk, the indexer:
1. Deletes all existing chunks from the index whose `filePath` matches the file being indexed (handles the changed-file case).
2. Inserts the new chunk records with their vectors.

For each deleted file, the indexer deletes all chunks from the index whose `filePath` matches.

### Mtime Cache Update

After all chunks for a file have been successfully written to the index, the indexer updates the in-memory mtime cache for that file (`filePath`, `mtime`, `chunkCount`, `indexedAt`). The full cache is written to disk atomically after all files have been processed (CONSTITUTION.md § 6).

### Concurrency

Only one index operation may run at a time. If `codebase_index` is called while a previous call is still running, it returns `Error: [INDEX_ALREADY_RUNNING] ...` immediately.

---

## Acceptance Criteria

**Scenario 1 — Happy path: first index build**

Given the index is empty and `OPENAI_API_KEY` is set,
When `codebase_index` is called with `PI_INDEX_DIRS` pointing to a directory containing 3 TypeScript files,
Then all 3 files are chunked and embedded, all chunks are written to the index, the mtime cache is written with 3 entries, and the tool returns a summary listing 3 files added and 0 skipped.

**Scenario 2 — Happy path: incremental refresh with one changed file**

Given the index contains chunks for 3 files and the mtime cache reflects their mtimes,
When one file is modified on disk and `codebase_index` is called,
Then only the modified file is re-indexed (its old chunks are deleted and new chunks are inserted), the other 2 files are skipped, and the summary lists 0 added, 1 updated, 2 skipped.

**Scenario 3 — Validation error: missing API key**

Given `OPENAI_API_KEY` and `PI_INDEX_API_KEY` are both absent,
When `codebase_index` is called,
Then the tool returns `Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable indexing.` and no files are processed.

**Scenario 4 — Validation error: file too large**

Given `PI_INDEX_MAX_FILE_KB` is `500`,
When `codebase_index` encounters a TypeScript file of 600KB,
Then that file is skipped, the summary includes it in the skipped count with the reason `FILE_TOO_LARGE`, and all other eligible files are indexed normally.

**Scenario 5 — Edge case: deleted file**

Given the index contains 5 chunks for `src/auth/login.ts` and the mtime cache has an entry for that file,
When `src/auth/login.ts` is deleted from disk and `codebase_index` is called,
Then all 5 chunks for `src/auth/login.ts` are removed from the index, the mtime cache entry for that file is removed, and the summary lists 1 file removed.

**Scenario 6 — Edge case: concurrency guard**

Given `codebase_index` is currently running,
When `codebase_index` is called again before the first completes,
Then the second call immediately returns `Error: [INDEX_ALREADY_RUNNING] ...` and the first call continues uninterrupted.

**Scenario 7 — Edge case: embedding retry**

Given the embedding service returns a rate-limit error on the first attempt,
When `codebase_index` is processing a file,
Then the indexer retries after 1 second, then 2 seconds, then 4 seconds, then 8 seconds before marking that file as failed, and continues indexing the remaining files.

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| Empty directory | Zero files processed. Summary: 0 added, 0 updated, 0 removed, 0 skipped. No error. |
| File with no supported extension (e.g., `.rb`) | File is silently skipped. Not counted in any summary category. |
| File that is exactly `maxFileKB` bytes | Accepted and indexed. The limit is exclusive: only files strictly greater than `maxFileKB` KB are skipped. |
| File consisting entirely of blank lines | Produces one chunk containing those blank lines. `symbol` is empty string. |
| File with a single line exceeding 80 lines worth of content (pathological case) | That single line forms a chunk on its own. The 80-line limit is a line-count limit, not a character limit. |
| `PI_INDEX_DIRS` points to a directory that does not exist | The missing directory is reported in the summary as a warning. Other directories are processed normally. |
| Mtime cache is missing or corrupt | The indexer treats all files as new and performs a full re-index. The corrupt cache is overwritten. |
| Two files with identical content in different paths | Both are indexed independently as separate `CodeChunk` records with different `filePath` values. |
| Index database is missing but mtime cache exists | Index is rebuilt from scratch. Mtime cache is discarded and rebuilt. |
| Embedding service is unreachable after all retries | Affected files are skipped and listed in the summary. The index retains their previous chunks (stale but present). Mtime entries are not updated. |

---

## Notes

The structural boundary detection patterns are intentionally conservative. A pattern that misses a boundary results in a larger chunk — at worst, an 80-line chunk that could have been two 40-line chunks. A pattern that incorrectly fires on a non-boundary line results in an extra small chunk that starts mid-function. Both outcomes are acceptable for v1 and do not cause incorrect search results — only slightly imprecise chunk boundaries.

The 80-line limit was chosen to balance chunk size (larger chunks carry more context but produce noisier embeddings) against granularity (smaller chunks are more precise but fragment functions across chunks). 80 lines ≈ 512 tokens for typical TypeScript or Python source, which matches the chunk size used by OpenClaw's production embedding pipeline.
