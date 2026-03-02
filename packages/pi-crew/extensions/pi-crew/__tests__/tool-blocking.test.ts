/**
 * Tests for tool_call hook — mechanical enforcement that the orchestrator
 * cannot write/edit outside .crew/. This is the core coordinator enforcement.
 *
 * The hook logic is extracted to a pure function for testability.
 */
import { describe, it, expect } from "vitest";
import { shouldBlockToolCall } from "../tool-blocking.js";

describe("tool blocking", () => {
  describe("shouldBlockToolCall", () => {
    // dispatch_crew is always allowed
    it("allows dispatch_crew", () => {
      expect(shouldBlockToolCall("dispatch_crew", {})).toEqual({ block: false });
    });

    // Read-only tools always allowed
    it("allows read", () => {
      expect(shouldBlockToolCall("read", { path: "src/index.ts" })).toEqual({ block: false });
    });

    it("allows bash", () => {
      expect(shouldBlockToolCall("bash", { command: "ls" })).toEqual({ block: false });
    });

    it("allows grep", () => {
      expect(shouldBlockToolCall("grep", { pattern: "foo" })).toEqual({ block: false });
    });

    it("allows find", () => {
      expect(shouldBlockToolCall("find", { pattern: "*.ts" })).toEqual({ block: false });
    });

    it("allows ls", () => {
      expect(shouldBlockToolCall("ls", { path: "." })).toEqual({ block: false });
    });

    // write to .crew/ is allowed
    it("allows write to .crew/state.md", () => {
      expect(shouldBlockToolCall("write", { path: ".crew/state.md" })).toEqual({ block: false });
    });

    it("allows write to .crew/findings/topic.md", () => {
      expect(shouldBlockToolCall("write", { path: ".crew/findings/payment.md" })).toEqual({ block: false });
    });

    it("allows write to .crew/phases/feature/explore.md", () => {
      expect(shouldBlockToolCall("write", { path: ".crew/phases/auth/explore.md" })).toEqual({ block: false });
    });

    it("allows write to absolute .crew/ path", () => {
      expect(shouldBlockToolCall("write", { path: "/Users/dev/project/.crew/state.md" })).toEqual({ block: false });
    });

    // edit to .crew/ is allowed
    it("allows edit to .crew/state.md", () => {
      expect(shouldBlockToolCall("edit", { path: ".crew/state.md" })).toEqual({ block: false });
    });

    it("allows edit to .crew/findings/topic.md", () => {
      expect(shouldBlockToolCall("edit", { path: ".crew/findings/auth.md" })).toEqual({ block: false });
    });

    // write/edit outside .crew/ is BLOCKED
    it("blocks write to source file", () => {
      const result = shouldBlockToolCall("write", { path: "src/index.ts" });
      expect(result.block).toBe(true);
      if (result.block) {
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain("dispatch_crew");
      }
    });

    it("blocks edit to source file", () => {
      const result = shouldBlockToolCall("edit", { path: "src/utils.ts" });
      expect(result.block).toBe(true);
      if (result.block) {
        expect(result.reason).toBeDefined();
      }
    });

    it("blocks write to config file", () => {
      const result = shouldBlockToolCall("write", { path: "tsconfig.json" });
      expect(result.block).toBe(true);
    });

    it("blocks write to test file", () => {
      const result = shouldBlockToolCall("write", { path: "__tests__/app.test.ts" });
      expect(result.block).toBe(true);
    });

    it("blocks write to absolute path outside .crew/", () => {
      const result = shouldBlockToolCall("write", { path: "/Users/dev/project/src/main.ts" });
      expect(result.block).toBe(true);
    });

    it("blocks edit to absolute path outside .crew/", () => {
      const result = shouldBlockToolCall("edit", { path: "/Users/dev/project/README.md" });
      expect(result.block).toBe(true);
    });

    // Edge cases
    it("blocks write when path is missing", () => {
      const result = shouldBlockToolCall("write", {});
      expect(result.block).toBe(true);
    });

    it("blocks edit when path is missing", () => {
      const result = shouldBlockToolCall("edit", {});
      expect(result.block).toBe(true);
    });

    it("blocks write to path that contains .crew but not in .crew/ dir", () => {
      // e.g. src/.crew-utils/helper.ts — NOT a .crew/ path
      const result = shouldBlockToolCall("write", { path: "src/.crew-utils/helper.ts" });
      expect(result.block).toBe(true);
    });

    // Path traversal attacks
    it("blocks write to ../.crew/ (traversal attack)", () => {
      const result = shouldBlockToolCall("write", { path: "../.crew/state.md" });
      expect(result.block).toBe(true);
    });

    it("blocks write to nested .crew dir (src/.crew/exploit.ts)", () => {
      const result = shouldBlockToolCall("write", { path: "src/.crew/exploit.ts" });
      expect(result.block).toBe(true);
    });

    it("blocks write to ../../.crew/ (double traversal)", () => {
      const result = shouldBlockToolCall("write", { path: "../../.crew/findings/x.md" });
      expect(result.block).toBe(true);
    });

    it("allows unknown tools (custom tools from other extensions)", () => {
      expect(shouldBlockToolCall("my_custom_tool", { anything: true })).toEqual({ block: false });
    });
  });
});
