import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.js";
import { IndexDB } from "./db.js";
import { Embeddings } from "./embeddings.js";
import { Indexer } from "./indexer.js";
import { Searcher } from "./searcher.js";
import { createIndexTools } from "./tools.js";
import { readMtimeCache, writeMtimeCache } from "./walker.js";
import { relativeTime } from "./utils.js";

const RULE = "─".repeat(39);

export default function (pi: ExtensionAPI): void {
  // The index root is the directory where pi is running (the project root)
  const indexRoot = process.cwd();

  // Load config — if it fails (missing API key), register stub tools + commands that report the error
  let cfg: ReturnType<typeof loadConfig>;
  try {
    cfg = loadConfig(indexRoot);
  } catch (_err) {
    const errorMsg = "Error: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.";
    // Register stub tools
    for (const name of ["codebase_search", "codebase_index", "codebase_status"]) {
      pi.registerTool({
        name,
        description: `pi-index: ${name} (disabled)`,
        parameters: { type: "object", properties: {} },
        handler: async () => errorMsg,
      } as never);
    }
    // Register /index-status with API-key-missing warning output
    pi.registerCommand("index-status", {
      description: "Show pi-index status",
      handler: async (_args, ctx) => {
        ctx.ui.notify(
          [
            "pi-index status",
            RULE,
            "⚠ Warning: OPENAI_API_KEY is not set. Indexing and search are disabled.",
            `Index path:    ${indexRoot}/.pi/index/lancedb`,
            "Status:        Not built",
            RULE,
          ].join("\n"),
          "info",
        );
      },
    });
    // Register stub /index-rebuild
    pi.registerCommand("index-rebuild", {
      description: "Force-rebuild the codebase index",
      handler: async (_args, ctx) => {
        ctx.ui.notify(
          "Index rebuild failed: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.",
          "error",
        );
      },
    });
    // Register stub /index-clear
    pi.registerCommand("index-clear", {
      description: "Clear the codebase index",
      handler: async (_args, ctx) => {
        ctx.ui.notify(
          "Index clear failed: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.",
          "error",
        );
      },
    });
    return;
  }

  // Build the dependency graph
  const db = new IndexDB(cfg.dbPath, cfg.dimensions);
  const emb = new Embeddings(cfg.apiKey, cfg.model);
  const indexer = new Indexer(cfg, db, emb);
  const searcher = new Searcher(db, emb, cfg);

  // Register the three LLM tools
  const { tools } = createIndexTools(searcher, indexer, db, cfg);
  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: tool.handler,
    } as never);
  }

  // Auto-index hook: triggers incremental refresh on every session start
  if (cfg.autoIndex) {
    pi.on("before_agent_start", async (_event, _ctx) => {
      try {
        await indexer.run();
      } catch {
        // Silent — auto-index failures never block the session
      }
      return undefined;
    });
  }

  // ─── Slash commands ──────────────────────────────────────────────────────

  pi.registerCommand("index-status", {
    description: "Show pi-index status — chunk count, files indexed, last indexed time",
    handler: async (_args, ctx) => {
      try {
        const status = await db.getStatus();
        const cache = await readMtimeCache(cfg.mtimeCachePath);

        if (status.chunkCount === 0 && cache.size === 0) {
          ctx.ui.notify(
            [
              "pi-index status",
              RULE,
              `Index path:    ${cfg.dbPath}`,
              "Status:        Not built",
              "               Run /index-rebuild or call codebase_index to create the index.",
              `Model:         ${cfg.model}`,
              `Auto-index:    ${cfg.autoIndex ? "on" : "off"}`,
              `Index dirs:    ${cfg.indexDirs.join(", ")}`,
              RULE,
            ].join("\n"),
            "info",
          );
          return;
        }

        const rebuilding = indexer.isRunning;
        const lastStr = status.lastIndexedAt
          ? relativeTime(status.lastIndexedAt)
          : "never";

        const lines = [
          "pi-index status",
          RULE,
          `Index path:    ${cfg.dbPath}`,
          `Total chunks:  ${status.chunkCount.toLocaleString()}`,
          `Files indexed: ${status.fileCount.toLocaleString()}`,
          `Last indexed:  ${lastStr}${status.lastIndexedAt ? `  (${new Date(status.lastIndexedAt).toISOString().slice(0, 16).replace("T", " ")})` : ""}`,
          `Model:         ${cfg.model}`,
          `Auto-index:    ${cfg.autoIndex ? "on" : "off"}`,
          `Index dirs:    ${cfg.indexDirs.join(", ")}`,
          RULE,
        ];
        if (rebuilding) lines.push("(Index currently rebuilding…)");

        ctx.ui.notify(lines.join("\n"), "info");
      } catch (err) {
        // Spec: /index-status never fails — report unreadable state gracefully
        ctx.ui.notify(
          [
            "pi-index status",
            RULE,
            "Status:        Could not read index state.",
            `               ${String(err)}`,
            `Index path:    ${cfg.dbPath}`,
            RULE,
          ].join("\n"),
          "info",
        );
      }
    },
  });

  pi.registerCommand("index-rebuild", {
    description: "Force-rebuild the entire codebase index from scratch",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Rebuilding index… (this may take several minutes on first run)", "info");
      try {
        const summary = await indexer.run({ force: true });
        ctx.ui.notify(
          [
            "Index rebuilt:",
            `  Added:   ${summary.added} files (${summary.addedChunks} chunks)`,
            `  Skipped: ${summary.skippedTooLarge} files (too large)`,
            `  Time:    ${Math.round(summary.elapsedMs / 1000)}s`,
          ].join("\n"),
          "info",
        );
      } catch (err) {
        const msg = String(err);
        if (msg.includes("INDEX_ALREADY_RUNNING")) {
          ctx.ui.notify(
            "Index rebuild failed: [INDEX_ALREADY_RUNNING] Wait for the current index to complete.",
            "error",
          );
        } else if (msg.includes("CONFIG_MISSING_API_KEY")) {
          ctx.ui.notify(
            "Index rebuild failed: [CONFIG_MISSING_API_KEY] Set OPENAI_API_KEY or PI_INDEX_API_KEY to enable pi-index.",
            "error",
          );
        } else {
          ctx.ui.notify(`Index rebuild failed: ${msg}`, "error");
        }
      }
    },
  });

  pi.registerCommand("index-clear", {
    description: "Delete the entire codebase index (chunks and mtime cache)",
    handler: async (_args, ctx) => {
      try {
        await db.deleteAll();
        await writeMtimeCache(cfg.mtimeCachePath, new Map());
        ctx.ui.notify("Index cleared. Run /index-rebuild or codebase_index to rebuild.", "info");
      } catch (err) {
        ctx.ui.notify(`Failed to clear index: ${String(err)}`, "error");
      }
    },
  });
}
