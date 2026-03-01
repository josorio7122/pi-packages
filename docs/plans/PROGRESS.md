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

### Task 2: Add `gem install` to installer, remove `go install`
- **Status:** ✅ Complete
- **Commit:** e4b7573
- **Built:** Updated `installer.ts`: fixed `findBinary` comments ("Go-installed binaries" → "gem-installed binaries"), fixed error message ("gem is not installed" → "Ruby gem is not installed"), and changed `installGemServer` fallback to call `findBinary` instead of returning `undefined`. Updated `installer.test.ts`: renamed "finds go binary" → "finds gem-installed binary", added 3 new `installServer` tests (no-package, gem dispatch, gem-unavailable), and added `vi.mock('node:child_process')` at module level.
- **Tests:** 8 passing (installer.test.ts); 112 passing (full suite)
- **Notes:** The installer.ts already had `installGemServer` and `gemPackage` dispatch from Task 1 — this task fixed the error message, fallback behavior, and comments, and added the test coverage.
- **Timestamp:** 2026-02-28

### Task 4: TypeScript first-publish skip
- **Status:** ✅ Complete
- **Commit:** 64d518d
- **Built:** Added a guard in `client.ts` `publishDiagnostics` handler: when `serverID === 'typescript'`, the first publish for a file stores diagnostics but skips notifying listeners. All other servers notify on every publish including the first.
- **Tests:** 16 passing (client.test.ts); 4 new tests covering: TS first-publish suppression, TS second-publish resolution, pyright immediate resolution, diagnostics stored despite suppression.
- **Notes:** Pre-existing failures in index.test.ts (LSPClient is not a constructor — 6 tests) exist before this task and are unrelated.
- **Timestamp:** 2026-02-28

### Task 5: Warm LSP on `read` (pre-heating)
- **Status:** ✅ Complete
- **Commit:** e032b33
- **Built:** Added `tool_result` handler in `index.ts` that fires `manager.touchFile(abs, false)` (fire-and-forget) when a successful `read` tool result comes in, pre-heating the LSP server without modifying the read result. Handler is outside `diagnosticsEnabled` guard so warmup works regardless of diagnostics config.
- **Tests:** 109 passing (103 existing + 6 new in index.test.ts)
- **Notes:** none
- **Timestamp:** 2026-02-28

### Task 3: Cross-file diagnostics on `write`
- **Status:** ✅ Complete
- **Commit:** d659dd7
- **Built:** Added `maxCrossFileDiagnostics` config field (env: `PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS`, default 5, 0 disables). Updated `tool_result` handler in `index.ts` to append cross-file diagnostics (up to `maxCrossFileDiagnostics` other files) after own-file diagnostics — only for `write`, not `edit`, matching OpenCode's deliberate asymmetry.
- **Tests:** 109 passing (6 new in index.test.ts, 5 new in config.test.ts)
- **Notes:** Handler was restructured to check cross-file even when own-file has zero errors. The "LSP errors detected in this file" phrase is replaced with "LSP errors detected in other files" for cross-file sections via string replace on formatDiagnosticsXml output.
- **Timestamp:** 2026-02-28

### Task: Fix 2 code bugs in pi-index
- **Status:** ✅ Complete
- **Commit:** d273eca fix(pi-index): index-clear concurrency guard + formatSummary Removed line
- **Built:** Added `indexer.isRunning` guard to `/index-clear` handler rejecting with error when index is active; added "Removed" line to `formatSummary` output matching spec.
- **Tests:** 271 passing (268 existing + 3 new)
- **Notes:** The `vi.mock("./tools.js")` in `index.test.ts` has an inline `formatSummary` that still omits "Removed" — this is intentional since `index.test.ts` mocks `tools.js` entirely and no test there asserts on the absence of "Removed". The real `formatSummary` is tested in `tools.test.ts`.
- **Timestamp:** 2026-02-27
