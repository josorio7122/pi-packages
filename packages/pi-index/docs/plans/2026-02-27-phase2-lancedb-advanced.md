# Phase 2: LanceDB Advanced Features — Detailed Sub-Plan

> **Parent plan:** `2026-02-27-pi-index-v2.md` (Tasks 6-9)
> **Scope:** Scalar indexes, table optimization, auto vector index. Task 8 (prefiltered search) dropped — already default behavior.
> **Branch:** `feature/pi-index-v2-phase2`
> **Worktree:** `.worktrees/feature/pi-index-v2-phase2`

---

## Testing Philosophy: Real LanceDB Everywhere

**No mocks on the persistence layer.** Every new test in Phase 2 runs against a real LanceDB instance in a tmpdir. The only fake is `Embeddings` — replaced with a deterministic function that returns predictable vectors (no OpenAI API calls).

For the indexer integration tests, we use:
- **Real `IndexDB`** — tmpdir-based LanceDB, full read/write
- **Fake `Embeddings`** — deterministic vectors based on input hash, no network
- **Real filesystem** — tmpdir with real `.ts` files
- **`vi.spyOn` on real objects** — wraps real methods to verify call ordering WITHOUT replacing them

This gives us both: **real end-to-end execution** (catches actual LanceDB bugs, schema issues) AND **ordering assertions** (optimize called after FTS rebuild).

### Fake Embeddings helper

Used by all indexer integration tests. Returns deterministic 4-dim vectors — no API key needed:

```typescript
import type { Embeddings } from "./embeddings.js";

/** Deterministic fake embeddings for integration tests. No network calls. */
function makeFakeEmb(dim = 4): Embeddings {
  return {
    async embed(texts: string | string[]): Promise<number[] | number[][]> {
      const toVec = (t: string): number[] => {
        // Simple deterministic hash → vector so different texts get different vectors
        let hash = 0;
        for (let i = 0; i < t.length; i++) hash = ((hash << 5) - hash + t.charCodeAt(i)) | 0;
        return Array.from({ length: dim }, (_, i) => Math.abs(Math.sin(hash + i)));
      };
      if (Array.isArray(texts)) return texts.map(toVec);
      return toVec(texts);
    },
  } as unknown as Embeddings;
}
```

### makeChunk helper update (db.test.ts)

Add language/extension auto-detection from file path and an overrides parameter:

```typescript
function makeChunk(
  filePath: string,
  chunkIndex: number,
  text: string,
  dim = 4,
  overrides: Partial<CodeChunk> = {},
): CodeChunk {
  const ext = filePath.match(/\.[^.]+$/)?.[0] ?? ".ts";
  const langMap: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".sql": "sql", ".md": "markdown", ".css": "css", ".html": "html",
  };
  return {
    id: `${filePath}:${chunkIndex}`,
    text,
    vector: Array.from({ length: dim }, (_, i) => (i === chunkIndex % dim ? 1 : 0.1)),
    filePath,
    chunkIndex,
    startLine: chunkIndex * 10 + 1,
    endLine: chunkIndex * 10 + 10,
    language: langMap[ext] ?? "text",
    extension: ext,
    symbol: `fn${chunkIndex}`,
    mtime: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}
```

Backward compatible — existing calls like `makeChunk("src/a.ts", 0, "content")` still produce `language: "typescript"`, `extension: ".ts"`.

---

## Verified LanceDB v0.26.2 API Facts

Confirmed by running live integration tests against the actual SDK:

| API | Behavior |
|-----|----------|
| `Index.btree()` | Creates `${column}_idx` named BTree index |
| `createIndex(col, { config: Index.btree() })` | Default `replace: true` — idempotent, 4ms on re-create |
| Scalar index on empty table | ✅ Works (after schema row deleted) |
| Scalar indexes survive reopen | ✅ Persist across connections |
| `table.optimize()` | Returns `OptimizeStats { compaction, prune }`. No-op on fresh table is cheap (returns zeros) |
| `table.listIndices()` | Returns `IndexConfig[] { name, indexType, columns }` |
| `vectorSearch().where(filter)` | **Prefilters by default** — no explicit API call needed |
| `query().nearestToText().nearestTo().rerank().where()` | Hybrid search + filter works correctly with scalar indexes |
| `Index.ivfPq({ numPartitions, numSubVectors, distanceType })` | Creates `vector_idx`. Needs 256+ rows. Warns below 512 |
| `postfilter()` | Exists on `VectorQuery`, opts OUT of prefiltering. Not needed for our use case |

