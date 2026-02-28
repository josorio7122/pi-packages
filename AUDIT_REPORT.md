# PI-INDEX DEEP AUDIT REPORT
## Core Modules: Config, Embeddings, Chunker, Walker, MMR

---

## 1. CONFIG MODULE
**File:** `packages/pi-index/extensions/index/config.ts` + tests

### Environment Variables & Defaults

**Variables Read:**
- `PI_INDEX_API_KEY` (preferred over OPENAI_API_KEY)
- `OPENAI_API_KEY` (fallback)
- `PI_INDEX_MODEL`
- `PI_INDEX_DB_PATH`
- `PI_INDEX_DIRS` (comma-separated)
- `PI_INDEX_AUTO` (must be "true" string)
- `PI_INDEX_MAX_FILE_KB`
- `PI_INDEX_MIN_SCORE`

**Defaults:**
```
model:             "text-embedding-3-small"
dimensions:        1536 (auto-derived from model)
maxFileKB:         500
minScore:          0.2
dbPath:            "{indexRoot}/.pi/index/lancedb" (relative, resolved)
mtimeCachePath:    "{indexRoot}/.pi/index/mtime-cache.json" (always relative to indexRoot)
indexDirs:         [indexRoot] (if not specified)
autoIndex:         false
```

### Config Merging & Precedence

**⚠️ CRITICAL FINDING:** No `pi.config.json` support!
- `loadConfig()` reads ONLY environment variables
- No JSON config file is loaded or merged
- All configuration is env-based
- This is intentional but worth documenting

**Precedence (env vars win):**
```
process.env.PI_INDEX_API_KEY > process.env.OPENAI_API_KEY (no pi.config.json)
process.env.PI_INDEX_MODEL > default
```

### Validation

✅ **All validations present and correct:**
- `apiKey`: required, must be non-empty string
- `model`: validated against known models (throws for unknown)
- `maxFileKB`: must be > 0
- `minScore`: must be in range [0.0, 1.0]
- Errors have descriptive messages

**Error Examples:**
```
"CONFIG_MISSING_API_KEY: Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index."
"Unsupported embedding model: {model}"
"maxFileKB must be greater than 0"
"minScore must be between 0.0 and 1.0"
```

### Path Resolution

✅ **Correctly handles relative vs absolute:**
```typescript
resolveDbPath(dbPath, indexRoot): string {
  if (dbPath.startsWith("/")) return dbPath;  // absolute → return as-is
  return resolve(indexRoot, dbPath);           // relative → resolve against indexRoot
}
```

Tests confirm:
- Absolute paths (`/abs/path/lancedb`) returned unchanged
- Relative paths (`.pi/index/lancedb`) resolved against indexRoot

### Issues & Concerns

✅ **No issues found.** Config module is solid:
- Clear validation logic
- Correct path handling
- Well-tested (all cases covered)
- Sensible defaults
- Env var precedence is documented

**Note:** Missing pi.config.json is not a bug if it's by design, but should be documented in README.

---

## 2. EMBEDDINGS MODULE
**File:** `packages/pi-index/extensions/index/embeddings.ts` + tests

### Model & Dimensions

- **Default model:** Passed via config (default "text-embedding-3-small")
- **Dimensions:** 1536 for small, 3072 for large
- Not hardcoded in embeddings.ts; sourced from config module

### encoding_format: 'float'

✅ **YES, correctly set:**
```typescript
const response = await this.client.embeddings.create({
  model: this.model,
  input: text,
  encoding_format: "float",  // ← explicitly set
});
```

**Why this matters for OpenAI 6.x:**
- Comment states: "ensure plain number[] (openai 6.x defaults to base64 internally)"
- OpenAI SDK v6.x changed default to base64 encoding for efficiency
- Setting `encoding_format: "float"` forces plain number array format
- Without this, would get base64-encoded strings that need decoding

### Enrichment Before Embedding

❌ **NO enrichment applied:**
- Raw text only is embedded
- No metadata prepended (File: path, Symbol, Language, etc.)
- No semantic context added

**Concern:** 
- Embeddings lack semantic signal about code structure
- Example: two files with identical function logic but different names produce identical embeddings
- Could lose signal about file context, symbol names, language
- Consider adding lightweight prefix: `"# {language}\n# Symbol: {symbol}\n\n{text}"`

### Retry & Error Handling

❌ **NO error handling or retries:**
```typescript
async embed(text: string): Promise<number[]> {
  const response = await this.client.embeddings.create({...});
  return response.data[0].embedding;  // ← direct return, no try/catch
}
```

