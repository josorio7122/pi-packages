import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { emptyUsage, mapWithConcurrencyLimit, writePromptToTempFile, cleanupTempFile } from "../spawn.js";

describe("spawn", () => {
	describe("emptyUsage", () => {
		it("returns zeroed usage stats", () => {
			const usage = emptyUsage();
			expect(usage.input).toBe(0);
			expect(usage.output).toBe(0);
			expect(usage.cacheRead).toBe(0);
			expect(usage.cacheWrite).toBe(0);
			expect(usage.cost).toBe(0);
			expect(usage.contextTokens).toBe(0);
			expect(usage.turns).toBe(0);
		});

		it("returns a new object each call", () => {
			const a = emptyUsage();
			const b = emptyUsage();
			expect(a).not.toBe(b);
			a.input = 100;
			expect(b.input).toBe(0);
		});
	});

	describe("mapWithConcurrencyLimit", () => {
		it("returns empty array for empty input", async () => {
			const result = await mapWithConcurrencyLimit([], 4, async (x) => x);
			expect(result).toEqual([]);
		});

		it("processes all items", async () => {
			const items = [1, 2, 3, 4, 5];
			const result = await mapWithConcurrencyLimit(items, 2, async (x) => x * 2);
			expect(result).toEqual([2, 4, 6, 8, 10]);
		});

		it("preserves order regardless of completion time", async () => {
			const items = [3, 1, 2]; // delays in ms-ish
			const result = await mapWithConcurrencyLimit(items, 3, async (x) => {
				await new Promise((r) => setTimeout(r, x * 10));
				return x;
			});
			expect(result).toEqual([3, 1, 2]);
		});

		it("respects concurrency limit", async () => {
			let running = 0;
			let maxRunning = 0;
			const items = [1, 2, 3, 4, 5, 6];

			await mapWithConcurrencyLimit(items, 2, async (x) => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				await new Promise((r) => setTimeout(r, 20));
				running--;
				return x;
			});

			expect(maxRunning).toBeLessThanOrEqual(2);
		});

		it("concurrency=1 runs sequentially", async () => {
			const order: number[] = [];
			const items = [1, 2, 3];

			await mapWithConcurrencyLimit(items, 1, async (x) => {
				order.push(x);
				await new Promise((r) => setTimeout(r, 10));
				return x;
			});

			expect(order).toEqual([1, 2, 3]);
		});

		it("handles rejections", async () => {
			const items = [1, 2, 3];
			await expect(
				mapWithConcurrencyLimit(items, 2, async (x) => {
					if (x === 2) throw new Error("boom");
					return x;
				}),
			).rejects.toThrow("boom");
		});

		it("concurrency clamped to at least 1", async () => {
			const result = await mapWithConcurrencyLimit([1, 2], 0, async (x) => x * 2);
			expect(result).toEqual([2, 4]);
		});

		it("concurrency clamped to items.length", async () => {
			let maxRunning = 0;
			let running = 0;

			await mapWithConcurrencyLimit([1, 2], 100, async (x) => {
				running++;
				maxRunning = Math.max(maxRunning, running);
				await new Promise((r) => setTimeout(r, 20));
				running--;
				return x;
			});

			expect(maxRunning).toBeLessThanOrEqual(2);
		});
	});

	describe("writePromptToTempFile", () => {
		it("creates a temp file with the prompt content", () => {
			const { dir, filePath } = writePromptToTempFile("test prompt content");
			try {
				expect(fs.existsSync(filePath)).toBe(true);
				expect(fs.readFileSync(filePath, "utf-8")).toBe("test prompt content");
				expect(path.basename(filePath)).toBe("prompt.md");
				expect(filePath.startsWith(dir)).toBe(true);
			} finally {
				cleanupTempFile(dir, filePath);
			}
		});

		it("creates file with restricted permissions", () => {
			const { dir, filePath } = writePromptToTempFile("secret prompt");
			try {
				const stats = fs.statSync(filePath);
				// 0o600 = owner read/write only
				const mode = stats.mode & 0o777;
				expect(mode).toBe(0o600);
			} finally {
				cleanupTempFile(dir, filePath);
			}
		});
	});

	describe("cleanupTempFile", () => {
		it("removes file and directory", () => {
			const { dir, filePath } = writePromptToTempFile("cleanup test");
			cleanupTempFile(dir, filePath);
			expect(fs.existsSync(filePath)).toBe(false);
			expect(fs.existsSync(dir)).toBe(false);
		});

		it("handles null arguments gracefully", () => {
			expect(() => cleanupTempFile(null, null)).not.toThrow();
		});

		it("handles already-deleted file gracefully", () => {
			const { dir, filePath } = writePromptToTempFile("double cleanup");
			cleanupTempFile(dir, filePath);
			// Second call should not throw
			expect(() => cleanupTempFile(dir, filePath)).not.toThrow();
		});
	});
});
