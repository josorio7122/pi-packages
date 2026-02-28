# Subsystem Spec: Search

**Version:** 0.2.0
**File:** `specs/02-search.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md, specs/01-indexing.md

---

## Overview

The search subsystem handles all queries from the LLM agent. It takes a natural language query (with optional scope filters), runs it against the index using hybrid search, reranks results for diversity, and returns a formatted set of relevant code excerpts.

The search subsystem is the primary interface between the LLM and the codebase. It is designed to be called frequently — multiple times per agent turn — with minimal latency. All heavy work (chunking, embedding, writing) is done by the indexing subsystem; search reads from a pre-built index and only calls the embedding service once per query (to embed the query itself).

---

## User Stories

1. As the LLM agent, I can search the codebase with a natural language query, so that I can find relevant code without reading individual files or running grep commands.

2. As the LLM agent, I can narrow a search to a specific directory using `@dir:`, so that I can find the implementation of a feature I know lives in a particular part of the project.

3. As the LLM agent, I can narrow a search by language using `@lang:`, so that I can find only the Python backend code (or only the TypeScript frontend code) when working on a specific layer.

4. As the LLM agent, I can control how many results are returned using the `limit` parameter (0–20), so that I can request fewer results when I need a quick lookup and more when I need broad coverage.

5. As the LLM agent, I can override the minimum score threshold per call using `minScore`, so that I can relax or tighten filtering for a specific query without changing global config.

6. As a developer, I can trust that search results come from diverse parts of the codebase, so that the LLM does not waste context on many chunks from the same file.

---

## Behavior

### Query Parsing

Before running any search, the extension parses scope filters from the query string. This produces a clean query (the text without filter tokens) and a filter set.

The parser scans the query string for tokens matching `@word:value`. Each recognized scope token is extracted and added to the filter set. The remaining text (with filter tokens removed and extra whitespace collapsed) is the clean query. Unrecognized scope tokens cause the tool to return `Error: [INVALID_SCOPE_FILTER] Unknown scope '@word'. Supported scopes: @file, @dir, @ext, @lang.`

Scope filter application rules (CONSTITUTION.md § 7):
- `@file:value` — include only chunks whose `filePath` ends with `/value` or equals `value` (case-sensitive path suffix match)
- `@dir:value` — include only chunks whose `filePath` starts with `value/` (case-sensitive path prefix)
- `@ext:value` — include only chunks whose `extension` exactly equals `value` (must include dot, case-sensitive)
- `@lang:value` — include only chunks whose `language` label equals `value` (case-insensitive)

Multiple scope filters of different types are combined with AND (all filters must match). Multiple filters of the same type are combined with OR (any of the values matches).

### Query Embedding

The clean query is sent to the embedding service to produce a query vector. If the clean query is empty (the query contained only scope filters), the original query string is used as input for embedding instead. If the embedding service fails, the tool returns `Error: [EMBEDDING_FAILED] ...`.

### Hybrid Search

The index is queried using LanceDB's hybrid search — vector similarity and BM25 full-text search combined with RRF (Reciprocal Rank Fusion) via `RRFReranker`. The query fetches `limit * 3` candidates (over-fetch for subsequent filtering and MMR reranking).

Scope filters are translated to SQL WHERE clauses and applied to the hybrid search, restricting both the vector and full-text components to matching rows. LanceDB v0.26.2 prefilters by default — when a WHERE clause references a column with a BTREE scalar index (`filePath`, `language`, `extension`), the filter is applied before vector comparison using the index, rather than scanning every row.

If hybrid search fails (e.g., FTS index not yet built, tantivy error), the search automatically falls back to vector-only search with a `console.warn`. This fallback is transparent to the caller.

### Score Normalization

After search, scores are normalized to `[0.0, 1.0]` relative to the best result in the set:
- **Hybrid path:** Each result's `_relevance_score` from LanceDB's RRF is divided by the maximum `_relevance_score`. The top result always scores `1.0`.
- **Vector-only fallback:** Each `1/(1+distance)` score is divided by the maximum score. Same relative semantics.
- If RRF scores are unavailable, positional fallback is used: `1 - i/(n-1)` for rank `i` out of `n` results.

This consistent normalization means `minScore` thresholds behave the same across both search paths.

### Score Threshold

Results with `score < minScore` are removed. The threshold used is the per-call `minScore` override if provided, otherwise `IndexConfig.minScore` (default `0.2`).

### MMR Reranking

After score filtering, MMR reranking is applied to promote diversity. The algorithm:

```
For each remaining slot to fill:
  score(candidate) = λ × relevance_score - (1 - λ) × max_cosine_similarity_to_selected
  Select the candidate with the highest MMR score.
