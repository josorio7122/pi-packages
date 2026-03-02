/**
 * Tests for state auto-management — extension manages state.md transitions.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeState, advancePhase } from "../state.js";
import { readState } from "../state.js";
import { writeHandoff } from "../handoff.js";

describe("state management", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(os.tmpdir() + "/crew-state-mgmt-");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("writeState", () => {
    it("writes state.md with YAML frontmatter", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      });
      const content = fs.readFileSync(path.join(tmpDir, ".crew", "state.md"), "utf-8");
      expect(content).toContain("feature: auth");
      expect(content).toContain("phase: explore");
      expect(content).toContain("workflow: explore,design,plan,build,review,ship");
    });

    it("creates .crew directory if needed", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "build",
        progress: "2/5",
        workflow: ["build", "ship"],
      });
      expect(fs.existsSync(path.join(tmpDir, ".crew"))).toBe(true);
    });

    it("includes progress when set", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "build",
        progress: "3/5",
        workflow: ["explore", "build", "ship"],
      });
      const content = fs.readFileSync(path.join(tmpDir, ".crew", "state.md"), "utf-8");
      expect(content).toContain("progress: 3/5");
    });

    it("omits progress when null", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      const content = fs.readFileSync(path.join(tmpDir, ".crew", "state.md"), "utf-8");
      expect(content).not.toContain("progress:");
    });

    it("roundtrips through readState", () => {
      const original = {
        feature: "user-auth",
        phase: "plan",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      };
      writeState(tmpDir, original);
      const read = readState(tmpDir);
      expect(read).toEqual(original);
    });
  });

  describe("advancePhase", () => {
    it("advances from explore to design in full workflow", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      });
      writeHandoff(tmpDir, "auth", "explore", "# Explore findings");
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(true);
      const state = readState(tmpDir);
      expect(state?.phase).toBe("design");
    });

    it("advances from explore to build in quick workflow", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      writeHandoff(tmpDir, "auth", "explore", "# Explore");
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(true);
      const state = readState(tmpDir);
      expect(state?.phase).toBe("build");
    });

    it("does not advance if handoff is missing", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      // No handoff written
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(false);
      const state = readState(tmpDir);
      expect(state?.phase).toBe("explore");
    });

    it("does not advance past the last phase", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "ship",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      writeHandoff(tmpDir, "auth", "ship", "# Summary");
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(false);
      const state = readState(tmpDir);
      expect(state?.phase).toBe("ship");
    });

    it("returns false when no state.md exists", () => {
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(false);
    });

    it("returns false when no workflow", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "build",
        progress: null,
        workflow: null,
      });
      const advanced = advancePhase(tmpDir);
      expect(advanced).toBe(false);
    });

    it("clears progress on phase advance", () => {
      writeState(tmpDir, {
        feature: "auth",
        phase: "build",
        progress: "5/5",
        workflow: ["explore", "build", "review", "ship"],
      });
      writeHandoff(tmpDir, "auth", "build", "# Build summary");
      advancePhase(tmpDir);
      const state = readState(tmpDir);
      expect(state?.phase).toBe("review");
      expect(state?.progress).toBeNull();
    });
  });
});
