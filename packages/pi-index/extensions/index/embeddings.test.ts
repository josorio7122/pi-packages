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
});
