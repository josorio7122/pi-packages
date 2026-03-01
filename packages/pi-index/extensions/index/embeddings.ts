import OpenAI from "openai";
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "./constants.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) return true;
  }
  const status = (err as { status?: number })?.status;
  return status === 429;
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((res) => setTimeout(res, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }
  // TypeScript requires an unreachable throw for type narrowing
  throw new Error("[pi-index] withRetry: exhausted all retry attempts");
}

/**
 * OpenAI embedding provider with exponential-backoff retry.
 * Implements EmbeddingProvider interface.
 *
 * Supports both single-string and batch (string array) inputs via overloaded `embed`.
 * Rate-limit errors (HTTP 429) are retried up to `MAX_RETRIES` times before throwing.
 */
export class Embeddings implements EmbeddingProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Embed one or more text strings using the configured OpenAI model.
   *
   * The single-string overload returns a flat `number[]`; the array overload returns
   * `number[][]` with one vector per input in the same order.
   *
   * @param text - A single string or an array of strings to embed
   * @returns The embedding vector(s) as plain `number[]` / `number[][]`
   * @throws {Error} After `MAX_RETRIES` failed attempts when the API is rate-limited
   * @throws {Error} Immediately for any non-rate-limit API error
   */
  async embed(text: string): Promise<number[]>;
  async embed(text: string[]): Promise<number[][]>;
  async embed(text: string | string[]): Promise<number[] | number[][]> {
    const response = await withRetry(() =>
      this.client.embeddings.create({
        model: this.model,
        input: text as string, // OpenAI SDK accepts string | string[]; cast satisfies TS overload
        encoding_format: "float", // ensure plain number[] (openai 6.x defaults to base64 internally)
      })
    );
    if (Array.isArray(text)) {
      return response.data.map((d) => d.embedding);
    }
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  async getDimension(): Promise<number> {
    const dims = EMBEDDING_DIMENSIONS[this.model];
    if (dims === undefined) throw new Error(`Unknown dimension for model: ${this.model}`);
    return dims;
  }

  getProvider(): string {
    return "openai";
  }
}
