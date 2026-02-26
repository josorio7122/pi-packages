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
- **Status:** ✅ Complete
- **Commit:** 0f38bad
- **Built:** CodeChunk type, detectLanguage, chunkFile — structural boundary detection per language (TS/JS/Python/SQL/Markdown/CSS), 80-line max enforcement with sub-splitting, 1-based line numbers, id = `filePath:chunkIndex`
- **Tests:** 22 passing
- **Notes:** CodeChunk type defined here — to be imported by db.ts, mmr.ts, indexer.ts, searcher.ts. `.d.ts` handled via basename check before extname. vector field is always [] at chunk time.
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
