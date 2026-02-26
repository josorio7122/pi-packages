import { describe, it, expect, vi, beforeEach } from "vitest";

// Vitest 4.x: class mock factories must use `function` (not arrow functions) to be constructable.
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      },
    };
  }),
}));

describe("Embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the embedding array from the API response", async () => {
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    const result = await emb.embed("hello world");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("calls the API with the correct model and input", async () => {
    const OpenAI = (await import("openai")).default;
    const mockCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    vi.mocked(OpenAI).mockImplementationOnce(function () {
      return { embeddings: { create: mockCreate } };
    } as never);
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    await emb.embed("test input");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "text-embedding-3-small",
        input: "test input",
        encoding_format: "float",
      })
    );
  });

  it("retries embed on HTTP 429 and returns result after retry", async () => {
    vi.useFakeTimers();
    try {
      const OpenAI = (await import("openai")).default;
      let callCount = 0;
      const mockCreate = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
        }
        return { data: [{ embedding: [0.5, 0.6, 0.7] }] };
      });
      vi.mocked(OpenAI).mockImplementationOnce(function () {
        return { embeddings: { create: mockCreate } };
      } as never);
      const { Embeddings } = await import("./embeddings.js");
      const emb = new Embeddings("sk-test", "text-embedding-3-small");
      const promise = emb.embed("rate limit test");
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result).toEqual([0.5, 0.6, 0.7]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry on non-429 errors", async () => {
    const OpenAI = (await import("openai")).default;
    const mockCreate = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    vi.mocked(OpenAI).mockImplementationOnce(function () {
      return { embeddings: { create: mockCreate } };
    } as never);
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    await expect(emb.embed("test")).rejects.toThrow("Unauthorized");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
