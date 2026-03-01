import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ensureCrewDir,
  getPhaseDir,
  listFeatures,
  readConfig,
  writeConfig,
  readStateRaw,
  readState,
  parseFrontmatter,
  isWorkflowComplete,
  getWorkflowProgress,
  readPhaseSkill,
} from "../state.js";

describe("state", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-state-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("ensureCrewDir", () => {
    it("creates .crew directory", () => {
      ensureCrewDir(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, ".crew"))).toBe(true);
    });

    it("does not throw if directory already exists", () => {
      ensureCrewDir(tmpDir);
      expect(() => ensureCrewDir(tmpDir)).not.toThrow();
    });
  });

  describe("getPhaseDir", () => {
    it("returns correct path", () => {
      const result = getPhaseDir(tmpDir, "auth-feature");
      expect(result).toBe(path.join(tmpDir, ".crew", "phases", "auth-feature"));
    });

    it("does not create the directory", () => {
      const result = getPhaseDir(tmpDir, "auth-feature");
      expect(fs.existsSync(result)).toBe(false);
    });
  });

  describe("listFeatures", () => {
    it("returns empty array when .crew/phases does not exist", () => {
      expect(listFeatures(tmpDir)).toEqual([]);
    });

    it("returns empty array when phases dir is empty", () => {
      fs.mkdirSync(path.join(tmpDir, ".crew", "phases"), { recursive: true });
      expect(listFeatures(tmpDir)).toEqual([]);
    });

    it("returns feature directory names", () => {
      const phasesDir = path.join(tmpDir, ".crew", "phases");
      fs.mkdirSync(path.join(phasesDir, "auth"), { recursive: true });
      fs.mkdirSync(path.join(phasesDir, "billing"), { recursive: true });
      // Create a file (should be excluded — only directories)
      fs.writeFileSync(path.join(phasesDir, "notes.txt"), "not a feature");

      const features = listFeatures(tmpDir);
      expect(features).toHaveLength(2);
      expect(features).toContain("auth");
      expect(features).toContain("billing");
    });
  });

  describe("readConfig / writeConfig", () => {
    it("returns default config when no file exists", () => {
      const config = readConfig(tmpDir);
      expect(config.profile).toBe("balanced");
      expect(config.overrides).toEqual({});
    });

    it("returns default config for corrupt JSON", () => {
      const crewDir = path.join(tmpDir, ".crew");
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(path.join(crewDir, "config.json"), "not valid json{{{");

      const config = readConfig(tmpDir);
      expect(config.profile).toBe("balanced");
      expect(config.overrides).toEqual({});
    });

    it("roundtrips config", () => {
      const config = { profile: "quality", overrides: { scout: "claude-opus-4" } };
      writeConfig(tmpDir, config);

      const read = readConfig(tmpDir);
      expect(read.profile).toBe("quality");
      expect(read.overrides).toEqual({ scout: "claude-opus-4" });
    });

    it("writeConfig creates .crew directory if needed", () => {
      expect(fs.existsSync(path.join(tmpDir, ".crew"))).toBe(false);
      writeConfig(tmpDir, { profile: "budget", overrides: {} });
      expect(fs.existsSync(path.join(tmpDir, ".crew"))).toBe(true);
    });

    it("preserves overrides with multiple agents", () => {
      const config = {
        profile: "balanced",
        overrides: {
          scout: "claude-haiku-4-5",
          executor: "claude-opus-4",
          debugger: "claude-sonnet-4-5",
        },
      };
      writeConfig(tmpDir, config);
      const read = readConfig(tmpDir);
      expect(read.overrides).toEqual(config.overrides);
    });

    it("handles missing profile field in JSON", () => {
      const crewDir = path.join(tmpDir, ".crew");
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(
        path.join(crewDir, "config.json"),
        JSON.stringify({ overrides: { scout: "x" } }),
      );

      const config = readConfig(tmpDir);
      expect(config.profile).toBe("balanced"); // default
      expect(config.overrides).toEqual({ scout: "x" });
    });

    it("handles missing overrides field in JSON", () => {
      const crewDir = path.join(tmpDir, ".crew");
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(path.join(crewDir, "config.json"), JSON.stringify({ profile: "quality" }));

      const config = readConfig(tmpDir);
      expect(config.profile).toBe("quality");
      expect(config.overrides).toEqual({});
    });
  });

  describe("readStateRaw", () => {
    it("returns null when no state file exists", () => {
      expect(readStateRaw(tmpDir)).toBeNull();
    });

    it("returns raw content of state file", () => {
      const crewDir = path.join(tmpDir, ".crew");
      fs.mkdirSync(crewDir, { recursive: true });
      const content = "---\nfeature: auth\nphase: build\n---\n\n## Progress\n- done";
      fs.writeFileSync(path.join(crewDir, "state.md"), content);

      expect(readStateRaw(tmpDir)).toBe(content);
    });
  });

  describe("readState", () => {
    it("returns null when no state file exists", () => {
      expect(readState(tmpDir)).toBeNull();
    });

    it("parses frontmatter from state file", () => {
      const crewDir = path.join(tmpDir, ".crew");
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(
        path.join(crewDir, "state.md"),
        "---\nfeature: auth\nphase: build\nprogress: 3/5\n---\n\nBody text",
      );

      const state = readState(tmpDir);
      expect(state).not.toBeNull();
      expect(state!.feature).toBe("auth");
      expect(state!.phase).toBe("build");
      expect(state!.progress).toBe("3/5");
    });
  });

  describe("parseFrontmatter", () => {
    it("parses valid frontmatter", () => {
      const state = parseFrontmatter(
        "---\nfeature: auth\nphase: build\nprogress: 3/5\n---\n\nBody",
      );
      expect(state.feature).toBe("auth");
      expect(state.phase).toBe("build");
      expect(state.progress).toBe("3/5");
    });

    it("returns nulls for content without frontmatter", () => {
      const state = parseFrontmatter("Just some markdown\nNo frontmatter here");
      expect(state.feature).toBeNull();
      expect(state.phase).toBeNull();
      expect(state.progress).toBeNull();
    });

    it("returns nulls for empty frontmatter", () => {
      const state = parseFrontmatter("---\n---\nBody");
      expect(state.feature).toBeNull();
      expect(state.phase).toBeNull();
      expect(state.progress).toBeNull();
    });

    it("returns null for empty values", () => {
      const state = parseFrontmatter("---\nfeature:\nphase:\n---");
      expect(state.feature).toBeNull();
      expect(state.phase).toBeNull();
    });

    it("handles extra whitespace in values", () => {
      const state = parseFrontmatter("---\nfeature:   auth-module  \nphase: explore\n---");
      expect(state.feature).toBe("auth-module");
      expect(state.phase).toBe("explore");
    });

    it("ignores unknown keys", () => {
      const state = parseFrontmatter("---\nfeature: auth\nunknown_key: value\nphase: build\n---");
      expect(state.feature).toBe("auth");
      expect(state.phase).toBe("build");
    });

    it("handles values with colons", () => {
      const state = parseFrontmatter("---\nfeature: auth:v2\nprogress: 3/5: almost done\n---");
      expect(state.feature).toBe("auth:v2");
      expect(state.progress).toBe("3/5: almost done");
    });

    it("handles partial frontmatter (missing fields)", () => {
      const state = parseFrontmatter("---\nfeature: auth\n---");
      expect(state.feature).toBe("auth");
      expect(state.phase).toBeNull();
      expect(state.progress).toBeNull();
    });

    it("parses workflow field as string array", () => {
      const state = parseFrontmatter(
        "---\nfeature: auth\nphase: explore\nworkflow: explore,design,plan,build,review,ship\n---",
      );
      expect(state.workflow).toEqual(["explore", "design", "plan", "build", "review", "ship"]);
    });

    it("parses single-phase workflow", () => {
      const state = parseFrontmatter("---\nfeature: fix\nphase: build\nworkflow: build\n---");
      expect(state.workflow).toEqual(["build"]);
    });

    it("returns null workflow when field missing", () => {
      const state = parseFrontmatter("---\nfeature: auth\nphase: build\n---");
      expect(state.workflow).toBeNull();
    });

    it("returns null workflow for empty value", () => {
      const state = parseFrontmatter("---\nworkflow:\n---");
      expect(state.workflow).toBeNull();
    });

    it("trims whitespace in workflow phases", () => {
      const state = parseFrontmatter("---\nworkflow: explore , build , ship\n---");
      expect(state.workflow).toEqual(["explore", "build", "ship"]);
    });
  });

  describe("isWorkflowComplete", () => {
    it("returns true when phase matches last workflow item", () => {
      expect(
        isWorkflowComplete({
          feature: "x",
          phase: "ship",
          progress: null,
          workflow: ["build", "review", "ship"],
        }),
      ).toBe(true);
    });

    it("returns false when phase is mid-workflow", () => {
      expect(
        isWorkflowComplete({
          feature: "x",
          phase: "build",
          progress: null,
          workflow: ["build", "review", "ship"],
        }),
      ).toBe(false);
    });

    it("returns true when no workflow field (no enforcement)", () => {
      expect(
        isWorkflowComplete({ feature: "x", phase: "build", progress: null, workflow: null }),
      ).toBe(true);
    });

    it("returns true when workflow is empty", () => {
      expect(
        isWorkflowComplete({ feature: "x", phase: "build", progress: null, workflow: [] }),
      ).toBe(true);
    });

    it("returns false when phase is null but workflow exists", () => {
      expect(
        isWorkflowComplete({
          feature: "x",
          phase: null,
          progress: null,
          workflow: ["explore", "build"],
        }),
      ).toBe(false);
    });

    it("returns true for single-phase workflow when on that phase", () => {
      expect(
        isWorkflowComplete({ feature: "x", phase: "build", progress: null, workflow: ["build"] }),
      ).toBe(true);
    });
  });

  describe("getWorkflowProgress", () => {
    it("marks completed phases with ✓ and current with bold", () => {
      const result = getWorkflowProgress({
        feature: "auth",
        phase: "plan",
        progress: null,
        workflow: ["explore", "design", "plan", "build", "review", "ship"],
      });
      expect(result).toContain("explore ✓");
      expect(result).toContain("design ✓");
      expect(result).toContain("**plan**");
      expect(result).toContain("build");
      expect(result).not.toContain("build ✓");
    });

    it("returns empty string when no workflow", () => {
      expect(
        getWorkflowProgress({ feature: "x", phase: "build", progress: null, workflow: null }),
      ).toBe("");
    });

    it("handles first phase (nothing completed)", () => {
      const result = getWorkflowProgress({
        feature: "x",
        phase: "explore",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      expect(result).toContain("**explore**");
      expect(result).not.toContain("✓");
    });

    it("handles last phase (all previous completed)", () => {
      const result = getWorkflowProgress({
        feature: "x",
        phase: "ship",
        progress: null,
        workflow: ["explore", "build", "ship"],
      });
      expect(result).toContain("explore ✓");
      expect(result).toContain("build ✓");
      expect(result).toContain("**ship**");
    });

    it("uses arrow separator between phases", () => {
      const result = getWorkflowProgress({
        feature: "x",
        phase: "build",
        progress: null,
        workflow: ["explore", "build"],
      });
      expect(result).toContain("→");
    });
  });

  describe("readPhaseSkill", () => {
    it("reads skill content for valid phase from real package root", () => {
      // Use the actual pi-crew package root
      const packageRoot = path.resolve(__dirname, "../../..");
      const content = readPhaseSkill(packageRoot, "explore");
      expect(content).not.toBeNull();
      expect(content).toContain("Explore Phase");
      expect(content).toContain("Dispatch scouts");
    });

    it("strips YAML frontmatter from skill content", () => {
      const packageRoot = path.resolve(__dirname, "../../..");
      const content = readPhaseSkill(packageRoot, "explore");
      expect(content).not.toBeNull();
      // Should NOT contain frontmatter delimiters at the start
      expect(content!.startsWith("---")).toBe(false);
      // Should NOT contain the name/description metadata
      expect(content).not.toContain("name: crew-explore");
    });

    it("returns null for unknown phase", () => {
      const packageRoot = path.resolve(__dirname, "../../..");
      expect(readPhaseSkill(packageRoot, "nonexistent")).toBeNull();
    });

    it("returns null when package root is invalid", () => {
      expect(readPhaseSkill("/nonexistent/path", "explore")).toBeNull();
    });
  });
});
