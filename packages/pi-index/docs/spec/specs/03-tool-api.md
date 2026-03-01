# Subsystem Spec: Tool API

**Version:** 0.3.0
**File:** `specs/03-tool-api.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md, specs/01-indexing.md, specs/02-search.md

---

## Overview

The tool API defines the three LLM-callable tools that pi-index registers with the pi extension system. These are the only public interface between the LLM and the extension — the LLM calls tools, the extension executes the corresponding subsystem behavior, and the result is returned as plain text.

Tools are registered at extension load time. If `CONFIG_MISSING_API_KEY` is detected at startup, all three tools are registered as stubs — every call immediately returns the configuration error string without executing any indexing or search logic.

---

## Tool: `codebase_search`

Searches the index using hybrid vector + full-text search with MMR reranking. This is the tool the LLM should call instead of grep or bash when exploring the codebase.

### Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `query` | string | Yes | — | Natural language or identifier-based search query. May include `@scope:value` filters (see CONSTITUTION.md § 7). |
| `limit` | number | No | `8` | Maximum number of results to return. Range: 0–20. Values above 20 are capped to 20. |
| `minScore` | number | No | config value (`0.2`) | Per-call override for the minimum relevance score threshold. Overrides `PI_INDEX_MIN_SCORE` for this call only. |

### Behavior

Delegates entirely to the search subsystem (`specs/02-search.md`). The full search pipeline runs: query parsing → query embedding → hybrid search → scope filtering → RRF fusion → score threshold → MMR reranking → result formatting.

If the index is empty (zero chunks), returns `Error: [INDEX_NOT_INITIALIZED] ...`.

If `indexer.isRunning` is `true` at the time of the call, a warning line is prepended to the result:

```
⚠️ Index is currently being updated — results may be incomplete.
```

This warning appears even when results are returned successfully. It is omitted when no index run is in progress.

### Returns

On success: formatted plain text as described in `specs/02-search.md` § Result Formatting.

On error: `Error: [CODE] message` using the global error codes from CONSTITUTION.md § 2.

### Error Codes

| Code | Condition |
| --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key configured |
| `INDEX_NOT_INITIALIZED` | Index has never been built or is empty |
| `EMBEDDING_FAILED` | Query embedding call failed after retries |
| `SEARCH_FAILED` | Unexpected error during search |
| `INVALID_SCOPE_FILTER` | Query contains an unrecognized `@scope:` token |

### Usage Examples

```
codebase_search("authentication middleware")
codebase_search("handleStripeWebhook @file:webhooks.ts")
codebase_search("database schema migrations @lang:python @dir:accounts")
codebase_search("email validation", limit: 5)
codebase_search("payment flow", minScore: 0.5)
```

---

## Tool: `codebase_index`

Triggers an incremental index of the configured directories. On first call, builds the full index. On subsequent calls, re-indexes only files that have changed.

### Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `force` | boolean | No | `false` | If `true`, performs a full re-index: all existing chunks are deleted and all files are re-embedded regardless of mtime. Use when the embedding model has been changed or when the index is suspected to be corrupt. |

### Behavior

Delegates to the indexing subsystem (`specs/01-indexing.md`).

`codebase_index` always starts the indexer via `runAsync()` and **returns immediately** — it does not wait for indexing to complete. The full indexing pipeline runs in the background.

When `force: false`: runs the incremental diff against the mtime cache. Only new, changed, and deleted files are processed.

When `force: true`: deletes all chunks from the index and clears the mtime cache, then indexes all eligible files from scratch.

### Returns

On success (immediate — indexing started in background):

```
Started indexing {N} file(s) in the background.
Check progress with codebase_status.
```

When the background run completes, the full summary is available via `codebase_status`. The final summary uses the header "Index updated:" for incremental runs or "Index rebuilt:" for `force: true`:

```
Index updated:
  Added:   {N} file(s) ({M} chunk(s))
  Updated: {N} file(s) ({M} chunk(s))
  Removed: {N} file(s)
  Skipped: {N} file(s) (unchanged)
  Too large: {N} file(s) (size limit)
  Total:   {N} chunk(s)
  Time:    {N}s
```

On error: `Error: [CODE] message`.

### Error Codes

| Code | Condition |
| --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key configured |
| `INDEX_ALREADY_RUNNING` | A previous `codebase_index` call is still in progress |
| `INDEX_FAILED` | An unexpected error occurred during indexing |

Note: individual file embedding failures are non-fatal. They are reported in the summary's `failedFiles` list (visible in logs), and the index run continues for all other files.

### Usage Examples

```
codebase_index()
codebase_index(force: true)
```

---

## Tool: `codebase_status`

Returns the current state of the index — whether it exists, how many files and chunks it contains, when it was last updated, and the current configuration.

### Parameters

None.

### Behavior

Reads the mtime cache (for file count and last-indexed time) and the index database (for chunk count). Does not trigger any indexing or search. Does not call the embedding service.

The `fileCount` is derived from the number of entries in the mtime cache (including entries with `chunkCount: 0` for empty files). The `lastIndexedAt` is the maximum `indexedAt` across all cache entries.

### Returns

On success (index not yet built — `chunkCount == 0` and `cache.size == 0`):

```
pi-index status:
  Index path:    {dbPath}
  Status:        Not built. Call codebase_index to create the index.
  Provider:      {openai | ollama | voyage}
  Auto-index:    {on | off}
  Index dirs:    {comma-separated list of indexDirs}
