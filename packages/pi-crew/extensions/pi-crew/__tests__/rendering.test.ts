import { describe, it, expect } from "vitest";
import { formatTokens, formatUsageStats, formatToolCall, getDisplayItems, getFinalOutput } from "../rendering.js";
import type { Message } from "@mariozechner/pi-ai";
import type { UsageStats } from "../spawn.js";

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
			const messages: Message[] = [
				{ role: "user", content: [{ type: "text", text: "hello" }] } as any,
			];
			expect(getDisplayItems(messages)).toEqual([]);
		});

		it("extracts text blocks from assistant messages", () => {
			const messages: Message[] = [
				{
					role: "assistant",
					content: [{ type: "text", text: "Here is my analysis" }],
				} as any,
			];
			const items = getDisplayItems(messages);
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("text");
			expect(items[0].text).toBe("Here is my analysis");
		});

		it("extracts tool call blocks", () => {
			const messages: Message[] = [
				{
					role: "assistant",
					content: [
						{ type: "toolCall", name: "read", arguments: { path: "/tmp/test.ts" } },
					],
				} as any,
			];
			const items = getDisplayItems(messages);
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("toolCall");
			expect(items[0].name).toBe("read");
		});

		it("handles mixed content", () => {
			const messages: Message[] = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Let me check" },
						{ type: "toolCall", name: "bash", arguments: { command: "ls" } },
						{ type: "text", text: "Found it" },
					],
				} as any,
			];
			const items = getDisplayItems(messages);
			expect(items).toHaveLength(3);
			expect(items[0].type).toBe("text");
			expect(items[1].type).toBe("toolCall");
			expect(items[2].type).toBe("text");
		});

		it("handles multiple assistant messages", () => {
			const messages: Message[] = [
				{ role: "assistant", content: [{ type: "text", text: "first" }] } as any,
				{ role: "toolResult", content: [{ type: "text", text: "result" }] } as any,
				{ role: "assistant", content: [{ type: "text", text: "second" }] } as any,
			];
			const items = getDisplayItems(messages);
			expect(items).toHaveLength(2);
			expect(items[0].text).toBe("first");
			expect(items[1].text).toBe("second");
		});
	});

	describe("getFinalOutput", () => {
		it("returns empty string for empty messages", () => {
			expect(getFinalOutput([])).toBe("");
		});

		it("returns empty string when no assistant messages", () => {
			const messages: Message[] = [
				{ role: "user", content: [{ type: "text", text: "hello" }] } as any,
			];
			expect(getFinalOutput(messages)).toBe("");
		});

		it("returns last assistant text block", () => {
			const messages: Message[] = [
				{ role: "assistant", content: [{ type: "text", text: "first" }] } as any,
				{ role: "assistant", content: [{ type: "text", text: "last" }] } as any,
			];
			expect(getFinalOutput(messages)).toBe("last");
		});

		it("skips empty text blocks", () => {
			const messages: Message[] = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "real content" },
						{ type: "text", text: "   " },
					],
				} as any,
			];
			expect(getFinalOutput(messages)).toBe("real content");
		});

		it("returns last non-empty text from last assistant message", () => {
			const messages: Message[] = [
				{ role: "assistant", content: [{ type: "text", text: "earlier" }] } as any,
				{ role: "user", content: [{ type: "text", text: "question" }] } as any,
				{
					role: "assistant",
					content: [
						{ type: "toolCall", name: "read", arguments: {} },
						{ type: "text", text: "the final answer" },
					],
				} as any,
			];
			expect(getFinalOutput(messages)).toBe("the final answer");
		});
	});
});
