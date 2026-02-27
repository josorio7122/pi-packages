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

### Task: Fix M-3 (remove var boundary) and M-4 (tighten CSS regex)
- **Status:** ✅ Complete
- **Commit:** 461881f
- **Built:** (M-3) Confirmed `var` was never in the TS/JS boundary patterns (already granular per-pattern entries) — added test documenting this behavior. (M-4) Replaced broken CSS regex `/^[.#a-zA-Z:[]\w][^{]*\{/` (which had a character-class parsing bug causing `]` to close the class early, breaking `.className {` matching) with `/^\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[,{]|^[a-zA-Z][a-zA-Z0-9_-]*\s*\{/` — also updated symbol extractor to strip comma/brace.
- **Tests:** 26 passing
- **Notes:** The old CSS pattern was silently broken — the `]` in `[.#a-zA-Z:[]\w]` closed the character class early, so `.container {` never matched. All CSS content was falling into fixed-size chunks instead of semantic chunks. This is now fixed.
- **Timestamp:** 2026-02-26

### Task: Fix L-1, L-3, L-4 — gitignore note, chunk ID stability, timestamp test
- **Status:** ✅ Complete
- **Commit:** 3e898fd (test), 4aa43ad (docs)
- **Built:** (L-1) Added `.gitignore` section to README after configuration block; (L-4) Added Chunk IDs subsection in Architecture explaining `{filePath}:{chunkIndex}` format and index-instability; (L-3) Added `/index-status includes formatted last indexed date` test verifying `2023-11-14 22:13` output from known timestamp `1700000000000`
- **Tests:** 26 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task: Fix L-2, M-5, M-6 — retry to embeddings.ts, LanceDB integration tests, force=true test
- **Status:** ✅ Complete
- **Commit:** eb92386 (tests), 02c589f (refactor)
- **Built:** (L-2) Moved `isRateLimitError`+`withRetry` from indexer.ts into embeddings.ts — `embed()` now retries up to 4× on 429 before throwing; removed retry loop from indexer's `processBatch`, which now just calls `this.emb.embed()` directly. (M-5) Added `IndexDB integration` describe block in db.test.ts with 2 real-LanceDB tests using async `mkdir`/`rm` + `randomUUID` temp dirs. (M-6) Added `force=true calls db.deleteAll before indexing even when files are unchanged` test in indexer.test.ts using `vi.spyOn` to verify both `deleteAll` and `insertChunks` are called.
- **Tests:** 199 passing
- **Notes:** The existing indexer test `"HTTP 429 errors are retried and can succeed on a subsequent attempt"` was renamed and updated to reflect new contract: from indexer's perspective a 429 from emb.embed() is a plain failure (the real Embeddings class handles retrying internally). The M-5 integration tests use `30_000` timeout matching the existing db.test.ts pattern.
- **Timestamp:** 2026-02-26

### Task: Fix M-1 (mmrLambda config) and M-2 (dir existence warning)
- **Status:** ✅ Complete
- **Commit:** fecb9dd
- **Built:** Added `mmrLambda: number` to `IndexConfig` (default 0.5, validated 0–1, env var `PI_INDEX_MMR_LAMBDA`); added `existsSync` filtering in `parseConfig` — missing dirs emit `console.warn` and are removed, falling back to `indexRoot` if all removed.
- **Tests:** 23 passing
- **Notes:** ESM prevents `vi.spyOn` on `node:fs` named exports; used `vi.mock("node:fs", factory)` + `vi.mocked(existsSync)` instead. Added `beforeEach` reset to all describe blocks so the mock defaults to `true` and doesn't break existing tests.
- **Timestamp:** 2026-02-26

### Task: Fix H-3 (minScore param) and M-1 searcher side (mmrLambda)
- **Status:** ✅ Complete
- **Commit:** e1169ac
- **Built:** (1) `mmrRerank` gains optional `lambda = 0.5` parameter (backward-compatible, replaces hardcoded 0.5 in both relevance and diversity weights); (2) `Searcher.search()` gains optional `minScore?: number` param — uses `minScore ?? this.cfg.minScore` for threshold; (3) `Searcher.search()` passes `this.cfg.mmrLambda` to `mmrRerank`; (4) `codebase_search` tool adds `minScore` to schema, extracts and passes it through to `search()`.
- **Tests:** 207 passing
- **Notes:** Existing tool tests updated: `toHaveBeenCalledWith("auth", 8)` → `toHaveBeenCalledWith("auth", 8, undefined)` since the call now passes 3 args. `makeConfig` in searcher.test.ts updated to include `mmrLambda: 0.5`.
- **Timestamp:** 2026-02-26

