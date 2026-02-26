# Subsystem Spec: Slash Commands

**Version:** 0.1.0
**File:** `specs/04-commands.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md, specs/03-tool-api.md

---

## Overview

The slash commands subsystem provides developer-facing inspection and management commands available in the pi TUI. Unlike the tool API (which is called by the LLM), slash commands are invoked directly by the developer typing in the pi interface.

Slash commands are not LLM tools. They bypass the LLM entirely and run directly against the index. They are intended for quick status checks, forced rebuilds, and emergency cleanup — operations a developer performs when setting up, debugging, or maintaining the index rather than during a normal coding session.

---

## User Stories

1. As a developer, I can run `/index-status` to see how many files and chunks are indexed and when the index was last refreshed, so that I can confirm the index reflects the current state of my project before trusting search results.

2. As a developer, I can run `/index-rebuild` to force a complete rebuild of the index, so that I can recover from a suspected corruption or apply a new embedding model.

3. As a developer, I can run `/index-clear` to delete the entire index, so that I can free disk space or start fresh without leaving stale data behind.

---

## Commands

### `/index-status`

Displays the current state of the index. Equivalent to calling `codebase_status` directly, but formatted for human reading in the TUI.

**Input:** None.

**Output:**

```
pi-index status
───────────────────────────────────────
Index path:    .pi/index/lancedb
Total chunks:  4,231
Files indexed: 318
Last indexed:  3 hours ago  (2026-02-26 11:04)
Model:         text-embedding-3-small
Auto-index:    off
Index dirs:    /Users/dev/project/src, /Users/dev/project/assets
───────────────────────────────────────
```

If the index has never been built:

```
pi-index status
───────────────────────────────────────
Index path:    .pi/index/lancedb
Status:        Not built
               Run /index-rebuild or call codebase_index to create the index.
Model:         text-embedding-3-small
Auto-index:    off
Index dirs:    /Users/dev/project
───────────────────────────────────────
```

If the API key is not configured:

```
pi-index status
───────────────────────────────────────
⚠ Warning: OPENAI_API_KEY is not set. Indexing and search are disabled.
Index path:    .pi/index/lancedb
Status:        Not built
───────────────────────────────────────
```

**Errors:** None. `/index-status` never fails — if the index state cannot be read, it reports the unreadable state.

---

### `/index-rebuild`

Deletes all existing index data and performs a full re-index from scratch. Equivalent to calling `codebase_index(force: true)`.

**Input:** None.

**Output (while running):**

```
Rebuilding index… (this may take several minutes on first run)
```

**Output (on completion):**

```
Index rebuilt:
  Added:   318 files (4,231 chunks)
  Skipped: 12 files (too large)
  Time:    47s
```

**Output (on error):**

```
Index rebuild failed: [CODE] message
```

This command is synchronous from the developer's perspective — the TUI shows progress and waits for completion before returning the prompt.

**Errors:** Passes through all error codes from `codebase_index`.

---

### `/index-clear`

Deletes all index data: all chunks from the database and the entire mtime cache. The index path directory is left in place but emptied.

**Input:** None.

**Output:**

```
Index cleared. Run /index-rebuild or codebase_index to rebuild.
```

After `/index-clear`, `codebase_search` returns `Error: [INDEX_NOT_INITIALIZED] ...` until `codebase_index` is called again.

**Errors:** If the database or mtime cache cannot be deleted (e.g., permission error), outputs:

```
Failed to clear index: {reason}
```

---

## Acceptance Criteria

**Scenario 1 — /index-status with populated index**

Given the index contains 500 chunks across 40 files, last built 1 hour ago,
When the developer runs `/index-status`,
Then the output shows `Total chunks: 500`, `Files indexed: 40`, and a last-indexed time of approximately 1 hour ago.

**Scenario 2 — /index-status with empty index**

Given `codebase_index` has never been called,
When the developer runs `/index-status`,
Then the output shows `Status: Not built` and instructs the developer to run `/index-rebuild` or `codebase_index`.

**Scenario 3 — /index-rebuild completes successfully**

Given `OPENAI_API_KEY` is set and the project has 50 eligible files,
When the developer runs `/index-rebuild`,
Then the output shows progress, waits for completion, and reports the number of files and chunks indexed.

**Scenario 4 — /index-rebuild with missing API key**

Given `OPENAI_API_KEY` is not set,
When the developer runs `/index-rebuild`,
Then the output shows `Index rebuild failed: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.`

**Scenario 5 — /index-clear followed by search**

Given the index is populated,
When the developer runs `/index-clear` and then the LLM calls `codebase_search`,
Then `/index-clear` confirms the index was cleared, and `codebase_search` returns `Error: [INDEX_NOT_INITIALIZED] ...`.

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| `/index-rebuild` called while `codebase_index` is already running (via LLM tool) | Returns `Index rebuild failed: [INDEX_ALREADY_RUNNING] ...`. The running index operation continues. |
| `/index-clear` called while `codebase_index` is running | The clear waits for the running index to finish, then deletes all data. Or: rejects with `Index is currently rebuilding. Wait for completion before clearing.` — implementation may choose either behavior; must be documented in README. |
| `/index-status` called while `codebase_index` is running | Shows the status as of the last completed run, with a note: `(Index currently rebuilding…)`. |
| `/index-rebuild` on a project with 0 eligible files | Completes successfully. Output: `Index rebuilt: Added: 0 files (0 chunks). Time: 0s`. |
