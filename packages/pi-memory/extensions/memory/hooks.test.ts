import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { MemoryConfig } from "./config.js";

const DIMS = 8;

// ─── Injection hook ──────────────────────────────────────────────────────────

describe("createInjectionHook", () => {
  let tmpPath: string;
  let db: import("./db.js").MemoryDB;
  let mockEmb: { embed: ReturnType<typeof vi.fn> };
  let cfg: MemoryConfig;

  beforeEach(async () => {
    tmpPath = `${tmpdir()}/pi-memory-hooks-test-${randomUUID()}`;
    const { MemoryDB } = await import("./db.js");
    db = new MemoryDB(tmpPath, DIMS);
    mockEmb = { embed: vi.fn().mockResolvedValue(Array(DIMS).fill(0.5)) };
    cfg = {
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      dbPath: tmpPath,
      autoCapture: true,
      autoRecall: true,
      captureMaxChars: 500,
    };
  });

  afterEach(async () => {
    await rm(tmpPath, { recursive: true, force: true });
  });

  it("returns undefined when DB is empty (no memories to inject)", async () => {
    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "What is my preferred editor?", systemPrompt: "You are a helpful assistant." });
    expect(result).toBeUndefined();
  });

  it("returns systemPrompt with injected memories when matching memories exist", async () => {
    // Pre-store a memory with the same vector the mock will return
    await db.store({
      text: "I always prefer dark mode",
      vector: Array(DIMS).fill(0.5),
      importance: 0.8,
      category: "preference",
    });

    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "What theme do I prefer?", systemPrompt: "You are a helpful assistant." });

    expect(result).toBeDefined();
    expect(result?.systemPrompt).toBeDefined();
  });

  it("returned systemPrompt contains the original systemPrompt", async () => {
    const originalPrompt = "You are a helpful assistant.";
    await db.store({
      text: "I always prefer dark mode",
      vector: Array(DIMS).fill(0.5),
      importance: 0.8,
      category: "preference",
    });

    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "What theme do I prefer?", systemPrompt: originalPrompt });

    expect(result?.systemPrompt).toContain(originalPrompt);
  });

  it("returned systemPrompt contains <relevant-memories> block", async () => {
    await db.store({
      text: "I always prefer dark mode",
      vector: Array(DIMS).fill(0.5),
      importance: 0.8,
      category: "preference",
    });

    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "What theme do I prefer?", systemPrompt: "You are helpful." });

    expect(result?.systemPrompt).toContain("<relevant-memories>");
  });

  it("returns undefined for very short prompts (< 5 chars)", async () => {
    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "hi", systemPrompt: "You are helpful." });

    expect(result).toBeUndefined();
    expect(mockEmb.embed).not.toHaveBeenCalled();
  });

  it("silently returns undefined when embed() throws", async () => {
    mockEmb.embed.mockRejectedValue(new Error("OpenAI unavailable"));

    const { createInjectionHook } = await import("./hooks.js");
    const hook = createInjectionHook(db, mockEmb as any, cfg);
    const result = await hook({ prompt: "What is my preference?", systemPrompt: "You are helpful." });

    expect(result).toBeUndefined();
  });
});

// ─── Capture hook ────────────────────────────────────────────────────────────

describe("createCaptureHook", () => {
  let tmpPath: string;
  let db: import("./db.js").MemoryDB;
  let mockEmb: { embed: ReturnType<typeof vi.fn> };
  let cfg: MemoryConfig;

  beforeEach(async () => {
    tmpPath = `${tmpdir()}/pi-memory-hooks-test-${randomUUID()}`;
    const { MemoryDB } = await import("./db.js");
    db = new MemoryDB(tmpPath, DIMS);
    mockEmb = { embed: vi.fn().mockResolvedValue(Array(DIMS).fill(0.5)) };
    cfg = {
      apiKey: "sk-test",
      model: "text-embedding-3-small",
      dbPath: tmpPath,
      autoCapture: true,
      autoRecall: true,
      captureMaxChars: 500,
    };
  });

  afterEach(async () => {
    await rm(tmpPath, { recursive: true, force: true });
  });

  it("does nothing when messages array is empty", async () => {
    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);
    await hook({ messages: [] });
    expect(await db.count()).toBe(0);
  });

  it("captures memorable user messages", async () => {
    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);
    await hook({
      messages: [
        { role: "user", content: "I always prefer dark mode" },
      ],
    });
    expect(await db.count()).toBe(1);
  });

  it("skips assistant messages (no self-poisoning)", async () => {
    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);
    await hook({
      messages: [
        { role: "assistant", content: "I always prefer dark mode for you" },
      ],
    });
    expect(await db.count()).toBe(0);
  });

  it("skips non-capturable user messages (too short or no triggers)", async () => {
    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);
    await hook({
      messages: [
        { role: "user", content: "ok" },
        { role: "user", content: "What is the weather today?" },
      ],
    });
    expect(await db.count()).toBe(0);
  });

  it("skips near-duplicate messages", async () => {
    // Pre-store a memory with the same vector mockEmb will return
    await db.store({
      text: "I always prefer dark mode",
      vector: Array(DIMS).fill(0.5),
      importance: 0.8,
      category: "preference",
    });
    const countBefore = await db.count();

    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);
    await hook({
      messages: [
        { role: "user", content: "I always prefer dark mode" },
      ],
    });

    // Count should be unchanged — duplicate was skipped
    expect(await db.count()).toBe(countBefore);
  });

  it("stores up to 3 messages per call, skips the rest", async () => {
    // Use distinct vectors per call so messages are not treated as duplicates of each other
    let callCount = 0;
    mockEmb.embed.mockImplementation(() => {
      const v = Array(DIMS).fill(0);
      v[callCount % DIMS] = 1.0; // each call gets a unique unit vector
      callCount++;
      return Promise.resolve(v);
    });

    const { createCaptureHook } = await import("./hooks.js");
    const hook = createCaptureHook(db, mockEmb as any, cfg);

    await hook({
      messages: [
        { role: "user", content: "I always prefer dark mode" },
        { role: "user", content: "I prefer tabs over spaces always" },
        { role: "user", content: "I love using TypeScript always" },
        { role: "user", content: "I never use semicolons always" },
        { role: "user", content: "I prefer vim always" },
      ],
    });

    expect(await db.count()).toBe(3);
  });
});