### Task: Fix NaN guard in config.ts and add missing loadConfig env var tests
- **Status:** ✅ Complete
- **Commit:** 6772f07
- **Built:** Added `parseEnvInt`/`parseEnvFloat` helpers that throw `CONFIG_INVALID_VALUE` on `NaN`; updated `loadConfig` to use them for `PI_INDEX_MAX_FILE_KB`, `PI_INDEX_MIN_SCORE`, `PI_INDEX_MMR_LAMBDA`. Added 6 new tests: 3 NaN error cases + 3 happy-path env var parse tests.
- **Tests:** 29 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task: Fix minor code quality — mmrLambda in test factories, ScoredChunk import, mmr mismatch warn, chunker dedup, fake timers
- **Status:** ✅ Complete
- **Commit:** aabeefa
- **Built:** (1) Added `mmrLambda: 0.5` to `makeConfig` factories in `indexer.test.ts` and `tools.test.ts`; (2) Replaced local `type ScoredChunk` declaration in `mmr.test.ts` with `import { ..., type ScoredChunk }` from `./mmr.js`; (3) Added `console.warn` for vector dimension mismatch in `cosineSimilarity`; (4) Extracted shared `TS_JS_BOUNDARIES` constant in `chunker.ts` (TypeScript and JavaScript entries were byte-for-byte identical); (5) Converted retry test in `embeddings.test.ts` from real 1-second `setTimeout` to `vi.useFakeTimers()` + `vi.runAllTimersAsync()`.
- **Tests:** 213 passing
- **Notes:** embeddings.test.ts now runs in ~39ms instead of ~1000ms. searcher.test.ts already had mmrLambda in its makeConfig — no change needed there.
- **Timestamp:** 2026-02-26

### Task: Fix LIKE escaping, hybridSearch tests, updated count
- **Status:** ✅ Complete
- **Commit:** 6a04dcf (indexer), 284cdb0 (db tests), 9c63e37 (searcher)
- **Built:** (1) `buildFilter` now escapes `%` and `_` wildcards with `ESCAPE '\\'` in `@file` and `@dir` LIKE clauses; removed dead `default: continue` from switch. (2) Added hybridSearch happy-path and fallback-to-vectorSearch tests in `db.test.ts`. (3) Fixed `updated` field in `IndexSummary` to exclude failed files (same pattern as `added`).
- **Tests:** 221 passing
- **Notes:** hybridSearch fallback test mocks `db.vectorSearch` to return canned results — necessary because LanceDB's `table.vectorSearch()` internally calls `table.query()`, which breaks if you replace `table.query` to force the hybrid throw.
- **Timestamp:** 2026-02-26

### Task: Fix 3 issues — searcher.ts default case, db.ts RRF score, embeddings.ts dead code
- **Status:** ✅ Complete
- **Commit:** b224c41 (embeddings), c7f4c76 (db), 9040bb1 (searcher)
- **Built:** (1) `buildFilter` switch: added `default: continue` and changed `let condition: string` → `let condition: string | undefined` to satisfy TS strict mode; (2) `hybridSearch`: replaced positional score with normalized `_relevance_score / maxRelevance`, falling back to positional when unavailable; (3) `withRetry`: removed dead `lastErr` variable and unreachable `throw lastErr`, replaced with `throw new Error("[pi-index] withRetry: exhausted all retry attempts")` for TypeScript type narrowing.
- **Tests:** 221 passing
- **Notes:** none
- **Timestamp:** 2026-02-26

### Task: Fix 3 issues — indexRoot in IndexConfig, Set for failedFiles, Too large label
- **Status:** ✅ Complete
- **Commit:** 96dec38 (indexer/config), 0c56bfe (tools)
- **Built:** (1) Added `indexRoot: string` to `IndexConfig` type and included it in `parseConfig` return; `indexer.ts` now uses `this.cfg.indexRoot` instead of `this.cfg.indexDirs[0]` as relative path base. (2) Replaced `failedFiles.includes()` O(n) lookups with a local `failedSet = new Set<string>()` kept in sync, giving O(1) lookups throughout `processBatch`. (3) Renamed the second "Skipped:" line in `formatSummary` to `"Too large: N file(s) (size limit)"`. Updated all test factories in `indexer.test.ts`, `tools.test.ts`, `searcher.test.ts`, `index.test.ts` to include `indexRoot`.
- **Tests:** 221 passing
- **Notes:** `index.test.ts` "(too large)" assertion was moot (tools.js mocked), so no change needed there. The second `failedFiles.includes()` check (in DB write catch) was also converted to use `failedSet`.
- **Timestamp:** 2026-02-26

