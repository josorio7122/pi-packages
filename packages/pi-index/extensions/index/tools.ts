import type { Indexer, IndexSummary } from "./indexer.js";
import type { Searcher } from "./searcher.js";
import type { IndexDB } from "./db.js";
import type { IndexConfig } from "./config.js";
import { readMtimeCache } from "./walker.js";
import { relativeTime } from "./utils.js";

export type IndexTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, notify?: (msg: string, level: string) => void) => Promise<string>;
};

export function formatSummary(summary: IndexSummary, rebuilt = false): string {
  const header = rebuilt ? "Index rebuilt:" : "Index updated:";
  const lines = [
    header,
    `  Added:   ${summary.added} file${summary.added !== 1 ? "s" : ""} (${summary.addedChunks} chunk${summary.addedChunks !== 1 ? "s" : ""})`,
    `  Updated: ${summary.updated} file${summary.updated !== 1 ? "s" : ""} (${summary.updatedChunks} chunk${summary.updatedChunks !== 1 ? "s" : ""})`,
    `  Removed: ${summary.removed} file${summary.removed !== 1 ? "s" : ""}`,
    `  Skipped: ${summary.skipped} file${summary.skipped !== 1 ? "s" : ""} (unchanged)`,
    `  Too large: ${summary.skippedTooLarge} file${summary.skippedTooLarge !== 1 ? "s" : ""} (size limit)`,
    `  Total:   ${summary.totalChunks} chunk${summary.totalChunks !== 1 ? "s" : ""}`,
    `  Time:    ${Math.round(summary.elapsedMs / 1000)}s`,
  ];
  return lines.join("\n");
}

export function createIndexTools(
  searcher: Searcher,
  indexer: Indexer,
  db: IndexDB,
  cfg: IndexConfig,
  opts: { notify?: (msg: string, level: string) => void } = {},
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
          description: "Maximum number of results (0–20). Default: 8.",
        },
        minScore: {
          type: "number",
          description: "Minimum relevance score 0–1 to include a result. Default: config value (typically 0.2).",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 8;
      const minScore = typeof args.minScore === "number" ? args.minScore : undefined;

      try {
        const result = await searcher.search(query, limit, minScore);
        // Normalize searcher's INDEX_EMPTY into the tools-layer error format
        if (result.startsWith("[INDEX_EMPTY]")) {
          return "Error: [INDEX_NOT_INITIALIZED] Run codebase_index to build the index before searching.";
        }
        return result;
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
    handler: async (args, notify) => {
      const force = typeof args.force === "boolean" ? args.force : false;
      const effectiveNotify = notify ?? opts.notify;
      try {
        const summary = await indexer.run({
          force,
          onProgress: effectiveNotify ? (msg) => effectiveNotify(msg, "info") : undefined,
        });
        return formatSummary(summary, force);
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
        const [status, cache] = await Promise.all([
          db.getStatus(),
          readMtimeCache(cfg.mtimeCachePath),
        ]);

        if (status.chunkCount === 0 && cache.size === 0) {
          return [
            "pi-index status:",
            `  Index path:    ${cfg.dbPath}`,
            "  Status:        Not built. Call codebase_index to create the index.",
            `  Auto-index:    ${cfg.autoIndex ? "on" : "off"}`,
            `  Index dirs:    ${cfg.indexDirs.join(", ")}`,
          ].join("\n");
        }

        const fileCount = cache.size;
        const lastIndexedAt =
          cache.size > 0
            ? Math.max(...[...cache.values()].map((v) => v.indexedAt))
            : null;
        const lastStr = lastIndexedAt ? relativeTime(lastIndexedAt) : "never";

        let statusStr = [
          "pi-index status:",
          `  Index path:    ${cfg.dbPath}`,
          `  Total chunks:  ${status.chunkCount}`,
          `  Files indexed: ${fileCount}`,
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
