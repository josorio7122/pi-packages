# How pi-index Works

A complete conceptual and technical guide to the pi-index extension — what it does, why each part exists, and exactly how every piece fits together.

---

## The Problem It Solves

When an LLM agent works on a large codebase, exploring it with grep and bash is expensive. A search like `grep -r "authentication" src/` might return 200 lines across 40 files. The agent has to read all of it, most of it is noise, and every line burns tokens from the context window.

pi-index replaces that pattern with a pre-built semantic index. Instead of scanning files at request time, the agent calls one tool — `codebase_search("user login flow")` — and gets back 8 ranked, relevant excerpts from across the codebase. Each excerpt tells the agent exactly where to look (file, line range, language, symbol name) and how relevant it is to the query. No grep, no bash, no wasted tokens.

---

## Architecture at a Glance

```
User message
     │
     ▼
before_agent_start hook (if PI_INDEX_AUTO=true)
     │
     ├── runs incremental index in background (fire-and-forget)
     └── agent starts, LLM gets context

LLM calls codebase_search("query")
     │
     ▼
Searcher.search()
     ├── parseScopeFilters()      → clean query + SQL WHERE clause
     ├── emb.embed(cleanQuery)    → query vector (1 OpenAI API call)
     ├── db.hybridSearch()        → LanceDB vector + BM25 → RRF ranked rows
     ├── score normalization      → [0, 1] relative scale
     ├── minScore threshold       → drop low-confidence results
     └── mmrRerank()              → diversity-balanced final list
          │
          ▼
     formatResults()              → plain text for LLM

LLM calls codebase_index()
     │
     ▼
Indexer.run()
     ├── walkDirs()               → file list (respecting .gitignore)
     ├── diffFileSet()            → new / changed / deleted / unchanged
     ├── chunkFile()              → CodeChunk[] per file
     ├── emb.embed([...texts])    → vectors in batches of 20, 3 concurrent
     ├── db.deleteByFilePath()    → remove old chunks (changed files)
     ├── db.insertChunks()        → write new chunks with vectors
     ├── db.rebuildFtsIndex()     → keep BM25 search current
     └── writeMtimeCache()        → atomic JSON write
```

---

## The Two Sides: Indexing and Search

pi-index has two completely separate workflows that happen at different times.

**Indexing** is expensive and infrequent. It reads every file, calls the OpenAI API, and writes to disk. On a 3000-file project, the first index takes several minutes and costs a few cents in API calls. After that, incremental runs take seconds — they only re-embed files that changed.

**Search** is cheap and frequent. It embeds one query string (one fast API call), then queries the local database. No file reading. No filesystem traversal. The result comes back in under a second.

The separation means the LLM can call `codebase_search` as many times as it wants during a session without meaningful overhead.

---

## Phase 1: Configuration

When pi loads the extension, `loadConfig()` reads environment variables and builds an `IndexConfig` object. This happens once and the config is immutable for the session.

