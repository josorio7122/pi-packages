/**
 * Workflow enforcement tests.
 *
 * Tests that the system actively pushes back when the LLM tries to dispatch
 * multi-agent work without first writing .crew/state.md.
 */
import { describe, it, expect } from "vitest";
import { shouldRequireWorkflow, buildWorkflowGateMessage } from "../enforcement.js";

describe("workflow enforcement", () => {
  describe("shouldRequireWorkflow", () => {
    it("returns false for single scout dispatch (exploratory)", () => {
      expect(shouldRequireWorkflow("single", [{ preset: "scout" }], false)).toBe(false);
    });

    it("returns false for single researcher dispatch", () => {
      expect(shouldRequireWorkflow("single", [{ preset: "researcher" }], false)).toBe(false);
    });

    it("returns false for single debugger dispatch", () => {
      expect(shouldRequireWorkflow("single", [{ preset: "debugger" }], false)).toBe(false);
    });

    it("returns false for single executor dispatch (simple task)", () => {
      expect(shouldRequireWorkflow("single", [{ preset: "executor" }], false)).toBe(false);
    });

    it("returns false for 2 parallel scouts (still exploratory)", () => {
      expect(
        shouldRequireWorkflow("parallel", [{ preset: "scout" }, { preset: "scout" }], false),
      ).toBe(false);
    });

    it("returns true for 3+ parallel tasks (multi-agent work)", () => {
      expect(
        shouldRequireWorkflow(
          "parallel",
          [{ preset: "scout" }, { preset: "scout" }, { preset: "executor" }],
          false,
        ),
      ).toBe(true);
    });

    it("returns true for chain with executor (multi-step implementation)", () => {
      expect(
        shouldRequireWorkflow(
          "chain",
          [{ preset: "scout" }, { preset: "executor" }],
          false,
        ),
      ).toBe(true);
    });

    it("returns true for chain with architect (design work)", () => {
      expect(
        shouldRequireWorkflow(
          "chain",
          [{ preset: "scout" }, { preset: "architect" }],
          false,
        ),
      ).toBe(true);
    });

    it("returns false when state.md already exists (workflow active)", () => {
      // If state.md exists, the workflow is already being tracked
      expect(
        shouldRequireWorkflow(
          "chain",
          [{ preset: "scout" }, { preset: "executor" }],
          true, // hasActiveWorkflow
        ),
      ).toBe(false);
    });

    it("returns true for parallel executors without workflow", () => {
      expect(
        shouldRequireWorkflow(
          "parallel",
          [{ preset: "executor" }, { preset: "executor" }],
          false,
        ),
      ).toBe(true);
    });

    it("returns false for parallel scouts only (all exploratory)", () => {
      expect(
        shouldRequireWorkflow(
          "parallel",
          [{ preset: "scout" }, { preset: "researcher" }],
          false,
        ),
      ).toBe(false);
    });

    it("returns false for parallel researcher + reviewer (exploratory)", () => {
      expect(
        shouldRequireWorkflow(
          "parallel",
          [{ preset: "researcher" }, { preset: "reviewer" }],
          false,
        ),
      ).toBe(false);
    });

    it("returns false for chain of scouts and researchers (exploratory)", () => {
      expect(
        shouldRequireWorkflow(
          "chain",
          [{ preset: "scout" }, { preset: "researcher" }],
          false,
        ),
      ).toBe(false);
    });

    it("returns true for chain with researcher + executor (implementation)", () => {
      expect(
        shouldRequireWorkflow(
          "chain",
          [{ preset: "researcher" }, { preset: "executor" }],
          false,
        ),
      ).toBe(true);
    });
  });

  describe("buildWorkflowGateMessage", () => {
    it("returns a message telling LLM to write state.md", () => {
      const msg = buildWorkflowGateMessage();
      expect(msg).toContain(".crew/state.md");
      expect(msg).toContain("workflow");
    });

    it("includes the state.md format example", () => {
      const msg = buildWorkflowGateMessage();
      expect(msg).toContain("feature:");
      expect(msg).toContain("phase:");
    });
  });
});
