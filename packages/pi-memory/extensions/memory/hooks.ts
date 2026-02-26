import type { MemoryDB } from "./db.js";
import type { Embeddings } from "./embeddings.js";
import type { MemoryConfig } from "./config.js";
import { shouldCapture, detectCategory, formatRelevantMemoriesContext, looksLikePromptInjection } from "./utils.js";

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

export function createCaptureHook(
  db: MemoryDB,
  emb: Pick<Embeddings, "embed">,
  cfg: MemoryConfig,
): (event: { messages: Array<{ role: string; content: unknown }> }) => Promise<void> {
  return async (event) => {
    if (event.messages.length === 0) {
      return;
    }
    try {
      let stored = 0;
      for (const message of event.messages) {
        if (stored >= 3) {
          break;
        }
        if (message.role !== "user") {
          continue;
        }

        const text = extractText(message.content);
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

function extractText(content: unknown): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
    const joined = parts.join(" ").trim();
    return joined || null;
  }
  return null;
}
