import { describe, it, expect } from "vitest";
import { resolveModel, isValidProfile, PROFILE_NAMES, PROFILE_DESCRIPTIONS } from "../profiles.js";
import type { Tier, ProfileName } from "../profiles.js";

describe("profiles", () => {
  describe("resolveModel", () => {
    it("returns correct model for balanced profile + budget tier", () => {
      expect(resolveModel("balanced", "budget", "scout", {})).toBe("claude-haiku-4-5");
    });

    it("returns correct model for balanced profile + balanced tier", () => {
      expect(resolveModel("balanced", "balanced", "executor", {})).toBe("claude-sonnet-4-6");
    });

    it("returns correct model for balanced profile + quality tier", () => {
      expect(resolveModel("balanced", "quality", "architect", {})).toBe("claude-sonnet-4-6");
    });

    it("returns correct model for quality profile + quality tier", () => {
      expect(resolveModel("quality", "quality", "architect", {})).toBe("claude-opus-4-6");
    });

    it("returns correct model for budget profile + budget tier", () => {
      expect(resolveModel("budget", "budget", "scout", {})).toBe("claude-haiku-4-5");
    });

    it("returns correct model for budget profile + balanced tier", () => {
      expect(resolveModel("budget", "balanced", "executor", {})).toBe("claude-haiku-4-5");
    });

    it("returns correct model for budget profile + quality tier", () => {
      expect(resolveModel("budget", "quality", "debugger", {})).toBe("claude-sonnet-4-6");
    });

    it("per-agent override takes precedence over profile", () => {
      expect(resolveModel("budget", "budget", "scout", { scout: "claude-opus-4-6" })).toBe(
        "claude-opus-4-6",
      );
    });

    it("override for different agent does not affect this agent", () => {
      expect(resolveModel("balanced", "budget", "scout", { executor: "claude-opus-4-6" })).toBe(
        "claude-haiku-4-5",
      );
    });

    it("falls back to balanced profile for unknown profile name", () => {
      expect(resolveModel("nonexistent", "budget", "scout", {})).toBe("claude-haiku-4-5");
      expect(resolveModel("nonexistent", "quality", "architect", {})).toBe("claude-sonnet-4-6");
    });

    it("falls back to balanced for empty string profile", () => {
      expect(resolveModel("", "balanced", "executor", {})).toBe("claude-sonnet-4-6");
    });

    // Exhaustive: all 9 profile × tier combinations
    const expectations: Array<[ProfileName, Tier, string]> = [
      ["quality", "budget", "claude-sonnet-4-6"],
      ["quality", "balanced", "claude-sonnet-4-6"],
      ["quality", "quality", "claude-opus-4-6"],
      ["balanced", "budget", "claude-haiku-4-5"],
      ["balanced", "balanced", "claude-sonnet-4-6"],
      ["balanced", "quality", "claude-sonnet-4-6"],
      ["budget", "budget", "claude-haiku-4-5"],
      ["budget", "balanced", "claude-haiku-4-5"],
      ["budget", "quality", "claude-sonnet-4-6"],
    ];

    for (const [profile, tier, expected] of expectations) {
      it(`${profile}/${tier} → ${expected}`, () => {
        expect(resolveModel(profile, tier, "test-agent", {})).toBe(expected);
      });
    }
  });

  describe("isValidProfile", () => {
    it("returns true for valid profiles", () => {
      expect(isValidProfile("quality")).toBe(true);
      expect(isValidProfile("balanced")).toBe(true);
      expect(isValidProfile("budget")).toBe(true);
    });

    it("returns false for invalid profiles", () => {
      expect(isValidProfile("nonexistent")).toBe(false);
      expect(isValidProfile("")).toBe(false);
      expect(isValidProfile("QUALITY")).toBe(false);
    });
  });

  describe("PROFILE_NAMES", () => {
    it("contains exactly 3 profiles", () => {
      expect(PROFILE_NAMES).toHaveLength(3);
      expect(PROFILE_NAMES).toContain("quality");
      expect(PROFILE_NAMES).toContain("balanced");
      expect(PROFILE_NAMES).toContain("budget");
    });
  });

  describe("PROFILE_DESCRIPTIONS", () => {
    it("has a description for each profile", () => {
      for (const name of PROFILE_NAMES) {
        expect(PROFILE_DESCRIPTIONS[name]).toBeDefined();
        expect(PROFILE_DESCRIPTIONS[name].length).toBeGreaterThan(0);
      }
    });
  });
});
