# pi-index v3 — Plan: JS/TS + Ruby + Python Focus

**Date:** 2026-02-27  
**Status:** Draft  
**Baseline:** pi-index v2 (316 tests, 13 source files, ~3,200 LOC implementation)  
**Scope:** JavaScript/TypeScript, Ruby, Python — and their ecosystem file types  
**Reference:** claude-context (zilliztech) for feature parity targets

---

## Language Scope

This plan targets three programming language ecosystems:

| Ecosystem | Already indexed | To add |
|-----------|----------------|--------|
| **JS/TS** | `.ts` `.tsx` `.d.ts` `.js` `.jsx` | — (complete) |
| **Python** | `.py` | `.pyi` (type stubs) |
| **Ruby** | ❌ nothing | `.rb` `.erb` `.rake` `.gemspec` `.ru` |
| **CSS/styling** | `.css` | `.scss` `.sass` `.less` |
| **Config/ecosystem** | `.md` `.html` `.sql` `.txt` | `.json` `.yaml` `.yml` `.toml` `.env` |

**Tree-sitter AST splitting (replaces regex):** JS, TS, Python, Ruby, CSS, SCSS  
**LangChain `RecursiveCharacterTextSplitter` fallback:** ERB, LESS, SQL, Markdown, HTML, .pyi, .txt, JSON, YAML, TOML  
**Fallback chain (same as claude-context):** tree-sitter AST → if no grammar or parse fails → LangChain language-aware text splitter → if unknown language → LangChain generic splitter

LangChain's `RecursiveCharacterTextSplitter.fromLanguage()` provides language-specific separators for `js`, `python`, `ruby`, `markdown`, `html`, `latex`, `sol`, and others. For languages it doesn't know, it falls back to splitting on newlines/paragraphs. This is strictly better than pi-index v2's line-count-only fallback.

**Already supported import extraction:** JS/TS (`import`/`require`), Python (`import`/`from`), Ruby (`require`/`require_relative`)  
**Nothing to add** — the three target languages are already covered by the enricher.

---

## Verified Comparison vs claude-context (source-code level)

### pi-index already wins

| Feature | pi-index | claude-context |
|---------|----------|----------------|
| Zero-config deployment | LanceDB embedded, `.pi/index/` | Requires Milvus or Zilliz Cloud |
| Search quality | MMR + minScore threshold | No MMR, no threshold on hybrid |
| Scope filters | `@file:` `@dir:` `@ext:` `@lang:` | `extensionFilter` param only |
| Contextual enrichment | Module symbols + imports + position | Raw content only |
| Change detection cost | mtime stat (µs/file) | SHA-256 full read (ms/file) |
| Index maintenance | BTREE, FTS rebuild, optimize(), IVF-PQ | Relies on Milvus internals |
| Retry logic | Exponential backoff, 4 attempts | Zero retry in any provider |
| Per-file failure recovery | Failed files retried next run | Entire codebase marked failed |
| Tests | 316, TDD, full specs | 0 |
| Dependencies | 2 runtime | 15+ |

### claude-context wins (gaps this plan closes)

| Feature | claude-context | Gap | This plan |
|---------|---------------|-----|-----------|
| Embedding providers | 4 (OpenAI, Voyage, Gemini, Ollama) | pi-index: OpenAI only | **Phase 1**: Add Ollama + Voyage |
| Local/offline embedding | Ollama | None | **Phase 1**: Ollama provider |
| Ruby support | `.rb` indexed + AST splitting | Not indexed | **Phase 2**: Full Ruby support |
| Config files | `.json` `.yaml` `.yml` indexed | Not indexed | **Phase 2**: Add ecosystem files |
| Async indexing | Background, non-blocking | Blocking | **Phase 3**: Async mode |
| Auto re-index | 5 min periodic sync | Session start only | **Phase 4**: Periodic sync |

---

## Design Principles

1. **No new required deps for embeddings** — Ollama and Voyage are optional peer deps. `openai` stays the only required one.
2. **Tree-sitter for all structural splitting** — Replace regex patterns entirely. Use the same native tree-sitter packages as claude-context. Proper AST parsing, no heuristics.
3. **TDD** — Failing test first, always.
4. **Backward compatible** — Existing indexes keep working. No forced rebuilds.
5. **Scoped to 3 ecosystems** — No Java, Go, Rust, C/C++, C#, Kotlin, Swift in this plan.
6. **LangChain fallback** — Languages without a tree-sitter grammar (JSON, YAML, TOML, ERB, etc.) fall back to `@langchain/textsplitters` `RecursiveCharacterTextSplitter` with language-specific separators where available.

