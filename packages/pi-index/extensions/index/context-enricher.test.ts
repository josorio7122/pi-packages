import { describe, it, expect } from "vitest";
import { extractImportNames, enrichForEmbedding } from "./context-enricher.js";
import type { CodeChunk } from "./chunker.js";

/** Helper to build a minimal CodeChunk with overrides. */
function makeChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: "test.ts:0",
    text: "const x = 1;",
    vector: [],
    filePath: "src/test.ts",
    chunkIndex: 0,
    startLine: 1,
    endLine: 1,
    language: "typescript",
    extension: ".ts",
    symbol: "",
    mtime: 1000,
    createdAt: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractImportNames
// ---------------------------------------------------------------------------

describe("extractImportNames", () => {
  it("extracts JS/TS default import: import X from 'Y'", () => {
    const result = extractImportNames("import jwt from 'jsonwebtoken';");
    expect(result).toEqual(["jsonwebtoken"]);
  });

  it("extracts JS/TS named import: import { X } from 'Y'", () => {
    const result = extractImportNames("import { sign, verify } from 'jsonwebtoken';");
    expect(result).toEqual(["jsonwebtoken"]);
  });

  it("extracts JS/TS namespace import: import * as X from 'Y'", () => {
    const result = extractImportNames("import * as path from 'node:path';");
    expect(result).toEqual(["node:path"]);
  });

  it("extracts JS/TS side-effect import: import 'Y'", () => {
    const result = extractImportNames("import './setup.js';");
    expect(result).toEqual(["./setup.js"]);
  });

  it("extracts Python from-import: from X import Y", () => {
    const result = extractImportNames("from flask import Flask, request");
    expect(result).toEqual(["flask"]);
  });

  it("extracts Python simple import: import X", () => {
    const result = extractImportNames("import os");
    expect(result).toEqual(["os"]);
  });

  it("extracts CommonJS require: require('Y')", () => {
    const result = extractImportNames("const fs = require('fs');");
    expect(result).toEqual(["fs"]);
  });

  it("extracts Ruby require: require 'Y'", () => {
    const result = extractImportNames("require 'json'");
    expect(result).toEqual(["json"]);
  });

  it("extracts Ruby require_relative: require_relative 'Y'", () => {
    const result = extractImportNames("require_relative 'helper'");
    expect(result).toEqual(["helper"]);
  });

  it("extracts multiple imports from multi-line text", () => {
    const text = [
      "import jwt from 'jsonwebtoken';",
      "import { Config } from '../config';",
      "import type { User } from './types';",
    ].join("\n");
    const result = extractImportNames(text);
    expect(result).toEqual(["jsonwebtoken", "../config", "./types"]);
  });

  it("returns empty array when no imports found", () => {
    const result = extractImportNames("const x = 1;\nfunction foo() {}");
    expect(result).toEqual([]);
  });

  it("deduplicates repeated module names", () => {
    const text = [
      "import { sign } from 'jsonwebtoken';",
      "import { verify } from 'jsonwebtoken';",
    ].join("\n");
    const result = extractImportNames(text);
    expect(result).toEqual(["jsonwebtoken"]);
  });

  it("ignores comment lines", () => {
    const text = [
      "// import fake from 'not-real';",
      "import real from 'actual';",
    ].join("\n");
    const result = extractImportNames(text);
    expect(result).toEqual(["actual"]);
  });
});

// ---------------------------------------------------------------------------
// enrichForEmbedding
// ---------------------------------------------------------------------------

