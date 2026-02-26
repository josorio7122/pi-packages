# pi-index — Glossary

**Version:** 0.1.0
**Status:** Draft

---

## Terms

### Index

The collection of all stored knowledge about a project's source files. When a developer runs `codebase_index`, the extension reads every matching file in the project, breaks each one into pieces, and stores those pieces in the index so they can be searched later. The index persists between sessions so it does not need to be rebuilt every time.

### Chunk

A small, self-contained excerpt of a source file — typically one function, one class, or a group of related lines. Each chunk has a known start line and end line within its file. The index stores chunks rather than whole files because searching a focused excerpt is faster and more precise than searching an entire file.

### Embedding

A list of numbers that encodes the meaning of a piece of text. Two chunks that are about similar concepts will have embeddings that are numerically close to each other, even if they use completely different words. The extension sends chunk text to an embedding service and stores the resulting numbers alongside the chunk so that future searches can find similar content quickly.

### Hybrid Search

A search strategy that combines two complementary techniques — vector search and full-text search — and merges their results into a single ranked list. Hybrid search is more reliable than either technique alone because some queries are better matched by exact keywords while others are better matched by meaning. The extension uses hybrid search for all `codebase_search` calls.

### Vector Search

A way of finding chunks whose meaning is similar to a query. The query is converted into an embedding, and the index finds chunks whose embeddings are numerically close. Vector search finds conceptually related content even when the exact words don't match — for example, searching "error handling" might return code that uses `try/catch` even if the word "error" doesn't appear in the chunk.

### Full-Text Search

A way of finding chunks that contain specific words or identifiers from a query. Full-text search applies statistical weighting (BM25) to rank results by how frequently and distinctively the query terms appear. It excels at finding exact function names, constant names, and identifiers that vector search might rank poorly.

### Reciprocal Rank Fusion (RRF)

A formula for merging two ranked lists into one. Each item in each list receives a score based on its position — items ranked near the top score higher, items ranked near the bottom score lower. Items that appear in both lists receive a combined score and rise to the top. RRF is how the extension combines the results of vector search and full-text search into a single, coherent ranking.

### Maximal Marginal Relevance (MMR)

A reranking step that balances relevance with diversity. Without MMR, a search for "authentication logic" might return eight chunks all from the same file. MMR detects when results are too similar to each other and promotes results from other files, giving the agent a broader view of the codebase in fewer results.

### Scope Filter

A modifier appended to a search query that restricts results to a specific file, directory, extension, or language. For example, adding `@dir:src/payments` to a query limits results to files inside `src/payments/`. Scope filters are written directly in the query string and are stripped before the search runs.

### mtime (Modification Time)

A timestamp recorded by the operating system whenever a file is saved. The extension records each file's mtime after indexing it. On subsequent sessions, it compares the current mtime of each file to the stored value — if they match, the file is skipped; if they differ, the file is re-indexed. This makes incremental indexing fast without requiring the extension to read every file on every session start.

### Incremental Indexing

The process of updating only the parts of the index that have changed since the last run. When `codebase_index` is called, the extension identifies new files, changed files (by mtime), and deleted files, then processes only those. Files that have not changed are untouched. A full project can typically be refreshed in seconds after the first index is built.

### Index Root

The top-level directory that the extension treats as the base of the project. All file paths stored in the index are expressed relative to this root. The index root is typically the project's root directory — the same directory where `.pi/` lives.

### Language

A label assigned to each file based on its extension, used as metadata to help narrow searches. For example, all `.py` files are labeled `python` and all `.ts` files are labeled `typescript`. Language labels are used by the `@lang:` scope filter.

### Symbol

A best-effort name extracted from the beginning of a chunk — typically the name of the function or class that the chunk belongs to. For example, a chunk starting with `def handle_payment(` would have the symbol `handle_payment`. Symbol extraction uses simple pattern matching and may be empty for chunks that don't start at a structural boundary.

### Relevance Score

A number between 0.0 and 1.0 assigned to each search result, representing how well the chunk matches the query. Higher scores indicate a better match. Scores are produced by combining the rankings from vector search and full-text search using RRF. Results below the configured minimum score threshold are excluded from the output.

---

## How They Connect

When a developer first sets up pi-index on a project, they run `codebase_index`. The extension walks the project directories, reads each source file, and breaks it into chunks — small, self-contained excerpts of a few dozen lines each, ideally aligned with function or class boundaries. For each chunk, the extension sends the text to an embedding service, which returns a list of numbers encoding the chunk's meaning. The extension stores each chunk along with its embedding, file path, line numbers, and a record of when the file was last modified.

Once the index is built, the LLM agent can call `codebase_search` at any time. The agent's query — a natural language phrase or an exact identifier — is itself converted to an embedding. The index then runs two searches in parallel: one that finds chunks whose embeddings are numerically similar to the query (vector search), and one that finds chunks containing the query's exact words and identifiers (full-text search). The two result lists are merged using RRF, which promotes chunks that appear near the top of both lists. A final MMR pass ensures the returned results come from diverse parts of the codebase rather than clustering around a single file.

The agent receives a short list of ranked chunks — each with its file path, line range, language, and a relevance score — and can read them directly without issuing any file-reading commands. The index persists between sessions. On subsequent sessions, `codebase_index` compares each file's current modification time to the stored value and re-indexes only files that have changed, making refresh fast even on large projects.
