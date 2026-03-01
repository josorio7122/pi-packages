# Implementation Progress

### Task 5: Update Spec Files for v3
- **Status:** ✅ Complete
- **Commit:** 408ef70
- **Built:** Updated all five spec docs (DATA-MODEL.md, GLOSSARY.md, 00-overview.md, 01-indexing.md, 03-tool-api.md) to reflect multi-provider embeddings, tree-sitter AST chunking, async indexing, and periodic sync. Bumped versions to 0.3.0. Added 13 new language extensions to supported languages table. Added 8 new glossary terms. Updated architecture diagram. Added async return semantics to codebase_index and codebase_status progress display.
- **Tests:** 393 passing
- **Notes:** No source code changed — docs only. The `.rb` edge-case example in 01-indexing edge cases table was updated to `.swift` since Ruby is now a supported language.
- **Timestamp:** 2026-02-28

### Task 2.2 + 2.3: AST Chunker + Refactor chunker.ts
- **Status:** ✅ Complete
- **Commit:** 8dfed71
- **Built:** Created `ast-chunker.ts` with `astSplit` (tree-sitter AST splitting for TypeScript, JavaScript, Python, Ruby, CSS, SCSS) and `langchainSplit` (LangChain fallback). Refactored `chunker.ts` to make `chunkFile` async using AST chunker, removing all regex patterns. Updated `indexer.ts` to `await chunkFile`. Updated all `chunker.test.ts` tests to async/await. 18 new ast-chunker tests added.
- **Tests:** 383 passing
- **Notes:** `abstract_class_declaration` uses `type_identifier` child (not `identifier`) — handled explicitly. `export_statement` wrapping a declaration uses only the outer range (no duplicates). The langchainSplit test needed enough content to exceed `MAX_CHUNK_LINES * 80` char threshold.
- **Timestamp:** 2026-02-28

### Task 2.1: Add Language Map Entries + Tree-Sitter Dependencies
- **Status:** ✅ Complete
- **Commit:** 4f146f1
- **Built:** Added 13 new extensions to `LANGUAGE_MAP` (Ruby ecosystem: `.rb`, `.erb`, `.rake`, `.gemspec`, `.ru`; Python: `.pyi`; CSS preprocessors: `.scss`, `.sass`, `.less`; config files: `.json`, `.yaml`, `.yml`, `.toml`). Installed tree-sitter and `@langchain/textsplitters` deps with exact versions. Created `constants.test.ts` with 7 tests.
- **Tests:** 365 passing (7 new constants tests + 358 existing)
- **Notes:** Adding `.json` to LANGUAGE_MAP caused `mtime-cache.json` (written to `tmpDir` by the indexer) to be picked up as an indexable file on the second run in indexer tests. Fixed by introducing `configDir` (separate temp dir) in `beforeEach`/`afterEach` and storing `dbPath`/`mtimeCachePath` there instead of in `tmpDir`. Also updated the "only indexes files with supported extensions" test to use `.xyz` as the unsupported extension (`.rb` is now supported). All 5 integration tests updated to use `configDir` for their LanceDB path.
- **Timestamp:** 2026-02-28

### Task 1.6: Update Indexer + Searcher + Index Entry to Use EmbeddingProvider
- **Status:** ✅ Complete
- **Commit:** 2e6055c
- **Built:** Replaced `Embeddings` type with `EmbeddingProvider` in `indexer.ts`, `searcher.ts`, and `index.ts`; indexer now calls `embedBatch()` for batch embedding; `index.ts` uses `createProvider(cfg)` and is async with dimension resolution for non-OpenAI providers; all test mocks updated to conform to `EmbeddingProvider` interface.
- **Tests:** 358 passing
- **Notes:** The `index.ts` default export is now `async function` — Pi supports async extension init functions. Dimension resolution for Ollama/Voyage (dimensions=0) uses `getDimension()` at startup; if unreachable, stub tools are registered and the function returns early. All `vi.doMock("./config.js", ...)` calls in `index.test.ts` that lead to the happy path were updated to include `createProvider` in the mock.
- **Timestamp:** 2026-02-28

### Task 3.1-3.3: Async Background Indexing
- **Status:** ✅ Complete
- **Commit:** c03b140
- **Built:** Added `runAsync()` method to `Indexer` (fires `run()` in background, returns `{status:'started'|'already_running'}`); added `lastResult`, `lastError`, `progress` public fields. Updated `codebase_index` tool to use `runAsync` (returns immediate "Started indexing" string). Added search-during-indexing warning to `codebase_search` handler. Updated `codebase_status` to show `Indexing: In progress — <message>` and `Last error:` lines. Updated `tools.test.ts` to remove 13 stale `codebase_index` tests (old sync behavior) and add 10 new tests for async behavior. Added 7 new `runAsync` tests to `indexer.test.ts`.
- **Tests:** 393 passing
- **Notes:** `run()` method kept intact — `runAsync()` wraps it. Errors in background indexing go to `lastError` (not thrown). The `already_running` result includes current `progress` value. `codebase_status` no longer shows "(Index currently rebuilding in background)" — replaced with structured `Indexing:` line.
- **Timestamp:** 2026-02-28