**Issues:**
- No timeout handling
- No rate-limit backoff
- No validation of response (what if `data[0]` is undefined?)
- Network errors propagate directly to caller
- Callers must implement their own retry logic

**Recommendation:**
- Add try/catch with logging
- Consider exponential backoff for rate limits
- Validate response structure before accessing `data[0]`
- Consider memoization for identical text inputs

### Test Coverage

✅ Tests verify:
- Correct embedding extraction from API response
- Model and input parameters passed correctly
- `encoding_format: "float"` is set
- Mock-based (no live API calls)

### Issues & Concerns

⚠️ **Moderate severity:**
1. **No enrichment** — embeddings lack semantic context
2. **No error handling** — will crash on API failures
3. **No validation** — assumes response.data[0] exists
4. **No retry logic** — rate limits will fail immediately

---

## 3. CHUNKER MODULE
**File:** `packages/pi-index/extensions/index/chunker.ts` + tests

### Language Detection

✅ **Via file extension, maps correctly:**
```
.ts/.tsx/.d.ts     → typescript
.js/.jsx           → javascript
.py                → python
.sql               → sql
.md                → markdown
.css               → css
.html              → html
.txt               → text
(unknown)          → text (safe default)
```

Special handling for `.d.ts`:
```typescript
if (base.endsWith(".d.ts")) return ".d.ts";  // ← correct!
return extname(base);  // would return ".ts" without the check
```

### Boundary Patterns Per Language

**TypeScript/JavaScript:**
```
export function {name}
export abstract class {name}
export const {name} = (...)
function {name}                    (non-exported)
abstract class {name}              (non-exported)
class {name}                       (non-exported)
```

**Python:**
```
def {name}
async def {name}
class {name}
```

**SQL:**
```
CREATE|ALTER|DROP|INSERT|UPDATE|DELETE
(extracts first 3 words as symbol)
```

**Markdown:**
```
## {header text}
### {header text}
(h2 and h3 only, not h1)
```

**CSS:**
```
.class {...}
#id {...}
[attr] {...}
selector {...}
(extracts selector name)
```

### 80-Line Hard Cap

✅ **Enforced correctly:**
```
const MAX_CHUNK_LINES = 80;

// Algorithm:
1. Find all structural boundaries (functions, classes, etc.)
2. Create ranges from boundary to boundary
3. If any range > 80 lines, split it into 80-line windows
4. If no boundaries found, split content into 80-line windows
```

**Tests confirm:**
```
✅ No chunk exceeds 80 lines
✅ All lines covered with no gaps
✅ No overlapping chunks
```

### .d.ts Handling

✅ **Correctly handled:**
- Special case in `getExtension(filePath)` function
- Maps `.d.ts` → typescript language
- Would not work if relying only on `extname()` (would give `.ts`)

### Chunk ID Format

✅ **Correct format:** `{filePath}:{chunkIndex}`
- Example: `"src/auth/login.ts:0"`, `"src/auth/login.ts:1"`, etc.
- Sequential, zero-indexed

### CodeChunk Type

```typescript
type CodeChunk = {
  id:        string;      // "{filePath}:{chunkIndex}"
  text:      string;      // chunk content
  vector:    number[];    // empty at chunk time, filled by embedder
  filePath:  string;      // original file path
  chunkIndex: number;     // 0-based, sequential
  startLine: number;      // 1-based, inclusive
  endLine:   number;      // 1-based, inclusive
  language:  string;      // detected language
  extension: string;      // file extension
  symbol:    string;      // extracted function/class name, or ""
  mtime:     number;      // file modification time (ms)
  createdAt: number;      // chunk creation time (ms)
};
```

### Edge Cases & Production Concerns

✅ **All handled correctly:**
1. Empty content → returns []
2. Content without boundaries → splits by 80-line windows
3. No line coverage gaps → every line in exactly one chunk
4. startLine/endLine are 1-based → correct (not 0-based)
5. Symbol extraction → works for functions, classes, Python defs
6. .d.ts files → correctly detected as TypeScript

**Potential concerns:**
⚠️ **Symbol extraction regex robustness**
- Patterns are somewhat lenient (e.g., `function\s+(\w+)` allows extra whitespace)
- HTML/CSS regexes may have false positives (e.g., CSS selector regex is very broad)
- For CSS: `/^[.#a-zA-Z:[]\w][^{]*\{/` — could match invalid selectors
- Recommendation: Test with edge cases (nested structures, unusual syntax)