---

## Phase 1: Multi-Provider Embeddings (6 tasks)

**Goal:** Ollama (local/offline) + Voyage (code-optimized) + abstract provider interface  
**New optional peer deps:** `ollama`, `voyageai`

### Task 1.1: Abstract `EmbeddingProvider` interface

Create `embedding-provider.ts`:

```typescript
export interface EmbeddingProvider {
  /** Embed a single text string. */
  embed(text: string): Promise<number[]>;
  /** Embed a batch of text strings (one API call). */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Get or detect vector dimension (async — Ollama needs a probe call). */
  getDimension(): Promise<number>;
  /** Human-readable provider name for logging. */
  getProvider(): string;
}
```

**Files:** `extensions/index/embedding-provider.ts` (new)  
**Tests:** Type conformance tests with a mock provider

### Task 1.2: Wrap existing `Embeddings` as `OpenAIProvider`

Refactor `embeddings.ts` to implement `EmbeddingProvider`. Existing class becomes the default.

**Files:** `extensions/index/embeddings.ts` (modify)  
**Tests:** Existing tests pass unchanged; add `getDimension()` + `getProvider()` tests  
**Behavior:**
- `getDimension()` → returns from config (1536 / 3072)
- `getProvider()` → `"openai"`
- Backward compatible — `Embeddings` class still works everywhere it's imported

### Task 1.3: Ollama provider

Create `ollama-provider.ts`:

**Files:** `extensions/index/ollama-provider.ts` (new)  
**Tests:** Fake HTTP tests; real Ollama tests (skip if no `OLLAMA_HOST`)  
**Config:** `PI_INDEX_PROVIDER=ollama`, `PI_INDEX_OLLAMA_HOST` (default `http://127.0.0.1:11434`), `PI_INDEX_OLLAMA_MODEL` (default `nomic-embed-text`)  
**Behavior:**
- Uses `ollama` npm package (optional peer dep)
- `getDimension()` probes with a test embedding
- `embedBatch()` uses Ollama native batch API
- Graceful error if `ollama` not installed
- Reuses `withRetry` from `embeddings.ts` for retry logic

### Task 1.4: Voyage AI provider

Create `voyage-provider.ts`:

**Files:** `extensions/index/voyage-provider.ts` (new)  
**Tests:** Mock HTTP tests  
**Config:** `PI_INDEX_PROVIDER=voyage`, `PI_INDEX_VOYAGE_API_KEY` / `VOYAGEAI_API_KEY`, `PI_INDEX_VOYAGE_MODEL` (default `voyage-code-3`)  
**Behavior:**
- Uses `voyageai` npm package (optional peer dep)
- `voyage-code-3` default (optimized for code, 13-17% better than OpenAI)
- Batch size up to 128
- Graceful error if `voyageai` not installed

### Task 1.5: Provider factory + config integration

Wire provider selection into config:

**Files:** `extensions/index/config.ts` (modify), `extensions/index/index.ts` (modify)  
**Tests:** Config validation for new env vars; factory dispatch tests  
**New env vars:**
- `PI_INDEX_PROVIDER` — `openai` (default) | `ollama` | `voyage`
- `PI_INDEX_OLLAMA_HOST`, `PI_INDEX_OLLAMA_MODEL`
- `PI_INDEX_VOYAGE_API_KEY`, `PI_INDEX_VOYAGE_MODEL`

**Behavior:**
- `createProvider(config): EmbeddingProvider` factory
- Ollama: no API key required; Voyage: own key required
- Auto-detect dimension via `getDimension()` for non-OpenAI
- Warn on dimension mismatch with existing index

### Task 1.6: Update indexer + searcher to use `EmbeddingProvider`

Replace `Embeddings` type with `EmbeddingProvider` in indexer and searcher:

**Files:** `extensions/index/indexer.ts` (modify), `extensions/index/searcher.ts` (modify)  
**Tests:** Existing integration tests pass with fake provider  
**Behavior:**
- Constructor signatures change from `Embeddings` to `EmbeddingProvider`
- Batching logic unchanged (EMBED_BATCH_SIZE=20, EMBED_CONCURRENCY=3)
- Enrichment unchanged — provider-agnostic

---

## Phase 2: Tree-Sitter AST Chunking + Ruby + Ecosystem Files (5 tasks)

**Goal:** Replace regex-based boundary detection with proper tree-sitter AST parsing. LangChain text splitter as fallback. Add Ruby support. Add ecosystem config files.  
**New deps (required):** `tree-sitter`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-ruby`, `tree-sitter-css`, `tree-sitter-scss`, `tree-sitter-embedded-template`, `@langchain/textsplitters`

### Verified AST Node Types (from real tree-sitter output)

These were verified by parsing real source files with each grammar:

```typescript
const SPLITTABLE_NODE_TYPES = {
  typescript: [
    'function_declaration',     // export function foo() {}
    'class_declaration',        // export class Foo {}
    'interface_declaration',    // export interface IFoo {}
    'type_alias_declaration',   // export type Foo = ...
    'export_statement',         // wraps all exported declarations
    'method_definition',        // class method
    'arrow_function',           // const foo = () => {}
  ],
  javascript: [
    'function_declaration',
    'class_declaration',
    'export_statement',
    'method_definition',
    'arrow_function',
  ],
  python: [
    'function_definition',      // def foo(): / async def foo():
    'class_definition',         // class Foo:
    'decorated_definition',     // @decorator + function/class
  ],
  ruby: [
    'class',                    // class User
    'module',                   // module MyApp
    'method',                   // def foo
    'singleton_method',         // def self.foo
  ],
  css: [
    'rule_set',                 // .header { ... }
    'media_statement',          // @media (...) { ... }
    'keyframes_statement',      // @keyframes fadeIn { ... }
  ],
  scss: [
    'rule_set',                 // .header { ... }  (same as CSS)
    'mixin_statement',          // @mixin flex-center { ... }
    'media_statement',          // @media (...) { ... }
  ],
  // ERB: tree-sitter-embedded-template produces content/directive/output_directive nodes.
  // No function-level boundaries — LangChain fallback (html separators) is correct for templates.
};
```

### Task 2.1: Add language map entries + tree-sitter dependencies

Add to `LANGUAGE_MAP` in `constants.ts` and install tree-sitter packages:

```typescript
// Ruby ecosystem
".rb": "ruby",
".erb": "erb",
".rake": "ruby",      // Rake files are Ruby
".gemspec": "ruby",   // Gemspec files are Ruby
".ru": "ruby",        // Rackup files are Ruby

// Python addition
".pyi": "python",     // Type stubs are Python

// CSS preprocessors
".scss": "scss",
".sass": "scss",      // SASS uses same grammar for structural splitting
".less": "less",

// Config / ecosystem files (LangChain fallback — no tree-sitter grammar)
".json": "json",
".yaml": "yaml",
".yml": "yaml",
".toml": "toml",
```

**Files:** `extensions/index/constants.ts` (modify), `package.json` (add deps)  
**Tests:** Verify all new extensions map correctly; `SUPPORTED_EXTENSIONS` auto-derives  
**Deps to install:**
```bash
pnpm add tree-sitter@^0.21.1 \
  tree-sitter-javascript@^0.21.0 \
  tree-sitter-typescript@^0.21.2 \
  tree-sitter-python@^0.21.0 \
  tree-sitter-ruby@^0.21.0 \
  tree-sitter-css@^0.23.0 \
  tree-sitter-scss@^1.0.0 \
  tree-sitter-embedded-template@^0.21.0 \
  @langchain/textsplitters@^1.0.1
```

**`@langchain/textsplitters`** is the standalone package (only dep: `js-tiktoken`). NOT the full `langchain` package — that would be massive. This is the same splitter claude-context uses as its fallback.

**Note:** `.env` files are NOT added — they may contain secrets.

### Task 2.2: Create `ast-chunker.ts` — tree-sitter AST splitting + LangChain fallback

New file that replaces regex-based boundary detection. Same pattern as claude-context's `ast-splitter.ts` (tree-sitter + LangChain fallback) but adapted for pi-index's line-based approach:

**Files:** `extensions/index/ast-chunker.ts` (new)  
**Tests:** AST chunker tests for every supported language with realistic code samples; LangChain fallback tests for unsupported languages

**Architecture:**

```typescript
import Parser from 'tree-sitter';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// Language-specific grammars
const JS = require('tree-sitter-javascript');
const TS = require('tree-sitter-typescript').typescript;
const Python = require('tree-sitter-python');
const Ruby = require('tree-sitter-ruby');
const CSS = require('tree-sitter-css');
const SCSS = require('tree-sitter-scss');

