# pi-packages Implementation Progress

### Task 1: Bootstrap monorepo
- **Status:** ✅ Complete
- **Commit:** 5739be0
- **Built:** Turborepo monorepo at /Users/josorio/Code/pi-packages/ — pnpm workspaces, turbo v2 tasks schema, tsconfig.base.json, no apps/ dir, empty packages/ ready for packages.
- **Tests:** n/a (no packages yet)
- **Notes:** create-turbo pre-initialized git on `main`; our changes squashed into a single follow-up commit. turbo.json uses v2 `tasks` key (not `pipeline`). `test` task has `cache: false` so every run is fresh.
- **Timestamp:** 2026-02-25

### Task 2: Scaffold pi-memory package
- **Status:** ✅ Complete
- **Commit:** e52aa1f
- **Built:** packages/pi-memory/ with package.json, tsconfig.json, vitest.config.ts, extensions/memory/index.ts stub, skills/memory-guide/SKILL.md
- **Tests:** n/a (skeleton only — no src yet)
- **Notes:** pnpm install complete (@lancedb/lancedb 0.18.2, openai 4.104.0, vitest 3.2.4, @mariozechner/pi-coding-agent 0.55.1). tsc --noEmit passes cleanly. Corrected typo in task's devDependencies: `@mariozachner` → `@mariozechner`. Ready for Tasks 3/4/5 (parallel).
- **Timestamp:** 2026-02-25

### Task 3: Utility functions
- **Status:** ✅ Complete
- **Commit:** 1d3563c
- **Built:** extensions/memory/utils.ts — shouldCapture, detectCategory, looksLikePromptInjection, escapeMemoryForPrompt, formatRelevantMemoriesContext; plus MemoryCategory type, MEMORY_CATEGORIES, DEFAULT_CAPTURE_MAX_CHARS constants.
- **Tests:** 24 passing
- **Notes:** One minor deviation from verbatim port: regex `/ignore (all|any|previous|above|prior) instructions/i` extended to `/ignore (all|any|previous|above|prior)( \w+)? instructions/i` so "ignore all previous instructions" matches (test spec required it). Intent preserved.
- **Timestamp:** 2026-02-25

### Task 4: MemoryDB class
- **Status:** ✅ Complete
- **Commit:** 38f5d2f
- **Built:** extensions/memory/db.ts — MemoryDB class with store/search/delete/count, lazy LanceDB init with initPromise idempotency, UUID validation to prevent SQL injection
- **Tests:** 8 passing (real LanceDB, temp dirs via os.tmpdir() + randomUUID())
- **Notes:** utils.ts was already committed by Task 3 (no conflict). LanceDB v0.18.2 vectorSearch API worked as expected: `.vectorSearch(vector).limit(n).toArray()` with `_distance` in results. Used `any` for LanceDB internals (dynamic import, version-safe).
- **Timestamp:** 2026-02-25

### Task 5: Embeddings + Config
- **Status:** ✅ Complete
- **Commit:** bf00dfa
- **Built:** extensions/memory/embeddings.ts (Embeddings class), extensions/memory/config.ts (parseConfig, loadConfig, vectorDimsForModel, resolveDbPath, MemoryConfig type)
- **Tests:** 16 passing (embeddings: 2, config: 14)
- **Notes:** utils.test.ts (Task 3) shows 24 failures in the same run — expected, utils.ts is a parallel task not yet implemented. config.ts reads env vars: OPENAI_API_KEY or PI_MEMORY_API_KEY, PI_MEMORY_MODEL, PI_MEMORY_DB_PATH, PI_MEMORY_AUTO_CAPTURE, PI_MEMORY_AUTO_RECALL.
- **Timestamp:** 2026-02-25

### Task 6: Memory tools
- **Status:** ✅ Complete
- **Commit:** 1bb007b
- **Built:** extensions/memory/tools.ts — createMemoryTools factory (recall, store, forget)
- **Tests:** 11 passing (tools tests) / 71 total across all test files
- **Notes:** Factory returns recallTool/storeTool/forgetTool without pi runtime dependency. Duplicate detection at 0.95 cosine similarity. Forget auto-deletes single match with score > 0.9; returns candidates list for multiple matches.
- **Timestamp:** 2026-02-25

### Task 7: Lifecycle hooks
- **Status:** ✅ Complete
- **Commit:** 8995c73
- **Built:** extensions/memory/hooks.ts — createInjectionHook (before_agent_start), createCaptureHook (agent_end)
- **Tests:** 12 passing
- **Notes:** Injection hook returns undefined for prompts < 5 chars and swallows all errors to never break agent start. Capture hook limits to 3 stores per call and deduplicates at 0.95 cosine similarity threshold. Content extraction handles both string and array content blocks. tools.test.ts failing in same run is expected — Task 6 (tools.ts) not yet implemented.
- **Timestamp:** 2026-02-25

### Task 7 (spec fix): Add missing capture hook array content tests
- **Status:** ✅ Complete
- **Commit:** 78afe5b
- **Built:** Added 3 missing tests in hooks.test.ts: array content blocks, non-text blocks in array, and non-string/non-array content (null/number/object)
- **Tests:** 75 passing (all 6 test files)
- **Notes:** All three branches of extractText() are now fully covered. No implementation changes needed — the code already handled these cases correctly.
- **Timestamp:** 2026-02-25

### Task 8: Extension entry point
- **Status:** ✅ Complete
- **Commit:** 9a4a158
- **Built:** extensions/memory/index.ts — wires tools, hooks, commands to pi ExtensionAPI
- **Tests:** 75 passing
- **Notes:** tsc --noEmit passes. Tools registered with `as any` casts (ToolResult.content type string vs literal "text"). Hooks: before_agent_start (injection), agent_end (capture). Commands: /memory-stats, /memory-search.
- **Timestamp:** 2026-02-25

### Task 6 (spec fix): memory_forget zero-results branch test
- **Status:** ✅ Complete
- **Commit:** 856214d
- **Built:** Added missing `memory_forget` test — query with empty DB returns `found: 0` and "No matching" text
- **Tests:** 75 passing (tools: 12)
- **Notes:** none
- **Timestamp:** 2026-02-25

### Branch Review Fixes: pi-memory
- **Status:** ✅ Complete
- **Commit:** b3b6f8c
- **Built:** 7 fixes — initPromise retry on failure (ensureInitialized + doInitialize), search threshold unified to 0.3, injection guard in createInjectionHook, empty text validation in memory_store, TypeBox min/max constraints on importance, console.log gated with PI_MEMORY_DEBUG, Czech triggers comment in utils.ts
- **Tests:** 78 passing (3 new tests added)
- **Notes:** Fix for initPromise retry placed in `ensureInitialized` (not only `doInitialize`) because test patches `doInitialize`, so the reset must happen at the caller level too. Both layers reset `this.initPromise = null` on failure for defense-in-depth.
- **Timestamp:** 2026-02-25

### Task 9: README + skill
- **Status:** ✅ Complete
- **Commit:** 6e71638
- **Built:** README.md, skills/memory-guide/SKILL.md (full version), pi manifest verified (skills already present)
- **Tests:** 75 passing
- **Notes:** Task 10 is manual smoke test — not automated.
- **Timestamp:** 2026-02-25
