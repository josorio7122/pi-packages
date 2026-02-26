# pi-index Implementation Progress

## Task 1: Scaffold — ✅ Complete
- Commit: 804c8a9
- Created: packages/pi-index/package.json, tsconfig.json, extensions/index/.gitkeep
- pnpm install verified workspace picks up @josorio/pi-index

### Task 3: embeddings.ts — OpenAI embed wrapper
- **Status:** ✅ Complete
- **Commit:** 03c0a1c
- **Built:** Embeddings class wrapping OpenAI embeddings API with encoding_format:float to ensure number[] return type
- **Tests:** 2 passing
- **Notes:** Spec-provided test had a shared-spy bug (each `new MockOpenAI()` created a fresh vi.fn()); adapted to vi.mocked().mockImplementationOnce pattern matching pi-memory convention
- **Timestamp:** 2026-02-26

### Task 4: chunker.ts — structural boundary splitting, 80-line max
- **Status:** ✅ Complete (spec fix applied)
- **Commit:** f514fcb
- **Built:** CodeChunk type, detectLanguage, chunkFile — structural boundary detection per language (TS/JS/Python/SQL/Markdown/CSS), 80-line max enforcement with sub-splitting, 1-based line numbers, id = `filePath:chunkIndex`
- **Tests:** 23 passing
- **Notes:** Spec fix: added `abstract class` boundary pattern to TS+JS; removed non-spec `export const = function` pattern. CodeChunk type defined here — to be imported by db.ts, mmr.ts, indexer.ts, searcher.ts. `.d.ts` handled via basename check before extname. vector field is always [] at chunk time.
- **Timestamp:** 2026-02-26

### Task 5: walker.ts — file system walking and mtime cache
- **Status:** ✅ Complete
- **Commit:** 113ac51
- **Built:** walkDirs (recursive file discovery by extension + size), readMtimeCache/writeMtimeCache (atomic JSON sidecar), diffFileSet (new/changed/deleted/unchanged diff against cache)
- **Tests:** 15 passing
- **Notes:** Atomic write via .tmp + rename; size check is strictly > maxFileKB; relative paths use forward slashes on all platforms
- **Timestamp:** 2026-02-26

### Task 2: config.ts — IndexConfig type, loadConfig, parseConfig
- **Status:** ✅ Complete
- **Commit:** 5c28418
- **Built:** IndexConfig type, vectorDimsForModel, resolveDbPath, parseConfig, loadConfig — full config module with env-var loading and validation
- **Tests:** 16 passing
- **Notes:** loadConfig takes explicit indexRoot arg; PI_INDEX_API_KEY takes precedence over OPENAI_API_KEY; parseConfig validates model, minScore (0–1), maxFileKB (>0)
- **Timestamp:** 2026-02-26

### Task 6: mmr.ts — cosine similarity + MMR reranking
- **Status:** ✅ Complete
- **Commit:** f9a2be8
- **Built:** cosineSimilarity (dot product / norms, returns 0 for zero vectors) and mmrRerank (greedy MMR with λ=0.5, no input mutation)
- **Tests:** 11 passing
- **Notes:** ScoredChunk type defined here — to be imported by searcher.ts. candidates is shallow-copied so input array is never mutated.
- **Timestamp:** 2026-02-26

### Task 7: db.ts — IndexDB (LanceDB wrapper with hybrid search)
- **Status:** ✅ Complete
- **Commit:** a3465e9
- **Built:** IndexDB class wrapping LanceDB with lazy init, FTS index, insertChunks, deleteByFilePath, deleteAll, vectorSearch, hybridSearch (with RRF reranking, vector fallback), count, getStatus
- **Tests:** 8 passing
- **Notes:** RRFReranker is at `lancedb.rerankers.RRFReranker` (not `lancedb.RRFReranker`). Hybrid search requires `nearestToText` before `nearestTo` — reversed order from spec. `table.vectorSearch()` used directly for vector-only search. FTS index creation on empty table is caught and ignored.
- **Timestamp:** 2026-02-26