Key decisions made at config time:
- Which OpenAI API key to use (`PI_INDEX_API_KEY` > `OPENAI_API_KEY`)
- Which embedding model — and therefore which vector dimension to use (1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`)
- Where the LanceDB database lives (`.pi/index/lancedb` relative to project root by default)
- Where the mtime cache lives (`.pi/index/mtime-cache.json`, always in `.pi/index/`)
- Which directories to index (`PI_INDEX_DIRS`, defaults to project root)
- Whether to auto-index on session start (`PI_INDEX_AUTO`)

If the API key is missing, the extension still loads — but it registers stub tools and stub slash commands that return a helpful error message. The extension never crashes on startup.

The `existsSync` check at config time filters non-existent directories out of `indexDirs` with a warning. If all dirs are removed, it falls back to the project root.

---

## Phase 2: Database Initialization (Lazy)

`IndexDB` uses a lazy initialization pattern — the LanceDB connection is not opened until the first operation that needs it (insert, search, delete, count). The `ensureInitialized()` method handles this.

On first initialization:
1. Connect to LanceDB at `dbPath`
2. Check if the `chunks` table already exists
3. If yes: open it
4. If no: create it with a bootstrap schema row (a fake `CodeChunk` with all fields set), then immediately delete that row. This establishes the schema without leaving garbage data. Then create an FTS (full-text search) index on the `text` column.
5. **Create BTREE scalar indexes** on `filePath`, `language`, and `extension` columns. These accelerate scope filter queries (`@file:`, `@dir:`, `@lang:`, `@ext:`) from full column scans to indexed lookups. The scalar index creation runs on **both** the new-table and existing-table paths — LanceDB's default `replace: true` makes repeated calls idempotent (~4ms on re-create). If scalar index creation fails, queries still work — just slower (full scan fallback).

The bootstrap approach is required because LanceDB infers the schema from the first row inserted. We need the FTS index to be created on an empty table, which some LanceDB versions can't do — so the FTS creation is wrapped in try-catch and treated as best-effort.

The lazy import pattern (`import("@lancedb/lancedb")` at runtime) prevents the native module from being loaded at startup, which would slow down extension loading.

---

## Phase 3: File Walking

`walkDirs()` traverses the configured directories recursively using Node.js `readdir()` with `{ withFileTypes: true }`. For each directory it enters, it first tries to load a `.gitignore` file from that directory.

### .gitignore processing

The gitignore system works hierarchically:
1. Each directory's `.gitignore` is loaded as it's visited
2. Patterns are compiled to RegExps via `gitPatternToRegex()`
3. Patterns are stored as "scoped patterns" — each carries the relative path of the directory that owns it
4. When checking a file or directory, the path is made relative to each `.gitignore`'s directory before testing
5. This means `src/api/.gitignore` patterns only match paths under `src/api/`

The `gitPatternToRegex()` function handles:
- `*` → `[^/]*` (matches within a single path segment)
- `**` → `.*` (matches across path separators)
- `?` → `[^/]` (matches exactly one non-separator character)
- `/pattern` → anchored to the containing directory
- `pattern/` → directory-only pattern
- Regex metacharacters (`.`, `+`, `^`, etc.) are escaped

Negation patterns (`!`) are not supported and generate a console warning.

### What gets included

After `.gitignore` filtering, files are included only if:
- The directory is not `node_modules` or `.git` (hard-coded exclusion)
- The file extension is in the supported list (`.ts`, `.tsx`, `.d.ts`, `.js`, `.jsx`, `.py`, `.sql`, `.md`, `.css`, `.html`, `.txt`)
- The file size does not exceed `maxFileKB` (default 500 KB)

The result is a list of `FileRecord` objects with `relativePath`, `absolutePath`, `mtime`, `sizeKB`, and `extension`.

---

## Phase 4: Incremental Diff

After walking the filesystem, `diffFileSet()` compares the current file list against the mtime cache to compute a three-way diff.

```
┌──────────────────────────────────────────┐
│  Current files on disk (walkDirs result) │
└──────────────────────────────────────────┘
         │
         ▼
  Compare mtime vs cache
         │
    ┌────┴─────────────────────────────────────┐
    │                                          │
   NEW (not in cache)         CHANGED (mtime ≠ cached)
    ↓                                ↓
  toAdd                           toUpdate
    │                                │
    └──────────────── toProcess ─────┘
         │
  Files in cache but not on disk → toDelete
         │
  Files with matching mtime → skipped (unchanged)
```

On `force: true`, the database is wiped (`deleteAll`), the cache is cleared, and every file goes into `toAdd`.

---

## Phase 5: Chunking

`chunkFile()` splits a file into `CodeChunk` records. The goal is to produce chunks that are semantically coherent — ideally one function, one class, one section of documentation — while guaranteeing no chunk exceeds 80 lines.

### Algorithm

1. **Scan for boundaries.** For each line, check if it matches a structural boundary pattern for the file's language. These patterns detect function declarations, class declarations, SQL statements, Markdown section headers, and CSS selectors. Only column-0 matches count (no indented methods in Python, no nested classes in TS that would fragment context).

2. **Build ranges.** If there are boundaries:
   - Lines before the first boundary form a "preamble" range (imports, module-level declarations)
   - Each boundary starts a range ending just before the next boundary
   
   If there are no boundaries (text files, HTML, unsupported languages):
   - Split in 80-line blocks

3. **Sub-split oversized ranges.** Any range over 80 lines is split at 80-line intervals. There's no attempt to find a nice split point — just a hard cap.

4. **Assign IDs and metadata.** Each final range becomes a `CodeChunk` with:
   - `id`: `"{filePath}:{chunkIndex}"` (0-based index within file)
   - `startLine`/`endLine`: 1-based, inclusive
   - `symbol`: extracted name from the boundary pattern on the range's first line, or `""` if no pattern matched
   - `language`: from the extension map
   - `vector`: empty array `[]` — filled by the embedder

Empty files (content is empty or whitespace-only) return `[]`. This is not an error.

### Why not use an AST parser?

AST parsing would require language-specific parsers (TypeScript compiler API, Python's `ast` module, etc.), each adding complexity and dependencies. The pattern-based approach is language-agnostic, requires no dependencies, and handles the most important case (top-level function/class declarations) correctly. Missed boundaries produce slightly larger chunks — not incorrect results.

---

## Phase 6: Embedding

`Embeddings.embed()` sends text to the OpenAI embeddings API and returns vectors.

### Batch processing

Single chunks are not embedded one at a time — that would require one API call per chunk, making a 3000-chunk codebase require 3000 API calls. Instead, the indexer:

1. Groups chunks into batches of 20 (`EMBED_BATCH_SIZE`)
2. Runs up to 3 batches concurrently (`EMBED_CONCURRENCY`)
3. Each batch is ONE API call with an array of 20 texts

This means 3000 chunks = 150 batches = ~50 rounds of 3 concurrent calls = about 50 sequential API call rounds (each round is 3 concurrent calls). In practice, with fast network, this is much faster than 3000 sequential calls.

### Enriched embedding text

Each chunk is embedded as:
```
File: src/auth/login.ts (typescript)
Symbol: handleLogin
---
export async function handleLogin(user: string, password: string) {
  const hashed = await bcrypt.hash(password, 10);
  ...
}
```

The enrichment header improves retrieval quality. The embedding model learns to associate "login", "authentication", and "TypeScript" with this chunk. Without it, the chunk would just embed as a generic code pattern.

The stored `text` field is always the raw source lines — never the enriched form. The enrichment only appears in the API call.

### Retry logic

The `withRetry()` wrapper inside `Embeddings` retries only on HTTP 429 (rate limit). Other errors (401 auth, 403 forbidden, 500 server error) fail immediately. There are 4 total attempts with delays of 1s, 2s, 4s between them (up to 7s wait before the final attempt). The delay before the 4th attempt would be 8s, but the loop detects it is the last attempt and throws immediately instead — so only three delays fire.

If a batch fails after all retries, all files in that batch are marked as failed. The indexer continues processing other batches — one bad batch doesn't stop the whole run.

### Partial-write protection

If any chunk embedding fails for a file, that entire file is skipped — no new chunks are written to the DB, and the old chunks are preserved. This prevents a file from being in a half-indexed state. The mtime cache entry is not updated, so the file will be retried on the next run.

---

## Phase 7: Writing to the Database

For each successfully embedded file, the indexer:

1. **Deletes old chunks** with `deleteByFilePath(file.relativePath)` — this removes any previously indexed version of the file
2. **Inserts new chunks** with `insertChunks(chunks)` — all chunks for the file in one batch insert
3. **Updates the cache** with the new mtime, chunk count, and timestamp

Steps 1+2 happen together, and the cache update only happens after both succeed. This means:
- If the delete succeeds but insert fails: the file is unindexed (no old, no new). On next run, the file is treated as new. This is safe — temporary data loss, not corruption.
- If both succeed but cache update somehow fails: the cache doesn't reflect the new state, so next run will re-index the file (wasteful but not harmful).

For files that became empty (zero chunks after chunking), the old chunks are still deleted and the cache entry is written with `chunkCount: 0`. The file won't be re-processed on future runs.

### FTS index rebuild

After processing all files, `rebuildFtsIndex()` is called. This rebuilds LanceDB's tantivy full-text search index with `replace: true` so it includes all newly inserted chunk texts. Without this, hybrid search might not find newly indexed content via BM25.

The FTS rebuild is only triggered when at least one file was processed (added or updated). Delete-only runs don't need an FTS rebuild because LanceDB's deletion mechanism removes the rows from the underlying storage.

### Table optimization

After FTS rebuild, `optimize()` compacts fragmented data files. Each per-file delete+insert cycle during indexing creates a new data fragment in LanceDB's underlying Apache Lance storage. A 100-file index update creates ~100-200 small fragments. Without compaction, subsequent queries must read from many small files — slower I/O. The optimize call merges fragments into fewer, larger files and prunes old table versions.

Optimization runs whenever files were added, updated, or deleted (skipped on no-change runs). It's best-effort — if it fails, data is correct but fragmented.

### Auto vector index

After optimization, `createVectorIndexIfNeeded()` checks whether the chunk count exceeds the IVF-PQ threshold (10,000 chunks). If yes, and no vector index already exists, it creates an IVF-PQ (Inverted File with Product Quantization) index on the `vector` column. This speeds up vector search from brute-force O(n) to approximate O(√n).

The index parameters are computed dynamically:
- `numPartitions` = `min(ceil(sqrt(count)), 256)` — standard heuristic, capped
- `numSubVectors` = `floor(vectorDim / 16)` — for 1536-dim (OpenAI text-embedding-3-small): 96 subvectors
- `distanceType` = `"cosine"` — matches the search distance metric

Once created, the vector index persists and is updated incrementally by `optimize()`. The method checks `listIndices()` first to avoid expensive re-training on every run. Most codebases (200-10K chunks) stay below the threshold — brute-force is fast enough at that scale (~15ms on M1 for 10K vectors).

---

## Phase 8: Mtime Cache

The mtime cache is a JSON file at `.pi/index/mtime-cache.json`. It's an array of `MtimeEntry` objects:

```json
[
  {
    "filePath": "src/auth/login.ts",
    "mtime": 1709123456789,
    "chunkCount": 4,
    "indexedAt": 1709123460000
  },
  ...
]
```

The cache is read as a `Map<string, MtimeEntry>` keyed by `filePath`.

**Atomic write:** The cache is written by writing to a `.tmp` file first, then renaming it to the final path. On POSIX systems (macOS, Linux), rename is atomic — either the old file exists or the new file exists, never a partial write.

**Corruption recovery:** If the cache is missing or corrupt, `JSON.parse` fails, the catch block returns an empty `Map`, and the indexer treats all files as new. The corrupt file is overwritten on the next write.

---

## Phase 9: Hybrid Search

When the LLM calls `codebase_search`, the `Searcher` runs:

### 1. Scope filter parsing

```
"auth token validation @dir:src/auth @lang:typescript"
```
→ clean query: `"auth token validation"`
→ filters: `[{scope:"dir", value:"src/auth"}, {scope:"lang", value:"typescript"}]`
→ SQL WHERE: `(filePath LIKE 'src/auth/%' ESCAPE '\') AND language = 'typescript'`

Unknown `@scope:` tokens throw `INVALID_SCOPE_FILTER` immediately.

### 2. Query embedding

The clean query is embedded with a single `emb.embed(cleanQuery)` call. If the clean query is empty (query was only filters), the original query is used instead so at least something is embedded.

### 3. Hybrid search

LanceDB runs vector search and BM25 full-text search simultaneously:

- **Vector search**: finds chunks whose stored `vector` fields are closest to the query vector (inner product / cosine distance in the embedding space). Good for semantic similarity — "authentication flow" finds code about "sign-in" even if the words differ.

- **BM25 full-text search**: finds chunks whose `text` field contains query terms, weighted by term frequency and document frequency. Good for exact identifiers — "handleStripeWebhook" reliably surfaces the function even if it's conceptually very different from the query.

LanceDB's `RRFReranker` fuses the two result lists using Reciprocal Rank Fusion:
```
RRF_score(item) = Σ 1/(k + rank_in_list)    where k=60
```
Items that rank well in both lists get combined scores and rise to the top. Items that only appear in one list still get a score based on their position in that list.

The over-fetch factor of 3× (`fetchLimit = safeLimit * 3`) ensures there are enough candidates for score filtering and MMR to work with before trimming to the requested `limit`.

### 4. Score normalization

After LanceDB returns results, scores are normalized:
```
normalizedScore[i] = rawScore[i] / max(rawScores)
```
The top result always gets score 1.0. All others get proportional scores. This makes `minScore = 0.2` mean "drop results below 20% of the best result's relevance" — a consistent threshold regardless of the absolute magnitude of raw scores, which varies per query.

If RRF `_relevance_score` is unavailable (some LanceDB configurations), positional fallback: `1 - i/(n-1)` for rank i out of n results.

### 5. Score threshold

Results with `score < minScore` are dropped. This removes clearly irrelevant results that happened to match some keywords or have a nearby vector.

### 6. MMR reranking

Maximal Marginal Relevance prevents result clustering. Without it, a search for "authentication" might return 8 chunks all from `src/auth/auth.ts`. MMR greedily selects results by balancing two objectives:

```
MMR_score(candidate) = λ × relevance - (1 - λ) × max_cosine_similarity_to_selected
```

- **First iteration**: selects the highest-relevance result (nothing selected yet, so similarity penalty is 0)
- **Subsequent iterations**: penalizes candidates that are similar to already-selected results

With λ=0.5 (default), relevance and diversity have equal weight. The result: you get the most relevant chunk, then the most relevant chunk from a different part of the codebase, and so on.

Cosine similarity in the `vector` space (not the text space) determines "too similar" — two chunks with nearly identical embedding vectors are likely about the same code concept.

### 7. Result formatting

The final results are formatted as structured plain text:

```
Found 3 results for "auth token validation @dir:src/auth":

1. src/auth/jwt.ts — validateToken (lines 15–42) [typescript, 100% match]
------------------------------------------------------------
export function validateToken(token: string): TokenPayload {
  ...
}
------------------------------------------------------------

2. src/auth/middleware.ts — authMiddleware (lines 8–31) [typescript, 73% match]
------------------------------------------------------------
...
```

The LLM reads this directly — no additional tool calls needed to see the code.

---

## Phase 10: Auto-Index

When `PI_INDEX_AUTO=true`, a `before_agent_start` event handler is registered. This hook fires before the LLM processes each user message.

The handler checks:
1. Is `isRunning` (local flag) true? → Skip this turn
2. Has the index never been built this session (`!isIndexed`)? → Run
3. Has enough time elapsed since the last run? (`intervalMs > 0 && elapsed > intervalMs`) → Run

If indexing should run, it starts fire-and-forget (not awaited). The agent starts immediately without waiting for the index. Progress notifications appear in the UI during background indexing.

The `isRunning` flag (local to the closure, not `indexer.isRunning`) prevents the same before_agent_start handler from triggering again before the current run finishes. If a separate `codebase_index` tool call is running when auto-index fires, `indexer.run()` throws `INDEX_ALREADY_RUNNING`, caught by `.catch()`, which resets the timestamp so the next session start retries sooner.

---

## The Dependency Graph

The 12 source files have a clean dependency order:

```
utils.ts          ← no dependencies
constants.ts      ← no dependencies (language map, batch sizes, thresholds)
config.ts         ← node:path, node:fs
mmr.ts            ← chunker.ts (ScoredChunk type)
chunker.ts        ← node:path, constants.ts
walker.ts         ← node:fs/promises, node:path
embeddings.ts     ← openai, constants.ts
db.ts             ← @lancedb/lancedb, chunker.ts, constants.ts
indexer.ts        ← config, db, embeddings, chunker, walker, constants.ts
searcher.ts       ← db, embeddings, config, mmr, constants.ts
tools.ts          ← indexer, searcher, db, config, walker, utils
index.ts          ← all of the above + pi ExtensionAPI
```

There are no circular dependencies. Every module except `index.ts` is independently testable without the pi extension API.

---

## Storage Layout

```
.pi/
└── index/
    ├── lancedb/              ← LanceDB database (vector + BM25 + scalar storage)
    │   ├── _latest_manifest.manifest
    │   ├── chunks.lance/
    │   │   └── ...           ← columnar data files (Apache Lance format)
    │   ├── text_idx/         ← FTS index (tantivy, always created)
    │   ├── filePath_idx/     ← BTREE scalar index (always created)
    │   ├── language_idx/     ← BTREE scalar index (always created)
    │   ├── extension_idx/    ← BTREE scalar index (always created)
    │   └── vector_idx/       ← IVF-PQ vector index (auto-created when >10K chunks)
    └── mtime-cache.json      ← plain JSON array of MtimeEntry
```

**Indexes:**
- `text_idx` — tantivy FTS index on the `text` column. Rebuilt after every indexing run.
- `filePath_idx`, `language_idx`, `extension_idx` — BTREE scalar indexes. Created on DB initialization, idempotent on reopen. Accelerate scope filter WHERE clauses.
- `vector_idx` — IVF-PQ approximate nearest-neighbor index. Only created when chunk count exceeds 10,000. Persists and is updated incrementally by `optimize()`.

Both `lancedb/` and `mtime-cache.json` should be added to `.gitignore` — they are derived build artifacts, not source.

---

## Error Handling Philosophy

1. **Extension startup never throws.** If config loading fails, stub tools are registered. The developer sees a clear error message when they call any tool, not a crash.

2. **Search errors are returned as strings.** The LLM receives `Error: [CODE] message` rather than an exception. The LLM can describe the error to the user and suggest next steps.

3. **Indexing errors are non-fatal per-file.** If embedding fails for 5 files, the other 295 files are indexed normally. The summary lists which files failed.

4. **DB errors retry.** `loadLanceDB` clears its promise on error so subsequent calls retry the import. `ensureInitialized` clears its promise on error so the next operation triggers a fresh init attempt.

5. **Mtime cache is never the source of truth.** If the cache and DB disagree, the next indexer run reconciles them. The cache's `chunkCount` is advisory — the actual count in the DB is authoritative.

---

## Key Numbers and Defaults

| Parameter | Default | Why |
|---|---|---|
| Max chunk lines | 80 | ~512 tokens for typical source code; balances context vs. granularity |
| Embed batch size | 20 chunks | OpenAI allows up to 2048 inputs per call; 20 is conservative |
| Embed concurrency | 3 batches | Avoids overwhelming the rate limit; empirically fast |
| Max retries (429) | 4 | 1s+2s+4s=7s max wait; 4th attempt fires then throws (no 8s delay) |
| Over-fetch factor | 3× | Ensures enough candidates for score filtering + MMR |
| MMR λ default | 0.5 | Equal weight: neither pure relevance nor pure diversity |
| Min score default | 0.2 | Filters noise; top result scores 1.0, so 0.2 = bottom 20% |
| Max file size | 500 KB | Large files are usually generated (build output, data files) |
| Auto-interval default | 0 | Once per session; users opt in to more frequent re-indexing |
| Vector index threshold | 10,000 chunks | Below this, brute-force scan is fast enough (~15ms on M1 for 10K vectors) |
| IVF-PQ numSubVectors | dim/16 | 96 for 1536-dim (text-embedding-3-small); balances compression vs. accuracy |
| IVF-PQ numPartitions | min(√n, 256) | Standard k-means heuristic, capped to avoid empty clusters |

---

## Comparison with OpenClaw's Memory System

pi-index was designed with OpenClaw's `memory-lancedb` extension as a reference. Key improvements:

| Feature | OpenClaw memory-lancedb | pi-index |
|---|---|---|
| Search type | Vector only | Hybrid (vector + BM25) |
| Reranking | None | MMR with configurable λ |
| Embedding | 1 text per API call | 20 texts per call (batched) |
| Score output | Raw distance | Normalized 0-1 per query |
| Chunking | No chunking | Structural boundaries, 80-line cap |
| Incremental | Full re-embed each time | mtime diff, skip unchanged |
| Scope filters | None | `@file`, `@dir`, `@ext`, `@lang` |
| .gitignore | N/A | Root + all subdirectories |
| Progress | Logger only | Throttled UI notifications |
| Storage | Global `~/.openclaw/memory/` | Project-local `.pi/index/` |
| Empty file handling | N/A | Cached with chunkCount=0, not re-attempted |
| Concurrent clear guard | N/A | `/index-clear` rejects if indexer is running |

The fundamental architecture is similar — LanceDB + OpenAI embeddings — but pi-index handles code-search use cases explicitly, where OpenClaw's memory system is designed for conversation memory.

---

## Limitations (Documented, Acceptable)

- **No custom extensions via env var.** Supported extensions are hardcoded in `indexer.ts` as `SUPPORTED_EXTENSIONS`. Adding a new extension requires a code change.
- **`codebase_index` progress UI now works via ctx bridge.** The `registerTool` handler in `index.ts` bridges `ctx.ui.notify` to the tool's `notify` parameter, so progress notifications fire for LLM-invoked `codebase_index` calls, `/index-rebuild`, and auto-index alike.
- **Chunk IDs are not stable across re-index.** If a file is modified and re-indexed, chunk indices may shift. Do not use chunk IDs as persistent external references.
- **`@file:login` (no extension) doesn't match `login.ts`.** The basename match requires the full filename including extension. Use `@file:login.ts`.
- **Negation patterns in `.gitignore` are skipped.** Lines starting with `!` are ignored with a warning.
- **H1 Markdown headings are always in the preamble.** Only H2 and H3 (`##`, `###`) trigger chunk boundaries.