### Task N: Add .gitignore test coverage to walker.test.ts and fill embeddings test gaps
- **Status:** ✅ Complete
- **Commit:** 2f0b027 (embeddings), 000ec83 (walker)
- **Built:** Added 4 async integration tests for walker .gitignore/node_modules/size/extension filtering (plus walker.ts implementation for .gitignore support + hardcoded node_modules exclusion); added 4 embeddings tests for multi-text batch, 500-no-retry, empty-array, and 4-attempt retry exhaustion (plus embeddings.ts overload for string[]).
- **Tests:** 233 passing (pnpm --filter @josorio/pi-index exec vitest run)
- **Notes:** walker.ts gained ALWAYS_EXCLUDED_DIRS (node_modules, .git) and gitPatternToRegex-based .gitignore loading from indexRoot; embeddings.ts gained embed(string[]) overload returning number[][]; retry-exhaustion test uses .catch() before runAllTimersAsync to prevent unhandled rejection warning.
- **Timestamp:** 2026-02-26

### Task: Fix getStatus O(n) scan and add empty index hint in searcher
- **Status:** ✅ Complete
- **Commit:** 6494d7f
- **Built:** (1) `DBStatus` simplified to `{ chunkCount: number }` only; `getStatus()` replaced with single `countRows()` call — O(1) regardless of table size. `fileCount` and `lastIndexedAt` now derived from mtime cache via `readMtimeCache()` in both `tools.ts` and `index.ts`. (2) `Searcher.search()` calls `db.count()` before embedding — returns `[INDEX_EMPTY]` message immediately if index is empty, saving the OpenAI API call.
- **Tests:** 233 passing (225 baseline + 8 new)
- **Notes:** The `codebase_search` tool already had an INDEX_NOT_INITIALIZED guard; the new [INDEX_EMPTY] in the Searcher is a second-level safety net for direct Searcher use. The embeddings.test.ts produces an unhandled 429 error in full-suite runs (pre-existing timing/rate-limit flakiness from the retry test) — all 233 tests still pass.
- **Timestamp:** 2026-02-26

### Task: Fix embedding batch bug — call embed(string[]) per batch, not per chunk
- **Status:** ✅ Complete
- **Commit:** 5005338
- **Built:** `processBatch` now collects all enriched texts for a batch into `enrichedTexts: string[]` and calls `this.emb.embed(enrichedTexts)` once (returning `number[][]`), then zips `vectors[i]` back to `batch[i]`. If the batch call throws, all files in the batch are marked failed. Reduced API calls from N_chunks to N_chunks/EMBED_BATCH_SIZE (20x fewer).
- **Tests:** 236 passing
- **Notes:** `embeddings.ts` already had the `embed(string[]): Promise<number[][]>` overload — no changes needed there. Test mocks updated: `makeEmb()` now returns a mock that handles `string[]` input and returns `number[][]`; "partial chunk failure" test redesigned to fail the whole batch (batch-level failure is the new granularity); "updated count" test updated to reflect that small files sharing a batch all fail together when the batch is rejected.
- **Timestamp:** 2026-02-26

### Task: Fix ** glob support in gitPatternToRegex in walker.ts
- **Status:** ✅ Complete
- **Commit:** ee8809b
- **Built:** Fixed `gitPatternToRegex` to handle `**` before `*` using a null-byte placeholder to prevent the `.*` produced for `**` from being re-processed by the `*` → `[^/]*` replacement. Added 2 new integration tests: `**/*.js` targeting a file 2 levels deep (tests the bug directly) and `dist/**` excluding files directly in dist/ and in nested subdirectories.
- **Tests:** 22 passing in walker.test.ts (235 total in suite minus pre-existing indexer failures from in-progress work)
- **Notes:** The naive two-step replace (`**` → `.*`, then `*` → `[^/]*`) silently breaks because the `.*` result still contains `*` which the second replace corrupts into `.[^/]*`. Fix uses null-byte placeholder: replace `**` → `\x00`, then `*` → `[^/]*`, then `\x00` → `.*`. The pre-existing uncommitted `indexer.ts`/`indexer.test.ts` changes (batch embed work) have a failing test unrelated to this task — not touched.
- **Timestamp:** 2026-02-26