### Task 8: indexer.ts — full indexing pipeline
- **Status:** ✅ Complete
- **Commit:** 8128abb
- **Built:** Indexer class orchestrating walk → diff → chunk → embed → insertChunks → update mtime cache, with concurrency guard (INDEX_ALREADY_RUNNING), force re-index, file removal detection, and extension filtering
- **Tests:** 8 passing
- **Notes:** mtime cache updated only after successful DB write (CONSTITUTION.md §6 invariant 5). Embed retry uses exponential backoff (1s/2s/4s/8s). Enriched embed input includes file/language/symbol context.
- **Timestamp:** 2026-02-26

### Task 9: searcher.ts — scope filter parser, hybrid search, RRF+MMR, result formatter
- **Status:** ✅ Complete
- **Commit:** e48d70d
- **Built:** parseScopeFilters (extracts @file/@dir/@ext/@lang tokens, throws INVALID_SCOPE_FILTER for unknown scopes), buildFilter (SQL WHERE clause builder), formatResults (numbered result list with file path, line range, score %, chunk text), Searcher class (embed → hybridSearch → score threshold → MMR → format, with error handling for invalid scope/embedding failure)
- **Tests:** 28 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task 9b: Fix searcher.ts spec compliance issues
- **Status:** ✅ Complete
- **Commit:** 49cf2f3
- **Built:** Fixed error format to use `[CODE]` bracket style (`[INVALID_SCOPE_FILTER]`); fixed `buildFilter` to OR same-type scope filters and AND across different types; added two new tests.
- **Tests:** 30 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task 8b: Fix indexer.ts spec compliance issues
- **Status:** ✅ Complete
- **Commit:** 3000d92
- **Built:** (1) Refactored `processBatch` to collect all chunks from all files, split into batches of 20 chunks, and embed with up to 3 concurrent batch loops (sequential within each batch) — matching the spec's "up to 20 chunks per API call, up to 3 concurrent". Removed the now-unused `embedWithRetry` method. (2) Fixed `added` in `IndexSummary` to exclude files that failed to process (previously counted all `diff.toAdd.length` regardless of failures). Added 2 new tests.
- **Tests:** 115 passing
- **Notes:** The concurrency test verifies `maxConcurrent ≤ 3` using a 5ms delay mock across 25 files. The "added excludes failures" test uses chmod 000 on a file to trigger a read failure, avoiding retry-delay timeouts.
- **Timestamp:** 2026-02-26

### Task 8c: Fix indexer.ts — retry only on HTTP 429
- **Status:** ✅ Complete
- **Commit:** ded8b10
- **Built:** Added `isRateLimitError` helper (module-level); updated retry catch block to only retry on 429 errors (fail immediately on non-429); added `embedFailedFiles` Set to prevent partial writes when any chunk in a file fails to embed. Added 3 new tests: non-429 fails immediately (1 embed call), 429 retries and recovers, partial-write prevention.
- **Tests:** 13 passing
- **Notes:** Fake timer approach for testing 429 retries was abandoned — real async FS ops in the chain make `advanceTimersByTimeAsync` unreliable. Used real timers with a 1-retry-then-succeed mock (accepts 1-second real delay) instead.
- **Timestamp:** 2026-02-26

### Task: Fix spec compliance — delete changed-file chunks only after embedding succeeds
- **Status:** ✅ Complete
- **Commit:** 3c47824
- **Built:** In `run()`, only pre-delete `toDelete` files; in `processBatch()`, call `deleteByFilePath` immediately before `insertChunks` after successful embedding. Added test verifying stale chunks are preserved when embedding fails.
- **Tests:** 14 passing
- **Notes:** The ordering guarantee is now: embed → deleteByFilePath → insertChunks → cache.set(). Old chunks survive any embedding failure, matching spec §Writing edge-case table.
- **Timestamp:** 2026-02-26

