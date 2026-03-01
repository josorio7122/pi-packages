import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("VoyageProvider", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("implements EmbeddingProvider interface", async () => {
    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    expect(typeof provider.embed).toBe("function");
    expect(typeof provider.embedBatch).toBe("function");
    expect(typeof provider.getDimension).toBe("function");
    expect(typeof provider.getProvider).toBe("function");
  });

  it("getProvider returns 'voyage'", async () => {
    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    expect(provider.getProvider()).toBe("voyage");
  });

  it("embed sends correct request to Voyage API", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    const result = await provider.embed("hello world");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer voy-test-key",
        },
        body: JSON.stringify({
          model: "voyage-code-3",
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
        data: [
          { embedding: [0.1, 0.2] },
          { embedding: [0.3, 0.4] },
          { embedding: [0.5, 0.6] },
        ],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    const result = await provider.embedBatch(["a", "b", "c"]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[2]).toEqual([0.5, 0.6]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("getDimension probes and caches result", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    const dim = await provider.getDimension();
    expect(dim).toBe(5);

    // Second call uses cache — no additional fetch
    const dim2 = await provider.getDimension();
    expect(dim2).toBe(5);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses custom model from constructor", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1] }],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key", "voyage-3-lite");
    await provider.embed("test");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        body: JSON.stringify({
          model: "voyage-3-lite",
          input: ["test"],
        }),
      }),
    );
  });

  it("throws when API key is not provided", async () => {
    const { VoyageProvider } = await import("./voyage-provider.js");
    expect(() => new VoyageProvider("")).toThrow(/API key.*required/i);
  });

  it("throws descriptive error on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: vi.fn().mockResolvedValue("invalid api key"),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-bad-key");
    await expect(provider.embed("test")).rejects.toThrow(/401|unauthorized/i);
  });

  it("retries on 429 rate limit", async () => {
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
            data: [{ embedding: [0.1, 0.2] }],
          }),
        };
      });

      const { VoyageProvider } = await import("./voyage-provider.js");
      const provider = new VoyageProvider("voy-test-key");
      const promise = provider.embed("test");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual([0.1, 0.2]);
      expect(callCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws descriptive error when fetch fails (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const { VoyageProvider } = await import("./voyage-provider.js");
    const provider = new VoyageProvider("voy-test-key");
    await expect(provider.embed("test")).rejects.toThrow(/Voyage.*unreachable|network error/i);
  });
});
