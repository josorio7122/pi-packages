/**
 * Tests for phases.ts — phase metadata (allowed presets, auto-advance, handoffs).
 * Phase content (PHASE_CONTENT) was removed — phases now only carry metadata.
 */
import { describe, it, expect } from "vitest";
import {
  getPhaseAllowedPresets,
  getPhaseDescription,
  isPhaseAutoAdvance,
  getRequiredHandoffs,
  VALID_PHASES,
  type PhaseId,
} from "../phases.js";

describe("phases", () => {
  describe("VALID_PHASES", () => {
    it("contains all 6 phases in order", () => {
      expect(VALID_PHASES).toEqual(["explore", "design", "plan", "build", "review", "ship"]);
    });

    it("is readonly", () => {
      expect(Object.isFrozen(VALID_PHASES)).toBe(true);
    });
  });

  describe("getPhaseDescription", () => {
    it("returns a short description for each phase", () => {
      for (const phase of VALID_PHASES) {
        const desc = getPhaseDescription(phase);
        expect(desc).not.toBeNull();
        expect(typeof desc).toBe("string");
        expect(desc!.length).toBeLessThan(200);
        expect(desc!.length).toBeGreaterThan(10);
      }
    });

    it("returns null for invalid phase", () => {
      expect(getPhaseDescription("nonexistent")).toBeNull();
      expect(getPhaseDescription("")).toBeNull();
    });
  });

  describe("getPhaseAllowedPresets", () => {
    it("returns correct presets for explore phase", () => {
      expect(getPhaseAllowedPresets("explore")).toEqual(["scout", "researcher"]);
    });

    it("returns correct presets for design phase", () => {
      expect(getPhaseAllowedPresets("design")).toEqual(["architect", "researcher", "scout"]);
    });

    it("returns correct presets for plan phase", () => {
      expect(getPhaseAllowedPresets("plan")).toEqual(["scout", "researcher"]);
    });

    it("returns correct presets for build phase", () => {
      expect(getPhaseAllowedPresets("build")).toEqual(["executor", "debugger", "scout"]);
    });

    it("returns correct presets for review phase", () => {
      expect(getPhaseAllowedPresets("review")).toEqual(["reviewer", "scout"]);
    });

    it("returns correct presets for ship phase", () => {
      expect(getPhaseAllowedPresets("ship")).toEqual(["scout", "researcher"]);
    });

    it("returns null for invalid phase", () => {
      expect(getPhaseAllowedPresets("nonexistent")).toBeNull();
      expect(getPhaseAllowedPresets("")).toBeNull();
    });
  });

  describe("isPhaseAutoAdvance", () => {
    it("returns true for explore phase", () => {
      expect(isPhaseAutoAdvance("explore")).toBe(true);
    });

    it("returns true for design phase", () => {
      expect(isPhaseAutoAdvance("design")).toBe(true);
    });

    it("returns true for plan phase", () => {
      expect(isPhaseAutoAdvance("plan")).toBe(true);
    });

    it("returns false for build phase", () => {
      expect(isPhaseAutoAdvance("build")).toBe(false);
    });

    it("returns false for review phase", () => {
      expect(isPhaseAutoAdvance("review")).toBe(false);
    });

    it("returns true for ship phase", () => {
      expect(isPhaseAutoAdvance("ship")).toBe(true);
    });

    it("returns true for unknown phase (default)", () => {
      expect(isPhaseAutoAdvance("nonexistent")).toBe(true);
      expect(isPhaseAutoAdvance("")).toBe(true);
    });
  });

  describe("getRequiredHandoffs", () => {
    it("explore has no dependencies", () => {
      expect(getRequiredHandoffs("explore", ["explore", "design", "plan", "build", "review", "ship"])).toEqual([]);
    });

    it("design requires explore", () => {
      expect(getRequiredHandoffs("design", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["explore"]);
    });

    it("build requires plan in full workflow", () => {
      expect(getRequiredHandoffs("build", ["explore", "design", "plan", "build", "review", "ship"])).toEqual(["plan"]);
    });

    it("quick workflow: build only requires explore", () => {
      expect(getRequiredHandoffs("build", ["explore", "build", "ship"])).toEqual(["explore"]);
    });

    it("minimal workflow: build has no deps (first phase)", () => {
      expect(getRequiredHandoffs("build", ["build", "ship"])).toEqual([]);
    });
  });
});
