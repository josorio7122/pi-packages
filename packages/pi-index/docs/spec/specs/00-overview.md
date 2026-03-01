# pi-index — Overview

**Version:** 0.3.0
**Status:** Current

---

## Purpose

`pi-index` solves a token efficiency problem: when an LLM agent works on a large codebase, navigating with grep and bash burns enormous amounts of tokens on noise — hundreds of unranked lines returned for every search. `pi-index` replaces discovery-phase exploration with a pre-built vector and full-text index that the LLM queries directly, receiving a small set of ranked, relevant excerpts instead.

The extension has two sides: an indexing pipeline that runs when the developer asks for it, and a search interface that the LLM uses during every session once the index exists.

---

## Workflows

### Workflow 1: First-Time Index Build

This workflow runs once per project, the first time a developer sets up pi-index.

1. The developer installs pi-index from GitHub following the README. The extension loads on the next pi session start.
2. The developer sets `OPENAI_API_KEY` (or `PI_INDEX_API_KEY`) in their shell environment.
3. The developer calls `codebase_index` (or the LLM calls it on their behalf). This is the trigger for the first build. (`PI_INDEX_AUTO` is `false` by default — see `specs/01-indexing.md`.) The tool returns immediately with a "Started indexing…" message; the indexer runs in the background.
4. The indexer walks the configured directories, applies the file inclusion rules from DATA-MODEL.md, and collects all eligible files.
5. For each eligible file, the indexer splits it into chunks (see `specs/01-indexing.md`). Each chunk gets a start line, end line, language label, and best-effort symbol name.
6. The indexer enriches each chunk with file-level context (sibling symbols, imports, position) and sends the enriched text to the embedding service in batches. Each chunk produces a vector.
7. The indexer writes each chunk — text, vector, metadata — to the index database.
8. After all chunks are written, the indexer updates the mtime cache atomically.
9. When the background run completes, the summary (files indexed, chunks created, time elapsed) is available via `codebase_status`.
10. The LLM can call `codebase_search` at any point — even while indexing is still running. Results include a warning note when the index is incomplete.

### Workflow 2: Incremental Refresh

This workflow runs on every subsequent `codebase_index` call after the first build.

1. The indexer reads the mtime cache to get the last-known mtime for every previously indexed file.
2. The indexer walks the configured directories and compares current file mtimes to stored values.
3. Files whose mtime is unchanged are skipped entirely — no reading, no embedding, no writing.
4. Files that are new or modified are re-indexed: their old chunks are deleted, new chunks are produced and embedded, and the mtime cache entry is updated.
5. Files that were indexed previously but no longer exist on disk have all their chunks deleted and their mtime entry removed.
6. The tool returns a summary: files added, files updated, files removed, files skipped.

### Workflow 3: Semantic Search

This workflow runs every time the LLM calls `codebase_search` during a session.

1. The LLM calls `codebase_search` with a natural language query and optional scope filters and options.
2. The extension parses any `@scope:` filters from the query string, producing a clean query and a filter set.
3. The extension sends the clean query to the embedding service to produce a query vector.
4. The index runs vector search (semantic similarity) and full-text search (BM25) in parallel.
5. Scope filters are applied to restrict results to matching files, directories, extensions, or languages.
6. The two result lists are merged using RRF into a single ranked list.
7. Results below the minimum relevance score are removed.
8. MMR reranking promotes diversity: results that are too similar to already-selected results are pushed down.
9. The top results are formatted as a structured text block with file paths, line ranges, language labels, relevance scores, and chunk text.
10. The formatted result is returned to the LLM.

---

## Data Flow

