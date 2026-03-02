/**
 * Tests for prompt.ts — coordinator prompt with 3 modes.
 */
import { describe, it, expect } from "vitest";
import { buildCrewPrompt, buildNudgeMessage } from "../prompt.js";
import type { CrewState } from "../state.js";

describe("prompt", () => {
  const presetDocs = "| scout | Fast recon | haiku |";

  describe("buildCrewPrompt", () => {
    describe("idle mode (no workflow)", () => {
      it("includes coordinator identity", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain("Coordinator");
      });

      it("includes the 3 modes", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain("Just Answer");
        expect(prompt).toContain("Understand");
        expect(prompt).toContain("Implement");
      });

      it("includes .crew/ structure", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain(".crew/findings/");
        expect(prompt).toContain(".crew/phases/");
        expect(prompt).toContain(".crew/dispatches/");
        expect(prompt).toContain(".crew/state.md");
      });

      it("includes write/edit restriction", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain("write");
        expect(prompt).toContain("edit");
        expect(prompt).toContain("dispatch_crew");
      });

      it("includes preset docs", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain(presetDocs);
      });

      it("mentions checking .crew/ before dispatching", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt).toContain("check");
        expect(prompt.toLowerCase()).toContain(".crew/");
      });

      it("is token-efficient (under 2000 chars)", () => {
        const prompt = buildCrewPrompt(presetDocs, null);
        expect(prompt.length).toBeLessThan(2000);
      });
    });

    describe("active workflow mode", () => {
      const state: CrewState = {
        feature: "add-subscriptions",
        phase: "build",
        progress: null,
        workflow: ["explore", "design", "build", "review", "ship"],
      };

      it("includes coordinator identity", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        expect(prompt).toContain("Coordinator");
      });

      it("includes active workflow indicator", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        expect(prompt).toContain("add-subscriptions");
        expect(prompt).toContain("build");
      });

      it("includes phase description", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        // Build phase description mentions executors
        expect(prompt.toLowerCase()).toContain("executor");
      });

      it("includes allowed presets for current phase", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        expect(prompt).toContain("executor");
        expect(prompt).toContain("debugger");
      });

      it("still includes .crew/ structure", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        expect(prompt).toContain(".crew/");
      });

      it("is token-efficient (under 2500 chars with workflow)", () => {
        const prompt = buildCrewPrompt(presetDocs, state);
        expect(prompt.length).toBeLessThan(2500);
      });
    });
  });

  describe("buildNudgeMessage", () => {
    it("includes feature name and phase", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: ["explore", "build", "ship"],
      };
      const msg = buildNudgeMessage(state);
      expect(msg).toContain("auth");
      expect(msg).toContain("build");
    });

    it("tells the orchestrator to continue", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      };
      const msg = buildNudgeMessage(state);
      expect(msg.toLowerCase()).toContain("continue");
    });

    it("mentions reading state.md", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      };
      const msg = buildNudgeMessage(state);
      expect(msg).toContain("state.md");
    });
  });
});