### Task 11: Fix spec compliance — walker, indexer, tools (7 issues)
- **Status:** ✅ Complete
- **Commit:** 9e2f9db
- **Built:** (1) `walkDirs` now returns `WalkResult { files, skippedLarge }` instead of bare `FileRecord[]`; (2) `IndexSummary` gains `addedChunks`, `updatedChunks`, `skippedTooLarge`; (3) `Indexer.isRunning` getter; (4) `formatSummary` shows chunk counts per-op and `too large` line, removes `Failed:` line; (5) `codebase_status` uses `relativeTime()` instead of `toLocaleString()`; (6) rebuilding note appended when `indexer.isRunning`; (7) `codebase_search` catches `CONFIG_MISSING_API_KEY`; (8) not-built block uses 4 spaces after `Index path:` colon.
- **Tests:** 147 passing (3 commits: walker, indexer, tools)
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task 10: tools.ts — LLM tool registrations
- **Status:** ✅ Complete
- **Commit:** 21704e6
- **Built:** `createIndexTools` factory returning three `IndexTool` objects: `codebase_search` (checks index exists, delegates to Searcher), `codebase_index` (delegates to Indexer, formats summary), `codebase_status` (reads db + mtime cache, shows config). Full error handling with `[CODE]` format per CONSTITUTION.md §2.
- **Tests:** 13 passing (132 total across all modules)
- **Notes:** `codebase_search` guards against uninitialized index by checking `chunkCount === 0` before calling searcher. `codebase_status` reads mtime cache via `readMtimeCache` to detect "Not built" state accurately.
- **Timestamp:** 2026-02-26

### Task: Fix tools.ts code quality issues
- **Status:** ✅ Complete
- **Commit:** 3d2df48
- **Built:** Removed unused `beforeEach` import; added 3 error-path tests (SEARCH_FAILED, INDEX_FAILED, STATUS_FAILED); added 2 relativeTime branch tests (hours, days); fixed alignment in not-built status block; replaced brittle whitespace test with meaningful dbPath/Not-built test.
- **Tests:** 27 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task: Fix formatSummary — Remove Removed line and 'in index' suffix
- **Status:** ✅ Complete
- **Commit:** 6318d8d
- **Built:** Removed the "Removed:" line from formatSummary and stripped the " in index" suffix from the "Total:" line in tools.ts
- **Tests:** 22 passing
- **Notes:** Test description updated to match (removed "Removed" from label); no assertion changes needed as no test asserted those strings
- **Timestamp:** 2026-02-26

### Task: Fix tools.test.ts — cover getStatus-throw and config-key paths, organize hierarchy
- **Status:** ✅ Complete
- **Commit:** 757e5f4
- **Built:** Added 2 new tests (INDEX_NOT_INITIALIZED when db.getStatus throws in codebase_search; CONFIG_MISSING_API_KEY when indexer throws in codebase_index); moved 3 top-level fallback error tests (SEARCH_FAILED, INDEX_FAILED, STATUS_FAILED) inside their respective describe blocks.
- **Tests:** 29 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task 11: index.ts — extension entry point and slash commands
- **Status:** ✅ Complete
- **Commit:** cfc6f16
- **Built:** Extension entry point that wires all modules together: registers 3 LLM tools (codebase_search, codebase_index, codebase_status) via pi.registerTool(), 3 slash commands (/index-status, /index-rebuild, /index-clear) via pi.registerCommand(), and optional auto-index hook via pi.on("before_agent_start") when autoIndex is enabled.
- **Tests:** 161 passing (7 new in index.test.ts)
- **Notes:** relativeTime helper duplicated from tools.ts intentionally — slash commands need it independently. Config errors cause graceful degradation: stub tools are registered that return the error message.
- **Timestamp:** 2026-02-26

