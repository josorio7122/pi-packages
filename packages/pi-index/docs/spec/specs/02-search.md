# Subsystem Spec: Search

**Version:** 0.1.0
**File:** `specs/02-search.md`
**Depends on:** CONSTITUTION.md, DATA-MODEL.md, specs/01-indexing.md

---

## Overview

The search subsystem handles all queries from the LLM agent. It takes a natural language query (with optional scope filters), runs it against the index using hybrid search, reranks results for diversity, and returns a formatted set of relevant code excerpts.

The search subsystem is the primary interface between the LLM and the codebase. It is designed to be called frequently — multiple times per agent turn — with minimal latency. All heavy work (chunking, embedding, writing) is done by the indexing subsystem; search reads from a pre-built index and only calls the embedding service once per query (to embed the query itself).

The search subsystem connects to the indexing subsystem via the shared index database: indexing writes, search reads. It connects to the tool API (`specs/03-tool-api.md`) because `codebase_search` is the public interface for this subsystem.

---

## User Stories

1. As the LLM agent, I can search the codebase with a natural language query, so that I can find relevant code without reading individual files or running grep commands.

2. As the LLM agent, I can narrow a search to a specific directory using `@dir:`, so that I can find the implementation of a feature I know lives in a particular part of the project.

3. As the LLM agent, I can narrow a search by language using `@lang:`, so that I can find only the Python backend code (or only the TypeScript frontend code) when working on a specific layer.

4. As the LLM agent, I can control how many results are returned using the `limit` parameter, so that I can request fewer results when I need a quick lookup and more when I need broad coverage.

5. As a developer, I can trust that search results come from diverse parts of the codebase, so that the LLM does not waste my context window on eight chunks from the same file.

---

## Behavior

### Query Parsing

Before running any search, the extension parses scope filters from the query string. This produces a clean query (the text without filter tokens) and a filter set.

The parser scans the query string for tokens matching `@word:value`. Each recognized scope token is extracted and added to the filter set. The remaining text (with filter tokens removed and extra whitespace collapsed) is the clean query. Unrecognized scope tokens cause the tool to return `Error: [INVALID_SCOPE_FILTER] Unknown scope '@word'. Supported scopes: @file, @dir, @ext, @lang.`

Scope filter application rules (CONSTITUTION.md § 7):
- `@file:value` — include only chunks whose `filePath` basename equals `value` (case-sensitive)
- `@dir:value` — include only chunks whose `filePath` starts with `value` (case-sensitive)
- `@ext:value` — include only chunks whose `extension` exactly equals `value` (case-sensitive, must include dot)
- `@lang:value` — include only chunks whose `language` label equals `value` (case-insensitive)

Multiple scope filters of different types are combined with AND (all filters must match). Multiple filters of the same type are combined with OR (any of the values matches).

### Query Embedding

The clean query is sent to the embedding service to produce a query vector. If the embedding service fails, the tool returns `Error: [EMBEDDING_FAILED] ...`. Scope filters are still valid at this point but cannot be applied without a vector; the call does not fall back to FTS-only.

### Hybrid Search

Vector search and full-text search run in parallel against the index:

- **Vector search**: finds chunks whose stored vectors are closest to the query vector. Returns up to `limit * 3` candidates (over-fetch to allow for filtering and reranking).
- **Full-text search (BM25)**: finds chunks whose stored text contains terms from the clean query. Returns up to `limit * 3` candidates.

Scope filters are applied to both result sets before merging: any chunk that does not satisfy all active scope filters is removed.

### RRF Fusion

The filtered vector results and filtered full-text results are merged using Reciprocal Rank Fusion with `k=60`. For each chunk appearing in either list, its RRF score is the sum of `1 / (k + rank)` across the lists it appears in. Chunks appearing in both lists receive contributions from both, naturally boosting them to the top. The merged list is sorted by descending RRF score.

The score assigned to each result is the normalized RRF score, mapped to the `[0.0, 1.0]` range. Results below `IndexConfig.minScore` are removed from the merged list.

