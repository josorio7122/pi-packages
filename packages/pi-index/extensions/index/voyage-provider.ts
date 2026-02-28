import type { EmbeddingProvider } from "./embedding-provider.js";
import { withRetry } from "./embeddings.js";

const API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-code-3";

/**
 * Voyage AI embedding provider — optimized for code embeddings.
 *
 * Uses Voyage's REST API with native fetch. Requires an API key.
 * Default model is voyage-code-3 (code-optimized, ~1024 dimensions).
 */
export class VoyageProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private cachedDimension: number | null = null;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) throw new Error("[pi-index] Voyage AI API key is required");
    this.apiKey = apiKey;
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
    const result = await this.callEmbed(["dimension probe"]);
    this.cachedDimension = result[0].length;
    return this.cachedDimension;
  }

  getProvider(): string {
    return "voyage";
  }

  private async callEmbed(input: string[]): Promise<number[][]> {
    return withRetry(async () => {
      let response: Response;
      try {
        response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: this.model, input }),
        });
      } catch (err) {
        throw new Error(
          `[pi-index] Voyage AI API unreachable: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(
          `[pi-index] Voyage AI API error ${response.status}: ${body}`
        );
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      return (data.data as { embedding: number[] }[]).map(d => d.embedding);
    });
  }
}
