import { describe, it, expect, vi, beforeEach } from "vitest";

describe("EmbeddingProvider interface", () => {
  it("Embeddings class implements EmbeddingProvider interface", async () => {
    // Verify Embeddings has all required methods
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");

    // Check interface conformance
    expect(typeof emb.embed).toBe("function");
    expect(typeof emb.embedBatch).toBe("function");
    expect(typeof emb.getDimension).toBe("function");
    expect(typeof emb.getProvider).toBe("function");
  });

  it("getDimension returns correct dimension for text-embedding-3-small", async () => {
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    const dim = await emb.getDimension();
    expect(dim).toBe(1536);
  });

  it("getDimension returns correct dimension for text-embedding-3-large", async () => {
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-large");
    const dim = await emb.getDimension();
    expect(dim).toBe(3072);
  });

  it("getProvider returns 'openai'", async () => {
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    expect(emb.getProvider()).toBe("openai");
  });

  it("embedBatch calls embed with array and returns number[][]", async () => {
    // Reset module registry so vi.doMock takes effect before the import
    vi.resetModules();
    vi.doMock("openai", () => ({
      default: vi.fn().mockImplementation(function () {
        return {
          embeddings: {
            create: vi.fn().mockResolvedValue({
              data: [
                { embedding: [0.1, 0.2] },
                { embedding: [0.3, 0.4] },
              ],
            }),
          },
        };
      }),
    }));

    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    const result = await emb.embedBatch(["hello", "world"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.3, 0.4]);

    vi.doUnmock("openai");
    vi.resetModules();
  });

  it("withRetry is exported and functional", async () => {
    const { withRetry } = await import("./embeddings.js");
    expect(typeof withRetry).toBe("function");

    // Should succeed on first try
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("isRateLimitError is exported and detects 429 status", async () => {
    const { isRateLimitError } = await import("./embeddings.js");
    expect(typeof isRateLimitError).toBe("function");

    expect(isRateLimitError(Object.assign(new Error("rate limit"), { status: 429 }))).toBe(true);
    expect(isRateLimitError(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe(false);
    expect(isRateLimitError(new Error("some other error"))).toBe(false);
  });
});