```

where `λ = IndexConfig.mmrLambda` (default `0.5`, configurable via `PI_INDEX_MMR_LAMBDA`).

- `λ = 1.0` → pure relevance ranking (disables diversity penalty)
- `λ = 0.0` → maximum diversity (pure MMR)
- `λ = 0.5` → balanced (default)

If fewer than 2 results pass the score filter, MMR is skipped (there is nothing to diversify).

### Result Formatting

The final result set is formatted as structured plain text for the LLM:

```
Found N results for "{original query}":

1. {filePath} — {symbol or "(no symbol)"} (lines {startLine}–{endLine}) [{language}, {score}% match]
------------------------------------------------------------
{chunk text}
------------------------------------------------------------

2. ...
```

- `score` is displayed as an integer percentage (e.g., `87% match`), rounded
- The horizontal rule is 60 dashes
- Chunk text is reproduced verbatim
- Results are ordered by MMR selection order (not by raw score)
- If no results are found: `No results found for "{original query}". Try a broader query or check that the index is up to date with codebase_index.`

---

## Acceptance Criteria

**Scenario 1 — Happy path: semantic query**

Given the index contains chunks for an authentication module,
When `codebase_search` is called with query `"user login flow"`,
Then results include chunks from the authentication-related files with file paths, line ranges, and relevance scores.

**Scenario 2 — Happy path: exact identifier query**

Given the index contains a TypeScript function named `handleStripeWebhook`,
When `codebase_search` is called with query `"handleStripeWebhook"`,
Then the chunk containing that function definition appears in the results (full-text search surfaces it).

**Scenario 3 — Scope filter: @dir**

Given the index contains chunks from both `src/auth/` and `src/payments/`,
When `codebase_search` is called with query `"validation logic @dir:src/auth"`,
Then all returned chunks have `filePath` values starting with `src/auth/`.

**Scenario 4 — Validation error: unrecognized scope**

Given the index is populated,
When `codebase_search` is called with query `"auth logic @module:core"`,
Then the tool returns `Error: [INVALID_SCOPE_FILTER] Unknown scope '@module'. Supported scopes: @file, @dir, @ext, @lang.`

**Scenario 5 — Validation error: index not initialized**

Given `codebase_index` has never been called,
When `codebase_search` is called,
Then the tool returns `Error: [INDEX_NOT_INITIALIZED] Run codebase_index to build the index before searching.`

**Scenario 6 — Edge case: no results after filtering**

Given the index contains only TypeScript files,
When `codebase_search` is called with query `"database schema @lang:python"`,
Then the response is the "No results found" message.

**Scenario 7 — Edge case: MMR diversity**

Given the index contains many chunks from the same file all matching a query,
When `codebase_search` is called with `limit: 8`,
Then the 8 results include chunks from multiple files, not all from the same file.

**Scenario 8 — Per-call minScore override**

Given `IndexConfig.minScore` is `0.2`,
When `codebase_search` is called with `minScore: 0.6`,
Then only results scoring >= 0.6 are returned for this call.

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| `limit: 0` | Returns empty result set without error: `Found 0 results for "..."` |
| `limit: 25` | Capped to 20 silently. Returns at most 20 results. |
| Query is empty string | Clean query is empty; embedding service embeds empty string; may return unexpected results. No error. |
| Query contains only scope filters | Clean query is empty; original query is used for embedding fallback. Scope filters are applied. |
| Scope filter value contains `%` or `_` | These are LIKE wildcard characters in SQL and are escaped with `\` before building the WHERE clause. |
| Multiple `@lang:` filters | Returns chunks matching either language (OR semantics). |
| Embedding service fails | Returns `Error: [EMBEDDING_FAILED] ...`. No partial results. |
| Index has stale chunks (file deleted since last index) | Stale chunks are returned if they score above threshold. `codebase_index` will clean them up when next called. |
| Two chunks from different files with identical text | Both are returned if they score above threshold. No deduplication. |
| `@file:login` (no extension) | Only matches files whose path ends with `/login` or equals `login` exactly. Won't match `login.ts`. |
| `@ext:ts` (missing dot) | Matches `extension = 'ts'`, but extensions are stored with the dot (e.g. `.ts`). Use `@ext:.ts`. |