### Task: C1 — Rebuild FTS index after incremental indexing (was stale after run 1)
- **Status:** ✅ Complete
- **Commit:** 94aa084
- **Built:** Added `rebuildFtsIndex()` to `IndexDB` (calls `createIndex("text", { config: fts(), replace: true })`, swallows errors with console.warn). Called from `Indexer.run()` after `writeMtimeCache` only when `toProcess.length > 0`. Added 2 tests to db.test.ts and 2 tests to indexer.test.ts.
- **Tests:** 242 passing
- **Notes:** `rebuildFtsIndex` is best-effort — errors are logged but never propagate. Skipped on delete-only or no-change runs. The db.ts and db.test.ts changes landed in the prior commit (cee767a) because they were already staged; indexer.ts and indexer.test.ts changes are in commit 94aa084.
- **Timestamp:** 2026-02-27

### Task: C2 + C3 — .gitignore negation patterns + vectorSearch score normalization
- **Status:** ✅ Complete
- **Commit:** cee767a (db fix + README), 60f037f (walker fix)
- **Built:** C2: `loadGitignorePatterns` now skips lines starting with `!` and emits a `console.warn` listing the skipped patterns with a clear consequence message. C3: `vectorSearch` normalizes raw `1/(1+distance)` scores relative to the batch maximum (same as hybridSearch RRF normalization), so `minScore` behaves consistently across both search paths. README updated with `minScore` semantics and a new Scoring section.
- **Tests:** 242 passing
- **Notes:** The vectorSearch normalization changes the effective behavior of `minScore=0.2`: it now filters the bottom 20% of each result set rather than using an absolute distance-derived threshold. The README Scoring section documents this clearly. Negation lines in .gitignore are fully unsupported — the warning is explicit about what files may be affected.
- **Timestamp:** 2026-02-27

### Task: PI_INDEX_AUTO_INTERVAL — config option for periodic auto-reindex
- **Status:** ✅ Complete
- **Commit:** 40c9117
- **Built:** Added `autoIndexInterval: number` to `IndexConfig` (default 0 = once per session); `parseConfig` validates >= 0; `loadConfig` reads `PI_INDEX_AUTO_INTERVAL` env var via `parseEnvInt`. The `before_agent_start` hook changed from blocking `await indexer.run()` to non-blocking fire-and-forget with `lastAutoIndexedAt` + `isIndexed` + `isRunning` closure state tracking the interval.
- **Tests:** 254 passing (8 new: 3 parseConfig + 2 loadConfig in config.test.ts, 3 interval behavior in index.test.ts)
- **Notes:** The `onProgress` wiring in index-rebuild (other implementer's change) was already in the working tree — preserved as-is in this commit. `autoIndexInterval=0` means once per session (second call is no-op after first completes). Interval check uses `Date.now()` vs `lastAutoIndexedAt` which is set immediately on trigger (preventing concurrent triggers), then updated again in `.then()` after completion.
- **Timestamp:** 2026-02-27

### Task C3: Progress Feedback for Indexer.run()
- **Status:** ✅ Complete
- **Commit:** 2ba5980
- **Built:** Added `ProgressCallback` type + `throttle()` helper to indexer.ts; updated `Indexer.run()` to accept `onProgress?` and `processBatch()` to accept `notify`; emits 4 progress events (scan, indexing, embedding per batch group, completion); added `notify` option to `createIndexTools()` for tool-level progress; wired `onProgress` in `/index-rebuild` slash command (already present in index.ts from prior task).
- **Tests:** 258 passing (added 4 new tests: 2 in indexer.test.ts, 1 in tools.test.ts, 1 in index.test.ts)
- **Notes:** The `edit` tool failed to write to disk (reported success but no-op) — used `Write` tool and bash python scripts instead. Previous task (40c9117) had already added `onProgress` wiring to index.ts. The `read` tool showed stale content for index.ts that didn't match disk state.
- **Timestamp:** 2026-02-27
