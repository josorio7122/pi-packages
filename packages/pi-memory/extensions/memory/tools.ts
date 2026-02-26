import { Type } from "@sinclair/typebox";
import type { MemoryDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { MemoryConfig } from "./config.js";
import { MEMORY_CATEGORIES, type MemoryCategory } from "./utils.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
};

export function createMemoryTools(db: MemoryDB, emb: Pick<Embeddings, "embed">, _cfg: MemoryConfig) {
  // ─── memory_recall ──────────────────────────────────────────────────────

  const recallTool = {
    name: "memory_recall",
    label: "Memory Recall",
    description:
      "Search through long-term memories. Use when you need context about user preferences, past decisions, or previously discussed topics.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 5)" })
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { query: string; limit?: number },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown
    ): Promise<ToolResult> {
      const vector = await emb.embed(params.query);
      const results = await db.search(vector, params.limit ?? 5, 0.3);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No relevant memories found." }],
          details: { count: 0 },
        };
      }

      const lines = results.map((r, i) => {
        const pct = Math.round(r.score * 100);
        return `${i + 1}. [${r.entry.category}] ${r.entry.text} (${pct}%)`;
      });

      // Sanitize: strip vector field
      const memories = results.map((r) => {
        const { vector: _v, ...rest } = r.entry;
        return rest;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { count: results.length, memories },
      };
    },
  };

  // ─── memory_store ───────────────────────────────────────────────────────

  const storeTool = {
    name: "memory_store",
    label: "Memory Store",
    description:
      "Save important information in long-term memory. Use for preferences, facts, decisions.",
    parameters: Type.Object({
      text: Type.String({ description: "Information to remember" }),
      importance: Type.Optional(
        Type.Number({ minimum: 0, maximum: 1, description: "Importance score 0-1 (default: 0.7)" })
      ),
      category: Type.Optional(
        Type.Unsafe<MemoryCategory>({
          type: "string",
          enum: [...MEMORY_CATEGORIES],
        })
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { text: string; importance?: number; category?: MemoryCategory },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown
    ): Promise<ToolResult> {
      if (!params.text || params.text.trim().length === 0) {
        return {
          content: [{ type: "text" as const, text: "Memory text cannot be empty." }],
          details: { error: "empty_text" },
        };
      }
      const vector = await emb.embed(params.text);

      // Duplicate check at very high threshold
      const dupes = await db.search(vector, 1, 0.95);
      if (dupes.length > 0) {
        const existing = dupes[0].entry;
        return {
          content: [
            {
              type: "text",
              text: `Duplicate memory found: "${existing.text}"`,
            },
          ],
          details: {
            action: "duplicate",
            id: existing.id,
            text: existing.text,
            category: existing.category,
          },
        };
      }

      const entry = await db.store({
        text: params.text,
        vector,
        importance: params.importance ?? 0.7,
        category: params.category ?? "other",
      });

      return {
        content: [{ type: "text", text: `Memory stored with id ${entry.id}.` }],
        details: { action: "created", id: entry.id },
      };
    },
  };

  // ─── memory_forget ──────────────────────────────────────────────────────

  const forgetTool = {
    name: "memory_forget",
    label: "Memory Forget",
    description: "Delete specific memories. GDPR-compliant.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: "Search to find memory" })
      ),
      memoryId: Type.Optional(
        Type.String({ description: "Specific memory ID" })
      ),
    }),
    async execute(
      _toolCallId: string,
      params: { query?: string; memoryId?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown
    ): Promise<ToolResult> {
      // Direct delete by ID
      if (params.memoryId) {
        await db.delete(params.memoryId);
        return {
          content: [
            { type: "text", text: `Memory ${params.memoryId} deleted.` },
          ],
          details: { action: "deleted", id: params.memoryId },
        };
      }

      // Search-based delete
      if (params.query) {
        const vector = await emb.embed(params.query);
        const results = await db.search(vector, 5, 0.7);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No matching memories found." }],
            details: { action: "not_found", found: 0 },
          };
        }

        // Single high-confidence match — auto-delete
        if (results.length === 1 && results[0].score > 0.9) {
          const id = results[0].entry.id;
          await db.delete(id);
          return {
            content: [{ type: "text", text: `Memory ${id} deleted.` }],
            details: { action: "deleted", id },
          };
        }

        // Multiple matches — return candidates
        const candidates = results.map((r) => ({
          id: r.entry.id,
          text: r.entry.text.slice(0, 80),
          score: Math.round(r.score * 100),
        }));
        return {
          content: [
            {
              type: "text",
              text: `Found ${candidates.length} candidates. Specify a memoryId to delete.`,
            },
          ],
          details: { action: "candidates", candidates },
        };
      }

      // Neither provided
      return {
        content: [
          {
            type: "text",
            text: "Provide either a query or a memoryId.",
          },
        ],
        details: { error: "missing_param" },
      };
    },
  };

  return { recallTool, storeTool, forgetTool };
}
