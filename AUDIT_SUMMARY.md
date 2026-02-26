# PI-INDEX AUDIT — EXECUTIVE SUMMARY

## Module Status Overview

```
✅ CONFIG        — Solid, well-validated, no issues
⚠️  EMBEDDINGS   — Needs work: 1 CRITICAL (no error handling), 1 HIGH (no enrichment)
✅ CHUNKER      — Solid, well-tested, minor CSS regex concern
✅ WALKER       — Solid, atomic operations, proper diffing
✅ MMR          — Excellent, mathematically correct, safe
```

---

## CRITICAL FINDINGS

### 1. **EMBEDDINGS: No Error Handling (CRITICAL)**
```typescript
// Current: WILL CRASH on API failures
async embed(text: string): Promise<number[]> {
  const response = await this.client.embeddings.create({...});
  return response.data[0].embedding;  // ← no try/catch, no validation
}
```
**Impact:** Any network error, rate limit, or malformed response crashes the process.
**Fix:** Add try/catch, exponential backoff, validate response structure.

---

### 2. **EMBEDDINGS: No Semantic Enrichment (HIGH)**
```typescript
// Current: Raw text only
await client.embeddings.create({
  model: this.model,
  input: text,  // ← no metadata
});

// Better: Prepend semantic context
const enriched = `# ${language}\n# Symbol: ${symbol}\n# File: ${path}\n\n${text}`;
```
**Impact:** Identical code in different contexts produces identical embeddings. Loses file context, symbol names, language signal.
**Fix:** Prepend metadata before embedding.

---

### 3. **CONFIG: No pi.config.json Support (FINDING)**
The module reads **environment variables only**. No JSON config file is loaded or merged.
```
PI_INDEX_API_KEY > OPENAI_API_KEY (with defaults)
(no pi.config.json)
```
**Status:** Not a bug if intentional, but should be documented.

---

## ALL QUESTIONS ANSWERED

### CONFIG
| Question | Answer |
|----------|--------|
| Env vars? | PI_INDEX_API_KEY, OPENAI_API_KEY, PI_INDEX_MODEL, PI_INDEX_DB_PATH, PI_INDEX_DIRS, PI_INDEX_AUTO, PI_INDEX_MAX_FILE_KB, PI_INDEX_MIN_SCORE |
| Defaults? | model: text-embedding-3-small, dimensions: 1536, maxFileKB: 500, minScore: 0.2, dbPath: .pi/index/lancedb, indexDirs: [indexRoot] |
| pi.config.json? | ❌ NOT SUPPORTED — env-vars only |
| Precedence? | Env vars override defaults |
| Validation? | apiKey (required), model (known models only), maxFileKB (>0), minScore (0-1 range) |
| Path handling? | ✅ Correct — absolute paths returned as-is, relative paths resolved against indexRoot |
| Issues? | No — solid module |

### EMBEDDINGS
| Question | Answer |
|----------|--------|
| Model & dims? | text-embedding-3-small → 1536 dims (configurable) |
| encoding_format? | ✅ YES, set to "float" |
| Why float? | OpenAI SDK 6.x defaults to base64; float ensures plain number[] |
| Enrichment? | ❌ NO — raw text only, no metadata |
| Retry/error? | ❌ NONE — direct await, will crash on failures |
| Issues? | Critical: no error handling, High: no enrichment |

### CHUNKER
| Question | Answer |
|----------|--------|
| Language detection? | Via file extension (.ts→typescript, .py→python, etc.) |
| Boundary patterns? | TS: export function/class, def; Python: def/class; SQL: CREATE|ALTER|DROP; MD: ##/###; CSS: selectors |
| 80-line cap? | ✅ Enforced — boundary-based chunks split if >80 lines, non-boundary content split by 80-line windows |
| .d.ts handling? | ✅ Special case in getExtension() — correctly maps to typescript |
| Chunk IDs? | ✅ Format: {filePath}:{chunkIndex} (e.g., "src/auth.ts:0") |
| CodeChunk type? | id, text, vector, filePath, chunkIndex, startLine (1-based), endLine (1-based), language, extension, symbol, mtime, createdAt |
| Edge cases? | ✅ All handled — empty content, no boundaries, overlaps, 1-based line numbers; Minor: CSS regex may be overly broad |

### WALKER
| Question | Answer |
|----------|--------|
| Extensions? | ❌ NOT hardcoded — passed as parameter, must be configured elsewhere |
| mtime caching? | ✅ Stored in Map<relativePath, MtimeEntry> with filePath, mtime, chunkCount, indexedAt |
| Atomic writes? | ✅ YES — writes to .tmp file, then rename() (atomic on POSIX) |
| diffFileSet? | ✅ Correctly returns { toAdd, toUpdate, toDelete }; unchanged files skipped |
| Classification? | ✅ Properly classifies new/updated/deleted/skipped based on mtime |
| skippedLarge? | ✅ YES — counted and returned in WalkResult |
| Issues? | Minor: silently skips inaccessible dirs/files (no logging) |

### MMR
| Question | Answer |
|----------|--------|
| Lambda? | λ = 0.5 (equal weight to relevance vs diversity) |
| Cosine formula? | ✅ Correct: dot / (√normA × √normB) |
| Mutation? | ✅ NO — uses shallow copy, doesn't mutate input |
| Zero vectors? | ✅ Safe — returns 0 (orthogonal interpretation) |
| Issues? | No major issues; lambda could be configurable (minor) |

---

## PRIORITY ROADMAP

### 🚨 CRITICAL (Fix immediately)
1. **embeddings.ts** — Add error handling + exponential backoff + response validation
   - Impact: Prevents crashes on API failures, rate limits, malformed responses
   - Effort: 30 min

### ⚡ HIGH (Fix ASAP)
2. **embeddings.ts** — Add semantic enrichment before embedding
   - Prepend: `# {language}\n# Symbol: {symbol}\n# File: {path}\n\n{text}`
   - Impact: Better embedding quality, maintains context signal
   - Effort: 20 min

