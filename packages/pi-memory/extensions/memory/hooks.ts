import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import type { MemoryDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { MemoryConfig } from "./config.js";
import { shouldCapture, detectCategory, formatRelevantMemoriesContext, looksLikePromptInjection } from "./utils.js";

// Derive message types from the event — no extra peer dep needed.
type AgentMessage = AgentEndEvent["messages"][number];
// UserMessage is the discriminated branch where role === "user".
type UserMessage = Extract<AgentMessage, { role: "user" }>;
type UserContent = UserMessage["content"];

// ── Injection hook ─────────────────────────────────────────────────────────

export function createInjectionHook(
  db: MemoryDB,
  emb: Pick<Embeddings, "embed">,
  _cfg: MemoryConfig,
): (event: { prompt: string; systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined> {
  return async (event) => {
    if (!event.prompt || event.prompt.length < 5) {
      return undefined;
    }
    // Guard against adversarial prompts designed to surface poisoned memories
    if (looksLikePromptInjection(event.prompt)) {
      return undefined;
    }
    try {
      const vector = await emb.embed(event.prompt);
      const results = await db.search(vector, 3, 0.3);
      if (results.length === 0) {
        return undefined;
      }
      const memoriesContext = formatRelevantMemoriesContext(
        results.map((r) => ({ category: r.entry.category, text: r.entry.text })),
      );
      return { systemPrompt: event.systemPrompt + "\n\n" + memoriesContext };
    } catch {
      return undefined;
    }
  };
}

// ── Capture hook ───────────────────────────────────────────────────────────

export function createCaptureHook(
  db: MemoryDB,
  emb: Pick<Embeddings, "embed">,
  cfg: MemoryConfig,
): (event: { messages: AgentMessage[] }) => Promise<void> {
  return async (event) => {
    if (event.messages.length === 0) {
      return;
    }
    try {
      let stored = 0;
      for (const msg of event.messages) {
        if (stored >= 3) {
          break;
        }
        // Only process user messages — never self-poison from model output
        if (msg.role !== "user") {
          continue;
        }

        // TypeScript narrows msg to UserMessage here since role === "user"
        const text = extractText((msg as UserMessage).content);
        if (!text) {
          continue;
        }

        if (!shouldCapture(text, { maxChars: cfg.captureMaxChars })) {
          continue;
        }

        const vector = await emb.embed(text);
        const dupes = await db.search(vector, 1, 0.95);
        if (dupes.length > 0) {
          continue;
        }

        const category = detectCategory(text);
        await db.store({ text, vector, importance: 0.7, category });
        stored++;
      }

      if (stored > 0 && process.env.PI_MEMORY_DEBUG) {
        console.log(`pi-memory: auto-captured ${stored} memories`);
      }
    } catch (err) {
      console.warn(`pi-memory: capture failed: ${String(err)}`);
    }
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a UserMessage's content.
 * Handles both string content and content-block arrays.
 */
function extractText(content: UserContent): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }
  // TypeScript guarantees this branch is (TextContent | ImageContent)[],
  // but guard defensively against unexpected runtime shapes.
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      // TypeScript narrows block to TextContent here
      parts.push(block.text);
    }
  }
  return parts.join(" ").trim() || null;
}