```

On success (index built):

```
pi-index status:
  Index path:    {dbPath}
  Total chunks:  {N}
  Files indexed: {N}
  Last indexed:  {relative time, e.g. "3 hours ago"}
  Model:         {model name}
  Provider:      {openai | ollama | voyage}
  Auto-index:    {on | off}
  Index dirs:    {comma-separated list of indexDirs}
  (Indexing in progress: {N}/{M} files — {pct}%)   ← only if indexer.isRunning
```

The progress line (`Indexing in progress: …`) is only shown when `indexer.isRunning` is `true`. It displays the count of files processed so far (`N`), the total files to process (`M`), and the percentage complete (`pct`). When `isRunning` is `false` but a previous async run completed, the status shows the result of the last completed run.

On error: `Error: [STATUS_FAILED] {reason}`.

---

## Acceptance Criteria

**Scenario 1 — codebase_search: happy path**

Given the index is populated and `OPENAI_API_KEY` is set,
When `codebase_search` is called with query `"payment processing"`,
Then the tool returns a formatted result block with at least 1 result containing a file path, line range, language label, relevance score, and chunk text.

**Scenario 2 — codebase_search: limit is respected**

Given the index contains more than 5 matching chunks for the query,
When `codebase_search` is called with `limit: 3`,
Then at most 3 results are returned.

**Scenario 3 — codebase_index: async immediate return**

Given the index was built with 100 files and 5 have been modified,
When `codebase_index` is called with `force: false`,
Then the tool returns immediately with "Started indexing…" and `indexer.isRunning` is `true`. After the background run completes, `codebase_status` shows a summary reporting 0 added, 5 updated, 0 removed, 95 skipped.

**Scenario 4 — codebase_index: force rebuild**

Given the index exists,
When `codebase_index` is called with `force: true`,
Then the tool returns immediately with "Started indexing…". After the background run completes, all chunks have been replaced and the summary header says "Index rebuilt:".

**Scenario 5 — codebase_status: populated index**

Given the index contains 4000 chunks across 300 files, last indexed 2 hours ago, and no index run is in progress,
When `codebase_status` is called,
Then the output includes `Total chunks: 4000`, `Files indexed: 300`, a last-indexed time approximately 2 hours ago, and no progress line.

**Scenario 5b — codebase_status: indexing in progress**

Given an index run is currently running and has processed 40 of 100 files,
When `codebase_status` is called,
Then the output includes `Indexing in progress: 40/100 files — 40%`.

**Scenario 6 — codebase_status: empty index**

Given `codebase_index` has never been called,
When `codebase_status` is called,
Then the output includes `Status: Not built. Call codebase_index to create the index.`

**Scenario 7 — all tools: missing API key (OpenAI provider)**

Given `PI_INDEX_PROVIDER` is `openai` (or unset) and neither `OPENAI_API_KEY` nor `PI_INDEX_API_KEY` is set,
When any tool is called,
Then the tool returns `Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.`

**Scenario 7b — all tools: missing API key (Voyage provider)**

Given `PI_INDEX_PROVIDER` is `voyage` and `PI_INDEX_VOYAGE_API_KEY` is not set,
When any tool is called,
Then the tool returns `Error: [CONFIG_MISSING_API_KEY] Set PI_INDEX_VOYAGE_API_KEY to use the Voyage AI provider.`

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| `codebase_search` with `limit: 0` | Returns `Found 0 results for "..."`. No error. |
| `codebase_search` with `limit: 25` | Capped to 20. Returns at most 20 results. |
| `codebase_index` while auto-index session-start run is in progress | Returns `Error: [INDEX_ALREADY_RUNNING] ...`. The session-start run continues. |
| `codebase_status` while `codebase_index` is running | Returns status as of last completed run, with `Indexing in progress: N/M files — pct%` progress line. |
| `codebase_index` with `force: true` and all embeddings fail | Index is left empty (all old chunks deleted, none inserted). Summary (available via `codebase_status`) reports all files as failed. |
| `codebase_search` while `codebase_index` is running | Returns results from the current (possibly incomplete) index with a `⚠️ Index is currently being updated — results may be incomplete.` warning prepended. |
