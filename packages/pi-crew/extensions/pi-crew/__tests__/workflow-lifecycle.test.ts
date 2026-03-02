/**
 * Workflow lifecycle tests.
 *
 * These test the full lifecycle: idle → state.md written → active prompt → nudge.
 * They verify that the extension hooks (before_agent_start, agent_end) behave
 * correctly at each stage of the workflow.
 *
 * Key finding: The current enforcement is purely advisory — the LLM is told to
 * write state.md but nothing mechanically prevents it from ignoring the instruction.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readState, readConfig, isWorkflowComplete } from "../state.js";
import { buildCrewPrompt, buildIdlePrompt, buildActivePrompt, buildNudgeMessage } from "../prompt.js";
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

// Simulate what before_agent_start does
function simulateBeforeAgentStart(cwd: string): string {
  const config = readConfig(cwd);
  const profile = config.profile || "balanced";
  const overrides = config.overrides || {};
  const presetDocs = formatPresetsForLLM(profile, overrides);

  const state = readState(cwd);

  return buildCrewPrompt(presetDocs, state);
}

// Simulate what agent_end does — returns nudge message or null
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

  describe("Stage 1: No state.md (idle mode)", () => {
    it("injects idle prompt with workflow instructions", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);

      expect(prompt).toContain("Crew — Agentic Workflow Orchestration");
      expect(prompt).toContain("dispatch_crew");
      expect(prompt).toContain("Mandatory Workflow Gate");
    });

    it("idle prompt tells LLM to write .crew/state.md", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);

      expect(prompt).toContain(".crew/state.md");
      expect(prompt).toContain("workflow:");
      expect(prompt).toContain("feature:");
      expect(prompt).toContain("phase:");
    });

    it("idle prompt includes workflow shortcuts", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);

      expect(prompt).toContain("explore,design,plan,build,review,ship");
      expect(prompt).toContain("explore,plan,build,review,ship");
      expect(prompt).toContain("explore,build,ship");
      expect(prompt).toContain("build,ship");
    });

    it("agent_end does NOT nudge when no state.md exists", () => {
      const nudge = simulateAgentEnd(tmpDir);
      expect(nudge).toBeNull();
    });
  });

  describe("Stage 2: LLM writes state.md (transition to active)", () => {
    it("state.md with workflow field activates the workflow", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: my-feature\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );

      const state = readState(tmpDir);
      expect(state).not.toBeNull();
      expect(state!.feature).toBe("my-feature");
      expect(state!.phase).toBe("explore");
      expect(state!.workflow).toEqual(["explore", "plan", "build", "ship"]);
    });

    it("active prompt includes phase skill content", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: my-feature\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );

      const prompt = simulateBeforeAgentStart(tmpDir);

      // Should be active prompt, not idle
      expect(prompt).toContain("ACTIVE WORKFLOW");
      expect(prompt).toContain("my-feature");
      expect(prompt).toContain("Current Phase: explore");
      // Should include the explore skill content
      expect(prompt).toContain("Dispatch scouts");
    });

    it("active prompt does NOT include idle workflow instructions", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: explore\nworkflow: explore,build,ship\n---\n",
      );

      const prompt = simulateBeforeAgentStart(tmpDir);

      // Active prompt should NOT have the idle mode content
      expect(prompt).not.toContain("Mandatory Workflow Gate");
      expect(prompt).not.toContain("Workflow Shortcuts");
    });

    it("active prompt includes progress bar", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: plan\nworkflow: explore,plan,build,ship\n---\n",
      );

      const prompt = simulateBeforeAgentStart(tmpDir);

      // Should show progress: explore ✓ → **plan** → build → ship
      expect(prompt).toContain("explore ✓");
      expect(prompt).toContain("**plan**");
    });
  });

  describe("Stage 3: Nudge on agent_end", () => {
    it("nudges when workflow is active and NOT on last phase", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );

      const nudge = simulateAgentEnd(tmpDir);
      expect(nudge).not.toBeNull();
      expect(nudge).toContain("Workflow in progress");
      expect(nudge).toContain("explore");
    });

    it("does NOT nudge when on the last phase (workflow complete)", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: ship\nworkflow: explore,plan,build,ship\n---\n",
      );

      const nudge = simulateAgentEnd(tmpDir);
      expect(nudge).toBeNull();
    });

    it("does NOT nudge when state.md has no workflow field", () => {
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: explore\n---\n",
      );

      const nudge = simulateAgentEnd(tmpDir);
      expect(nudge).toBeNull();
    });
  });

  describe("Stage 4: Phase transitions", () => {
    it("updating phase in state.md changes the injected skill", () => {
      // Start at explore
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: explore\nworkflow: explore,plan,build,ship\n---\n",
      );
      const prompt1 = simulateBeforeAgentStart(tmpDir);
      expect(prompt1).toContain("Current Phase: explore");
      expect(prompt1).toContain("Dispatch scouts");

      // LLM advances to plan
      writeStateMd(
        tmpDir,
        "---\nfeature: test\nphase: plan\nworkflow: explore,plan,build,ship\n---\n",
      );
      const prompt2 = simulateBeforeAgentStart(tmpDir);
      expect(prompt2).toContain("Current Phase: plan");
      // Should NOT contain explore content anymore
      expect(prompt2).not.toContain("Dispatch scouts");
    });

    it("isWorkflowComplete reflects phase progression", () => {
      const phases = ["explore", "plan", "build", "ship"];

      for (let i = 0; i < phases.length; i++) {
        writeStateMd(
          tmpDir,
          `---\nfeature: test\nphase: ${phases[i]}\nworkflow: explore,plan,build,ship\n---\n`,
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

  describe("ENFORCEMENT GAP: LLM ignores state.md instruction", () => {
    it("if LLM never writes state.md, system stays in idle mode forever", () => {
      // Simulate 5 turns where LLM never writes state.md
      for (let turn = 0; turn < 5; turn++) {
        const prompt = simulateBeforeAgentStart(tmpDir);
        // Always gets idle prompt — no enforcement mechanism kicks in
        expect(prompt).toContain("Mandatory Workflow Gate");
        expect(prompt).not.toContain("ACTIVE WORKFLOW");

        const nudge = simulateAgentEnd(tmpDir);
        // No nudge either — nothing to nudge about
        expect(nudge).toBeNull();
      }
    });

    it("if LLM writes PLAN.md at root instead of .crew/state.md, system sees nothing", () => {
      // LLM writes plan at root (what actually happened)
      fs.writeFileSync(
        path.join(tmpDir, "PLAN.md"),
        "# Plan\n\n## Tasks\n- Task 1\n- Task 2\n",
        "utf-8",
      );

      // System doesn't know about it
      const state = readState(tmpDir);
      expect(state).toBeNull();

      const prompt = simulateBeforeAgentStart(tmpDir);
      expect(prompt).toContain("Mandatory Workflow Gate"); // Still idle
      expect(prompt).not.toContain("ACTIVE WORKFLOW");
    });

    it("idle prompt contains .crew/state.md but NOT as a tool_use block — it's just text", () => {
      const prompt = simulateBeforeAgentStart(tmpDir);

      // The instruction to write state.md is plain text in the prompt
      // It's NOT a structured command or tool call — it's advisory
      expect(prompt).toContain("write `.crew/state.md`");

      // There is no mechanism to BLOCK the LLM from proceeding without state.md
      // The LLM can:
      //   1. Write state.md ✓ (follows instruction)
      //   2. Write PLAN.md instead ✗ (ignores instruction)
      //   3. Start dispatching agents directly ✗ (skips workflow)
      //   4. Write implementation code directly ✗ (skips everything)
    });
  });
});
