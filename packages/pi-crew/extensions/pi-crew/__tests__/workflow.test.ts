import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Integration tests for workflow enforcement.
 * Spawns real `pi` subprocesses WITH extensions loaded (not --no-extensions)
 * so the pi-crew before_agent_start hook fires and injects the prompt.
 */
describe("integration: workflow enforcement", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-workflow-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	/**
	 * Spawn pi WITH extensions (so pi-crew loads), parse NDJSON for final assistant text.
	 */
	function runPiWithExtensions(task: string, cwd: string): Promise<{ exitCode: number; output: string }> {
		return new Promise((resolve) => {
			const args = [
				"--mode", "json",
				"-p",
				"--no-session",
				"--model", "claude-haiku-4-5",
				"--thinking", "off",
				task,
			];

			const proc = spawn("pi", args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let buffer = "";
			let lastAssistantText = "";

			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === "message_end" && event.message?.role === "assistant") {
							const content = event.message.content;
							if (Array.isArray(content)) {
								for (const block of content) {
									if (block.type === "text" && block.text) {
										lastAssistantText = block.text;
									}
								}
							}
						}
					} catch { /* skip non-JSON lines */ }
				}
			});

			proc.stderr.on("data", () => { /* ignore */ });

			proc.on("close", (code) => {
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === "message_end" && event.message?.role === "assistant") {
							const content = event.message.content;
							if (Array.isArray(content)) {
								for (const block of content) {
									if (block.type === "text" && block.text) {
										lastAssistantText = block.text;
									}
								}
							}
						}
					} catch { /* skip */ }
				}
				resolve({ exitCode: code ?? 0, output: lastAssistantText });
			});

			proc.on("error", () => resolve({ exitCode: 1, output: "" }));
		});
	}

	it("idle mode — dispatch_crew tool is available without state.md", async () => {
		const { exitCode, output } = await runPiWithExtensions(
			'Do you have access to a tool called dispatch_crew? Reply with exactly "YES" or "NO".',
			tmpDir,
		);

		expect(exitCode).toBe(0);
		expect(output.toUpperCase()).toContain("YES");
	}, 60_000);

	it("active mode — system prompt includes phase skill when state.md exists", async () => {
		const crewDir = path.join(tmpDir, ".crew");
		fs.mkdirSync(crewDir, { recursive: true });
		fs.writeFileSync(
			path.join(crewDir, "state.md"),
			"---\nfeature: test-feature\nphase: explore\nworkflow: explore,build,ship\n---\n",
		);

		const { exitCode, output } = await runPiWithExtensions(
			'Your system prompt contains instructions for the explore phase. ' +
			'According to those instructions, how many scouts should you dispatch for a LARGE project (500+ files)? ' +
			'Reply with just the number range, like "3-4".',
			tmpDir,
		);

		expect(exitCode).toBe(0);
		// The explore SKILL.md says "3-4" scouts for 500+ files
		expect(output).toMatch(/3.?4/);
	}, 60_000);

	it("active mode — system prompt shows enforcement header with feature name", async () => {
		const crewDir = path.join(tmpDir, ".crew");
		fs.mkdirSync(crewDir, { recursive: true });
		fs.writeFileSync(
			path.join(crewDir, "state.md"),
			"---\nfeature: my-cool-feature\nphase: build\nworkflow: build,ship\n---\n",
		);

		const { exitCode, output } = await runPiWithExtensions(
			'Your system prompt contains an active workflow notice with a feature name. ' +
			'What is the feature name? Reply with just the feature name.',
			tmpDir,
		);

		expect(exitCode).toBe(0);
		expect(output).toContain("my-cool-feature");
	}, 60_000);

	it("idle mode — no enforcement when state.md has no workflow field", async () => {
		const crewDir = path.join(tmpDir, ".crew");
		fs.mkdirSync(crewDir, { recursive: true });
		fs.writeFileSync(
			path.join(crewDir, "state.md"),
			"---\nfeature: legacy\nphase: build\n---\n",
		);

		const { exitCode, output } = await runPiWithExtensions(
			'Does your system prompt contain the exact text "ACTIVE WORKFLOW"? Reply with exactly "YES" or "NO".',
			tmpDir,
		);

		expect(exitCode).toBe(0);
		expect(output.toUpperCase()).toContain("NO");
	}, 60_000);

	it("active mode — progress bar shows completed phases", async () => {
		const crewDir = path.join(tmpDir, ".crew");
		fs.mkdirSync(crewDir, { recursive: true });
		fs.writeFileSync(
			path.join(crewDir, "state.md"),
			"---\nfeature: auth\nphase: build\nworkflow: explore,design,build,ship\n---\n",
		);

		const { exitCode, output } = await runPiWithExtensions(
			'Your system prompt shows a workflow progress line. ' +
			'Which phases have a checkmark (✓) next to them? ' +
			'Reply with just the phase names separated by commas.',
			tmpDir,
		);

		expect(exitCode).toBe(0);
		const lower = output.toLowerCase();
		expect(lower).toContain("explore");
		expect(lower).toContain("design");
	}, 60_000);
});
