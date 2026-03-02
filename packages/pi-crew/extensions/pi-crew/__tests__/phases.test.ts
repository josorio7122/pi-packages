/**
 * Tests for phases.ts — phase content constants replacing SKILL.md files.
 */
import { describe, it, expect } from "vitest";
import { getPhaseContent, VALID_PHASES, type PhaseId } from "../phases.js";

describe("phases", () => {
  describe("VALID_PHASES", () => {
    it("contains all 6 phases in order", () => {
      expect(VALID_PHASES).toEqual(["explore", "design", "plan", "build", "review", "ship"]);
    });

    it("is readonly", () => {
      // TypeScript enforces this at compile time, but verify at runtime
      expect(Object.isFrozen(VALID_PHASES)).toBe(true);
    });
  });

  describe("getPhaseContent", () => {
    it("returns content for explore phase", () => {
      const content = getPhaseContent("explore");
      expect(content).not.toBeNull();
      expect(content).toContain("Explore Phase");
      expect(content).toContain("Dispatch scouts");
      expect(content).toContain("Assess Project Size");
    });

    it("returns content for design phase", () => {
      const content = getPhaseContent("design");
      expect(content).not.toBeNull();
      expect(content).toContain("Design Phase");
      expect(content).toContain("Lock Decisions");
      expect(content).toContain("architect");
    });

    it("returns content for plan phase", () => {
      const content = getPhaseContent("plan");
      expect(content).not.toBeNull();
      expect(content).toContain("Plan Phase");
      expect(content).toContain("Task Breakdown");
      expect(content).toContain("Wave");
    });

    it("returns content for build phase", () => {
      const content = getPhaseContent("build");
      expect(content).not.toBeNull();
      expect(content).toContain("Build Phase");
      expect(content).toContain("Execute Waves");
      expect(content).toContain("executor");
    });

    it("returns content for review phase", () => {
      const content = getPhaseContent("review");
      expect(content).not.toBeNull();
      expect(content).toContain("Review Phase");
      expect(content).toContain("Three Review Gates");
      expect(content).toContain("Spec Compliance");
    });

    it("returns content for ship phase", () => {
      const content = getPhaseContent("ship");
      expect(content).not.toBeNull();
      expect(content).toContain("Ship Phase");
      expect(content).toContain("PR/MR");
      expect(content).toContain("Feature Summary");
    });

    it("returns null for invalid phase", () => {
      expect(getPhaseContent("nonexistent")).toBeNull();
      expect(getPhaseContent("")).toBeNull();
      expect(getPhaseContent("EXPLORE")).toBeNull();
    });

    it("content does not contain YAML frontmatter", () => {
      for (const phase of VALID_PHASES) {
        const content = getPhaseContent(phase);
        expect(content).not.toBeNull();
        expect(content).not.toMatch(/^---\s*\n/);
        expect(content).not.toContain("name: crew-");
      }
    });

    it("every phase content starts with a heading", () => {
      for (const phase of VALID_PHASES) {
        const content = getPhaseContent(phase)!;
        expect(content.trimStart()).toMatch(/^# /);
      }
    });

    it("every phase content contains evaluation gate", () => {
      for (const phase of VALID_PHASES) {
        const content = getPhaseContent(phase)!;
        expect(content).toContain("Evaluation Gate");
      }
    });
  });
});