describe("enrichForEmbedding", () => {
  it("always includes file path and language", () => {
    const chunk = makeChunk({ filePath: "src/auth/jwt.ts", language: "typescript" });
    const result = enrichForEmbedding(chunk, [chunk]);
    expect(result).toContain("File: src/auth/jwt.ts (typescript)");
  });

  it("includes Module symbols line with all sibling symbols", () => {
    const chunks = [
      makeChunk({ filePath: "src/jwt.ts", chunkIndex: 0, symbol: "signToken" }),
      makeChunk({ filePath: "src/jwt.ts", chunkIndex: 1, symbol: "verifyToken" }),
      makeChunk({ filePath: "src/jwt.ts", chunkIndex: 2, symbol: "refreshToken" }),
    ];
    const result = enrichForEmbedding(chunks[1], chunks);
    expect(result).toContain("Module symbols: signToken, verifyToken, refreshToken");
  });

  it("deduplicates symbol names", () => {
    // Two chunks can share the same symbol (e.g., sub-split of a large function)
    const chunks = [
      makeChunk({ filePath: "src/a.ts", chunkIndex: 0, symbol: "bigFn" }),
      makeChunk({ filePath: "src/a.ts", chunkIndex: 1, symbol: "bigFn" }),
    ];
    const result = enrichForEmbedding(chunks[0], chunks);
    // "bigFn" should appear only once
    const matches = result.match(/bigFn/g);
    // Once in "Module symbols:" and once in "Current:" = 2 total
    expect(matches?.length).toBe(2);
    expect(result).toContain("Module symbols: bigFn");
  });

  it("includes Imports line from first chunk (preamble)", () => {
    const preamble = makeChunk({
      filePath: "src/jwt.ts",
      chunkIndex: 0,
      symbol: "",
      text: "import jwt from 'jsonwebtoken';\nimport { Config } from '../config';",
    });
    const fn = makeChunk({
      filePath: "src/jwt.ts",
      chunkIndex: 1,
      symbol: "signToken",
      text: "export function signToken() { return jwt.sign({}); }",
    });
    const result = enrichForEmbedding(fn, [preamble, fn]);
    expect(result).toContain("Imports: jsonwebtoken, ../config");
  });

  it("extracts imports from chunk 0 even if it has a symbol", () => {
    // File starts with a function but has imports at the top within the same chunk
    const chunk0 = makeChunk({
      filePath: "src/a.ts",
      chunkIndex: 0,
      symbol: "main",
      text: "import os from 'os';\nexport function main() {}",
    });
    const result = enrichForEmbedding(chunk0, [chunk0]);
    expect(result).toContain("Imports: os");
  });

  it("omits Module symbols line when no symbols exist", () => {
    const chunk = makeChunk({ filePath: "data.json", language: "json", symbol: "" });
    const result = enrichForEmbedding(chunk, [chunk]);
    expect(result).not.toContain("Module symbols:");
  });

  it("omits Imports line when no imports found", () => {
    const chunk = makeChunk({
      filePath: "src/util.ts",
      chunkIndex: 0,
      symbol: "add",
      text: "export function add(a: number, b: number) { return a + b; }",
    });
    const result = enrichForEmbedding(chunk, [chunk]);
    expect(result).not.toContain("Imports:");
  });

  it("shows Current line with symbol and position for named chunks", () => {
    const chunks = [
      makeChunk({ filePath: "src/a.ts", chunkIndex: 0, symbol: "" }),
      makeChunk({ filePath: "src/a.ts", chunkIndex: 1, symbol: "foo" }),
      makeChunk({ filePath: "src/a.ts", chunkIndex: 2, symbol: "bar" }),
    ];
    const result = enrichForEmbedding(chunks[1], chunks);
    expect(result).toContain("Current: foo (chunk 2 of 3)");
  });

  it("omits Current line for chunks with no symbol", () => {
    const chunk = makeChunk({ symbol: "" });
    const result = enrichForEmbedding(chunk, [chunk]);
    expect(result).not.toContain("Current:");
  });

  it("raw chunk text appears after --- separator", () => {
    const text = "export function hello() { return 'world'; }";
    const chunk = makeChunk({ text, symbol: "hello" });
    const result = enrichForEmbedding(chunk, [chunk]);
    const parts = result.split("---\n");
    expect(parts.length).toBe(2);
    expect(parts[1]).toBe(text);
  });

  it("only uses siblings from the same file", () => {
    const chunkA = makeChunk({ filePath: "src/a.ts", chunkIndex: 0, symbol: "aFn" });
    const chunkB = makeChunk({ filePath: "src/b.ts", chunkIndex: 0, symbol: "bFn" });
    const result = enrichForEmbedding(chunkA, [chunkA, chunkB]);
    expect(result).toContain("Module symbols: aFn");
    expect(result).not.toContain("bFn");
  });

  it("handles single-chunk file correctly", () => {
    const chunk = makeChunk({
      filePath: "src/tiny.ts",
      chunkIndex: 0,
      symbol: "helper",
      text: "export const helper = () => 42;",
    });
    const result = enrichForEmbedding(chunk, [chunk]);
    expect(result).toContain("File: src/tiny.ts (typescript)");
    expect(result).toContain("Module symbols: helper");
    expect(result).toContain("Current: helper (chunk 1 of 1)");
    expect(result).toContain("---\nexport const helper = () => 42;");
  });
});
