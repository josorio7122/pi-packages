import OpenAI from "openai";

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1000;

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) return true;
  }
  const status = (err as { status?: number })?.status;
  return status === 429;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
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

export class Embeddings {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

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
}
