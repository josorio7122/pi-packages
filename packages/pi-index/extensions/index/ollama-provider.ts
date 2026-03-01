import type { EmbeddingProvider } from "./embedding-provider.js";
import { withRetry } from "./embeddings.js";

const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "nomic-embed-text";

/**
 * Ollama embedding provider — runs locally, no API key required.
 *
 * Uses Ollama's HTTP API (/api/embed) with native fetch.
 * Supports batch embedding in a single request.
 */
export class OllamaProvider implements EmbeddingProvider {
  private readonly host: string;
  private readonly model: string;
  private cachedDimension: number | null = null;

  constructor(host?: string, model?: string) {
    this.host = (host ?? DEFAULT_HOST).replace(/\/+$/, ""); // strip trailing slash
    this.model = model ?? DEFAULT_MODEL;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.callEmbed([text]);
    return result[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.callEmbed(texts);
  }

  async getDimension(): Promise<number> {
    if (this.cachedDimension !== null) return this.cachedDimension;
    // Probe with a tiny test string
    const result = await this.callEmbed(["dimension probe"]);
    this.cachedDimension = result[0].length;
    return this.cachedDimension;
  }

  getProvider(): string {
    return "ollama";
  }

  private async callEmbed(input: string[]): Promise<number[][]> {
    return withRetry(async () => {
      let response: Response;
      try {
        response = await fetch(`${this.host}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, input }),
        });
      } catch (err) {
        throw new Error(
          `[pi-index] Ollama server unreachable at ${this.host}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(
          `[pi-index] Ollama API error ${response.status}: ${body}`,
        );
        // Attach status so withRetry/isRateLimitError can detect 429s
        (error as unknown as { status: number }).status = response.status;
        throw error;
      }

      const data = (await response.json()) as { embeddings: number[][] };
      return data.embeddings;
    });
  }
}