### MMR Reranking

After score filtering, MMR reranking is applied to promote diversity. The algorithm greedily selects the next result to include based on:

```
score(candidate) = λ × relevance_score - (1 - λ) × max_similarity_to_selected
```

where `λ = 0.5` (equal weight between relevance and diversity) and similarity is computed from stored vectors (cosine similarity). The selection continues until `limit` results have been chosen or candidates are exhausted.

If fewer than 2 results pass the score filter, MMR is skipped (there is nothing to diversify).

### Result Formatting

The final result set is formatted as structured plain text for the LLM:

```
Found N results for "{original query}":

1. {filePath} — {symbol or "(no symbol)"} (lines {startLine}–{endLine}) [{language}, {score}% match]
{horizontal rule}
{chunk text}
{horizontal rule}

2. ...
```

- `score` is displayed as an integer percentage (e.g., `87% match`)
- The horizontal rule is 60 dashes
- Chunk text is reproduced verbatim
- Results are ordered by MMR selection order (not by raw score)
- If no results are found after filtering, the response is: `No results found for "{original query}". Try a broader query or check that the index is up to date with codebase_index.`

---

## Acceptance Criteria

**Scenario 1 — Happy path: semantic query**

Given the index contains chunks for an authentication module,
When `codebase_search` is called with query `"user login flow"`,
Then results include chunks from the authentication-related files, each with a file path, line range, language label, and relevance score, and the formatted output lists them in order.

**Scenario 2 — Happy path: exact identifier query**

Given the index contains a TypeScript function named `handleStripeWebhook`,
When `codebase_search` is called with query `"handleStripeWebhook"`,
Then the chunk containing that function definition appears in the results (full-text search surfaces it even if vector similarity is low).

**Scenario 3 — Scope filter: @dir**

Given the index contains chunks from both `src/auth/` and `src/payments/`,
When `codebase_search` is called with query `"validation logic @dir:src/auth"`,
Then all returned chunks have `filePath` values starting with `src/auth/`, and no chunks from `src/payments/` appear.

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
Then no chunks pass the language filter, and the response is: `No results found for "database schema @lang:python". Try a broader query or check that the index is up to date with codebase_index.`

**Scenario 7 — Edge case: MMR diversity**

Given the index contains 20 chunks from `src/auth/auth.ts` and 5 chunks from `src/middleware/auth.ts`, all semantically similar to the query `"auth token validation"`,
When `codebase_search` is called with `limit: 8`,
Then the 8 results include chunks from both `src/auth/auth.ts` and `src/middleware/auth.ts` — not all 8 from the same file.

---

## Edge Cases

| Scenario | Expected behavior |
| --- | --- |
| Query is a single character | Processed normally. Full-text search may return zero results; vector search returns results based on embedding similarity. |
| Query contains only scope filters with no text (`@dir:src/auth`) | Clean query is empty string. Full-text search returns no results. Vector search embeds the empty string and may return unexpected results. Results are returned without error; the LLM is expected to provide a meaningful query. |
| `limit` is 0 | Returns an empty result set without error. |
| `limit` exceeds the number of chunks in the index | All passing chunks are returned, up to the actual count. |
| Scope filter value contains path separators (`@dir:src/auth/utils`) | Treated as a path prefix. Chunks from `src/auth/utils/` match; chunks from `src/auth/` that are not inside `utils/` do not. |
| Multiple `@lang:` filters (`@lang:typescript @lang:python`) | Returns chunks matching either language (OR semantics). |
| Embedding service is unavailable | Returns `Error: [EMBEDDING_FAILED] ...`. No partial results are returned. |
| Index contains chunks from a file that has since been deleted (stale index) | Stale chunks are returned if they match the query. The results include the `filePath` and `symbol` from when the file was indexed. The LLM is responsible for noticing the file no longer exists; `codebase_index` will clean up stale chunks when next called. |
| Two chunks from different files with identical text | Both are returned if they score above the threshold. No deduplication. |
