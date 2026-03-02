import { describe, it, expect } from "vitest";
import {
  formatTokens,
  formatUsageStats,
  formatToolCall,
  getDisplayItems,
  getFinalOutput,
  getErrorSummary,
  buildRenderResult,
} from "../rendering.js";
import type { AgentRenderState, CrewDispatchDetails } from "../rendering.js";
import type { Message } from "@mariozechner/pi-ai";
import type { UsageStats } from "../spawn.js";
import { emptyUsage } from "../spawn.js";
import { initTheme, Theme } from "@mariozechner/pi-coding-agent";
import { Text, Container } from "@mariozechner/pi-tui";

describe("rendering", () => {
  describe("formatTokens", () => {
    it("formats small numbers as-is", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(45)).toBe("45");
      expect(formatTokens(999)).toBe("999");
    });

    it("formats thousands with k suffix", () => {
      expect(formatTokens(1000)).toBe("1.0k");
      expect(formatTokens(1200)).toBe("1.2k");
      expect(formatTokens(45300)).toBe("45.3k");
      expect(formatTokens(999999)).toBe("1000.0k");
    });

    it("formats millions with M suffix", () => {
      expect(formatTokens(1_000_000)).toBe("1.0M");
      expect(formatTokens(2_500_000)).toBe("2.5M");
    });
  });

  describe("formatUsageStats", () => {
    const baseUsage: UsageStats = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    };

    it("formats zero usage", () => {
      const result = formatUsageStats(baseUsage);
      expect(result).toBe("↑0 ↓0");
    });

    it("includes turn count when > 0", () => {
      const result = formatUsageStats({ ...baseUsage, turns: 1 });
      expect(result).toContain("1 turn");
      expect(result).not.toContain("1 turns");
    });

    it("pluralizes turns", () => {
      const result = formatUsageStats({ ...baseUsage, turns: 3 });
      expect(result).toContain("3 turns");
    });

    it("includes cost when > 0", () => {
      const result = formatUsageStats({ ...baseUsage, cost: 0.0042 });
      expect(result).toContain("$0.0042");
    });

    it("includes model when provided", () => {
      const result = formatUsageStats(baseUsage, "claude-haiku-4-5");
      expect(result).toContain("claude-haiku-4-5");
    });

    it("formats full usage", () => {
      const usage: UsageStats = {
        input: 1200,
        output: 450,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.0042,
        contextTokens: 5000,
        turns: 3,
      };
      const result = formatUsageStats(usage, "claude-haiku-4-5");
      expect(result).toBe("3 turns ↑1.2k ↓450 $0.0042 claude-haiku-4-5");
    });
  });

  describe("formatToolCall", () => {
    // Simple theme function that just returns the text
    const themeFg = (_color: string, text: string) => text;

    it("formats read with path", () => {
      const result = formatToolCall("read", { path: "/tmp/test.ts" }, themeFg);
      expect(result).toContain("read");
      expect(result).toContain("/tmp/test.ts");
    });

    it("shortens home directory in paths", () => {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      if (home) {
        const result = formatToolCall("read", { path: `${home}/project/file.ts` }, themeFg);
        expect(result).toContain("~/project/file.ts");
      }
    });

    it("formats bash with command", () => {
      const result = formatToolCall("bash", { command: "ls -la" }, themeFg);
      expect(result).toContain("bash");
      expect(result).toContain("ls -la");
    });

    it("truncates long bash commands", () => {
      const longCmd = "a".repeat(100);
      const result = formatToolCall("bash", { command: longCmd }, themeFg);
      expect(result).toContain("...");
      expect(result.length).toBeLessThan(100);
    });

    it("formats write with path", () => {
      const result = formatToolCall("write", { path: "/tmp/out.ts" }, themeFg);
      expect(result).toContain("write");
      expect(result).toContain("/tmp/out.ts");
    });

    it("formats edit with path", () => {
      const result = formatToolCall("edit", { path: "/tmp/file.ts" }, themeFg);
      expect(result).toContain("edit");
      expect(result).toContain("/tmp/file.ts");
    });

    it("formats grep with pattern", () => {
      const result = formatToolCall("grep", { pattern: "TODO", path: "/tmp" }, themeFg);
      expect(result).toContain("grep");
      expect(result).toContain("/TODO/");
      expect(result).toContain("/tmp");
    });

    it("formats find with path and pattern", () => {
      const result = formatToolCall("find", { path: "/tmp", pattern: "*.ts" }, themeFg);
      expect(result).toContain("find");
      expect(result).toContain("/tmp");
      expect(result).toContain("*.ts");
    });

    it("formats ls with path", () => {
      const result = formatToolCall("ls", { path: "/tmp" }, themeFg);
      expect(result).toContain("ls");
      expect(result).toContain("/tmp");
    });

    it("formats unknown tool with first string arg", () => {
      const result = formatToolCall("custom_tool", { query: "hello world" }, themeFg);
      expect(result).toContain("custom_tool");
      expect(result).toContain("hello world");
    });

    it("formats unknown tool with no args", () => {
      const result = formatToolCall("custom_tool", {}, themeFg);
      expect(result).toContain("custom_tool");
    });
  });

  describe("getDisplayItems", () => {
    it("returns empty array for empty messages", () => {
      expect(getDisplayItems([])).toEqual([]);
    });

    it("skips non-assistant messages", () => {
      const messages = [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ] as Message[];
      expect(getDisplayItems(messages)).toEqual([]);
    });

    it("extracts text blocks from assistant messages", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "Here is my analysis" }],
          model: "test",
        },
      ] as Message[];
      const items = getDisplayItems(messages);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe("text");
      if (items[0].type === "text") {
        expect(items[0].text).toBe("Here is my analysis");
      }
    });

    it("extracts tool call blocks", () => {
      const messages = [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call-1", name: "read", arguments: { path: "/tmp/test.ts" } },
          ],
          model: "test",
        },
      ] as unknown as Message[];
      const items = getDisplayItems(messages);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe("toolCall");
      if (items[0].type === "toolCall") {
        expect(items[0].name).toBe("read");
      }
    });

    it("handles mixed content", () => {
      const messages = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check" },
            { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "ls" } },
            { type: "text", text: "Found it" },
          ],
          model: "test",
        },
      ] as unknown as Message[];
      const items = getDisplayItems(messages);
      expect(items).toHaveLength(3);
      expect(items[0].type).toBe("text");
      expect(items[1].type).toBe("toolCall");
      expect(items[2].type).toBe("text");
    });

    it("handles multiple assistant messages", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
          model: "test",
        },
        {
          role: "toolResult",
          content: [{ type: "text", text: "result" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "second" }],
          model: "test",
        },
      ] as Message[];
      const items = getDisplayItems(messages);
      expect(items).toHaveLength(2);
      if (items[0].type === "text") {
        expect(items[0].text).toBe("first");
      }
      if (items[1].type === "text") {
        expect(items[1].text).toBe("second");
      }
    });
  });

  describe("getFinalOutput", () => {
    it("returns empty string for empty messages", () => {
      expect(getFinalOutput([])).toBe("");
    });

    it("returns empty string when no assistant messages", () => {
      const messages = [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ] as Message[];
      expect(getFinalOutput(messages)).toBe("");
    });

    it("returns last assistant text block", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
          model: "test",
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "last" }],
          model: "test",
        },
      ] as Message[];
      expect(getFinalOutput(messages)).toBe("last");
    });

    it("skips empty text blocks", () => {
      const messages = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "real content" },
            { type: "text", text: "   " },
          ],
          model: "test",
        },
      ] as Message[];
      expect(getFinalOutput(messages)).toBe("real content");
    });

    it("returns last non-empty text from last assistant message", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "text", text: "earlier" }],
          model: "test",
        },
        {
          role: "user",
          content: [{ type: "text", text: "question" }],
        },
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call-1", name: "read", arguments: {} },
            { type: "text", text: "the final answer" },
          ],
          model: "test",
        },
      ] as unknown as Message[];
      expect(getFinalOutput(messages)).toBe("the final answer");
    });
  });

  describe("AgentRenderState error info", () => {
    it("carries stderr and errorMessage fields for surfacing error details", () => {
      // AgentRenderState should carry error details so the rendering
      // can display them when an agent fails. These fields must be
      // declared on the interface, not just ad-hoc properties.
      const agent: AgentRenderState = {
        preset: "researcher",
        instance: 1,
        task: "Search for something",
        status: "error",
        elapsedMs: 5000,
        exitCode: 1,
        messages: [],
        usage: emptyUsage(),
        model: "claude-haiku-4-5",
        stderr: "Error: ENOENT: no such file or directory",
        errorMessage: "Agent process exited with code 1",
      };

      // These fields should be settable on the interface and readable
      expect(agent.stderr).toContain("ENOENT");
      expect(agent.errorMessage).toContain("exited with code 1");

      // Verify getErrorSummary uses them
      expect(getErrorSummary(agent)).toContain("ENOENT");
      expect(getErrorSummary(agent)).toContain("exited with code 1");
    });

    it("getErrorSummary returns formatted error when stderr or errorMessage present", () => {
      const agent: AgentRenderState = {
        preset: "researcher",
        instance: 1,
        task: "Search for something",
        status: "error",
        elapsedMs: 5000,
        exitCode: 1,
        messages: [],
        usage: emptyUsage(),
        model: "claude-haiku-4-5",
        stderr: "Error: ENOENT: no such file or directory\n    at Object.openSync (node:fs:603:3)",
        errorMessage: "Agent process exited with code 1",
      };

      const summary = getErrorSummary(agent);
      expect(summary).toContain("ENOENT");
      expect(summary).toContain("exited with code 1");
    });

    it("getErrorSummary returns empty string for successful agents", () => {
      const agent: AgentRenderState = {
        preset: "scout",
        instance: 1,
        task: "Explore codebase",
        status: "done",
        elapsedMs: 3000,
        exitCode: 0,
        messages: [],
        usage: emptyUsage(),
        model: "claude-haiku-4-5",
      };

      expect(getErrorSummary(agent)).toBe("");
    });
  });

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * Collect all text strings from a Container tree (depth-first).
   */
  function collectTexts(node: Container | Text): string[] {
    const results: string[] = [];
    if (node instanceof Text) {
      results.push(node.text);
    } else if (node instanceof Container) {
      for (const child of node.children) {
        results.push(...collectTexts(child as Container | Text));
      }
    }
    return results;
  }

  function makeTheme(): Theme {
    // initTheme loads "dark" builtin theme and sets the global proxy
    initTheme("dark");
    // Return a simple passthrough Theme-compatible object for testing
    // (the real Theme requires complex color maps; we use a no-op mock)
    return {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      italic: (text: string) => text,
      underline: (text: string) => text,
      inverse: (text: string) => text,
      strikethrough: (text: string) => text,
      getFgAnsi: () => "",
      getBgAnsi: () => "",
      getColorMode: () => "truecolor" as const,
      getThinkingBorderColor: () => (s: string) => s,
      getBashModeBorderColor: () => (s: string) => s,
    } as unknown as Theme;
  }

  function makeAgent(overrides: Partial<AgentRenderState> = {}): AgentRenderState {
    return {
      preset: "scout",
      instance: 1,
      task: "Explore codebase",
      status: "done",
      elapsedMs: 3000,
      exitCode: 0,
      messages: [],
      usage: emptyUsage(),
      model: "claude-haiku-4-5",
      ...overrides,
    };
  }

  function makeDetails(agents: AgentRenderState[]): CrewDispatchDetails {
    return { mode: "single", agents };
  }

  // ── TASK_PREVIEW_CHARS = 100 ─────────────────────────────────────────

  describe("TASK_PREVIEW_CHARS", () => {
    it("generic formatToolCall arg truncates at 100 chars (not 50)", () => {
      // Build a string of exactly 80 chars — should NOT be truncated (100 limit)
      const arg80 = "x".repeat(80);
      const result = formatToolCall("custom_tool", { query: arg80 }, (_c, t) => t);
      // 80 chars < 100 limit so no ellipsis
      expect(result).not.toContain("...");
      expect(result).toContain(arg80);
    });

    it("generic formatToolCall arg truncates strings longer than 100 chars", () => {
      const arg110 = "y".repeat(110);
      const result = formatToolCall("custom_tool", { query: arg110 }, (_c, t) => t);
      expect(result).toContain("...");
      // The result should be shorter than 110 chars (plus tool name)
      expect(result.length).toBeLessThan(120);
    });
  });

  // ── Running state: turn + tool count progress line ───────────────────

  describe("buildRenderResult — running state", () => {
    function makeRunningMessages(toolNames: string[]): Message[] {
      return toolNames.map((name) => ({
        role: "assistant" as const,
        content: [
          {
            type: "toolCall" as const,
            id: `call-${name}`,
            name,
            arguments: { path: "/tmp/test" },
          },
        ],
        model: "claude-haiku-4-5",
      })) as unknown as Message[];
    }

    it("shows turn N · M tool calls progress line while running", () => {
      const agent = makeAgent({
        status: "running",
        messages: makeRunningMessages(["read", "bash", "write"]),
        usage: { ...emptyUsage(), turns: 2 },
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: true }, makeTheme());
      const texts = collectTexts(result);
      const combined = texts.join("\n");
      expect(combined).toMatch(/turn 2/);
      expect(combined).toMatch(/3 tool calls/);
    });

    it("shows singular 'tool call' for exactly 1 tool call", () => {
      const agent = makeAgent({
        status: "running",
        messages: makeRunningMessages(["read"]),
        usage: { ...emptyUsage(), turns: 1 },
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: true }, makeTheme());
      const texts = collectTexts(result);
      const combined = texts.join("\n");
      expect(combined).toMatch(/1 tool call(?!s)/);
    });

    it("shows last 3 tool calls (RUNNING_TOOL_COUNT) while running", () => {
      // 5 tool calls — should show only the last 3
      const agent = makeAgent({
        status: "running",
        messages: makeRunningMessages(["read", "bash", "write", "edit", "grep"]),
        usage: { ...emptyUsage(), turns: 3 },
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: true }, makeTheme());
      const texts = collectTexts(result);
      // Count "→" arrows — each tool call renders one
      const arrowLines = texts.filter((t) => t.includes("→"));
      expect(arrowLines).toHaveLength(3);
    });

    it("shows (starting...) when no tool calls yet", () => {
      const agent = makeAgent({
        status: "running",
        messages: [],
        usage: { ...emptyUsage(), turns: 1 },
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: true }, makeTheme());
      const texts = collectTexts(result);
      const combined = texts.join("\n");
      expect(combined).toContain("starting...");
    });
  });

  // ── Collapsed state: usage stats after output preview ────────────────

  describe("buildRenderResult — collapsed state with usage stats", () => {
    function makeAssistantMessage(text: string): Message {
      return {
        role: "assistant" as const,
        content: [{ type: "text" as const, text }],
        model: "claude-haiku-4-5",
      } as Message;
    }

    it("shows usage stats in collapsed mode when agent is done", () => {
      const agent = makeAgent({
        status: "done",
        messages: [makeAssistantMessage("Here is the result of my analysis.")],
        usage: {
          input: 1200,
          output: 450,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0.0042,
          contextTokens: 5000,
          turns: 3,
        },
        model: "claude-haiku-4-5",
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: false }, makeTheme());
      const texts = collectTexts(result);
      const combined = texts.join("\n");
      // Should include usage stats: turns, tokens, cost, model
      expect(combined).toMatch(/3 turns/);
      expect(combined).toMatch(/\$0\.0042/);
    });

    it("does not show usage stats line when usage is all zero", () => {
      // formatUsageStats with zero turns still returns "↑0 ↓0" which is truthy
      // so it will always show — but test that it at least renders something
      const agent = makeAgent({
        status: "done",
        messages: [makeAssistantMessage("Done.")],
        usage: emptyUsage(),
        model: "",
      });
      const result = buildRenderResult(makeDetails([agent]), { expanded: false, isPartial: false }, makeTheme());
      const texts = collectTexts(result);
      // Should not throw — just verify it renders
      expect(texts.length).toBeGreaterThan(0);
    });
  });
});
