import { describe, it, expect } from "vitest";
import { chunkFile, detectLanguage } from "./chunker.js";

describe("detectLanguage", () => {
  it.each([
    [".ts", "typescript"],
    [".tsx", "typescript"],
    [".d.ts", "typescript"],
    [".js", "javascript"],
    [".jsx", "javascript"],
    [".py", "python"],
    [".sql", "sql"],
    [".md", "markdown"],
    [".css", "css"],
    [".html", "html"],
    [".txt", "text"],
  ])("maps %s → %s", (ext, lang) => {
    expect(detectLanguage(ext)).toBe(lang);
  });
});

describe("chunkFile", () => {
  const filePath = "src/auth/login.ts";
  const mtime = 1234567890000;

  it("produces at least one chunk for non-empty content", () => {
    const content = "export function login() {\n  return true;\n}\n";
    const chunks = chunkFile(filePath, content, mtime);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("assigns sequential chunkIndex starting at 0", () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFile(filePath, content, mtime);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it("covers all lines with no gaps (every line in exactly one chunk)", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    const content = lines.join("\n");
    const chunks = chunkFile(filePath, content, mtime);
    const covered = new Set<number>();
    for (const c of chunks) {
      for (let ln = c.startLine; ln <= c.endLine; ln++) covered.add(ln);
    }
    for (let i = 1; i <= lines.length; i++) {
      expect(covered.has(i), `line ${i} not covered`).toBe(true);
    }
  });

  it("no chunk exceeds 80 lines", () => {
    const content = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFile(filePath, content, mtime);
    for (const c of chunks) {
      expect(c.endLine - c.startLine + 1).toBeLessThanOrEqual(80);
    }
  });

  it("sets filePath and mtime on every chunk", () => {
    const content = "const x = 1;\n";
    const chunks = chunkFile(filePath, content, mtime);
    for (const c of chunks) {
      expect(c.filePath).toBe(filePath);
      expect(c.mtime).toBe(mtime);
    }
  });

  it("generates chunk id as filePath:chunkIndex", () => {
    const content = "const x = 1;\n";
    const chunks = chunkFile(filePath, content, mtime);
    expect(chunks[0].id).toBe("src/auth/login.ts:0");
  });

  it("detects TypeScript function boundary and sets symbol", () => {
    const content = [
      "import { foo } from './foo.js';",
      "",
      "export function authenticate(user: string) {",
      "  return user === 'admin';",
      "}",
    ].join("\n");
    const chunks = chunkFile(filePath, content, mtime);
    const authChunk = chunks.find((c) => c.symbol === "authenticate");
    expect(authChunk).toBeDefined();
  });

  it("detects Python def boundary and sets symbol", () => {
    const pyPath = "src/auth/login.py";
    const content = [
      "import os",
      "",
      "def handle_login(user):",
      "    return True",
    ].join("\n");
    const chunks = chunkFile(pyPath, content, mtime);
    const loginChunk = chunks.find((c) => c.symbol === "handle_login");
    expect(loginChunk).toBeDefined();
  });

  it("returns empty array for empty content", () => {
    expect(chunkFile(filePath, "", mtime)).toEqual([]);
  });

  it("endLine >= startLine for all chunks", () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFile(filePath, content, mtime);
    for (const c of chunks) {
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
    }
  });

  it("startLine and endLine are 1-based (not 0-based)", () => {
    const content = "line one\nline two\n";
    const chunks = chunkFile(filePath, content, mtime);
    expect(chunks[0].startLine).toBe(1);
  });
});