const LANGUAGE_CONFIGS: Record<string, { parser: any; nodeTypes: string[] }> = {
  typescript: { parser: TS, nodeTypes: SPLITTABLE_NODE_TYPES.typescript },
  javascript: { parser: JS, nodeTypes: SPLITTABLE_NODE_TYPES.javascript },
  python:     { parser: Python, nodeTypes: SPLITTABLE_NODE_TYPES.python },
  ruby:       { parser: Ruby, nodeTypes: SPLITTABLE_NODE_TYPES.ruby },
  css:        { parser: CSS, nodeTypes: SPLITTABLE_NODE_TYPES.css },
  scss:       { parser: SCSS, nodeTypes: SPLITTABLE_NODE_TYPES.scss },
};

// LangChain language mapping for fallback
// RecursiveCharacterTextSplitter.fromLanguage() supports these:
const LANGCHAIN_LANGUAGES: Record<string, string> = {
  javascript: 'js', typescript: 'js', python: 'python',
  ruby: 'ruby', markdown: 'markdown', html: 'html',
  sql: 'sol',  // closest available
  // ... etc
};
```

**Exported functions:**

**`astSplit(code, language) → ASTRange[] | null`**
1. Look up language in `LANGUAGE_CONFIGS`
2. If found → parse with tree-sitter, traverse AST, extract splittable node ranges + symbols
3. If not found or parse fails → return `null`

**`langchainSplit(code, language) → LangChainRange[]`**
1. Map language to LangChain's supported language enum
2. If mapped → `RecursiveCharacterTextSplitter.fromLanguage(mapped, { chunkSize, chunkOverlap: 0 })`
3. If not mapped → generic `RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap: 0 })`
4. Split → estimate startLine/endLine from chunk position in original code
5. No symbol extraction (LangChain doesn't know about identifiers)

**Chunk size for LangChain:** Use `MAX_CHUNK_LINES * 80` characters (~6400 chars for 80 lines at ~80 chars/line) as the `chunkSize` parameter. This approximates pi-index's 80-line limit in character space. `chunkOverlap: 0` — no overlap, consistent with pi-index's design.

**Key differences from claude-context:**
- Returns line ranges, not character ranges (pi-index is line-based)
- Extracts `symbol` names from AST (claude-context doesn't track symbols)
- No overlap added (pi-index design choice — cleaner, no noise)
- MAX_CHUNK_LINES (80) sub-splitting applied after AST extraction, not character-based
- Falls back to LangChain `RecursiveCharacterTextSplitter` instead of returning a single giant chunk

### Task 2.3: Refactor `chunker.ts` — integrate AST chunker, remove regex

Replace the regex boundary system in `chunker.ts` with calls to `astSplit()`:

**Files:** `extensions/index/chunker.ts` (rewrite)  
**Tests:** All existing 176 lines of chunker tests must still pass; add new tests for each AST language

**New `chunkFile()` flow:**

```
chunkFile(filePath, content, mtime)
  │
  ├── Detect language from extension (unchanged)
  │
  ├── Try AST splitting: astSplit(content, language)
  │     ├── Language has tree-sitter grammar → parse AST → extract node ranges
  │     └── Language has no grammar → returns null
  │
  ├── If AST returned ranges:
  │     ├── Lines before first node → preamble chunk
  │     ├── Each AST node → chunk with symbol name from AST
  │     ├── Lines between/after nodes → gap chunks (no symbol)
  │     └── Sub-split any chunk > MAX_CHUNK_LINES
  │
  ├── If AST returned null OR parse failed:
  │     └── LangChain fallback: langchainSplit(content, language)
  │           ├── Language known to LangChain → RecursiveCharacterTextSplitter.fromLanguage()
  │           │     Uses language-specific separators (function defs, class defs, etc.)
  │           └── Language unknown → RecursiveCharacterTextSplitter (generic newline/paragraph)
  │           Both produce chunks with startLine/endLine (estimated from content position)
  │           Symbol = "" (LangChain doesn't extract symbol names)
  │
  └── Build CodeChunk[] with id, text, filePath, startLine, endLine, symbol, etc.
```

**Fallback chain (same as claude-context):**
1. **tree-sitter AST** — best quality, proper syntax boundaries, symbol extraction
2. **LangChain language-aware** — good quality, language-specific separators (covers: js, python, ruby, markdown, html, cpp, go, java, php, rust, scala, swift, latex, sol)
3. **LangChain generic** — baseline, splits on newlines/paragraphs

**What gets removed:**
- `TS_JS_BOUNDARIES` regex array
- `BOUNDARIES` record (python, sql, markdown, css patterns)
- `findSymbol()` regex function
- `isBoundary()` regex function
- Line-count fallback (replaced by LangChain)

**What stays:**
- `CodeChunk` type definition
- `detectLanguage()` function
- `getExtension()` helper
- MAX_CHUNK_LINES sub-splitting (applied on top of both AST and LangChain results)

**Symbol extraction from AST:**

| Language | How to get symbol name |
|----------|----------------------|
| TypeScript/JavaScript | `function_declaration` → child `identifier`; `class_declaration` → child `identifier`; `export_statement` → recurse into child declaration |
| Python | `function_definition` → child `identifier`; `class_definition` → child `identifier`; `decorated_definition` → recurse into child definition |
| Ruby | `method` → child `identifier`; `class` → child `constant`; `module` → child `constant`; `singleton_method` → child `identifier` |
| CSS/SCSS | `rule_set` → `selectors` child text; `media_statement` → `"@media"`; `mixin_statement` → child `identifier` |

### Task 2.4: Update `context-enricher.ts` for ERB and SCSS

ERB and SCSS may contain import-like patterns. Update `extractImportNames()`:

**Files:** `extensions/index/context-enricher.ts` (modify)  
**Tests:** Pure function tests for new import patterns

| Language | Pattern | Example |
|----------|---------|---------|
| SCSS | `@import 'file'` or `@use 'file'` | `@import 'variables';` → `variables` |
| ERB | No imports — it's a template. Skip. | — |

Ruby `require`/`require_relative` extraction is already supported — no change needed.

### Task 2.5: Update documentation

**Files:** `README.md`, `CHANGELOG.md`, `docs/spec/DATA-MODEL.md`, `docs/HOW-IT-WORKS.md`, `docs/spec/specs/01-indexing.md`  
**Content:**
- New language list with all extensions
- Tree-sitter AST splitting replaces regex (document which node types per language)
- Fallback behavior for unsupported languages
- Architecture diagram updated to show `ast-chunker.ts`
- Dependency list updated

---

## Phase 3: Async Background Indexing (3 tasks)

**Goal:** Non-blocking `codebase_index` — returns immediately, LLM searches partial results  
**New deps:** None

### Task 3.1: Async indexer with progress tracking

Add `runAsync()` method to `Indexer`:

**Files:** `extensions/index/indexer.ts` (modify)  
**Tests:** Async start, progress state, concurrent guard, completion/failure state

**Behavior:**
- `runAsync(opts)` starts the existing `run()` pipeline in a detached promise
- Returns `{ status: 'started' }` immediately, or `{ status: 'already_running', progress }` if busy
- Stores state: `lastResult: IndexSummary | null`, `lastError: string | null`, `progress: string | null`
- `isRunning` getter already exists — reuse
- `getProgress()` new getter returns current phase string + percentage estimate
- The existing `run()` stays available for synchronous use (auto-index, tests)

### Task 3.2: Update `codebase_index` tool for async mode

**Files:** `extensions/index/tools.ts` (modify)  
**Tests:** Tool returns "started" message; subsequent call shows "already running"

**Behavior:**
- First call: `"⚡ Started indexing — search is available with partial results while indexing completes."`
- Already running: `"⏳ Indexing is already in progress. Use codebase_status to check progress."`
- `codebase_status` enriched with progress when indexing is active

### Task 3.3: Search-during-indexing UX

**Files:** `extensions/index/tools.ts` (modify)  
**Tests:** Search result includes indexing warning when indexer is running

**Behavior:**
- `codebase_search`: if `indexer.isRunning`, append to results: `"\n⚠️ Indexing in progress — results may be incomplete."`
- `codebase_status`: show `"Indexing: <progress message>"` when active, plus `lastResult` or `lastError` when done

---

## Phase 4: Periodic Auto-Sync (2 tasks)

**Goal:** Automatic incremental re-indexing at a configurable interval  
**New deps:** None

### Task 4.1: Periodic sync timer

**Files:** `extensions/index/index.ts` (modify)  
**Tests:** Timer scheduling, skip-when-running, cleanup on extension unload

**Config:** `PI_INDEX_AUTO_INTERVAL` already exists (default `0` = once per session)

**Behavior:**
- When `PI_INDEX_AUTO=true` and `PI_INDEX_AUTO_INTERVAL > 0`:
  - After the initial `before_agent_start` sync, schedule `setInterval` at N-minute intervals
  - Each tick calls `indexer.run()` (sync, incremental) — mtime diff is cheap
  - Skip if `indexer.isRunning` (async index or previous sync still going)
  - Clear interval on extension cleanup
- When `PI_INDEX_AUTO_INTERVAL=0` (default): one-shot on session start, no timer

### Task 4.2: Smart directory-mtime short-circuit

**Files:** `extensions/index/walker.ts` (modify)  
**Tests:** Verify short-circuit when no directory mtimes changed

**Behavior:**
- After each walk, record the max `mtime` across all discovered files
- On next walk, first check if the index root directory's mtime has changed
- If root dir mtime unchanged AND no `PI_INDEX_DIRS` subdirectory mtimes changed → return previous file list without re-walking
- This makes no-change syncs O(1 stat per indexDir) instead of O(N files)

---

## Phase 5: Documentation (2 tasks)

### Task 5.1: Spec updates

Update all spec files for v3:
- **DATA-MODEL.md**: Updated Supported Languages table, new IndexConfig fields
- **GLOSSARY.md**: EmbeddingProvider, Ollama, Voyage AI, periodic sync
- **01-indexing.md**: Async mode, periodic sync, Ruby boundary patterns
- **03-tool-api.md**: Async `codebase_index` response, progress in `codebase_status`
- **00-overview.md**: Updated architecture diagram with provider layer

### Task 5.2: User-facing docs

- **README.md**: Provider configuration section, full language list, async indexing
- **CHANGELOG.md**: v3 entries
- **HOW-IT-WORKS.md**: Provider architecture, Ruby patterns, async pipeline, periodic sync

---

## Execution Order

```
Phase 1 (Multi-Provider)    ← highest user impact
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6

Phase 2 (Tree-Sitter + Ruby + Ecosystem)  ← proper AST splitting
  2.1 → 2.2 → 2.3 → 2.4 → 2.5

Phase 3 (Async Indexing)    ← UX improvement
  3.1 → 3.2 → 3.3

Phase 4 (Auto-Sync)         ← convenience
  4.1 → 4.2

Phase 5 (Docs)              ← after all code is final
  5.1 → 5.2
```

**Total: 18 tasks** across 5 phases.

---

## What We Deliberately Skip

| Feature | Why skip |
|---------|----------|
| **Tree-sitter for Java, Go, Rust, C/C++, C#, Kotlin, Swift** | Out of scope for this plan — scoped to JS/TS + Ruby + Python ecosystems only. Easy to add grammar-by-grammar later. |
| **Java, Go, Rust, C/C++, C#, Kotlin, Swift** | Out of scope — plan is scoped to JS/TS + Ruby + Python ecosystems. |
| **Gemini embedding provider** | Low value — OpenAI + Voyage + Ollama covers cloud, code-optimized, and local. |
| **Chunk overlap** | Adds noise and cost. pi-index's clean boundary splitting is better. |
| **`.env` file indexing** | Security risk — may contain secrets even if gitignored. |

---

## Post-v3 Evaluation

1. **Configurable chunk size** — Let users tune MAX_CHUNK_LINES
2. **HAML/Slim template support** — Ruby ecosystem templates beyond ERB
3. **Cross-file import graph** — Lightweight dependency graph from import/require statements
4. **Result snippets** — Return most relevant lines within a chunk, not the entire chunk
