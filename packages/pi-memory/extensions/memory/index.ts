import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig, vectorDimsForModel } from "./config.js";
import { MemoryDB } from "./db.js";
import { Embeddings } from "./embeddings.js";
import { createMemoryTools } from "./tools.js";
import { createInjectionHook, createCaptureHook } from "./hooks.js";

export default function (pi: ExtensionAPI): void {
  let cfg: ReturnType<typeof loadConfig>;

  try {
    cfg = loadConfig();
  } catch (err) {
    throw new Error(`pi-memory: configuration error — ${String(err)}`);
  }

  const vectorDim = vectorDimsForModel(cfg.model);
  const db = new MemoryDB(cfg.dbPath, vectorDim);
  const emb = new Embeddings(cfg.apiKey, cfg.model);

  // ── Tools ────────────────────────────────────────────────────────────────
  const { recallTool, storeTool, forgetTool } = createMemoryTools(db, emb, cfg);
  pi.registerTool(recallTool as any);
  pi.registerTool(storeTool as any);
  pi.registerTool(forgetTool as any);

  // ── Injection hook ────────────────────────────────────────────────────────
  if (cfg.autoRecall) {
    const injectionHook = createInjectionHook(db, emb, cfg);

    pi.on("before_agent_start", async (event, _ctx) => {
      const result = await injectionHook({
        prompt: event.prompt ?? "",
        systemPrompt: event.systemPrompt ?? "",
      });
      return result;  // { systemPrompt: "..." } or undefined
    });
  }

  // ── Capture hook ──────────────────────────────────────────────────────────
  if (cfg.autoCapture) {
    const captureHook = createCaptureHook(db, emb, cfg);

    pi.on("agent_end", async (event, _ctx) => {
      await captureHook({ messages: (event.messages ?? []) as any });
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────
  pi.registerCommand("memory-stats", {
    description: "Show memory database stats (total count and DB path)",
    handler: async (_args, ctx) => {
      try {
        const count = await db.count();
        ctx.ui.notify(`pi-memory: ${count} memories stored at ${cfg.dbPath}`, "info");
      } catch (err) {
        ctx.ui.notify(`pi-memory: ${String(err)}`, "error");
      }
    },
  });

  pi.registerCommand("memory-search", {
    description: "Search memories: /memory-search <query>",
    handler: async (args, ctx) => {
      if (!args || args.trim().length === 0) {
        ctx.ui.notify("Usage: /memory-search <query>", "warning");
        return;
      }
      try {
        const vector = await emb.embed(args.trim());
        const results = await db.search(vector, 5, 0.3);
        if (results.length === 0) {
          ctx.ui.notify("No memories found.", "info");
          return;
        }
        const lines = results
          .map((r, i) => `${i + 1}. [${r.entry.category}] ${r.entry.text} (${(r.score * 100).toFixed(0)}%)`)
          .join("\n");
        ctx.ui.notify(`Found ${results.length} memories:\n${lines}`, "info");
      } catch (err) {
        ctx.ui.notify(`pi-memory search error: ${String(err)}`, "error");
      }
    },
  });
}
