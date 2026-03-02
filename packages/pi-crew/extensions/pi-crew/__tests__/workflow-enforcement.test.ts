/**
 * Enforcement tests — phase gates and preset validation.
 *
 * shouldRequireWorkflow was removed — the tool_call hook now mechanically
 * blocks write/edit, making the workflow gate redundant.
 */
import { describe, it, expect } from "vitest";
import {
  shouldBlockForInvalidPreset,
  buildInvalidPresetMessage,
} from "../enforcement.js";

describe("enforcement", () => {
  describe("shouldBlockForInvalidPreset", () => {
    it("returns null when phase is null (no restriction)", () => {
      expect(shouldBlockForInvalidPreset(null, ["executor"])).toBeNull();
    });

    it("returns null for unknown phase", () => {
      expect(shouldBlockForInvalidPreset("unknown", ["executor"])).toBeNull();
    });

    it("allows scout during explore", () => {
      const result = shouldBlockForInvalidPreset("explore", ["scout"]);
      expect(result).toEqual({ blocked: false, invalidPresets: [] });
    });

    it("allows researcher during explore", () => {
      const result = shouldBlockForInvalidPreset("explore", ["researcher"]);
      expect(result).toEqual({ blocked: false, invalidPresets: [] });
    });

    it("blocks executor during explore", () => {
      const result = shouldBlockForInvalidPreset("explore", ["executor"]);
      expect(result).toEqual({
        blocked: true,
        invalidPresets: [{ preset: "executor", phase: "explore" }],
      });
    });

    it("allows executor during build", () => {
      const result = shouldBlockForInvalidPreset("build", ["executor"]);
      expect(result).toEqual({ blocked: false, invalidPresets: [] });
    });

    it("allows debugger during build", () => {
      const result = shouldBlockForInvalidPreset("build", ["debugger"]);
      expect(result).toEqual({ blocked: false, invalidPresets: [] });
    });

    it("blocks reviewer during build", () => {
      const result = shouldBlockForInvalidPreset("build", ["reviewer"]);
      expect(result).toEqual({
        blocked: true,
        invalidPresets: [{ preset: "reviewer", phase: "build" }],
      });
    });

    it("allows reviewer during review", () => {
      const result = shouldBlockForInvalidPreset("review", ["reviewer"]);
      expect(result).toEqual({ blocked: false, invalidPresets: [] });
    });

    it("returns all invalid presets when multiple are invalid", () => {
      const result = shouldBlockForInvalidPreset("explore", ["executor", "debugger", "scout"]);
      expect(result).toEqual({
        blocked: true,
        invalidPresets: [
          { preset: "executor", phase: "explore" },
          { preset: "debugger", phase: "explore" },
        ],
      });
    });
  });

  describe("buildInvalidPresetMessage", () => {
    it("includes phase name and preset names", () => {
      const msg = buildInvalidPresetMessage(
        "explore",
        [{ preset: "executor", phase: "explore" }],
        ["scout", "researcher"],
      );
      expect(msg).toContain('"explore"');
      expect(msg).toContain('"executor"');
      expect(msg).toContain('"scout"');
      expect(msg).toContain('"researcher"');
    });
  });
});
