/**
 * Workflow lifecycle tests.
 *
 * These test the full lifecycle: idle → state.md written → active prompt → nudge.
 * They verify that the extension hooks (before_agent_start, agent_end) behave
 * correctly at each stage of the workflow.
 *
 * Enforcement is now mechanical:
 * - tool_call hook blocks write/edit outside .crew/
 * - Phase-preset validation blocks wrong presets
 * - Phase gate blocks missing handoffs
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readState, readConfig, isWorkflowComplete } from "../state.js";
import { buildCrewPrompt, buildNudgeMessage } from "../prompt.js";
import { formatPresetsForLLM } from "../presets.js";

// ── Test Helpers ────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crew-lifecycle-"));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeStateMd(cwd: string, content: string): void {
  const crewDir = path.join(cwd, ".crew");
  fs.mkdirSync(crewDir, { recursive: true });
  fs.writeFileSync(path.join(crewDir, "state.md"), content, "utf-8");
}

function simulateBeforeAgentStart(cwd: string): string {
  const config = readConfig(cwd);
  const profile = config.profile || "balanced";
  const overrides = config.overrides || {};
  const presetDocs = formatPresetsForLLM(profile, overrides);
  const state = readState(cwd);
  return buildCrewPrompt(presetDocs, state);
}

function simulateAgentEnd(cwd: string): string | null {
  const state = readState(cwd);
  if (!state || !state.workflow || state.workflow.length === 0) return null;
  if (isWorkflowComplete(state)) return null;
  return buildNudgeMessage(state);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("workflow lifecycle", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe("Stage 1: No state.md (coordinator idle)", () => {
    it("injects coordinator prompt with 3 modes", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("Coordinator");
      expect(prompt).toContain("Just Answer");
      expect(prompt).toContain("Understand");
      expect(prompt).toContain("Implement");
    });

    it("mentions .crew/ workspace", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain(".crew/state.md");
      expect(prompt).toContain(".crew/findings/");
      expect(prompt).toContain(".crew/phases/");
    });

    it("mentions dispatch_crew and write/edit blocking", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("dispatch_crew");
      expect(prompt).toContain("write");
      expect(prompt).toContain("edit");
      expect(prompt).toContain("blocked");
    });

    it("includes preset table", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("scout");
      expect(prompt).toContain("executor");
    });

    it("does NOT include active workflow section", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).not.toContain("Active Workflow");
    });

    it("agent_end does NOT nudge", () => {
      expect(simulateAgentEnd(tmpDir)).toBeNull();
    });
  });

  describe("Stage 2: state.md written (transition to active)", () => {
    it("state.md with workflow field activates the workflow", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: payments\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );
      const state = readState(tmpDir);
      expect(state).not.toBeNull();
      expect(state!.feature).toBe("payments");
      expect(state!.phase).toBe("explore");
      expect(state!.workflow).toEqual(["explore", "plan", "build", "ship"]);
    });

    it("active prompt includes workflow context", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: payments\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("Active Workflow");
      expect(prompt).toContain("payments");
      expect(prompt).toContain("explore");
    });

    it("active prompt shows phase description and allowed presets", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: payments\nphase: build\nworkflow: explore,build,ship\n---\n",
      );
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("executor");
      expect(prompt).toContain("debugger");
    });

    it("still includes coordinator identity in active mode", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: payments\nphase: explore\nworkflow: explore,build,ship\n---\n",
      );
      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("Coordinator");
    });
  });

  describe("Stage 3: Nudge on agent_end", () => {
    it("nudges when workflow active and not on last phase", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: auth\nphase: explore\nworkflow: explore,build,ship\n---\n",
      );
      const nudge = simulateAgentEnd(tmpDir);
      expect(nudge).not.toBeNull();
      expect(nudge).toContain("auth");
      expect(nudge).toContain("explore");
      expect(nudge).toContain("state.md");
    });

    it("does NOT nudge on last phase (workflow complete)", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: auth\nphase: ship\nworkflow: explore,build,ship\n---\n",
      );
      expect(simulateAgentEnd(tmpDir)).toBeNull();
    });

    it("does NOT nudge without workflow field", () => {
      writeStateMd(tmpDir, "---\nfeature: auth\nphase: explore\n---\n");
      expect(simulateAgentEnd(tmpDir)).toBeNull();
    });
  });

  describe("Stage 4: Phase transitions", () => {
    it("changing phase in state.md changes prompt context", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: auth\nphase: explore\nworkflow: explore,build,ship\n---\n",
      );
      const prompt1 = simulateBeforeAgentStart(tmpDir);
      expect(prompt1).toContain("explore");

      writeStateMd(
        tmpDir,
        "---\nfeature: auth\nphase: build\nworkflow: explore,build,ship\n---\n",
      );
      const prompt2 = simulateBeforeAgentStart(tmpDir);
      expect(prompt2).toContain("build");
      expect(prompt2).toContain("executor");
    });

    it("isWorkflowComplete reflects phase progression", () => {
      const phases = ["explore", "build", "ship"];
      for (let i = 0; i < phases.length; i++) {
        writeStateMd(
          tmpDir,
          `---\nfeature: auth\nphase: ${phases[i]}\nworkflow: explore,build,ship\n---\n`,
        );
        const state = readState(tmpDir)!;
        if (i < phases.length - 1) {
          expect(isWorkflowComplete(state)).toBe(false);
        } else {
          expect(isWorkflowComplete(state)).toBe(true);
        }
      }
    });
  });
});