### Issues & Concerns

⚠️ **Minor:**
1. CSS selector regex may be overly broad — test with edge cases
2. No validation that `symbol` extraction succeeded (could be empty string)
3. Symbol name extraction could fail silently (returns empty string)

✅ **No major issues.** Chunker is well-designed and tested.

---

## 4. WALKER MODULE
**File:** `packages/pi-index/extensions/index/walker.ts` + tests

### Supported File Extensions

❌ **NOT hardcoded in walker:**
- Extensions passed as parameter: `supportedExtensions: string[]`
- Walker is agnostic to which extensions to include
- Must be configured elsewhere (likely in main index module)

### Mtime Caching

✅ **Correctly implemented:**

**Stored in `MtimeEntry`:**
```typescript
type MtimeEntry = {
  filePath: string;     // relative path (key in cache)
  mtime: number;        // file modification time in ms
  chunkCount: number;   // number of chunks this file produced
  indexedAt: number;    // timestamp when indexed
};
```

**Cache structure:** `Map<relativePath, MtimeEntry>`

**Usage:**
- Stored as JSON in `{indexRoot}/.pi/index/mtime-cache.json`
- Loaded on startup
- Used in `diffFileSet()` to detect changed files
- Comparison: `if (file.mtime !== cached.mtime) → toUpdate`

### Atomic Writes

✅ **YES, correctly atomic:**
```typescript
const tmp = cachePath + ".tmp";
await writeFile(tmp, json, "utf-8");
await rename(tmp, cachePath);  // atomic on POSIX
```

**Why safe:**
- Writes to temporary file first
- `rename()` is atomic on POSIX systems (Linux, macOS)
- If process crashes during write, old cache remains intact
- If rename fails, tmp file is left behind (could clean up)

**Note:** On Windows, `rename()` may not be atomic if destination exists. But comment only claims POSIX, so OK.

### diffFileSet Return

✅ **Correctly classifies files:**
```typescript
type FileDiff = {
  toAdd: FileRecord[];     // in current, absent from cache
  toUpdate: FileRecord[];  // in current and cache, but mtime differs
  toDelete: string[];      // in cache, absent from current
};
```

**Logic:**
- Files with matching mtime are skipped (not in any list)
- Correctly handles add/update/delete/skip cases
- Tests verify all four states work correctly

### skippedLarge Return

✅ **YES, returned and counted:**
```typescript
type WalkResult = {
  files: FileRecord[];
  skippedLarge: number;
};
```

**Counting:**
- Incremented when `sizeKB > maxFileKB` (strictly greater-than)
- File is excluded from results AND skippedLarge is incremented
- Tests confirm: 501 KB skipped when maxFileKB = 500

### FileRecord Structure

```typescript
type FileRecord = {
  relativePath: string;    // relative to indexRoot (Unix separators)
  absolutePath: string;    // full filesystem path
  mtime: number;           // modification time in ms
  sizeKB: number;          // size in kilobytes (float)
  extension: string;       // file extension (e.g., ".ts")
};
```

### Edge Cases

✅ **All handled gracefully:**
1. Inaccessible directories → silently skipped (try/catch on readdir)
2. Files that can't be stat-ed → silently skipped (try/catch on stat)
3. Empty directories → returns empty files array
4. Size calculation: `size / 1024` (may produce fractional KB)
5. Path separators normalized to Unix (`.replace(/\\/g, "/")`)

**Potential issue:**
⚠️ **Silent failures** — inaccessible directories/files are skipped without logging
- Could hide permissions issues in CI
- Recommendation: Log warnings for inaccessible paths

### Issues & Concerns

✅ **No critical issues.** Walker is solid:
- Correctly handles mtime caching
- Atomic cache writes
- Proper file classification in diffs
- Safe error handling (though silent)

⚠️ **Minor:**
1. Silent skipping of inaccessible paths (should log warnings?)
2. Windows atomicity not guaranteed (but not claimed)

---

## 5. MMR MODULE
**File:** `packages/pi-index/extensions/index/mmr.ts` + tests

### Lambda (Diversity vs Relevance Trade-off)

✅ **λ = 0.5 (equal weight):**
```
score(candidate) = 0.5 * relevance - 0.5 * max_cosine_sim_to_selected
```

**Interpretation:**
- Relevance score (original ranking) gets 50% weight
- Diversity (novelty) gets 50% weight
- Greedy selection: pick next item with highest MMR score

**Effect:**
- First selection: always highest-relevance item (no competitors selected yet)
- Subsequent selections: balance relevance with distance from already-selected items

