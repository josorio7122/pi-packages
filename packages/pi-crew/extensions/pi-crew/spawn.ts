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
  model: string | undefined;
  stopReason: string | undefined;
  errorMessage: string | undefined;
  stderr: string;
}

export type OnAgentUpdate = (update: {
  messages: Message[];
  usage: UsageStats;
  exitCode: number;
}) => void;

// ── Constants ───────────────────────────────────────────────────────

/** Max retries when pi subprocess crashes due to lock file contention. */
const LOCK_RETRY_MAX = 3;
/** Base delay between lock retries (ms). Doubles on each retry. */
const LOCK_RETRY_BASE_MS = 500;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Detect if stderr indicates a lock file contention crash.
 * Pi uses proper-lockfile on ~/.pi/agent/{settings,auth}.json during startup.
 * Simultaneous subprocess spawns cause "Lock file is already being held".
 */
export function isLockFileError(stderr: string): boolean {
  return stderr.includes("Lock file is already being held");
}

/**
 * Create a zeroed UsageStats object.
 * @returns UsageStats with all fields set to 0
 */
export function emptyUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

/**
 * Write prompt to a secure temp file.
 * Creates a temp directory with restricted permissions (0o600) and writes the prompt.
 * @param prompt - Prompt content to write
 * @returns Object with `dir` and `filePath` for cleanup
 */
export function writePromptToTempFile(prompt: string): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-"));
  const filePath = path.join(tmpDir, "prompt.md");
  fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

/**
 * Remove temp file and directory.
 * Silently ignores errors (file may already be deleted).
 * @param dir - Temp directory to remove
 * @param filePath - Temp file to remove
 */
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

/**
 * Run async work items with a concurrency limit.
 * - Preserves input order in the result array
 * - Clamps concurrency to [1, items.length]
 * - Staggers initial launches by STAGGER_MS to avoid lock file contention
 *   when multiple pi subprocesses race for ~/.pi/agent/settings.json
 * - Rejects on first error (remaining in-flight items continue but results are discarded)
 * @param items - Array of work items
 * @param concurrency - Maximum concurrent workers
 * @param fn - Async function to run for each item
 * @returns Promise resolving to array of results in input order
 */
const STAGGER_MS = 150;

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
    .map(async (_, workerIndex) => {
      // Stagger worker starts to avoid global lock file contention.
      // Pi uses proper-lockfile on ~/.pi/agent/{settings,auth}.json during startup;
      // simultaneous spawns cause "Lock file is already being held" crashes.
      if (workerIndex > 0) {
        await new Promise((resolve) => setTimeout(resolve, workerIndex * STAGGER_MS));
      }
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
 *
 * Automatically retries up to LOCK_RETRY_MAX times if the subprocess crashes
 * due to lock file contention (pi's proper-lockfile on global settings/auth).
 *
 * @param params - Resolved spawn parameters (task, systemPrompt, tools, model, cwd, thinking)
 * @param defaultCwd - Default working directory if params.cwd is not set
 * @param signal - AbortSignal for cancellation support
 * @param onAgentUpdate - Optional callback for progress updates
 * @returns Promise resolving to SpawnResult with exitCode, messages, usage, model, stopReason, errorMessage, stderr
 */
export async function runSingleAgent(
  params: SpawnParams,
  defaultCwd: string,
  signal: AbortSignal | undefined,
  onAgentUpdate?: OnAgentUpdate,
): Promise<SpawnResult> {
  for (let attempt = 0; attempt <= LOCK_RETRY_MAX; attempt++) {
    const result = await spawnPiSubprocess(params, defaultCwd, signal, onAgentUpdate);

    // Retry on lock file contention (non-zero exit + lock error in stderr)
    if (result.exitCode !== 0 && isLockFileError(result.stderr) && attempt < LOCK_RETRY_MAX) {
      const delay = LOCK_RETRY_BASE_MS * Math.pow(2, attempt); // 500, 1000, 2000
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    return result;
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Lock retry exhausted");
}

/** Inner subprocess spawn — no retry logic, just the raw spawn. */
async function spawnPiSubprocess(
  params: SpawnParams,
  defaultCwd: string,
  signal: AbortSignal | undefined,
  onAgentUpdate?: OnAgentUpdate,
): Promise<SpawnResult> {
  const result: SpawnResult = {
    exitCode: 0,
    messages: [],
    usage: emptyUsage(),
    model: params.model,
    stopReason: undefined,
    errorMessage: undefined,
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
        let event: Record<string, unknown>;
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