```
Developer / LLM
      │
      ├─► codebase_index ──────────────────────────────────────────────────┐
      │   (returns immediately — indexing runs in background)              │
      │                                                                    │
      │   Indexing Pipeline                                                │
      │   ┌─────────────┐  ┌─────────────┐  ┌───────────┐                 │
      │   │  File Walker │─►│ AST Chunker │─►│  Enricher │                 │
      │   └─────────────┘  │ (tree-sitter│  └─────┬─────┘                 │
      │         │           │  + LangChain│        │                       │
      │   (mtime diff)      │  fallback)  │        ▼                       │
      │         │           └─────────────┘  ┌──────────────────────────┐ │
      │         │                            │   EmbeddingProvider      │ │
      │         │                            │  ┌──────────┐            │ │
      │         │                            │  │  OpenAI  │ (default)  │ │
      │         │                            │  ├──────────┤            │ │
      │         │                            │  │  Ollama  │ (local)    │ │
      │         │                            │  ├──────────┤            │ │
      │         │                            │  │ Voyage AI│ (code)     │ │
      │         │                            │  └──────────┘            │ │
      │         │                            └──────────┬───────────────┘ │
      │         │                                 (vectors)               │
      │         ▼                                       ▼                 │
      │   ┌─────────────┐                  ┌──────────────────────┐      │
      │   │ Mtime Cache │                  │   Index Database     │      │
      │   │ (JSON file) │                  │  (chunks + vectors   │      │
      │   └─────────────┘                  │   + FTS index)       │      │
      │                                    └──────────────────────┘      │
      │                                                │                  │
      └─► codebase_search                              │◄─────────────────┘
                │                                      │
                │   Search Pipeline                    │
                │   ┌──────────────────────────────┐   │
                └──►│ Scope Filter Parser           │   │
                    │ Query Embedder                │   │
                    │ Vector Search  ──────────────►│◄──┘
                    │ Full-Text Search ────────────►│
                    │ RRF Fusion                    │
                    │ Score Threshold Filter        │
                    │ MMR Reranker                  │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
                            Ranked Results
                     (+ warning if indexing in progress)
                            (returned to LLM)
```

---

## Spec File Reference

| File | What it covers | Workflows served |
| --- | --- | --- |
| `GLOSSARY.md` | Definitions of all domain terms | All |
| `CONSTITUTION.md` | Design principles, error codes, config, scoring, chunking contract, incremental indexing contract, scope filter syntax, out-of-scope | All |
| `DATA-MODEL.md` | CodeChunk, MtimeEntry, IndexConfig entities; supported languages; file inclusion rules | All |
| `specs/00-overview.md` | End-to-end workflows and data flow | All |
| `specs/01-indexing.md` | File walking, chunking, embedding, mtime-based incremental updates | Workflows 1 & 2 |
| `specs/02-search.md` | Query parsing, hybrid search, RRF, MMR, result formatting | Workflow 3 |
| `specs/03-tool-api.md` | Tool contracts: codebase_search, codebase_index, codebase_status | All |
| `specs/04-commands.md` | Slash command contracts: /index-status, /index-rebuild, /index-clear | Maintenance |

---

## Key Design Decisions

**Hybrid search over pure vector.** Code search has two modes: semantic ("find auth logic") and exact ("find handleStripeWebhook"). Pure vector search performs poorly on exact identifier queries. The extension uses LanceDB's built-in full-text (BM25) and vector search together, fused with RRF, to handle both modes in a single call.

**autoIndex is off by default.** The first index build on a large project takes several minutes and costs real money in embedding API calls. The developer explicitly triggers the first build. After that, incremental refreshes are fast enough to be triggered automatically if desired.

**Async-first indexing.** `codebase_index` returns immediately with a "Started indexing…" message. The indexer runs in the background so the LLM can continue working. `codebase_status` shows progress, and search results include a warning when the index is incomplete.

**Multi-provider embeddings.** The embedding layer is abstracted behind an `EmbeddingProvider` interface. OpenAI is the default; Ollama enables local/offline use; Voyage AI provides code-optimized embeddings. The provider is selected by `PI_INDEX_PROVIDER`.

**AST-based chunking.** For languages with tree-sitter grammar support (TypeScript, JavaScript, Python, Ruby, CSS, SCSS), the chunker walks the AST to find structural boundaries — function and class definitions — instead of using regex pattern matching. This produces more semantically coherent chunks. LangChain `RecursiveCharacterTextSplitter` is the fallback for unsupported languages.

**Project-local index.** The index is stored in `.pi/index/` inside the project. This means each project has an independent index, different projects never interfere, and the index is easy to inspect or delete. It is gitignored — it is a derived artifact.

**Hard-excluded infrastructure directories.** The directories `node_modules` and `.git` are always excluded by the walker regardless of `.gitignore` settings or `PI_INDEX_DIRS` configuration. All other filtering is controlled by `.gitignore` files and the `PI_INDEX_DIRS` setting. The README documents common `PI_INDEX_DIRS` values for monorepo and multi-package layouts.

**MMR for diversity.** Without MMR, a search about a heavily-used pattern returns eight chunks all from the same file. MMR ensures results span multiple files, giving the LLM a broader picture of the codebase in fewer tokens.

**No cross-file deduplication.** Two functions in different files that do nearly the same thing are both stored. The LLM benefits from seeing all of them — it can compare implementations, understand conventions, and make informed decisions about which one to use or modify.
