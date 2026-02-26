import type { Indexer, IndexSummary } from "./indexer.js";
import type { Searcher } from "./searcher.js";
import type { IndexDB } from "./db.js";
import type { IndexConfig } from "./config.js";
import { readMtimeCache } from "./walker.js";

export type IndexTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
};

function relativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}

function formatSummary(summary: IndexSummary): string {
  const lines = [
    "Index updated:",
    `  Added:   ${summary.added} file${summary.added !== 1 ? "s" : ""} (${summary.addedChunks} chunk${summary.addedChunks !== 1 ? "s" : ""})`,
    `  Updated: ${summary.updated} file${summary.updated !== 1 ? "s" : ""} (${summary.updatedChunks} chunk${summary.updatedChunks !== 1 ? "s" : ""})`,
    `  Removed: ${summary.removed} file${summary.removed !== 1 ? "s" : ""}`,
    `  Skipped: ${summary.skipped} file${summary.skipped !== 1 ? "s" : ""} (unchanged)`,
    `  Skipped: ${summary.skippedTooLarge} file${summary.skippedTooLarge !== 1 ? "s" : ""} (too large)`,
    `  Total:   ${summary.totalChunks} chunk${summary.totalChunks !== 1 ? "s" : ""} in index`,
    `  Time:    ${(summary.elapsedMs / 1000).toFixed(1)}s`,
  ];
  return lines.join("\n");
}

export function createIndexTools(
  searcher: Searcher,
  indexer: Indexer,
  db: IndexDB,
  cfg: IndexConfig,
): { tools: IndexTool[] } {
  const searchTool: IndexTool = {
    name: "codebase_search",
    description:
      "Search the codebase index using natural language or exact identifiers. " +
      "Returns ranked code excerpts with file paths, line numbers, and relevance scores. " +
      "Use instead of grep or bash for code discovery. " +
      "Supports scope filters: @file:name, @dir:path, @ext:.ts, @lang:python.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query or identifier. May include @scope:value filters.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1–20). Default: 8.",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 8;

      try {
        const status = await db.getStatus();
        if (status.chunkCount === 0) {
          return "Error: [INDEX_NOT_INITIALIZED] Run codebase_index to build the index before searching.";
        }
      } catch {
        return "Error: [INDEX_NOT_INITIALIZED] Run codebase_index to build the index before searching.";
      }

      try {
        return await searcher.search(query, limit);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("CONFIG_MISSING_API_KEY")) {
          return "Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.";
        }
        return `Error: [SEARCH_FAILED] ${msg}`;
      }
    },
  };

  const indexTool: IndexTool = {
    name: "codebase_index",
    description:
      "Build or update the codebase index. " +
      "On first call, indexes all configured directories. " +
      "On subsequent calls, re-indexes only changed files (fast incremental update). " +
      "Use force:true to rebuild from scratch after changing the embedding model.",
    parameters: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "If true, delete all existing chunks and rebuild from scratch. Default: false.",
        },
      },
    },
    handler: async (args) => {
      const force = args.force === true;
      try {
        const summary = await indexer.run({ force });
        return formatSummary(summary);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("INDEX_ALREADY_RUNNING")) {
          return "Error: [INDEX_ALREADY_RUNNING] An index operation is already in progress. Wait for it to complete.";
        }
        if (msg.includes("CONFIG_MISSING_API_KEY")) {
          return "Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.";
        }
        return `Error: [INDEX_FAILED] ${msg}`;
      }
    },
  };

  const statusTool: IndexTool = {
    name: "codebase_status",
    description:
      "Show the current state of the codebase index — chunk count, file count, last indexed time, and configuration.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (_args) => {
      try {
        const status = await db.getStatus();
        const cache = await readMtimeCache(cfg.mtimeCachePath);

        if (status.chunkCount === 0 && cache.size === 0) {
          return [
            "pi-index status:",
            `  Index path:    ${cfg.dbPath}`,
            "  Status:       Not built. Call codebase_index to create the index.",
            `  Auto-index:   ${cfg.autoIndex ? "on" : "off"}`,
            `  Index dirs:   ${cfg.indexDirs.join(", ")}`,
          ].join("\n");
        }

        const lastStr = status.lastIndexedAt ? relativeTime(status.lastIndexedAt) : "never";

        let statusStr = [
          "pi-index status:",
          `  Index path:    ${cfg.dbPath}`,
          `  Total chunks:  ${status.chunkCount}`,
          `  Files indexed: ${status.fileCount}`,
          `  Last indexed:  ${lastStr}`,
          `  Model:         ${cfg.model}`,
          `  Auto-index:    ${cfg.autoIndex ? "on" : "off"}`,
          `  Index dirs:    ${cfg.indexDirs.join(", ")}`,
        ].join("\n");

        if (indexer.isRunning) {
          statusStr += "\n  (Index currently rebuilding in background)";
        }

        return statusStr;
      } catch (err) {
        return `Error: [STATUS_FAILED] ${String(err)}`;
      }
    },
  };

  return { tools: [searchTool, indexTool, statusTool] };
}
