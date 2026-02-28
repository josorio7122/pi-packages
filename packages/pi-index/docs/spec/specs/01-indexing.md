# Subsystem Spec: Indexing

**Version:** 0.3.0
**File:** `specs/01-indexing.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md

---

## Overview

The indexing subsystem is responsible for reading source files from disk, splitting them into chunks, producing an embedding for each chunk, and writing the results to the index. It also maintains the mtime cache — the record of what was last indexed — which enables incremental updates on subsequent runs.

The indexing subsystem runs when the developer or LLM calls `codebase_index`, or automatically on session start when `PI_INDEX_AUTO=true`. When `autoIndexInterval > 0` a periodic timer re-triggers incremental indexing at that interval. All indexing runs execute asynchronously — `codebase_index` returns immediately and the work proceeds in the background. The subsystem is designed so that re-running it on an unchanged codebase is nearly instantaneous: only modified files generate any work.

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

1. Always skip directories named `node_modules` or `.git`.
2. Skip directories and files matching patterns in `.gitignore` files at any level of the tree.
3. Skip files whose extension is not in the Supported Languages table.
4. Skip files whose size strictly exceeds `IndexConfig.maxFileKB` kilobytes. These increment the `skippedTooLarge` counter in the summary.
5. Accept all other files.

The indexer collects the relative path (relative to the index root, using forward slashes) and the current mtime for each accepted file.

### Incremental Diff

After collecting the current file set, the indexer computes a three-way diff against the mtime cache:

- **New files**: present on disk, absent from the mtime cache → must be indexed.
- **Changed files**: present on disk and in the mtime cache, but current mtime differs from stored mtime → must be re-indexed.
- **Deleted files**: absent from disk, present in the mtime cache → chunks must be deleted and mtime entry removed.
- **Unchanged files**: present on disk and in the mtime cache, current mtime matches stored mtime → skipped entirely (no reading, no embedding, no writing).

### Chunking

For each new or changed file, the indexer reads the file content and splits it into chunks. Chunks must satisfy all invariants in CONSTITUTION.md § 5 (Chunking Contract).

**`chunkFile()` is async.** Because tree-sitter parsing is performed asynchronously, `chunkFile()` returns a `Promise<Chunk[]>`. All callers must `await` the result.

**Empty files:** If a file's content is empty or consists only of whitespace, `chunkFile` returns zero chunks. The indexer still updates the mtime cache entry for this file (with `chunkCount: 0`) and deletes any old DB chunks for it. The file is not counted as a failure.

The chunker uses one of two strategies depending on language support:

#### Strategy 1 — AST chunking (tree-sitter)

For languages with a tree-sitter grammar, the chunker parses the file into a full AST and queries it for top-level and class-member structural nodes (function declarations, class declarations, method definitions, etc.). Each structural node becomes the start of a new chunk. This is more accurate than regex matching because it understands the full syntactic structure of the file.

**Languages using AST chunking:**

| Language | tree-sitter grammar |
| --- | --- |
| `typescript` / `javascript` | `tree-sitter-typescript`, `tree-sitter-javascript` |
| `python` | `tree-sitter-python` |
| `ruby` | `tree-sitter-ruby` |
| `css` | `tree-sitter-css` |
| `scss` | `tree-sitter-scss` |

AST split algorithm:
1. Parse the file with the appropriate tree-sitter grammar.
2. Walk the AST and collect node start-line indices for target node types (function/class/method declarations at any nesting level).
3. Lines before the first structural node become a preamble range `[0, first_node_start - 1]`.
4. Each structural node starts a range ending just before the next node's start line (or at end of file).
5. Any range exceeding 80 lines is sub-split at 80-line increments.
6. Assign `chunkIndex` values sequentially starting at 0.
7. `symbol` is set to the identifier name extracted from the structural node. If no node on that line (preamble, continuation), `symbol` is an empty string.

#### Strategy 2 — Fallback (LangChain RecursiveCharacterTextSplitter)

For languages without tree-sitter support, the chunker delegates to LangChain's `RecursiveCharacterTextSplitter`. This splits text by a hierarchy of separators (double newline → single newline → space → character) while respecting the 80-line maximum chunk size.

**Languages using fallback chunking:**

| Language | Notes |
| --- | --- |
| `sql` | Split on SQL statement boundaries |
| `markdown` | Split on heading boundaries |
| `html` | Split on tag boundaries |
| `json` | Split on structural separators |
| `yaml` / `toml` | Split on blank lines |
| `text` | Split on blank lines |
| `less` | Split on blank lines |
| `erb` | Split on blank lines |

When using the fallback strategy, `symbol` is always an empty string.

### Embedding

For each chunk produced, the indexer constructs an enriched input string using the contextual enricher (DATA-MODEL.md § Embedding Input) and sends it to the active `EmbeddingProvider`. The enricher adds file-level context — sibling symbols, import names, and chunk position — to improve retrieval quality without any LLM cost.

The `EmbeddingProvider` is created at startup by `createProvider(cfg)` based on the `provider` config field:
- `openai` (default) — calls the OpenAI `embeddings.create` API.
- `ollama` — calls the local Ollama HTTP API at `ollamaHost`.
- `voyage` — calls the Voyage AI embedding API using `voyageApiKey`.

Embedding calls are batched: up to **20 chunks per API call** (`EMBED_BATCH_SIZE`). Up to **3 API calls are made concurrently** (`EMBED_CONCURRENCY`). Each batch invokes `provider.embedBatch(texts)` with up to 20 enriched text strings.

If the embedding service returns a rate-limit error (HTTP 429), the provider retries with exponential backoff: delays of 1s, 2s, 4s between attempts (4 total attempts; up to 7s wait before the final attempt). After all 4 attempts fail, the error propagates to the indexer. Other HTTP errors (401, 403, 500, etc.) fail immediately without retrying.

If a batch fails, **all files in that batch** are marked as failed — partial writes are never made. The mtime entry for a failed file is not updated, so the file will be retried on the next run.

### Writing

For each successfully embedded file:
1. Delete all existing chunks from the index whose `filePath` matches the file being indexed.
2. Insert the new chunk records with their vectors.
3. Update the mtime cache entry.

For deleted files (no longer on disk): delete all chunks where `filePath` matches, remove the mtime entry.

For empty files (re-indexed, now 0 chunks): delete all chunks where `filePath` matches, write mtime entry with `chunkCount: 0`.

### Mtime Cache Update

After all chunks for a file have been successfully written to the index, the indexer updates the in-memory mtime cache for that file (`filePath`, `mtime`, `chunkCount`, `indexedAt`). The full cache is written to disk atomically after all files have been processed (CONSTITUTION.md § 6 rule 5).

After processing, the following post-indexing steps run in order:

1. **FTS index rebuild** (`rebuildFtsIndex`) — if any files were added or updated, so that hybrid search immediately reflects the new chunks.
2. **Table optimization** (`optimize`) — if any files were added, updated, or deleted. Compacts fragmented data files created by per-file delete+insert cycles and prunes old table versions.
3. **Vector index creation** (`createVectorIndexIfNeeded`) — if any files were added, updated, or deleted. Creates an IVF-PQ vector index when the chunk count exceeds 10,000 and no vector index already exists. Skipped for small codebases where brute-force is fast enough.

All three steps are best-effort — failures are logged as warnings but do not affect the indexing result or summary.

### Progress Feedback

When a caller provides an `onProgress` callback, the indexer emits progress messages at key phases:
- After scanning: `"🔍 Scanned — N file(s) to check"`
- Before processing: `"⚡ Indexing N file(s) (A new, B changed)..."`
- After reading files: `"📚 Reading files... (N/M)"`
- During embedding (throttled, max once per second): `"🧠 Embedding chunks... (N/M)"`
- On completion (unthrottled, always fires): one of three messages based on what happened

### Concurrency

Only one index operation may run at a time. If `codebase_index` is called while a previous call is still running, it throws `INDEX_ALREADY_RUNNING` immediately.

### Async Mode

All indexing runs execute via `runAsync()`, which starts the indexer in the background and returns immediately. The `codebase_index` tool always returns a "Started indexing…" message to the caller without waiting for the run to complete. Callers can poll progress via `codebase_status`.

- `indexer.isRunning` is `true` while a background run is in progress.
- `codebase_status` displays a progress percentage when `isRunning` is `true`.
- `codebase_search` results include a warning line ("⚠️ Index is currently being updated…") when `isRunning` is `true`.

### Auto-Index

When `PI_INDEX_AUTO=true`, the extension registers a `before_agent_start` event handler that runs incremental indexing before every agent turn. The `PI_INDEX_AUTO_INTERVAL` env var (default `0`) controls the minimum minutes between runs:
- `0` = index once per session, then never again until the session restarts.
- `30` = re-index if at least 30 minutes have elapsed since the last completed index.

Auto-index runs fire-and-forget (non-blocking). If the indexer is already running (e.g., from a `codebase_index` tool call), auto-index is skipped for that turn and retried on the next.

### Periodic Sync

When `autoIndexInterval > 0`, a `setInterval` timer is registered at extension startup. On each tick:
1. If `indexer.isRunning` is `true`, the tick is skipped entirely.
2. Otherwise, incremental indexing is triggered via `runAsync()`.

The interval is specified in minutes (`autoIndexInterval`). This keeps the index fresh during long-running sessions without requiring the developer to manually call `codebase_index` after every code change.

---

## Acceptance Criteria

**Scenario 1 — Happy path: first index build**

Given the index is empty and `OPENAI_API_KEY` is set,
When `codebase_index` is called,
Then all eligible files are chunked and embedded, all chunks are written to the index, the mtime cache is written, and the tool returns a summary listing files added.

**Scenario 2 — Happy path: incremental refresh with one changed file**

Given the index contains chunks for 3 files and the mtime cache reflects their mtimes,
When one file is modified on disk and `codebase_index` is called,
Then only the modified file is re-indexed (its old chunks are deleted and new chunks are inserted), the other 2 files are skipped, and the summary lists 0 added, 1 updated, 2 skipped.

**Scenario 3 — Validation error: missing API key**

Given `OPENAI_API_KEY` and `PI_INDEX_API_KEY` are both absent,
When `codebase_index` is called,
Then the tool returns `Error: [CONFIG_MISSING_API_KEY] ...` and no files are processed.

**Scenario 4 — Validation error: file too large**

Given `PI_INDEX_MAX_FILE_KB` is `500`,
When `codebase_index` encounters a TypeScript file of 600KB,
Then that file is skipped, the summary includes `skippedTooLarge: 1`, and all other eligible files are indexed normally.

**Scenario 5 — Edge case: deleted file**

Given the index contains 5 chunks for `src/auth/login.ts`,
When `src/auth/login.ts` is deleted from disk and `codebase_index` is called,
Then all 5 chunks for that file are removed, the mtime entry is removed, and the summary lists 1 removed.

**Scenario 6 — Edge case: concurrency guard**

Given `codebase_index` is currently running,
When `codebase_index` is called again,
Then the second call immediately returns `Error: [INDEX_ALREADY_RUNNING] ...`.

**Scenario 9 — Async mode: immediate return**

Given `codebase_index` is called,
When the tool executes,
Then it returns immediately with a "Started indexing…" message before any files are processed, and `indexer.isRunning` becomes `true`.

**Scenario 10 — Periodic sync: skips when already running**

Given `autoIndexInterval` is `30` and `indexer.isRunning` is `true`,
When the `setInterval` timer fires,
Then no new index run is started (tick is skipped).

**Scenario 7 — Edge case: embedding retry**

Given the embedding service returns HTTP 429 on the first attempt,
When the `Embeddings` class sends a batch,
Then it retries with exponential backoff (delays of 1s, 2s, 4s between 4 total attempts) before marking the batch as failed.

**Scenario 8 — Edge case: file becomes empty**

Given `src/auth/login.ts` was indexed with 5 chunks,
When the file content is cleared and `codebase_index` is called,
Then the 5 old chunks are deleted from the DB, and the mtime cache records `chunkCount: 0` for the file.

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| Empty directory | Zero files processed. Summary: 0 added, 0 updated, 0 removed, 0 skipped. No error. |
| File with unsupported extension (e.g., `.swift`) | Silently skipped. Not counted in any summary category. |
| File that is exactly `maxFileKB` bytes | Accepted and indexed. The limit is exclusive: only files strictly greater than `maxFileKB` KB are skipped. |
| File consisting entirely of whitespace | Produces zero chunks. Mtime entry written with `chunkCount: 0`. Not counted as a failure. |
| `PI_INDEX_DIRS` points to a non-existent directory | Filtered out at config load time with a `console.warn`. Not included in `indexDirs`. If all dirs are removed, falls back to `indexRoot`. |
| Mtime cache is missing or corrupt | The indexer treats all files as new and performs a full re-index. The corrupt/missing cache is replaced on completion. |
| Two files with identical content in different paths | Both are indexed independently as separate `CodeChunk` records with different `filePath` values. |
| Embedding service is unreachable after all retries | Affected files are listed in `failedFiles`. Their previous DB chunks are preserved (stale but present). Mtime entries are not updated, so the files are retried next run. |
| `force: true` with embedding failures | All old chunks are deleted first. Failed files are re-attempted next time `codebase_index` is called. |