---

## Task 6: BTREE Scalar Indexes on Metadata Columns

### Goal
Create BTREE scalar indexes on `filePath`, `language`, and `extension` columns so that scope filters (`@file:`, `@dir:`, `@lang:`, `@ext:`) use indexed lookups instead of full column scans.

### Design Decisions

1. **Where:** In `doInitialize()`, AFTER the table exists (both `createTable` and `openTable` paths).
2. **Idempotency:** Use default `replace: true` — calling `createIndex` on an already-indexed column costs 4ms and is a no-op rebuild. No need to check `listIndices()` first.
3. **Failure mode:** Best-effort with `console.warn`. If scalar index creation fails, queries still work — just slower (full scan).
4. **New public method:** `listIndexes(): Promise<string[]>` — thin wrapper around `table.listIndices()`. Needed for testing and future diagnostics.

### Files Changed

| File | Change |
|------|--------|
| `extensions/index/db.ts` | Add scalar index creation in `doInitialize()`. Add `listIndexes()` method. |
| `extensions/index/db.test.ts` | Update `makeChunk` helper. Add 4 integration tests (real LanceDB, no mocks). |

### Tests — All Real LanceDB (TDD: write first, all must fail before implementation)

#### Test 1: `creates scalar indexes on new table initialization`

```typescript
it("creates scalar indexes on new table initialization", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.count(); // trigger initialization
  const indexes = await db.listIndexes();
  expect(indexes).toContain("filePath_idx");
  expect(indexes).toContain("language_idx");
  expect(indexes).toContain("extension_idx");
}, 30_000);
```

**Why it fails:** `listIndexes()` doesn't exist. `doInitialize()` doesn't create scalar indexes.

#### Test 2: `scalar indexes survive table reopen`

```typescript
it("scalar indexes survive table reopen", async () => {
  const dbPath = join(tmpDir, "lancedb");
  const db1 = new IndexDB(dbPath, 4);
  await db1.insertChunks([makeChunk("src/a.ts", 0, "hello")]);

  // Reopen same DB path — triggers openTable path in doInitialize
  const db2 = new IndexDB(dbPath, 4);
  await db2.count();
  const indexes = await db2.listIndexes();
  expect(indexes).toContain("filePath_idx");
  expect(indexes).toContain("language_idx");
  expect(indexes).toContain("extension_idx");
}, 30_000);
```

**Why it fails:** Same.

#### Test 3: `vectorSearch with filter works correctly after scalar indexing`

```typescript
it("vectorSearch with filter returns only matching rows after scalar indexing", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.insertChunks([
    makeChunk("src/auth.py", 0, "def login(): pass"),
    makeChunk("src/app.ts", 1, "export function app() {}"),
  ]);
  const results = await db.vectorSearch([1, 0, 0, 0], 10, "language = 'python'");
  expect(results.length).toBe(1);
  expect(results[0].filePath).toBe("src/auth.py");
}, 30_000);
```

**Why it fails before `makeChunk` update:** Current `makeChunk` hardcodes `language: "typescript"` for all files. After the helper update, `.py` files get `language: "python"`. This test is also a regression guard — if scalar index creation breaks the table, this catches it.

#### Test 4: `hybridSearch with filter works correctly after scalar indexing`

```typescript
it("hybridSearch with filter works correctly after scalar indexing", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.insertChunks([
    makeChunk("src/auth.py", 0, "authentication login handler"),
    makeChunk("src/auth.ts", 1, "authentication middleware"),
    makeChunk("src/pay.ts", 2, "payment processing"),
  ]);
  const results = await db.hybridSearch(
    [1, 0, 0, 0], "authentication", 10, "extension = '.py'"
  );
  expect(results.length).toBe(1);
  expect(results[0].filePath).toBe("src/auth.py");
}, 30_000);
```

**Why it fails before `makeChunk` update:** Same reason — `.py` gets `extension: ".ts"` today.