### Task: Fix spec issues — parenthetical timestamp + extract relativeTime to utils
- **Status:** ✅ Complete
- **Commit:** f089f26
- **Built:** (1) Extracted `relativeTime` from both `tools.ts` and `index.ts` into a shared `utils.ts` module; (2) Added `/index-status` parenthetical date `(YYYY-MM-DD HH:MM)` in UTC ISO format alongside the relative time string; (3) Verified not-built Status continuation alignment (17 spaces). Added `utils.test.ts` with 4 tests covering all branches.
- **Tests:** 165 passing
- **Notes:** The parenthetical timestamp uses `toISOString().slice(0,16).replace("T"," ")` which gives UTC time — this matches the spec example format `(2026-02-26 11:04)`.
- **Timestamp:** 2026-02-26

### Task: Fix code quality — guard lastIndexedAt null, extract RULE, add missing test coverage
- **Status:** ✅ Complete
- **Commit:** cbff384
- **Built:** (1) `lastIndexedAt` non-null assertion replaced with conditional expression — prevents epoch `1970-01-01 00:00` rendering when value is null; (2) duplicate `const RULE` removed from catch block and happy path, moved to module scope above exported function; (3) Added 4 missing tests: `/index-rebuild success`, `/index-clear success`, `autoIndex hook registration` (via vi.doMock override), `/index-status happy path with chunk data`.
- **Tests:** 25 passing in index.test.ts (179 total across all modules)
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task: Fix code quality — trailing space cleanup, test isolation, tighter assertions
- **Status:** ✅ Complete
- **Commit:** 4f6b255
- **Built:** (1) Trailing spaces on null `lastIndexedAt` removed — spaces before the parenthetical now only appear when the timestamp is present; (2) `afterEach(() => { vi.resetModules(); })` added to both describe blocks so `vi.doMock` overrides don't leak between tests; (3) `/index-status chunk count` assertion tightened from `"50"` to `"Total chunks:  50"` with `"info"` level.
- **Tests:** 25 passing
- **Notes:** Used `vi.resetModules()` only (not `vi.resetAllMocks()`) in afterEach — `vi.resetAllMocks()` clears the `mockReturnValue` on top-level `vi.mock()` fn instances, causing subsequent tests to receive `undefined` from loadConfig.
- **Timestamp:** 2026-02-26

### Task: Fix 8 spec issues — slash command format, no-key stubs, graceful status error
- **Status:** ✅ Complete
- **Commit:** d3f356c
- **Built:** (1+2+3+4) RULE changed from 47 to 39 `─` chars; removed 2-space prefix from ALL content lines in both built and not-built blocks; continuation line fixed to 15-space indent. (5) Config-fail path now registers all 3 slash commands (`/index-status` with API-key warning, `/index-rebuild` and `/index-clear` with error notification) instead of returning after stub tools. (6) `/index-status` error handler uses `"info"` level and reports "Could not read index state" gracefully. (7) `/index-rebuild` skipped line uses `summary.skippedTooLarge` with label `(too large)` instead of `failedFiles.length` with `(errors)`. (8) Time format changed from `toFixed(1)` to `Math.round` giving integer seconds.
- **Tests:** 179 passing (21 in index.test.ts, up from 7)
- **Notes:** Tests for Fix 7/8/6 required `vi.doMock` (not hoisted) + `vi.resetModules()` inside test body to override specific mocks per test. The "no indent" content-line check excludes the continuation line which legitimately has 15-space alignment.
- **Timestamp:** 2026-02-26

### Task 12: Build verification + README
- **Status:** ✅ Complete
- **Commit:** efbbe43
- **Built:** TypeScript build verified clean (tsc exits 0, dist/ produced). Wrote `packages/pi-index/README.md` (features, config, tools, commands, architecture) and root `README.md` (monorepo overview, getting started, dev commands).
- **Tests:** 183 passing (pi-index), 78 passing (pi-memory)
- **Notes:** none
- **Timestamp:** 2026-02-26
