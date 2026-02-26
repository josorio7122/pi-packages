import { describe, it, expect } from "vitest";
import { parseConfig, resolveDbPath, vectorDimsForModel } from "./config.js";
import { homedir } from "node:os";

describe("vectorDimsForModel", () => {
  it("returns 1536 for text-embedding-3-small", () => {
    expect(vectorDimsForModel("text-embedding-3-small")).toBe(1536);
  });
  it("returns 3072 for text-embedding-3-large", () => {
    expect(vectorDimsForModel("text-embedding-3-large")).toBe(3072);
  });
  it("throws for unknown model", () => {
    expect(() => vectorDimsForModel("gpt-4")).toThrow("Unsupported embedding model");
  });
});

describe("parseConfig", () => {
  it("parses valid config with defaults", () => {
    const cfg = parseConfig({ apiKey: "sk-test" });
    expect(cfg.apiKey).toBe("sk-test");
    expect(cfg.model).toBe("text-embedding-3-small");
    expect(cfg.autoRecall).toBe(true);
    expect(cfg.autoCapture).toBe(false);
    expect(cfg.captureMaxChars).toBe(500);
    expect(cfg.dbPath).toContain(".pi-memory/lancedb");
  });
  it("respects explicit model override", () => {
    const cfg = parseConfig({ apiKey: "sk-test", model: "text-embedding-3-large" });
    expect(cfg.model).toBe("text-embedding-3-large");
  });
  it("throws when apiKey is missing", () => {
    expect(() => parseConfig({})).toThrow("apiKey is required");
  });
  it("throws for unknown model", () => {
    expect(() => parseConfig({ apiKey: "sk-test", model: "gpt-4" })).toThrow(
      "Unsupported embedding model"
    );
  });
  it("throws for captureMaxChars below range", () => {
    expect(() => parseConfig({ apiKey: "sk-test", captureMaxChars: 50 })).toThrow(
      "captureMaxChars must be between 100 and 10000"
    );
  });
  it("throws for captureMaxChars above range", () => {
    expect(() => parseConfig({ apiKey: "sk-test", captureMaxChars: 20_000 })).toThrow(
      "captureMaxChars must be between 100 and 10000"
    );
  });
  it("autoCapture defaults to false", () => {
    expect(parseConfig({ apiKey: "sk", autoCapture: false }).autoCapture).toBe(false);
  });
  it("autoRecall defaults to true", () => {
    expect(parseConfig({ apiKey: "sk" }).autoRecall).toBe(true);
  });
  it("autoRecall can be disabled", () => {
    expect(parseConfig({ apiKey: "sk", autoRecall: false }).autoRecall).toBe(false);
  });
});

describe("resolveDbPath", () => {
  it("expands ~ to home directory", () => {
    const result = resolveDbPath("~/.pi-memory/lancedb");
    expect(result).not.toContain("~");
    expect(result).toContain(".pi-memory/lancedb");
    expect(result.startsWith(homedir())).toBe(true);
  });
  it("leaves absolute paths unchanged", () => {
    const result = resolveDbPath("/tmp/test-db");
    expect(result).toBe("/tmp/test-db");
  });
});
