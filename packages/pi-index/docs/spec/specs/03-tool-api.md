# Subsystem Spec: Tool API

**Version:** 0.1.0
**File:** `specs/03-tool-api.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md, specs/01-indexing.md, specs/02-search.md

---

## Overview

The tool API defines the three LLM-callable tools that pi-index registers with the pi extension system. These are the only public interface between the LLM and the extension — the LLM calls tools, the extension executes the corresponding subsystem behavior, and the result is returned as plain text.

Tools are registered at extension load time. If `CONFIG_MISSING_API_KEY` is detected at startup, all tools are registered but every call immediately returns the configuration error string without executing any indexing or search logic.

---

## Tool: `codebase_search`

Searches the index using hybrid vector + full-text search with MMR reranking. This is the tool the LLM should call instead of grep or bash when exploring the codebase.

### Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `query` | string | Yes | — | Natural language or identifier-based search query. May include `@scope:value` filters (see CONSTITUTION.md § 7). |
| `limit` | number | No | `8` | Maximum number of results to return. Minimum: 1. Maximum: 20. |

### Behavior

Delegates entirely to the search subsystem (`specs/02-search.md`). The full search pipeline runs: query parsing → query embedding → hybrid search → scope filtering → RRF fusion → score threshold → MMR reranking → result formatting.

### Returns

On success: formatted plain text as described in `specs/02-search.md` § Result Formatting.

On error: `Error: [CODE] message` using the global error codes from CONSTITUTION.md § 2.

### Error Codes

| Code | Condition |
| --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key configured |
| `INDEX_NOT_INITIALIZED` | Index has never been built |
| `EMBEDDING_FAILED` | Query embedding call failed after retries |
| `SEARCH_FAILED` | Unexpected error during search |
| `INVALID_SCOPE_FILTER` | Query contains an unrecognized `@scope:` token |

### Usage Examples

```
codebase_search("authentication middleware")
codebase_search("handleStripeWebhook @file:webhooks.ts")
codebase_search("database schema migrations @lang:python @dir:accounts")
codebase_search("email validation", limit: 5)
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

When `force: false`: runs the incremental diff against the mtime cache. Only new, changed, and deleted files are processed.

When `force: true`: deletes all chunks from the index and clears the mtime cache, then indexes all eligible files from scratch.

### Returns

On success: a plain text summary:

```
Index updated:
  Added:   {N} files ({M} chunks)
  Updated: {N} files ({M} chunks)
  Removed: {N} files
  Skipped: {N} files (unchanged)
  Skipped: {N} files (too large)
  Total:   {N} chunks in index
  Time:    {N}s
```

On error: `Error: [CODE] message`.

### Error Codes

| Code | Condition |
| --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key configured |
| `INDEX_ALREADY_RUNNING` | A previous `codebase_index` call is still in progress |
| `EMBEDDING_FAILED` | All retries exhausted for one or more files (non-fatal: reported in summary, other files continue) |

### Usage Examples

```
codebase_index()
codebase_index(force: true)
```

---

## Tool: `codebase_status`

Returns the current state of the index — whether it exists, how many files and chunks it contains, and when it was last updated.

### Parameters

None.

### Behavior

Reads the mtime cache and the index metadata (chunk count, last write time). Does not trigger any indexing or search. Does not call the embedding service.

### Returns

On success: a plain text status report:

```
pi-index status:
  Index path:    {dbPath}
  Total chunks:  {N}
  Files indexed: {N}
  Last indexed:  {relative time, e.g. "3 hours ago" or "never"}
  Model:         {model name}
  Auto-index:    {on | off}
  Index dirs:    {comma-separated list of indexDirs}
```

If the index has never been built:

```
pi-index status:
  Index path:    {dbPath}
  Status:        Not built. Call codebase_index to create the index.
  Auto-index:    {on | off}
  Index dirs:    {comma-separated list of indexDirs}
```

On error: `Error: [CODE] message`.

### Error Codes

| Code | Condition |
| --- | --- |
| `CONFIG_MISSING_API_KEY` | No OpenAI API key configured (reported in status output, not as an error string) |

---

## Acceptance Criteria

**Scenario 1 — codebase_search: happy path**

Given the index is populated and `OPENAI_API_KEY` is set,
When `codebase_search` is called with query `"payment processing"`,
Then the tool returns a formatted result block with at least 1 result containing a file path, line range, language label, relevance score, and chunk text.

**Scenario 2 — codebase_search: limit is respected**

Given the index contains more than 5 matching chunks for the query `"error handling"`,
When `codebase_search` is called with `limit: 3`,
Then the tool returns exactly 3 results.

**Scenario 3 — codebase_index: incremental run reports correctly**

Given the index was built yesterday with 100 files,
When 5 files have been modified since then and `codebase_index` is called with `force: false`,
Then the summary reports 0 added, 5 updated, 0 removed, 95 skipped (unchanged).

**Scenario 4 — codebase_index: force rebuild**

Given the index exists with 1000 chunks,
When `codebase_index` is called with `force: true`,
Then all 1000 chunks are deleted and the index is rebuilt from scratch, and the summary reports all files as added.

**Scenario 5 — codebase_status: populated index**

Given the index contains 4000 chunks across 300 files, last indexed 2 hours ago,
When `codebase_status` is called,
Then the output includes `Total chunks: 4000`, `Files indexed: 300`, and a last-indexed time of approximately 2 hours ago.

**Scenario 6 — codebase_status: empty index**

Given `codebase_index` has never been called,
When `codebase_status` is called,
Then the output includes `Status: Not built. Call codebase_index to create the index.`

**Scenario 7 — all tools: missing API key**

Given `OPENAI_API_KEY` and `PI_INDEX_API_KEY` are both absent,
When any tool is called,
Then the tool returns `Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.`

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| `codebase_search` called with `limit: 0` | Returns empty result set: `Found 0 results for "..."`. No error. |
| `codebase_search` called with `limit: 25` | `limit` is capped to 20 silently. Returns at most 20 results. |
| `codebase_index` called while `PI_INDEX_AUTO=true` session-start indexing is running | Returns `Error: [INDEX_ALREADY_RUNNING] ...`. The session-start index run continues. |
| `codebase_index` with `force: true` and embedding service unavailable | All files fail to embed. The index is left empty (all chunks deleted, none inserted). Summary reports all files as failed. Mtime cache is cleared. |
| `codebase_status` called while `codebase_index` is running | Returns the status as of the last completed index run. Does not wait for the running index to finish. A note is appended: `(Index currently rebuilding in background)`. |
