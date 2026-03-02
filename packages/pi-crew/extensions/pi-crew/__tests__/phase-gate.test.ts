/**
 * Tests for phase gate — blocks advancement without handoff files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import { getRequiredHandoffs, type PhaseId } from "../phases.js";
import { shouldBlockForMissingHandoff } from "../enforcement.js";
import { writeHandoff } from "../handoff.js";
import type { CrewState } from "../state.js";

describe("phase gate", () => {
  describe("getRequiredHandoffs", () => {
    it("explore has no dependencies", () => {
      expect(getRequiredHandoffs("explore", ["explore", "design", "plan", "build", "review", "ship"])).toEqual([]);
    });

    it("design requires explore", () => {
      expect(getRequiredHandoffs("design", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["explore"]);
    });

    it("plan requires design", () => {
      expect(getRequiredHandoffs("plan", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["design"]);
    });

    it("build requires plan", () => {
      expect(getRequiredHandoffs("build", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["plan"]);
    });

    it("review requires build", () => {
      expect(getRequiredHandoffs("review", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["build"]);
    });

    it("ship requires review", () => {
      expect(getRequiredHandoffs("ship", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["review"]);
    });

    // Workflow shortcuts
    it("quick workflow: build only requires explore (no design/plan in workflow)", () => {
      expect(getRequiredHandoffs("build", ["explore", "build", "ship"])).toEqual(["explore"]);
    });

    it("minimal workflow: build has no deps (first phase)", () => {
      expect(getRequiredHandoffs("build", ["build", "ship"])).toEqual([]);
    });

    it("standard workflow: plan requires explore (no design)", () => {
      expect(getRequiredHandoffs("plan", ["explore", "plan", "build", "review", "ship"])).toEqual(["explore"]);
    });

    it("ship requires build when review is skipped", () => {
      expect(getRequiredHandoffs("ship", ["explore", "build", "ship"])).toEqual(["build"]);
    });
  });

  describe("shouldBlockForMissingHandoff", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(os.tmpdir() + "/crew-gate-");
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("does not block explore phase (no deps)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      };
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(false);
    });

    it("blocks design when explore handoff is missing", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "design",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      };
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(true);
      expect(result.missing).toContain("explore");
    });

    it("allows design when explore handoff exists", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "design",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      };
      writeHandoff(tmpDir, "auth", "explore", "# Explore findings");
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(false);
    });

    it("blocks build when plan handoff is missing (full workflow)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      };
      writeHandoff(tmpDir, "auth", "explore", "explore");
      writeHandoff(tmpDir, "auth", "design", "design");
      // Missing plan handoff
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(true);
      expect(result.missing).toContain("plan");
    });

    it("allows build in quick workflow with only explore handoff", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: ["explore", "build", "ship"],
      };
      writeHandoff(tmpDir, "auth", "explore", "# Explore");
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(false);
    });

    it("does not block when no workflow (backwards compat)", () => {
      const state: CrewState = {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: null,
      };
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(false);
    });

    it("does not block when no feature", () => {
      const state: CrewState = {
        feature: "",
        phase: "design",
        progress: null,
        workflow: ["explore", "design"],
      };
      const result = shouldBlockForMissingHandoff(tmpDir, state);
      expect(result.blocked).toBe(false);
    });
  });
});