### Implementation

In `db.ts`, add to `doInitialize()` — AFTER the FTS index block (for both new table AND existing table paths):

```typescript
// Create BTREE scalar indexes for scope-filter acceleration.
// Idempotent: LanceDB's default replace:true silently rebuilds if index exists (~4ms).
// Best-effort: queries degrade to full scan if index creation fails.
try {
  await this.table!.createIndex("filePath", { config: lancedb.Index.btree() });
  await this.table!.createIndex("language", { config: lancedb.Index.btree() });
  await this.table!.createIndex("extension", { config: lancedb.Index.btree() });
} catch (err) {
  console.warn("[pi-index] scalar index creation skipped:", String(err));
}
```

**Placement:** The scalar index block goes AFTER the existing FTS index try/catch, and OUTSIDE the `if (!tables.includes(TABLE_NAME))` conditional — it must run on both the `createTable` (new DB) AND `openTable` (existing DB) paths.

Add new public method:

```typescript
async listIndexes(): Promise<string[]> {
  await this.ensureInitialized();
  const indices = await this.table!.listIndices();
  return indices.map((i) => i.name);
}
```

### Commit

```
feat: add BTREE scalar indexes on filePath, language, extension columns
```

---

## Task 7: Table Optimization / Compaction After Indexing

### Goal
After bulk insert/delete during indexing, call `table.optimize()` to compact fragmented data files and update indexes for better query performance.

### Design Decisions

1. **Where in the indexer flow:** After `rebuildFtsIndex()`, before the summary is computed. Compacts fragments from per-file delete+insert cycles.
2. **Condition:** Only when `toProcess.length > 0 || diff.toDelete.length > 0`. Skip on no-change runs.
3. **Failure mode:** Best-effort with `console.warn`. Data is correct even without compaction.
4. **No options passed:** Use LanceDB defaults.

### Files Changed

| File | Change |
|------|--------|
| `extensions/index/db.ts` | Add `optimize()` method. |
| `extensions/index/db.test.ts` | Add 3 integration tests (real LanceDB). |
| `extensions/index/indexer.ts` | Call `db.optimize()` after `rebuildFtsIndex()`. |
| `extensions/index/indexer.test.ts` | Add `optimize` to mock `makeDb()`. Add 3 integration tests (real IndexDB + fake embeddings + spies). |

### Tests — db.test.ts (Real LanceDB)

#### Test 1: `optimize() compacts fragments after multiple inserts`

```typescript
it("optimize() compacts fragments after multiple inserts", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  // Multiple separate inserts create separate data fragments
  await db.insertChunks([makeChunk("src/a.ts", 0, "content a")]);
  await db.insertChunks([makeChunk("src/b.ts", 0, "content b")]);
  await db.insertChunks([makeChunk("src/c.ts", 0, "content c")]);
  const stats = await db.optimize();
  expect(stats).toBeDefined();
  expect(stats.compaction).toBeDefined();
  // Data must survive compaction
  expect(await db.count()).toBe(3);
}, 30_000);
```

**Why it fails:** `optimize()` doesn't exist on `IndexDB`.

#### Test 2: `optimize() is safe on empty table`

```typescript
it("optimize() is safe on empty table", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.count(); // trigger init
  const stats = await db.optimize();
  expect(stats).toBeDefined();
}, 30_000);
```

#### Test 3: `optimize() preserves scalar indexes`

```typescript
it("optimize() preserves scalar indexes", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.insertChunks([makeChunk("src/a.ts", 0, "content")]);
  await db.optimize();
  const indexes = await db.listIndexes();
  expect(indexes).toContain("filePath_idx");
  expect(indexes).toContain("language_idx");
  expect(indexes).toContain("extension_idx");
}, 30_000);
```

**Depends on:** Task 6's `listIndexes()` and scalar indexes.

### Tests — indexer.test.ts (Real IndexDB + Fake Embeddings + Spies)

These tests use a **real `IndexDB`**, a **fake `Embeddings`** (deterministic vectors), and **`vi.spyOn`** on the real db to verify call ordering without replacing real behavior.

#### Setup helper

