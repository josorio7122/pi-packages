import type { IndexDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { IndexConfig } from "./config.js";
import { mmrRerank, type ScoredChunk } from "./mmr.js";

export type ScopeFilter = { scope: string; value: string };

const KNOWN_SCOPES = new Set(["file", "dir", "ext", "lang"]);

/**
 * Parse @scope:value filters from a query string.
 * Returns the clean query (without filters) and the extracted filters.
 * Throws INVALID_SCOPE_FILTER for unrecognized @scope tokens.
 */
export function parseScopeFilters(query: string): {
  cleanQuery: string;
  filters: ScopeFilter[];
} {
  const filters: ScopeFilter[] = [];
  const nonFilterParts: string[] = [];

  for (const part of query.split(/\s+/)) {
    const match = part.match(/^@([a-zA-Z]+):(.+)$/);
    if (match) {
      const scope = match[1].toLowerCase();
      if (!KNOWN_SCOPES.has(scope)) {
        throw new Error(
          `[INVALID_SCOPE_FILTER] Unknown scope '@${match[1]}'. Supported scopes: @file, @dir, @ext, @lang.`,
        );
      }
      filters.push({ scope, value: match[2] });
    } else {
      nonFilterParts.push(part);
    }
  }

  return {
    cleanQuery: nonFilterParts.join(" ").replace(/\s+/g, " ").trim(),
    filters,
  };
}

/**
 * Build a SQL WHERE clause from scope filters.
 * Returns undefined when no filters are active.
 */
export function buildFilter(filters: ScopeFilter[]): string | undefined {
  if (filters.length === 0) return undefined;

  // Group by scope type
  const byScope = new Map<string, string[]>();
  for (const f of filters) {
    const v = f.value.replace(/'/g, "''"); // escape SQL string
    // For LIKE patterns only: escape % and _ wildcards
    const vLike = v.replace(/%/g, "\\%").replace(/_/g, "\\_");
    let condition: string;
    switch (f.scope) {
      case "file":
        // Match basename: filePath ends with /value or equals value
        condition = `(filePath = '${v}' OR filePath LIKE '%/${vLike}' ESCAPE '\\')`;
        break;
      case "dir":
        // Match path prefix
        condition = `(filePath LIKE '${vLike}/%' ESCAPE '\\' OR filePath = '${v}')`;
        break;
      case "ext":
        condition = `extension = '${v}'`;
        break;
      case "lang":
        condition = `language = '${v.toLowerCase()}'`;
        break;
    }
    if (!byScope.has(f.scope)) byScope.set(f.scope, []);
    byScope.get(f.scope)!.push(condition);
  }

  // OR within same type, AND across types
  const groups = Array.from(byScope.values()).map((conditions) =>
    conditions.length === 1 ? conditions[0] : `(${conditions.join(" OR ")})`,
  );

  return groups.length > 0 ? groups.join(" AND ") : undefined;
}

const SEPARATOR = "-".repeat(60);

/**
 * Format a list of ranked results as a human-readable string for the LLM.
 */
export function formatResults(results: ScoredChunk[], originalQuery: string): string {
  if (results.length === 0) {
    return (
      `No results found for "${originalQuery}". ` +
      `Try a broader query or check that the index is up to date with codebase_index.`
    );
  }

  const lines: string[] = [
    `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${originalQuery}":`,
    "",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const symbol = r.symbol || "(no symbol)";
    const scorePct = Math.round(r.score * 100);
    lines.push(
      `${i + 1}. ${r.filePath} \u2014 ${symbol} (lines ${r.startLine}\u2013${r.endLine}) [${r.language}, ${scorePct}% match]`,
    );
    lines.push(SEPARATOR);
    lines.push(r.text);
    lines.push(SEPARATOR);
    if (i < results.length - 1) lines.push("");
  }

  return lines.join("\n");
}

export class Searcher {
  constructor(
    private readonly db: IndexDB,
    private readonly emb: Embeddings,
    private readonly cfg: IndexConfig,
  ) {}

  async search(query: string, limit = 8, minScore?: number): Promise<string> {
    // Cap and floor the limit
    const safeLimit = Math.min(Math.max(limit, 0), 20);

    if (safeLimit === 0) {
      return formatResults([], query);
    }

    // Parse scope filters
    let cleanQuery: string;
    let filters: ScopeFilter[];
    try {
      ({ cleanQuery, filters } = parseScopeFilters(query));
    } catch (err) {
      return `Error: ${String(err).replace(/^Error:\s*/, "")}`;
    }

    // Embed the clean query
    let queryVector: number[];
    try {
      queryVector = await this.emb.embed(cleanQuery || query);
    } catch (err) {
      return `Error: [EMBEDDING_FAILED] Failed to embed query: ${String(err)}`;
    }

    const dbFilter = buildFilter(filters);
    const fetchLimit = safeLimit * 3; // over-fetch for filtering + MMR

    // Hybrid search (falls back to vector-only if FTS unavailable)
    let rawResults: ScoredChunk[];
    try {
      rawResults = await this.db.hybridSearch(
        queryVector,
        cleanQuery || query,
        fetchLimit,
        dbFilter,
      );
    } catch (err) {
      return `Error: [SEARCH_FAILED] Search encountered an error: ${String(err)}`;
    }

    // Apply minimum score threshold (override takes precedence over config)
    const scoreThreshold = minScore ?? this.cfg.minScore;
    const filtered = rawResults.filter((r) => r.score >= scoreThreshold);

    // MMR reranking for diversity (skip if < 2 results)
    const reranked =
      filtered.length >= 2
        ? mmrRerank(filtered, safeLimit, this.cfg.mmrLambda)
        : filtered.slice(0, safeLimit);

    return formatResults(reranked, query);
  }
}
