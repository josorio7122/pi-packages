/**
 * Workflow integration tests — raw subprocess spawning with extensions loaded.
 *
 * These spawn real `pi` processes WITH extensions (so pi-crew hooks fire)
 * and verify prompt injection, active/idle mode, and phase awareness.
 *
 * For tool_call blocking and nudge tests, see e2e.test.ts (SDK-based).
 * For subprocess primitives (single/parallel/chain), see integration.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("integration: workflow prompt injection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-workflow-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Spawn pi WITH extensions, parse NDJSON for final assistant text.
   */
  function runPiWithExtensions(
    task: string,
    cwd: string,
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      const args = [
        "--mode",
        "json",
        "-p",
        "--no-session",
        "--model",
        "claude-haiku-4-5",
        "--thinking",
        "off",
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
          } catch {
            /* skip non-JSON lines */
          }
        }
      });

      proc.stderr.on("data", () => {
        /* ignore */
      });

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
          } catch {
            /* skip */
          }
        }
        resolve({ exitCode: code ?? 0, output: lastAssistantText });
      });

      proc.on("error", () => resolve({ exitCode: 1, output: "" }));
    });
  }

  it("active mode — prompt includes feature name and current phase", async () => {
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: my-cool-feature\nphase: build\nworkflow: build,ship\n---\n",
    );

    const { exitCode, output } = await runPiWithExtensions(
      "Your system prompt mentions an active workflow. " +
        'What is the feature name and current phase? Reply in format "feature: X, phase: Y".',
      tmpDir,
    );

    expect(exitCode).toBe(0);
    expect(output).toContain("my-cool-feature");
    expect(output.toLowerCase()).toContain("build");
  }, 60_000);

  it("active mode — prompt shows allowed presets for current phase", async () => {
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(
      path.join(crewDir, "state.md"),
      "---\nfeature: auth\nphase: review\nworkflow: build,review,ship\n---\n",
    );

    const { exitCode, output } = await runPiWithExtensions(
      "Your system prompt lists the allowed presets for the current review phase. " +
        "What presets are allowed? Reply with just the preset names separated by commas.",
      tmpDir,
    );

    expect(exitCode).toBe(0);
    const lower = output.toLowerCase();
    expect(lower).toContain("reviewer");
    expect(lower).toContain("scout");
  }, 60_000);

  it("idle mode — no active workflow section when state.md has no workflow field", async () => {
    const crewDir = path.join(tmpDir, ".crew");
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, "state.md"), "---\nfeature: legacy\nphase: build\n---\n");

    const { exitCode, output } = await runPiWithExtensions(
      'Does your system prompt contain the text "Active Workflow"? Reply with exactly "YES" or "NO".',
      tmpDir,
    );

    expect(exitCode).toBe(0);
    expect(output.toUpperCase()).toContain("NO");
  }, 60_000);

  it("idle mode — coordinator prompt mentions .crew/ workspace", async () => {
    const { exitCode, output } = await runPiWithExtensions(
      "Your system prompt mentions a workspace directory. " +
        'What directory is it? Reply with just the directory path (e.g. ".crew/").',
      tmpDir,
    );

    expect(exitCode).toBe(0);
    expect(output).toContain(".crew");
  }, 60_000);
});