3. **walker.ts** — Document supported file extensions
   - Add to README: default extensions list, how to configure
   - Effort: 10 min

### 📋 MEDIUM (Fix soon)
4. **walker.ts** — Add logging for inaccessible paths
   - Log warnings when directories or files can't be accessed
   - Impact: Better visibility into CI failures
   - Effort: 15 min

5. **chunker.ts** — Test CSS selector regex edge cases
   - Verify CSS regex doesn't match invalid selectors
   - Current: `/^[.#a-zA-Z:[]\w][^{]*\{/` (may be too broad)
   - Effort: 20 min

### 🔧 LOW (Nice to have)
6. **mmr.ts** — Make lambda configurable
   - Change: `0.5 * relevance - 0.5 * maxSim` → `λ * relevance - (1-λ) * maxSim`
   - Effort: 10 min

7. **config.ts** — Document pi.config.json decision
   - Clarify in README: why env-only, is JSON support planned?
   - Effort: 5 min

---

## CROSS-MODULE RISKS

| Risk | Severity | Affected | Mitigation |
|------|----------|----------|-----------|
| Embeddings crash on API failure | CRITICAL | embeddings → main index | Error handling + retries |
| Weak embedding quality | HIGH | search quality | Semantic enrichment |
| Silent walker failures | MEDIUM | large repos with perms issues | Add logging |
| CSS chunking false positives | LOW | CSS files | Regex testing |
| No config JSON support | LOW | user experience | Documentation |

---

## TEST COVERAGE

✅ All modules well-tested:
- **config.test.ts** — Full coverage of all env vars, defaults, validation, path resolution
- **embeddings.test.ts** — Mocked API, correct model/input/encoding verification
- **chunker.test.ts** — Language detection, boundary patterns, 80-line cap, symbol extraction
- **walker.test.ts** — Extension filtering, mtime caching, diffing, skipped file counting
- **mmr.test.ts** — Cosine similarity, greedy selection, diversity promotion, no mutations

---

## CODE QUALITY

| Module | Readability | Correctness | Robustness | Score |
|--------|-------------|-------------|-----------|-------|
| config | A | A | A | A |
| embeddings | A | B | D | B- |
| chunker | A | A | B+ | A- |
| walker | A | A | B | A- |
| mmr | A | A | A | A |

**Overall:** 4 out of 5 modules are production-ready. **Embeddings needs fixes before production use.**