```typescript
function makeFakeEmb(dim = 4): Embeddings {
  return {
    async embed(texts: string | string[]): Promise<number[] | number[][]> {
      const toVec = (t: string): number[] => {
        let hash = 0;
        for (let i = 0; i < t.length; i++) hash = ((hash << 5) - hash + t.charCodeAt(i)) | 0;
        return Array.from({ length: dim }, (_, i) => Math.abs(Math.sin(hash + i)));
      };
      if (Array.isArray(texts)) return texts.map(toVec);
      return toVec(texts);
    },
  } as unknown as Embeddings;
}
```

#### Test 4: `indexer calls optimize() after rebuildFtsIndex when files are processed`

```typescript
it("indexer calls optimize() after rebuildFtsIndex when files are processed", async () => {
  writeFileSync(join(tmpDir, "hello.ts"), "export function hello() {}");
  const dbPath = join(tmpDir, "lancedb");
  const db = new IndexDB(dbPath, 4);
  const optimizeSpy = vi.spyOn(db, "optimize");
  const ftsSpy = vi.spyOn(db, "rebuildFtsIndex");

  const indexer = new Indexer(makeConfig(), db, makeFakeEmb());
  await indexer.run();

  // Both must have been called (real execution, not mocked)
  expect(optimizeSpy).toHaveBeenCalledOnce();
  expect(ftsSpy).toHaveBeenCalledOnce();
  // optimize must come AFTER rebuildFtsIndex
  expect(optimizeSpy.mock.invocationCallOrder[0])
    .toBeGreaterThan(ftsSpy.mock.invocationCallOrder[0]);
  // Data must be intact
  expect(await db.count()).toBeGreaterThan(0);
}, 30_000);
```

**Why it fails:** `optimize()` method doesn't exist, indexer doesn't call it.

#### Test 5: `indexer does NOT call optimize() when no files changed`

```typescript
it("indexer does NOT call optimize() when no files changed", async () => {
  writeFileSync(join(tmpDir, "stable.ts"), "export const x = 1;");
  const dbPath = join(tmpDir, "lancedb");
  const db = new IndexDB(dbPath, 4);
  const indexer = new Indexer(makeConfig(), db, makeFakeEmb());
  await indexer.run(); // first run indexes the file

  const optimizeSpy = vi.spyOn(db, "optimize");
  await indexer.run(); // second run: no changes
  expect(optimizeSpy).not.toHaveBeenCalled();
}, 30_000);
```

#### Test 6: `indexer calls optimize() on delete-only run`

```typescript
it("indexer calls optimize() on delete-only run", async () => {
  const filePath = join(tmpDir, "del.ts");
  writeFileSync(filePath, "export const x = 1;");
  const dbPath = join(tmpDir, "lancedb");
  const db = new IndexDB(dbPath, 4);
  const indexer = new Indexer(makeConfig(), db, makeFakeEmb());
  await indexer.run(); // first run indexes

  rmSync(filePath); // remove file
  const optimizeSpy = vi.spyOn(db, "optimize");
  await indexer.run(); // delete-only run
  expect(optimizeSpy).toHaveBeenCalledOnce();
}, 30_000);
```

### Mock db update (for existing mock-based tests)

The existing `makeDb()` in `indexer.test.ts` must gain `optimize` so existing tests that call `indexer.run()` don't fail when the implementation starts calling `db.optimize()`:

```typescript
optimize: vi.fn().mockResolvedValue({
  compaction: { fragmentsRemoved: 0, fragmentsAdded: 0, filesRemoved: 0, filesAdded: 0 },
  prune: { bytesRemoved: 0, oldVersionsRemoved: 0 },
}),
```

Similarly, add `optimize` to mocks in `searcher.test.ts`, `tools.test.ts`, and `index.test.ts` — **defensively** (they use `as unknown as IndexDB`, so they won't fail today, but it's good hygiene for when the cast is eventually removed).

### Implementation

In `db.ts`:

```typescript
/**
 * Compact table fragments and update indexes for optimal query performance.
 *
 * LanceDB fragments data on repeated inserts and deletes. This method merges small
 * fragments into larger files and prunes old versions. Safe to call frequently —
 * returns immediately when nothing needs compacting.
 *
 * @returns Optimization statistics (compaction and prune details)
 */
async optimize(): Promise<{ compaction: Record<string, number>; prune: Record<string, number> }> {
  await this.ensureInitialized();
  try {
    return await this.table!.optimize();
  } catch (err) {
    console.warn("[pi-index] table optimization skipped:", String(err));
    return {
      compaction: { fragmentsRemoved: 0, fragmentsAdded: 0, filesRemoved: 0, filesAdded: 0 },
      prune: { bytesRemoved: 0, oldVersionsRemoved: 0 },
    };
  }
}
```

In `indexer.ts`, after the `rebuildFtsIndex` block (~line 140):

```typescript
// Compact table fragments after bulk operations (inserts + deletes)
if (toProcess.length > 0 || diff.toDelete.length > 0) {
  await this.db.optimize();
}
```

### Commit

```
feat: add table optimization/compaction after indexing
```

---

## Task 9: Auto-Create IVF-PQ Vector Index for Large Codebases

### Goal
Automatically create an IVF-PQ vector index when the chunk count exceeds a threshold, speeding up vector search from brute-force O(n) to approximate O(√n).

### Design Decisions

1. **Threshold:** 10,000 chunks. Brute-force on 10K 1536-dim vectors is ~15ms — fast enough. Index helps above 10K.
2. **numSubVectors:** Dynamic — `Math.floor(vectorDim / 16)`. For 1536-dim (OpenAI): 96. For 768-dim (Voyage): 48.
3. **numPartitions:** `Math.min(Math.ceil(Math.sqrt(count)), 256)`. Standard heuristic, capped.
4. **distanceType:** `"cosine"` — matches LanceDB's default vector search.
5. **Idempotency:** Check `listIndices()` first — only create if `vector_idx` doesn't exist. Avoids expensive re-training.
6. **Failure mode:** Best-effort with `console.warn`. Search falls back to brute-force.
7. **When called:** After `optimize()` in indexer. Only when `totalChunks >= threshold` AND no existing vector index.

### Files Changed

| File | Change |
|------|--------|
| `extensions/index/constants.ts` | Add `VECTOR_INDEX_THRESHOLD = 10_000`. |
| `extensions/index/db.ts` | Add `createVectorIndexIfNeeded()` method. |
| `extensions/index/db.test.ts` | Add 4 integration tests (real LanceDB). |
| `extensions/index/indexer.ts` | Call `db.createVectorIndexIfNeeded()` after `optimize()`. |
| `extensions/index/indexer.test.ts` | Add `createVectorIndexIfNeeded` to mock `makeDb()`. Add 2 integration tests (real IndexDB + fake embeddings + spies). |

### Tests — db.test.ts (Real LanceDB)

IVF-PQ needs 256+ rows to train. Tests that verify index creation use dim=8 and 300+ rows.

#### Test 1: `createVectorIndexIfNeeded creates IVF-PQ when count >= threshold`

```typescript
it("createVectorIndexIfNeeded creates IVF-PQ index when count exceeds threshold", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 8);
  const chunks = Array.from({ length: 300 }, (_, i) =>
    makeChunk(`src/f${i}.ts`, 0, `content ${i}`, 8),
  );
  await db.insertChunks(chunks);
  await db.createVectorIndexIfNeeded(256); // low threshold for testing
  const indexes = await db.listIndexes();
  expect(indexes).toContain("vector_idx");
}, 60_000);
```

**Why it fails:** `createVectorIndexIfNeeded()` doesn't exist.

#### Test 2: `createVectorIndexIfNeeded skips when count < threshold`

```typescript
it("createVectorIndexIfNeeded skips when count is below threshold", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 4);
  await db.insertChunks([makeChunk("src/a.ts", 0, "hello")]);
  await db.createVectorIndexIfNeeded(10_000);
  const indexes = await db.listIndexes();
  expect(indexes).not.toContain("vector_idx");
}, 30_000);
```

#### Test 3: `createVectorIndexIfNeeded skips when vector index already exists`

