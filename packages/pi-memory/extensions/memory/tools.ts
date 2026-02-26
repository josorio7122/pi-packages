import { Type, type Static } from "@sinclair/typebox";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MemoryDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { MemoryConfig } from "./config.js";
import { MEMORY_CATEGORIES, type MemoryCategory } from "./utils.js";

// ── TypeBox parameter schemas ────────────────────────────────────────────────

const recallParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  limit: Type.Optional(Type.Number({ description: "Max results (default: 5)" })),
});

const storeParams = Type.Object({
  text: Type.String({ description: "Information to remember" }),
  importance: Type.Optional(
    Type.Number({ minimum: 0, maximum: 1, description: "Importance score 0-1 (default: 0.7)" }),
  ),
  category: Type.Optional(
    Type.Unsafe<MemoryCategory>({ type: "string", enum: [...MEMORY_CATEGORIES] }),
  ),
});

const forgetParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Search to find memory" })),
  memoryId: Type.Optional(Type.String({ description: "Specific memory ID" })),
});

// ── Detail types for each tool ───────────────────────────────────────────────

type SanitizedMemory = {
  id: string;
  text: string;
  category: MemoryCategory;
  importance: number;
  createdAt: number;
  score: number;
};

type RecallDetails = { count: number; memories?: SanitizedMemory[] };

type StoreDetails =
  | { action: "created"; id: string }
  | { action: "duplicate"; id: string; text: string; category: MemoryCategory }
  | { error: "empty_text" };

type ForgetCandidate = { id: string; text: string; score: number };

type ForgetDetails =
  | { action: "deleted"; id: string }
  | { action: "candidates"; candidates: ForgetCandidate[] }
  | { action: "not_found"; found: 0 }
  | { error: "missing_param" };

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMemoryTools(
  db: MemoryDB,
  emb: Pick<Embeddings, "embed">,
  _cfg: MemoryConfig,
) {
  // ─── memory_recall ──────────────────────────────────────────────────────

  const recallTool = {
    name: "memory_recall",
    label: "Memory Recall",
    description:
      "Search through long-term memories. Use when you need context about user preferences, past decisions, or previously discussed topics.",
    parameters: recallParams,
    async execute(
      _toolCallId: string,
      params: Static<typeof recallParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<RecallDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<RecallDetails>> {
      const vector = await emb.embed(params.query);
      const results = await db.search(vector, params.limit ?? 5, 0.1);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No relevant memories found." }],
          details: { count: 0 },
        };
      }

      const text = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.entry.category}] ${r.entry.text} (${(r.score * 100).toFixed(0)}%)`,
        )
        .join("\n");

      // Sanitize: strip the vector field before serialization
      const memories: SanitizedMemory[] = results.map((r) => ({
        id: r.entry.id,
        text: r.entry.text,
        category: r.entry.category,
        importance: r.entry.importance,
        createdAt: r.entry.createdAt,
        score: r.score,
      }));

      return {
        content: [{ type: "text", text: `Found ${results.length} memories:\n\n${text}` }],
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
    parameters: storeParams,
    async execute(
      _toolCallId: string,
      params: Static<typeof storeParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<StoreDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<StoreDetails>> {
      if (!params.text || params.text.trim().length === 0) {
        return {
          content: [{ type: "text", text: "Memory text cannot be empty." }],
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
            { type: "text", text: `Similar memory already exists: "${existing.text}"` },
          ],
          details: { action: "duplicate", id: existing.id, text: existing.text, category: existing.category },
        };
      }

      const entry = await db.store({
        text: params.text,
        vector,
        importance: params.importance ?? 0.7,
        category: params.category ?? "other",
      });

      return {
        content: [{ type: "text", text: `Stored: "${params.text.slice(0, 100)}..."` }],
        details: { action: "created", id: entry.id },
      };
    },
  };

  // ─── memory_forget ──────────────────────────────────────────────────────

  const forgetTool = {
    name: "memory_forget",
    label: "Memory Forget",
    description: "Delete specific memories. GDPR-compliant.",
    parameters: forgetParams,
    async execute(
      _toolCallId: string,
      params: Static<typeof forgetParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<ForgetDetails> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<ForgetDetails>> {
      // Direct delete by ID
      if (params.memoryId) {
        await db.delete(params.memoryId);
        return {
          content: [{ type: "text", text: `Memory ${params.memoryId} forgotten.` }],
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
            content: [{ type: "text", text: `Forgotten: "${results[0].entry.text}"` }],
            details: { action: "deleted", id },
          };
        }

        // Multiple matches — return candidates
        const candidates: ForgetCandidate[] = results.map((r) => ({
          id: r.entry.id,
          text: r.entry.text.slice(0, 60),
          score: Math.round(r.score * 100),
        }));
        const list = candidates
          .map((c) => `- [${c.id.slice(0, 8)}] ${c.text}...`)
          .join("\n");
        return {
          content: [
            { type: "text", text: `Found ${results.length} candidates. Specify memoryId:\n${list}` },
          ],
          details: { action: "candidates", candidates },
        };
      }

      // Neither provided
      return {
        content: [{ type: "text", text: "Provide query or memoryId." }],
        details: { error: "missing_param" },
      };
    },
  };

  return { recallTool, storeTool, forgetTool };
}