### Cosine Similarity Formula

✅ **Correct implementation:**
```typescript
dot = Σ(a[i] * b[i])
normA = √(Σ(a[i]²))
normB = √(Σ(b[i]²))
similarity = dot / (normA * normB)
```

**Special cases handled:**
- Different vector lengths → returns 0 (safe)
- Either vector is all-zeros → returns 0 (avoid division by zero)
- Identical vectors → returns 1.0 ✅
- Orthogonal vectors → returns 0.0 ✅
- Opposite vectors → returns -1.0 ✅

### Input Array Mutation

✅ **Does NOT mutate input:**
```typescript
const candidates = [...items];  // shallow copy
// ... process candidates ...
// items remains unchanged
```

**Test explicitly verifies:** `expect(items).toEqual(copy)` after mmrRerank call

### Zero Vector Handling

✅ **Safe:**
```typescript
const denom = Math.sqrt(normA) * Math.sqrt(normB);
return denom === 0 ? 0 : dot / denom;
```

- Explicit zero check before division
- Returns 0 (orthogonal interpretation) for zero vectors
- Prevents NaN from propagating

### Greedy Selection Algorithm

✅ **Correct greedy approach:**
```
1. selected = []
2. while selected.length < limit and candidates.length > 0:
   a. For each candidate, compute MMR score
   b. Select candidate with highest MMR score
   c. Move to selected; remove from candidates
3. Return selected
```

**Behavior verified by tests:**
- Always selects highest-scoring item first
- Promotes diverse results (orthogonal vectors preferred over similar ones)
- Returns at most `limit` results
- Handles empty input (returns [])
- Handles limit <= 0 (returns [])

### Edge Cases

✅ **All handled:**
1. Empty input → returns []
2. limit <= 0 → returns []
3. limit > items.length → returns all items
4. Single item → returns [item]
5. Zero vectors → handled safely
6. Mismatched vector dimensions → cosine returns 0

### Potential Improvements

⚠️ **Minor considerations:**
1. **Lambda value is hardcoded** — could be a parameter for tuning
2. **No logging** — silent operation (OK for a utility)
3. **Performance** — O(k * n²) where k=limit, n=items (feasible for typical searches, but could optimize with more sophisticated data structures if needed)

### Issues & Concerns

✅ **No issues found.** MMR module is well-implemented:
- Correct algorithm
- Safe handling of edge cases
- No mutations
- Proper zero vector handling

---

## CROSS-MODULE ISSUES

### 1. **Embeddings Lack Semantic Context**
- **Impact:** Moderate — reduces embedding quality
- **Affected modules:** embeddings.ts + chunker.ts
- **Solution:** Prepend metadata to chunk text before embedding
  ```typescript
  // Before embedding, enrich text:
  const enrichedText = [
    `# Language: ${chunk.language}`,
    chunk.symbol ? `# Symbol: ${chunk.symbol}` : null,
    `# File: ${chunk.filePath}`,
    ``,
    chunk.text
  ].filter(Boolean).join("\n");
  ```

### 2. **No Embeddings Error Handling**
- **Impact:** Critical — will crash on API failures
- **Affected modules:** embeddings.ts
- **Solution:** Add try/catch and exponential backoff

### 3. **Walker Extensions Not Documented**
- **Impact:** Low — users won't know what to configure
- **Affected modules:** walker.ts, main index module
- **Solution:** Document default supported extensions

### 4. **Config Lacks pi.config.json Support**
- **Impact:** Low — if intentional, just needs documentation
- **Affected modules:** config.ts
- **Solution:** Clarify in README whether JSON config support is planned

---

## SUMMARY TABLE

| Module | Status | Critical | High | Medium | Low |
|--------|--------|----------|------|--------|-----|
| Config | ✅ Solid | — | — | — | 1 (doc) |
| Embeddings | ⚠️ Needs work | 1 (errors) | 1 (no enrichment) | — | — |
| Chunker | ✅ Solid | — | — | 1 (CSS regex) | — |
| Walker | ✅ Solid | — | — | — | 1 (silent failures) |
| MMR | ✅ Excellent | — | — | 1 (hardcoded λ) | — |

---

## PRIORITY FIXES

1. **CRITICAL:** Add error handling + retries to embeddings.ts
2. **HIGH:** Add semantic enrichment to chunk text before embedding
3. **MEDIUM:** Document supported file extensions
4. **MEDIUM:** Improve walker logging for inaccessible paths
5. **LOW:** Make MMR lambda configurable

