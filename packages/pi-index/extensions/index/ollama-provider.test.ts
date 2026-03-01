import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmbeddingProvider } from "./embedding-provider.js";

describe("OllamaProvider", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("implements EmbeddingProvider interface", async () => {
    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();
    expect(typeof provider.embed).toBe("function");
    expect(typeof provider.embedBatch).toBe("function");
    expect(typeof provider.getDimension).toBe("function");
    expect(typeof provider.getProvider).toBe("function");
  });

  it("getProvider returns 'ollama'", async () => {
    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();
    expect(provider.getProvider()).toBe("ollama");
  });

  it("embed sends correct request to Ollama API", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();
    const result = await provider.embed("hello world");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/embed",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: ["hello world"],
        }),
      }),
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("embedBatch sends all texts in a single request", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();
    const result = await provider.embedBatch(["a", "b", "c"]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[2]).toEqual([0.5, 0.6]);
    // Should be a single API call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("getDimension probes with test text and returns vector length", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3, 0.4]],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();
    const dim = await provider.getDimension();

    expect(dim).toBe(4);
    // Second call should use cached dimension
    const dim2 = await provider.getDimension();
    expect(dim2).toBe(4);
    // fetch should only have been called once for the probe
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses custom host and model from constructor", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        embeddings: [[0.1]],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider("http://myhost:11434", "mxbai-embed-large");
    await provider.embed("test");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://myhost:11434/api/embed",
      expect.objectContaining({
        body: JSON.stringify({
          model: "mxbai-embed-large",
          input: ["test"],
        }),
      }),
    );
  });

  it("throws descriptive error when Ollama server is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();

    await expect(provider.embed("test")).rejects.toThrow(/Ollama.*unreachable|fetch failed/i);
  });

  it("throws descriptive error when API returns non-ok status", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("model not found"),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider();

    await expect(provider.embed("test")).rejects.toThrow(/404|not found/i);
  });

  it("retries on rate limit (429) errors", async () => {
    vi.useFakeTimers();
    try {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            statusText: "Too Many Requests",
            text: vi.fn().mockResolvedValue("rate limited"),
          };
        }
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({
            embeddings: [[0.1, 0.2]],
          }),
        };
      });

      const { OllamaProvider } = await import("./ollama-provider.js");
      const provider = new OllamaProvider();

      const promise = provider.embed("test");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([0.1, 0.2]);
      expect(callCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("strips trailing slash from host URL", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ embeddings: [[0.1]] }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { OllamaProvider } = await import("./ollama-provider.js");
    const provider = new OllamaProvider("http://localhost:11434/");
    await provider.embed("test");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/embed",
      expect.anything(),
    );
  });
});
