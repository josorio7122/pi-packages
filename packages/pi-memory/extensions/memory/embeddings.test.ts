import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }],
      }),
    },
  })),
}));

describe("Embeddings", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a float array from embed()", async () => {
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    const result = await emb.embed("test text");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    expect(typeof result[0]).toBe("number");
  });

  it("calls OpenAI with the correct model and input", async () => {
    const OpenAI = (await import("openai")).default;
    const mockCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1) }],
    });
    vi.mocked(OpenAI).mockImplementationOnce(() => ({
      embeddings: { create: mockCreate },
    }) as any);
    const { Embeddings } = await import("./embeddings.js");
    const emb = new Embeddings("sk-test", "text-embedding-3-small");
    await emb.embed("hello world");
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "hello world",
    });
  });
});
