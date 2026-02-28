# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Multi-provider embeddings** — abstract `EmbeddingProvider` interface with three implementations:
  - **OpenAI** (default) — wraps existing `Embeddings` class
  - **Ollama** — local/offline, no API key needed, uses native HTTP fetch
  - **Voyage AI** — code-optimized embeddings (`voyage-code-3`), uses native HTTP fetch
- **Tree-sitter AST chunking** — replaces regex-based boundary detection with proper syntax tree parsing for 6 languages (TypeScript, JavaScript, Python, Ruby, CSS, SCSS). Extracts accurate symbol names from AST nodes.
- **LangChain text splitter fallback** — `@langchain/textsplitters` `RecursiveCharacterTextSplitter` for languages without tree-sitter grammars. Language-aware splitting for Markdown, HTML, Python, Ruby, JS; generic splitting for JSON, YAML, TOML, etc.
- **13 new file extensions** — Ruby ecosystem (`.rb`, `.erb`, `.rake`, `.gemspec`, `.ru`), Python type stubs (`.pyi`), CSS preprocessors (`.scss`, `.sass`, `.less`), config files (`.json`, `.yaml`, `.yml`, `.toml`)
- **SCSS/LESS import extraction** — `@import`, `@use`, `@forward` patterns in context enricher
- **Provider factory** — `createProvider(cfg)` returns the correct `EmbeddingProvider` based on `PI_INDEX_PROVIDER` env var
- Provider-specific env vars: `PI_INDEX_PROVIDER`, `PI_INDEX_OLLAMA_HOST`, `PI_INDEX_OLLAMA_MODEL`, `PI_INDEX_VOYAGE_API_KEY`, `PI_INDEX_VOYAGE_MODEL`
- **Contextual enrichment** for embeddings — each chunk is enriched with file-level context (sibling symbols, import names, chunk position) before embedding. Deterministic, zero LLM cost.
- **BTREE scalar indexes** on `filePath`, `language`, and `extension` columns
- **Table optimization** after indexing — compacts fragmented data files
- **Auto IVF-PQ vector index** for large codebases (>10,000 chunks)
- Shared constants file (`constants.ts`) — single source of truth
- CHANGELOG.md

### Changed

- `chunkFile()` is now async (LangChain fallback is async)
- `Indexer` and `Searcher` now accept `EmbeddingProvider` interface instead of concrete `Embeddings` class
- Extension init function is now async (probes dimension for non-OpenAI providers)
- `withRetry()` and `isRateLimitError()` exported from `embeddings.ts` for reuse by other providers
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
