import { describe, it, expect } from "vitest";
import {
  buildIdlePrompt,
  buildActivePrompt,
  buildCrewPrompt,
  buildNudgeMessage,
} from "../prompt.js";
import type { CrewState } from "../state.js";

describe("prompt", () => {
  const mockPresetDocs = "| Preset | Model | Purpose |\n|--------|-------|---------|";

  describe("buildIdlePrompt", () => {
    it("includes presets table", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain(mockPresetDocs);
    });

    it("includes dispatch syntax examples", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain("dispatch_crew");
      expect(result).toContain("preset");
      expect(result).toContain("task");
    });

    it("includes workflow start guidance", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain("state.md");
      expect(result).toContain("workflow:");
    });

    it("includes workflow shortcut table", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain("Full");
      expect(result).toContain("Minimal");
      expect(result).toContain("build,ship");
    });

    it("does NOT include enforcement language", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).not.toContain("MUST complete");
      expect(result).not.toContain("⚠️ ACTIVE WORKFLOW");
    });

    it("includes mandatory workflow gate — MUST evaluate before implementing", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      // The idle prompt must contain a mandatory pre-implementation check
      // that forces the LLM to evaluate workflow criteria before writing any code.
      // This prevents the LLM from skipping the workflow for tasks that clearly
      // involve 3+ files, new features, or architectural changes.
      expect(result).toContain("BEFORE writing any implementation code");
      expect(result).toContain("MUST check");
    });

    it("lists concrete examples of tasks that require a workflow", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      // The guidance must include concrete examples so the LLM doesn't
      // rationalize skipping the workflow for "simple" multi-file tasks
      // like creating new packages, adding new modules, etc.
      expect(result).toContain("new package");
      expect(result).toContain("new module");
    });
  });

  describe("buildActivePrompt", () => {
    const state: CrewState = {
      feature: "user-auth",
      phase: "plan",
      progress: null,
      workflow: ["explore", "design", "plan", "build", "review", "ship"],
    };
    const skillContent = "# Plan Phase\n\nBreak the design into task waves.";

    it("includes enforcement header with feature name", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain("user-auth");
      expect(result).toContain("ACTIVE WORKFLOW");
    });

    it("includes progress bar", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain("explore ✓");
      expect(result).toContain("design ✓");
      expect(result).toContain("**plan**");
      expect(result).toContain("build");
    });

    it("includes full skill content", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain("# Plan Phase");
      expect(result).toContain("Break the design into task waves.");
    });

    it("includes MUST complete language", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain("MUST complete");
      expect(result).toContain("Do NOT skip phases");
    });

    it("includes presets table", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain(mockPresetDocs);
    });

    it("includes current phase name", () => {
      const result = buildActivePrompt(mockPresetDocs, state, skillContent);
      expect(result).toContain("Current Phase: plan");
    });
  });

  describe("buildCrewPrompt", () => {
    it("routes to idle when state is null", () => {
      const result = buildCrewPrompt(mockPresetDocs, null, null);
      expect(result).not.toContain("ACTIVE WORKFLOW");
      expect(result).toContain("dispatch_crew");
    });

    it("routes to active when state has workflow", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      };
      const result = buildCrewPrompt(mockPresetDocs, state, "# Explore skill content");
      expect(result).toContain("ACTIVE WORKFLOW");
      expect(result).toContain("auth");
      expect(result).toContain("# Explore skill content");
    });

    it("routes to idle when state has no workflow field (backwards compat)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: null,
      };
      const result = buildCrewPrompt(mockPresetDocs, state, null);
      expect(result).not.toContain("ACTIVE WORKFLOW");
    });

    it("routes to idle when skill content is null", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: ["build", "ship"],
      };
      const result = buildCrewPrompt(mockPresetDocs, state, null);
      expect(result).not.toContain("ACTIVE WORKFLOW");
    });
  });

  describe("buildNudgeMessage", () => {
    const state: CrewState = {
      feature: "user-auth",
      phase: "build",
      progress: "3/5",
      workflow: ["explore", "design", "plan", "build", "review", "ship"],
    };

    it("includes feature name", () => {
      const result = buildNudgeMessage(state);
      expect(result).toContain("user-auth");
    });

    it("includes progress bar", () => {
      const result = buildNudgeMessage(state);
      expect(result).toContain("explore ✓");
      expect(result).toContain("**build**");
    });

    it("includes continue instruction", () => {
      const result = buildNudgeMessage(state);
      expect(result).toContain("Continue");
    });

    it("includes warning emoji", () => {
      const result = buildNudgeMessage(state);
      expect(result).toContain("⚠️");
    });
  });
});