```typescript
it("createVectorIndexIfNeeded skips when vector_idx already exists", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 8);
  const chunks = Array.from({ length: 300 }, (_, i) =>
    makeChunk(`src/f${i}.ts`, 0, `content ${i}`, 8),
  );
  await db.insertChunks(chunks);
  await db.createVectorIndexIfNeeded(256); // first call: creates index
  const indexes = await db.listIndexes();
  expect(indexes).toContain("vector_idx");
  // Second call: should skip (nearly instant — no re-training)
  const start = Date.now();
  await db.createVectorIndexIfNeeded(256);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(100); // re-training 300 vectors takes >100ms
}, 60_000);
```

#### Test 4: `vectorSearch returns correct results after IVF-PQ index`

```typescript
it("vectorSearch returns correct results after IVF-PQ index", async () => {
  const db = new IndexDB(join(tmpDir, "lancedb"), 8);
  const chunks = Array.from({ length: 300 }, (_, i) => {
    const vec = Array.from({ length: 8 }, () => 0.1);
    vec[i % 8] = 1.0; // make each vector point in a different direction
    return { ...makeChunk(`src/f${i}.ts`, 0, `content ${i}`, 8), vector: vec };
  });
  await db.insertChunks(chunks);
  await db.createVectorIndexIfNeeded(256);
  const queryVec = [...chunks[0].vector];
  const results = await db.vectorSearch(queryVec, 5);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].filePath).toBe("src/f0.ts");
}, 60_000);
```

### Tests — indexer.test.ts (Real IndexDB + Fake Embeddings + Spies)

#### Test 5: `indexer calls createVectorIndexIfNeeded after optimize`

```typescript
it("indexer calls createVectorIndexIfNeeded after optimize", async () => {
  writeFileSync(join(tmpDir, "new.ts"), "export const x = 1;");
  const dbPath = join(tmpDir, "lancedb");
  const db = new IndexDB(dbPath, 4);
  const optimizeSpy = vi.spyOn(db, "optimize");
  const vectorIdxSpy = vi.spyOn(db, "createVectorIndexIfNeeded");

  const indexer = new Indexer(makeConfig(), db, makeFakeEmb());
  await indexer.run();

  expect(vectorIdxSpy).toHaveBeenCalledOnce();
  // Must be called AFTER optimize
  expect(vectorIdxSpy.mock.invocationCallOrder[0])
    .toBeGreaterThan(optimizeSpy.mock.invocationCallOrder[0]);
}, 30_000);
```

**Why it fails:** `createVectorIndexIfNeeded()` doesn't exist, indexer doesn't call it.

#### Test 6: `indexer does NOT call createVectorIndexIfNeeded when no files changed`

```typescript
it("indexer does NOT call createVectorIndexIfNeeded when no files changed", async () => {
  writeFileSync(join(tmpDir, "stable.ts"), "export const x = 1;");
  const dbPath = join(tmpDir, "lancedb");
  const db = new IndexDB(dbPath, 4);
  const indexer = new Indexer(makeConfig(), db, makeFakeEmb());
  await indexer.run(); // first run

  const vectorIdxSpy = vi.spyOn(db, "createVectorIndexIfNeeded");
  await indexer.run(); // second run: no changes
  expect(vectorIdxSpy).not.toHaveBeenCalled();
}, 30_000);
```

### Mock db update (for existing mock-based tests)

Add to `makeDb()` in `indexer.test.ts`:

```typescript
createVectorIndexIfNeeded: vi.fn().mockResolvedValue(undefined),
```

Also add defensively to mocks in `searcher.test.ts`, `tools.test.ts`, `index.test.ts`.

### Implementation

In `constants.ts`:

```typescript
/** Minimum chunk count before creating an IVF-PQ vector index. Below this, brute-force scan is fast enough. */
export const VECTOR_INDEX_THRESHOLD = 10_000;
```

In `db.ts`:

```typescript
/**
 * Create an IVF-PQ vector index if the table has enough rows and no vector index exists yet.
 *
 * Below the threshold, brute-force scan is faster than maintaining an index.
 * Skips if `vector_idx` already exists to avoid expensive re-training.
 *
 * @param threshold - Minimum row count to trigger index creation (default: `VECTOR_INDEX_THRESHOLD`)
 */
async createVectorIndexIfNeeded(threshold?: number): Promise<void> {
  await this.ensureInitialized();
  const lancedb = await loadLanceDB();
  const count = await this.count();
  const effectiveThreshold = threshold ?? VECTOR_INDEX_THRESHOLD;
  if (count < effectiveThreshold) return;

  // Skip if vector index already exists — avoid expensive re-training
  const indices = await this.table!.listIndices();
  if (indices.some((i) => i.name === "vector_idx")) return;

  try {
    const numPartitions = Math.min(Math.ceil(Math.sqrt(count)), 256);
    const numSubVectors = Math.floor(this.vectorDim / 16) || Math.floor(this.vectorDim / 8) || 1;
    await this.table!.createIndex("vector", {
      config: lancedb.Index.ivfPq({
        numPartitions,
        numSubVectors,
        distanceType: "cosine",
      }),
    });
  } catch (err) {
    console.warn("[pi-index] vector index creation skipped:", String(err));
  }
}
```

In `indexer.ts`, after the `optimize()` block:

```typescript
// Create vector index for large codebases (skips if below threshold or already exists)
if (toProcess.length > 0 || diff.toDelete.length > 0) {
  await this.db.createVectorIndexIfNeeded();
}
```

### Commit

```
feat: auto-create IVF-PQ vector index for large codebases (>10K chunks)
```

---

## Execution Order

Sequential — each builds on the previous:

```
Task 6 (scalar indexes + listIndexes) → Task 7 (optimize) → Task 9 (vector index)
```

**Why sequential:**
- Task 7's "optimize preserves scalar indexes" test depends on Task 6.
- Task 9 is called after `optimize()` in the indexer, and its indexer tests verify ordering relative to optimize.

### Per-task checklist

For each task:
1. Write all failing tests first (both db.test.ts and indexer.test.ts)
2. Run tests — confirm NEW tests fail, ALL existing 274 tests still pass
3. Implement the minimum code to pass
4. Run full test suite — all tests green
5. Run `tsc --noEmit` — no type errors
6. Commit

### Mock db stubs needed (cumulative, for existing mock-based tests)

**`indexer.test.ts` `makeDb()`** — add:
```typescript
optimize: vi.fn().mockResolvedValue({ compaction: {}, prune: {} }),
createVectorIndexIfNeeded: vi.fn().mockResolvedValue(undefined),
```

**`searcher.test.ts` `makeDb()`** — add:
```typescript
optimize: vi.fn(),
createVectorIndexIfNeeded: vi.fn(),
rebuildFtsIndex: vi.fn(),
listIndexes: vi.fn().mockResolvedValue([]),
```

**`tools.test.ts` `makeDb()`** — add:
```typescript
optimize: vi.fn(),
createVectorIndexIfNeeded: vi.fn(),
```

**`index.test.ts` `vi.mock("./db.js")`** — add:
```typescript
this.optimize = vi.fn().mockResolvedValue({ compaction: {}, prune: {} });
this.createVectorIndexIfNeeded = vi.fn().mockResolvedValue(undefined);
this.rebuildFtsIndex = vi.fn().mockResolvedValue(undefined);
this.listIndexes = vi.fn().mockResolvedValue([]);
```

### Documentation updates (after all 3 tasks)

- `CHANGELOG.md` — entries under `[Unreleased]`
- `docs/HOW-IT-WORKS.md` — section on scalar indexes, compaction, auto vector index
- `docs/spec/DATA-MODEL.md` — note the index schema

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scalar index creation fails on future LanceDB | Low | Low | try/catch, degrades to full scan |
| `optimize()` corrupts data | Very Low | High | Integration test verifies count after optimize |
| IVF-PQ training slow on large datasets | Medium | Medium | 10K threshold; most users never hit it |
| IVF-PQ degrades search accuracy | Low | Medium | Integration test verifies correct results after index |
| Integration tests slower than mock tests | Certain | Low | Each ~200-500ms; total phase adds ~5s to test suite |
| `numSubVectors` wrong for unusual dims | Low | Low | Fallback chain: dim/16 → dim/8 → 1 |

---

## What Was Dropped (and Why)

**Task 8: Prefiltered search** — Dropped because:
1. LanceDB v0.26.2 **already prefilters by default**.
2. Hybrid search path also prefilters correctly.
3. Task 6's scalar indexes make existing prefiltering faster.
4. Adding `{ prefilter?: boolean }` would be YAGNI.
