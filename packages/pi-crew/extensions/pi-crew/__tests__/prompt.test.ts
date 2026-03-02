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

    it("includes workflow start guidance", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain("Starting a Workflow");
      expect(result).toContain("state.md");
      expect(result).toContain("workflow:");
    });

    it("mentions dispatch logging", () => {
      const result = buildIdlePrompt(mockPresetDocs);
      expect(result).toContain(".crew/dispatches/");
      expect(result).toContain("automatically logged");
    });
  });

  describe("buildActivePrompt", () => {
    const state: CrewState = {
      feature: "user-auth",
      phase: "plan",
      progress: null,
      workflow: ["explore", "design", "plan", "build", "review", "ship"],
    };

    it("includes enforcement header with feature name", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain("user-auth");
      expect(result).toContain("ACTIVE WORKFLOW");
    });

    it("includes progress bar", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain("explore ✓");
      expect(result).toContain("design ✓");
      expect(result).toContain("**plan**");
      expect(result).toContain("build");
    });

    it("resolves phase content from phases.ts", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain("# Plan Phase");
      expect(result).toContain("Task Breakdown");
      expect(result).toContain("Wave");
    });

    it("includes MUST complete language", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain("MUST complete");
      expect(result).toContain("Do NOT skip phases");
    });

    it("includes presets table", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain(mockPresetDocs);
    });

    it("includes current phase name", () => {
      const result = buildActivePrompt(mockPresetDocs, state);
      expect(result).toContain("Current Phase: plan");
    });

    it("handles unknown phase gracefully", () => {
      const badState: CrewState = { ...state, phase: "nonexistent" };
      const result = buildActivePrompt(mockPresetDocs, badState);
      expect(result).toContain("Unknown phase: nonexistent");
    });
  });

  describe("buildCrewPrompt", () => {
    it("routes to idle when state is null", () => {
      const result = buildCrewPrompt(mockPresetDocs, null);
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
      const result = buildCrewPrompt(mockPresetDocs, state);
      expect(result).toContain("ACTIVE WORKFLOW");
      expect(result).toContain("auth");
      expect(result).toContain("# Explore Phase");
    });

    it("routes to idle when state has no workflow field (backwards compat)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: null,
      };
      const result = buildCrewPrompt(mockPresetDocs, state);
      expect(result).not.toContain("ACTIVE WORKFLOW");
    });

    it("routes to active even for empty workflow array (requires workflow)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: [],
      };
      const result = buildCrewPrompt(mockPresetDocs, state);
      // Empty workflow array means no active workflow
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
