### Task: Fix 4 bugs in pi-index
- **Status:** ✅ Complete
- **Commit:** c091b95
- **Built:** Fixed ? gitignore wildcard (step 4 in gitPatternToRegex), empty-file mtime caching (chunkCount=0), formatSummary header (rebuilt vs updated), and removed redundant db.getStatus() pre-check from codebase_search (searcher handles empty-index via [INDEX_EMPTY] normalization).
- **Tests:** 267 passing (262 original + 5 new; 2 existing tests updated to reflect Fix 4 behavior change)
- **Notes:** Fix 4 required updating 2 existing tests: "returns INDEX_NOT_INITIALIZED when chunkCount is 0" and "returns INDEX_NOT_INITIALIZED when db.getStatus throws" — both were testing the removed db.getStatus() pre-check. Updated to reflect the new behavior where tools.ts normalizes searcher's [INDEX_EMPTY] to [INDEX_NOT_INITIALIZED]. The searcher's existing db.count() guard is now the single source of truth for empty-index detection.
- **Timestamp:** 2026-02-27

### Task: Fix data integrity bug — stale DB chunks when file becomes empty
- **Status:** ✅ Complete
- **Commit:** aa80009
- **Built:** Added `deleteByFilePath` call in the `else` branch (0 chunks) of `processBatch` so previously-indexed files that become empty have their old DB chunks removed. Safe no-op for brand-new empty files.
- **Tests:** 268 passing (267 → 268; 1 new test added)
- **Notes:** The provided test spec omitted `vi.mocked(db.insertChunks).mockClear()` before the second run — without it `insertChunks` (called during run 1) caused a false failure. Added the clear to match the intent and the pattern used by the existing "skips unchanged files" test.
- **Timestamp:** 2026-02-27
### Task: Fix 2 code bugs in pi-index
- **Status:** ✅ Complete
- **Commit:** d273eca fix(pi-index): index-clear concurrency guard + formatSummary Removed line
- **Built:** Added `indexer.isRunning` guard to `/index-clear` handler rejecting with error when index is active; added "Removed" line to `formatSummary` output matching spec.
- **Tests:** 271 passing (268 existing + 3 new)
- **Notes:** The `vi.mock("./tools.js")` in `index.test.ts` has an inline `formatSummary` that still omits "Removed" — this is intentional since `index.test.ts` mocks `tools.js` entirely and no test there asserts on the absence of "Removed". The real `formatSummary` is tested in `tools.test.ts`.
- **Timestamp:** 2026-02-27
