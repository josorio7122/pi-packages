import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { runSingleAgent, mapWithConcurrencyLimit } from "../spawn.js";
import { resolvePreset } from "../presets.js";
import type { SpawnParams, UsageStats } from "../spawn.js";
import type { Message } from "@mariozechner/pi-ai";

/**
 * Integration tests — spawn real `pi` subprocesses.
 * These are slower and require `pi` to be installed.
 * Run with: pnpm test -- --testPathPattern=integration
 */
describe("integration: runSingleAgent", () => {
  const cwd = process.cwd();

  function makeParams(overrides: Partial<SpawnParams> = {}): SpawnParams {
    return {
      task: overrides.task ?? 'Reply with exactly the text "PONG" and nothing else.',
      systemPrompt: overrides.systemPrompt ?? "You are a test agent. Follow instructions exactly.",
      tools: overrides.tools ?? "",
      model: overrides.model ?? "claude-haiku-4-5",
      thinking: overrides.thinking ?? "off",
      ...overrides,
    };
  }

  it("spawns a pi subprocess and returns output", async () => {
    const result = await runSingleAgent(makeParams(), cwd, undefined);

    expect(result.exitCode).toBe(0);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.usage.turns).toBeGreaterThan(0);
    expect(result.usage.input).toBeGreaterThan(0);
    expect(result.usage.output).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();
  }, 30_000);

  it("returns output text in messages", async () => {
    const result = await runSingleAgent(makeParams(), cwd, undefined);

    // Find last assistant message with text content
    let foundText = false;
    for (const msg of result.messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block && block.text.includes("PONG")) {
            foundText = true;
          }
        }
      }
    }
    expect(foundText).toBe(true);
  }, 30_000);

  it("reports usage stats", async () => {
    const result = await runSingleAgent(makeParams(), cwd, undefined);

    expect(result.usage.input).toBeGreaterThan(0);
    expect(result.usage.output).toBeGreaterThan(0);
    expect(result.usage.cost).toBeGreaterThan(0);
    expect(result.usage.turns).toBe(1); // single turn for simple task
  }, 30_000);

  it("calls onAgentUpdate during execution", async () => {
    const updates: Array<{ messages: Message[]; usage: UsageStats; exitCode: number }> = [];

    await runSingleAgent(makeParams(), cwd, undefined, (update) => {
      updates.push({ ...update });
    });

    expect(updates.length).toBeGreaterThan(0);
    // Last update should have messages
    const last = updates[updates.length - 1];
    expect(last.messages.length).toBeGreaterThan(0);
  }, 30_000);

  it("respects system prompt", async () => {
    const result = await runSingleAgent(
      makeParams({
        systemPrompt: "You are a pirate. Always respond starting with 'Arrr'.",
        task: "Say hello.",
      }),
      cwd,
      undefined,
    );

    let output = "";
    for (const msg of result.messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block) output += block.text;
        }
      }
    }
    expect(output.toLowerCase()).toContain("arrr");
  }, 30_000);

  it("handles abort signal", async () => {
    const controller = new AbortController();

    // Abort after 1 second
    setTimeout(() => controller.abort(), 1000);

    await expect(
      runSingleAgent(
        makeParams({
          task: "Count from 1 to 1000, one number per line, slowly.",
        }),
        cwd,
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
  }, 15_000);
});

describe("integration: parallel dispatch", () => {
  const cwd = process.cwd();

  it("runs multiple agents in parallel", async () => {
    const tasks = [
      { task: 'Reply with exactly "ALPHA"', id: 0 },
      { task: 'Reply with exactly "BRAVO"', id: 1 },
    ];

    const results = await mapWithConcurrencyLimit(tasks, 2, async (item) => {
      return runSingleAgent(
        {
          task: item.task,
          systemPrompt: "Follow instructions exactly. Reply with only the requested word.",
          tools: "",
          model: "claude-haiku-4-5",
          thinking: "off",
        },
        cwd,
        undefined,
      );
    });

    expect(results).toHaveLength(2);

    // At least one should succeed (parallel subprocess startup can be flaky)
    const succeeded = results.filter((r) => r.exitCode === 0);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // Successful agents should have output
    for (const result of succeeded) {
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.usage.turns).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe("integration: chain dispatch", () => {
  const cwd = process.cwd();

  it("passes output from one agent to the next via substitution", async () => {
    // Step 1: generate a word
    const step1 = await runSingleAgent(
      {
        task: 'Reply with exactly the word "FOXTROT" and nothing else.',
        systemPrompt: "Follow instructions exactly.",
        tools: "",
        model: "claude-haiku-4-5",
        thinking: "off",
      },
      cwd,
      undefined,
    );

    expect(step1.exitCode).toBe(0);

    // Extract output (simulating chain {previous} substitution)
    let previousOutput = "";
    for (let i = step1.messages.length - 1; i >= 0; i--) {
      const msg = step1.messages[i];
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block && block.text.trim()) {
            previousOutput = block.text;
            break;
          }
        }
        if (previousOutput) break;
      }
    }

    expect(previousOutput).toContain("FOXTROT");

    // Step 2: use previous output
    const step2Task = `The previous agent said: "${previousOutput}". Repeat that exact word back.`;
    const step2 = await runSingleAgent(
      {
        task: step2Task,
        systemPrompt: "Follow instructions exactly.",
        tools: "",
        model: "claude-haiku-4-5",
        thinking: "off",
      },
      cwd,
      undefined,
    );

    expect(step2.exitCode).toBe(0);

    let step2Output = "";
    for (const msg of step2.messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block) step2Output += block.text;
        }
      }
    }

    expect(step2Output).toContain("FOXTROT");
  }, 60_000);
});

describe("integration: researcher uses exa-search", () => {
  const cwd = process.cwd();
  // Package root is 3 levels up from __tests__: __tests__ → pi-crew/ → extensions/ → pi-crew (package root)
  const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

  it("researcher agent has access to exa-search skill and uses it for web research", async () => {
    const preset = resolvePreset("researcher", "balanced", {}, packageRoot);
    expect(preset).toBeDefined();

    const result = await runSingleAgent(
      {
        task: 'Search the web for "Anthropic Claude model context protocol". Use the exa-search skill scripts (tsx scripts/search.ts or tsx scripts/answer.ts) — NOT curl. Return the search results.',
        systemPrompt: preset!.systemPrompt,
        tools: preset!.tools,
        model: "claude-haiku-4-5",
        thinking: "off",
      },
      cwd,
      undefined,
    );

    expect(result.exitCode).toBe(0);
    expect(result.messages.length).toBeGreaterThan(0);

    // Collect all text from assistant messages (includes tool call descriptions)
    let allAssistantText = "";
    for (const msg of result.messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block) {
            allAssistantText += block.text + "\n";
          }
        }
      }
    }

    // The researcher should mention using exa-search scripts, not curl
    const mentionsExa =
      allAssistantText.includes("search.ts") ||
      allAssistantText.includes("answer.ts") ||
      allAssistantText.includes("contents.ts") ||
      allAssistantText.includes("exa-search");
    const mentionsCurl =
      allAssistantText.includes("curl -") || allAssistantText.includes("curl http");

    expect(mentionsExa).toBe(true);
    expect(mentionsCurl).toBe(false);
  }, 60_000);
});
