/**
 * Tests for handoff.ts — auto-capture of dispatch results to .crew/ files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeHandoff,
  readHandoff,
  handoffExists,
  writeTaskFile,
  getHandoffPath,
  getTaskFilePath,
  writeDispatchLog,
  listDispatchLogs,
} from "../handoff.js";

describe("handoff", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-handoff-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("writeHandoff", () => {
    it("writes handoff file to .crew/phases/<feature>/<phase>.md", () => {
      writeHandoff(tmpDir, "auth", "explore", "# Explore findings\n\nFound stuff.");
      const filePath = path.join(tmpDir, ".crew", "phases", "auth", "explore.md");
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("# Explore findings\n\nFound stuff.");
    });

    it("creates directories recursively", () => {
      writeHandoff(tmpDir, "my-feature", "design", "Design content");
      const dir = path.join(tmpDir, ".crew", "phases", "my-feature");
      expect(fs.existsSync(dir)).toBe(true);
    });

    it("overwrites existing handoff file", () => {
      writeHandoff(tmpDir, "auth", "explore", "first");
      writeHandoff(tmpDir, "auth", "explore", "second");
      const content = fs.readFileSync(
        path.join(tmpDir, ".crew", "phases", "auth", "explore.md"),
        "utf-8",
      );
      expect(content).toBe("second");
    });

    it("handles feature names with special characters", () => {
      writeHandoff(tmpDir, "user-auth-v2", "plan", "Plan content");
      const filePath = path.join(tmpDir, ".crew", "phases", "user-auth-v2", "plan.md");
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("readHandoff", () => {
    it("reads existing handoff file", () => {
      writeHandoff(tmpDir, "auth", "explore", "# Findings");
      expect(readHandoff(tmpDir, "auth", "explore")).toBe("# Findings");
    });

    it("returns null for missing file", () => {
      expect(readHandoff(tmpDir, "auth", "explore")).toBeNull();
    });

    it("returns null for missing feature directory", () => {
      expect(readHandoff(tmpDir, "nonexistent", "explore")).toBeNull();
    });
  });

  describe("handoffExists", () => {
    it("returns true when handoff file exists", () => {
      writeHandoff(tmpDir, "auth", "explore", "content");
      expect(handoffExists(tmpDir, "auth", "explore")).toBe(true);
    });

    it("returns false when handoff file is missing", () => {
      expect(handoffExists(tmpDir, "auth", "explore")).toBe(false);
    });

    it("returns false when feature directory is missing", () => {
      expect(handoffExists(tmpDir, "nonexistent", "plan")).toBe(false);
    });
  });

  describe("writeTaskFile", () => {
    it("writes task file to .crew/phases/<feature>/build/task-<id>.md", () => {
      writeTaskFile(tmpDir, "auth", "01", "# Task 01\n\nDo the thing.");
      const filePath = path.join(tmpDir, ".crew", "phases", "auth", "build", "task-01.md");
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("# Task 01\n\nDo the thing.");
    });

    it("creates build subdirectory", () => {
      writeTaskFile(tmpDir, "auth", "02", "content");
      const buildDir = path.join(tmpDir, ".crew", "phases", "auth", "build");
      expect(fs.existsSync(buildDir)).toBe(true);
    });
  });

  describe("getHandoffPath", () => {
    it("returns correct path for phase handoff", () => {
      const result = getHandoffPath(tmpDir, "auth", "explore");
      expect(result).toBe(path.join(tmpDir, ".crew", "phases", "auth", "explore.md"));
    });
  });

  describe("getTaskFilePath", () => {
    it("returns correct path for task file", () => {
      const result = getTaskFilePath(tmpDir, "auth", "03");
      expect(result).toBe(path.join(tmpDir, ".crew", "phases", "auth", "build", "task-03.md"));
    });
  });

  describe("dispatch log", () => {
    describe("writeDispatchLog", () => {
      it("writes to .crew/dispatches/ directory", () => {
        writeDispatchLog(tmpDir, "executor", "Do the thing", "Task completed");
        
        const dispatchesDir = path.join(tmpDir, ".crew", "dispatches");
        expect(fs.existsSync(dispatchesDir)).toBe(true);
        
        const files = fs.readdirSync(dispatchesDir);
        expect(files.length).toBe(1);
        expect(files[0]).toMatch(/\.md$/);
      });

      it("creates the dispatches directory if missing", () => {
        const dispatchesDir = path.join(tmpDir, ".crew", "dispatches");
        expect(fs.existsSync(dispatchesDir)).toBe(false);
        
        writeDispatchLog(tmpDir, "executor", "Task", "Output");
        
        expect(fs.existsSync(dispatchesDir)).toBe(true);
      });

      it("includes preset name in filename", () => {
        writeDispatchLog(tmpDir, "executor", "Task", "Output");
        
        const files = fs.readdirSync(path.join(tmpDir, ".crew", "dispatches"));
        expect(files[0]).toMatch(/-executor\.md$/);
      });

      it("includes task and output in content", () => {
        writeDispatchLog(tmpDir, "executor", "My task description", "My output content");
        
        const files = fs.readdirSync(path.join(tmpDir, ".crew", "dispatches"));
        const content = fs.readFileSync(
          path.join(tmpDir, ".crew", "dispatches", files[0]),
          "utf-8"
        );
        
        expect(content).toContain("# executor dispatch");
        expect(content).toContain("## Task");
        expect(content).toContain("My task description");
        expect(content).toContain("## Output");
        expect(content).toContain("My output content");
      });

      it("truncates long task descriptions to 500 chars", () => {
        const longTask = "a".repeat(1000);
        writeDispatchLog(tmpDir, "executor", longTask, "Output");
        
        const files = fs.readdirSync(path.join(tmpDir, ".crew", "dispatches"));
        const content = fs.readFileSync(
          path.join(tmpDir, ".crew", "dispatches", files[0]),
          "utf-8"
        );
        
        const taskSection = content.split("## Task")[1].split("## Output")[0].trim();
        expect(taskSection.length).toBe(500);
      });
    });

    describe("listDispatchLogs", () => {
      it("returns empty array when no dispatches dir", () => {
        expect(listDispatchLogs(tmpDir)).toEqual([]);
      });

      it("returns sorted filenames", () => {
        // Write multiple dispatches - use different preset names to ensure unique filenames
        writeDispatchLog(tmpDir, "executor", "Task 1", "Output 1");
        writeDispatchLog(tmpDir, "planner", "Task 2", "Output 2");
        writeDispatchLog(tmpDir, "designer", "Task 3", "Output 3");
        
        const logs = listDispatchLogs(tmpDir);
        expect(logs.length).toBe(3);
        
        // Verify sorted order (alphabetically, which matches timestamp order)
        for (let i = 1; i < logs.length; i++) {
          expect(logs[i] >= logs[i - 1]).toBe(true);
        }
      });

      it("filters to only .md files", () => {
        writeDispatchLog(tmpDir, "executor", "Task", "Output");
        
        // Add a non-.md file
        const dispatchesDir = path.join(tmpDir, ".crew", "dispatches");
        fs.writeFileSync(path.join(dispatchesDir, "README.txt"), "Not a log");
        fs.writeFileSync(path.join(dispatchesDir, ".gitkeep"), "");
        
        const logs = listDispatchLogs(tmpDir);
        expect(logs.length).toBe(1);
        expect(logs[0]).toMatch(/\.md$/);
      });
    });
  });
});
