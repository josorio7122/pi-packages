import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getPreset, getPresetNames, resolvePreset, formatPresetsForLLM } from "../presets.js";

describe("presets", () => {
  describe("getPreset", () => {
    it("returns preset for each valid name", () => {
      const names = ["scout", "researcher", "architect", "executor", "reviewer", "debugger"];
      for (const name of names) {
        const preset = getPreset(name);
        expect(preset).toBeDefined();
        expect(preset!.name).toBe(name);
        expect(preset!.description).toBeTruthy();
        expect(preset!.promptFile).toBeTruthy();
        expect(preset!.tools).toBeTruthy();
        expect(preset!.tier).toMatch(/^(budget|balanced|quality)$/);
      }
    });

    it("returns undefined for unknown preset", () => {
      expect(getPreset("nonexistent")).toBeUndefined();
      expect(getPreset("")).toBeUndefined();
    });
  });

  describe("getPresetNames", () => {
    it("returns all 6 preset names", () => {
      const names = getPresetNames();
      expect(names).toHaveLength(6);
      expect(names).toContain("scout");
      expect(names).toContain("researcher");
      expect(names).toContain("architect");
      expect(names).toContain("executor");
      expect(names).toContain("reviewer");
      expect(names).toContain("debugger");
    });
  });

  describe("preset tiers", () => {
    it("scout is budget tier", () => {
      expect(getPreset("scout")!.tier).toBe("budget");
    });

    it("researcher is budget tier", () => {
      expect(getPreset("researcher")!.tier).toBe("budget");
    });

    it("architect is quality tier", () => {
      expect(getPreset("architect")!.tier).toBe("quality");
    });

    it("executor is balanced tier", () => {
      expect(getPreset("executor")!.tier).toBe("balanced");
    });

    it("reviewer is balanced tier", () => {
      expect(getPreset("reviewer")!.tier).toBe("balanced");
    });

    it("debugger is quality tier", () => {
      expect(getPreset("debugger")!.tier).toBe("quality");
    });
  });

  describe("preset tools", () => {
    it("scout has read-only tools", () => {
      const tools = getPreset("scout")!.tools;
      expect(tools).toContain("read");
      expect(tools).toContain("bash");
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("edit");
    });

    it("executor has write tools", () => {
      const tools = getPreset("executor")!.tools;
      expect(tools).toContain("read");
      expect(tools).toContain("write");
      expect(tools).toContain("edit");
      expect(tools).toContain("bash");
    });

    it("reviewer has read-only tools", () => {
      const tools = getPreset("reviewer")!.tools;
      expect(tools).toContain("read");
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("edit");
    });

    it("debugger has write tools", () => {
      const tools = getPreset("debugger")!.tools;
      expect(tools).toContain("write");
      expect(tools).toContain("edit");
    });
  });

  describe("resolvePreset", () => {
    let tmpDir: string;

    function setupFakePackageRoot() {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-test-"));
      // Create prompt files matching preset promptFile paths
      const promptDir = path.join(tmpDir, "references", "prompts");
      fs.mkdirSync(promptDir, { recursive: true });

      for (const name of getPresetNames()) {
        fs.writeFileSync(
          path.join(promptDir, `${name}.md`),
          `# System prompt for ${name}\nYou are a ${name} agent.`,
        );
      }
      return tmpDir;
    }

    function cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    it("resolves a valid preset with correct system prompt", () => {
      const root = setupFakePackageRoot();
      try {
        const result = resolvePreset("scout", "balanced", {}, root);
        expect(result).toBeDefined();
        expect(result!.systemPrompt).toContain("scout");
        expect(result!.tools).toBe("read,bash,grep,find,ls");
        expect(result!.model).toBe("claude-haiku-4-5"); // balanced profile, budget tier
      } finally {
        cleanup();
      }
    });

    it("resolves model based on profile and tier", () => {
      const root = setupFakePackageRoot();
      try {
        // architect = quality tier, quality profile → claude-opus-4
        const result = resolvePreset("architect", "quality", {}, root);
        expect(result!.model).toBe("claude-opus-4");
      } finally {
        cleanup();
      }
    });

    it("applies per-agent override", () => {
      const root = setupFakePackageRoot();
      try {
        const result = resolvePreset("scout", "balanced", { scout: "claude-opus-4" }, root);
        expect(result!.model).toBe("claude-opus-4");
      } finally {
        cleanup();
      }
    });

    it("returns undefined for unknown preset", () => {
      const root = setupFakePackageRoot();
      try {
        expect(resolvePreset("nonexistent", "balanced", {}, root)).toBeUndefined();
      } finally {
        cleanup();
      }
    });

    it("throws when prompt file is missing", () => {
      const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-empty-"));
      try {
        expect(() => resolvePreset("scout", "balanced", {}, emptyRoot)).toThrow();
      } finally {
        fs.rmSync(emptyRoot, { recursive: true, force: true });
      }
    });
  });

  describe("formatPresetsForLLM", () => {
    it("returns a markdown table", () => {
      const result = formatPresetsForLLM("balanced", {});
      expect(result).toContain("| Preset | Model | Purpose |");
      expect(result).toContain("|--------|-------|---------|");
    });

    it("includes all 6 presets", () => {
      const result = formatPresetsForLLM("balanced", {});
      for (const name of getPresetNames()) {
        expect(result).toContain(`| ${name} |`);
      }
    });

    it("reflects profile in model column", () => {
      const quality = formatPresetsForLLM("quality", {});
      const budget = formatPresetsForLLM("budget", {});
      // Quality profile should have opus for quality tier agents
      expect(quality).toContain("claude-opus-4");
      // Budget profile should not have opus
      expect(budget).not.toContain("claude-opus-4");
    });

    it("reflects overrides in model column", () => {
      const result = formatPresetsForLLM("balanced", { scout: "custom-model-v1" });
      expect(result).toContain("custom-model-v1");
    });
  });
});
