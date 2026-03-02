/**
 * Tests for lock file retry logic.
 *
 * Pi uses proper-lockfile on ~/.pi/agent/{settings,auth}.json during startup.
 * When multiple pi subprocesses start simultaneously, they race for the lock.
 * The loser crashes with "Lock file is already being held" and exitCode 1.
 *
 * The fix: detect this specific error in stderr and retry the subprocess.
 */
import { describe, it, expect } from "vitest";
import { isLockFileError, runSingleAgent, mapWithConcurrencyLimit } from "../spawn.js";

describe("lock file retry", () => {
  describe("isLockFileError detection", () => {
    it("detects lock file error in stderr", () => {
      expect(isLockFileError("Error: Lock file is already being held")).toBe(true);
    });

    it("detects lock file error with warning prefix", () => {
      expect(
        isLockFileError(
          "Warning (startup, global settings): Lock file is already being held\n" +
            "Error: Lock file is already being held\n" +
            "    at /some/path/lockfile.js:68:47",
        ),
      ).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isLockFileError("Error: No API key found")).toBe(false);
      expect(isLockFileError("")).toBe(false);
      expect(isLockFileError("some random error")).toBe(false);
    });
  });

  describe("parallel spawn resilience", () => {
    it("all agents succeed when spawned simultaneously (lock retry)", async () => {
      // Spawn 4 agents at once — this USED to fail with lock file contention.
      // With stagger + retry, all should succeed.
      const tasks = [
        { task: 'Reply with exactly "A"', id: 0 },
        { task: 'Reply with exactly "B"', id: 1 },
        { task: 'Reply with exactly "C"', id: 2 },
        { task: 'Reply with exactly "D"', id: 3 },
      ];

      const results = await mapWithConcurrencyLimit(tasks, 4, async (item) => {
        return runSingleAgent(
          {
            task: item.task,
            systemPrompt: "Reply with only the requested letter. No explanation.",
            tools: "",
            model: "claude-haiku-4-5",
            thinking: "off",
          },
          process.cwd(),
          undefined,
        );
      });

      expect(results).toHaveLength(4);

      // ALL should succeed — not just "at least one"
      const failed = results.filter((r) => r.exitCode !== 0);
      if (failed.length > 0) {
        console.log(
          "Failed agents:",
          failed.map((r) => ({ exitCode: r.exitCode, stderr: r.stderr.slice(0, 200) })),
        );
      }
      expect(failed).toHaveLength(0);
    }, 90_000);
  });
});
