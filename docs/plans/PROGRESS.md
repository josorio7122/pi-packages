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
### Task 1: Remove gopls, add rubocop server
- **Status:** ✅ Complete
- **Commit:** a6661d6
- **Built:** Removed gopls server entry, `goPackage` field, and `walkUp` import from server-registry.ts; added `gemPackage` field and a ruby server entry (rubocop --lsp). Updated installer.ts to use `installGemServer` instead of `installGoServer`. Updated tests accordingly.
- **Tests:** 13 passing
- **Notes:** Pre-existing TypeScript error in config.ts (`maxCrossFileDiagnostics` missing) is unrelated to this task and existed before these changes.
- **Timestamp:** 2026-02-28

### Task 4: TypeScript first-publish skip
- **Status:** ✅ Complete
- **Commit:** 64d518d
- **Built:** Added a guard in `client.ts` `publishDiagnostics` handler: when `serverID === 'typescript'`, the first publish for a file stores diagnostics but skips notifying listeners. All other servers notify on every publish including the first.
- **Tests:** 16 passing (client.test.ts); 4 new tests covering: TS first-publish suppression, TS second-publish resolution, pyright immediate resolution, diagnostics stored despite suppression.
- **Notes:** Pre-existing failures in index.test.ts (LSPClient is not a constructor — 6 tests) exist before this task and are unrelated.
- **Timestamp:** 2026-02-28

### Task: Fix 2 code bugs in pi-index
- **Status:** ✅ Complete
- **Commit:** d273eca fix(pi-index): index-clear concurrency guard + formatSummary Removed line
- **Built:** Added `indexer.isRunning` guard to `/index-clear` handler rejecting with error when index is active; added "Removed" line to `formatSummary` output matching spec.
- **Tests:** 271 passing (268 existing + 3 new)
- **Notes:** The `vi.mock("./tools.js")` in `index.test.ts` has an inline `formatSummary` that still omits "Removed" — this is intentional since `index.test.ts` mocks `tools.js` entirely and no test there asserts on the absence of "Removed". The real `formatSummary` is tested in `tools.test.ts`.
- **Timestamp:** 2026-02-27
