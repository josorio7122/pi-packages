// ── Spawn Logic ─────────────────────────────────────────────────────
// Spawns pi subprocesses, parses NDJSON, reports progress.
// Copied from dispatch-agent's spawn.ts and adapted for pi-crew presets.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@mariozechner/pi-ai";

// ── Types ───────────────────────────────────────────────────────────

export interface SpawnParams {
	task: string;
	systemPrompt: string;
	tools: string;
	model: string;
	cwd?: string;
	thinking?: string;
}

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SpawnResult {
	exitCode: number;
	messages: Message[];
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	stderr: string;
}

export type AgentUpdateCallback = (update: {
	messages: Message[];
	usage: UsageStats;
	exitCode: number;
}) => void;

// ── Helpers ─────────────────────────────────────────────────────────

export function emptyUsage(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

export function writePromptToTempFile(prompt: string): { dir: string; filePath: string } {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-"));
	const filePath = path.join(tmpDir, "prompt.md");
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

export function cleanupTempFile(dir: string | null, filePath: string | null) {
	if (filePath)
		try {
			fs.unlinkSync(filePath);
		} catch {
			/* ignore */
		}
	if (dir)
		try {
			fs.rmdirSync(dir);
		} catch {
			/* ignore */
		}
}

// ── Concurrency Limiter ─────────────────────────────────────────────

export async function mapWithConcurrencyLimit<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: R[] = new Array(items.length);
	let nextIndex = 0;
	const workers = Array(limit)
		.fill(null)
		.map(async () => {
			while (true) {
				const current = nextIndex++;
				if (current >= items.length) return;
				results[current] = await fn(items[current], current);
			}
		});
	await Promise.all(workers);
	return results;
}

// ── Single Agent Runner ─────────────────────────────────────────────

/**
 * Spawn a single pi subprocess with resolved preset params.
 * Reports progress via onAgentUpdate callback on each NDJSON event.
 * Returns final SpawnResult after process exits.
 */
export async function runSingleAgent(
	params: SpawnParams,
	defaultCwd: string,
	signal: AbortSignal | undefined,
	onAgentUpdate?: AgentUpdateCallback,
): Promise<SpawnResult> {
	const result: SpawnResult = {
		exitCode: 0,
		messages: [],
		usage: emptyUsage(),
		model: params.model,
		stderr: "",
	};

	const emitUpdate = () => {
		onAgentUpdate?.({
			messages: result.messages,
			usage: result.usage,
			exitCode: -1, // still running
		});
	};

	// Build CLI args
	const args: string[] = ["--mode", "json", "-p", "--no-session", "--no-extensions"];

	if (params.model) args.push("--model", params.model);
	if (params.tools) args.push("--tools", params.tools);
	args.push("--thinking", params.thinking || "off");

	// System prompt via temp file
	let tmpDir: string | null = null;
	let tmpFile: string | null = null;

	try {
		if (params.systemPrompt?.trim()) {
			const tmp = writePromptToTempFile(params.systemPrompt);
			tmpDir = tmp.dir;
			tmpFile = tmp.filePath;
			args.push("--append-system-prompt", tmp.filePath);
		}

		// Task is the positional argument
		args.push(params.task);

		let wasAborted = false;
		const cwd = params.cwd || defaultCwd;

		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn("pi", args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);

					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
							result.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data: Buffer) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			// Abort support
			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
		if (wasAborted) throw new Error("Agent was aborted");
		return result;
	} finally {
		cleanupTempFile(tmpDir, tmpFile);
	}
}
