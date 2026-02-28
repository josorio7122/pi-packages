# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **BTREE scalar indexes** on `filePath`, `language`, and `extension` columns — accelerates scope filter queries (`@file:`, `@dir:`, `@lang:`, `@ext:`) from full column scans to indexed lookups. Created automatically during database initialization; idempotent on reopen.
- **Table optimization** after indexing — compacts fragmented data files created by per-file delete+insert cycles. Runs automatically after every indexing operation that modifies data.
- **Auto IVF-PQ vector index** for large codebases (>10,000 chunks) — creates an approximate nearest-neighbor index that speeds up vector search from brute-force O(n) to O(√n). Skips if already present or below threshold.
- `IndexDB.optimize()` method — exposes LanceDB table compaction
- `IndexDB.createVectorIndexIfNeeded()` method — threshold-based vector index creation with dynamic `numSubVectors` calculation
- `IndexDB.listIndexes()` method — returns names of all indexes on the chunks table
- `VECTOR_INDEX_THRESHOLD` constant (10,000 chunks)
- Progress notifications in `codebase_index` tool handler (previously only `/index-rebuild` and auto-index had them)
- Shared constants file (`constants.ts`) — single source of truth for all configuration constants
- CHANGELOG.md

### Changed

- Removed unused `@sinclair/typebox` peer dependency

### Fixed

- `codebase_index` tool now shows progress notifications when called by the LLM

## [0.1.0] - 2026-02-27

### Added

- Initial release
- Hybrid search (vector + BM25) via LanceDB with RRF reranking
- Structural chunking with language-specific boundary detection (TypeScript, JavaScript, Python, SQL, Markdown, CSS)
- MMR reranking for result diversity
- Scope filters (`@file:`, `@dir:`, `@ext:`, `@lang:`)
- Incremental mtime-based indexing (only re-embeds changed files)
- 3 LLM tools: `codebase_search`, `codebase_index`, `codebase_status`
- 3 slash commands: `/index-status`, `/index-rebuild`, `/index-clear`
- Auto-index on session start (`PI_INDEX_AUTO`) with configurable interval
- Hierarchical `.gitignore` support (root + subdirectory patterns)
- Comprehensive SDD specification (10 documents)
- 270+ unit tests
