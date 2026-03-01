import type { CodeChunk } from "./chunker.js";

/**
 * Extract module/package names from import statements in source text.
 *
 * Handles:
 * - JS/TS: `import X from 'Y'`, `import { X } from 'Y'`, `import * as X from 'Y'`, `import 'Y'`
 * - Python: `from X import Y`, `import X`
 * - CommonJS: `require('Y')`
 * - Ruby: `require 'Y'`, `require_relative 'Y'`
 * - SCSS/LESS: `@import 'Y'`, `@use 'Y'`, `@forward 'Y'`
 *
 * @param text - Source text (typically the first chunk of a file)
 * @returns Array of unique module/package names in order of first appearance
 */
export function extractImportNames(text: string): string[] {
  const modules: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      modules.push(name);
    }
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    // JS/TS: import X from 'Y', import { X } from 'Y', import * as X from 'Y'
    const jsFrom = trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
    if (jsFrom) { add(jsFrom[1]); continue; }

    // JS/TS: import 'Y' (side-effect)
    const sideEffect = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
    if (sideEffect) { add(sideEffect[1]); continue; }

    // Python: from X import Y
    const pyFrom = trimmed.match(/^from\s+(\S+)\s+import/);
    if (pyFrom) { add(pyFrom[1]); continue; }

    // Python: import X (but not JS import which always has quotes or braces after)
    const pyImport = trimmed.match(/^import\s+([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)$/);
    if (pyImport) { add(pyImport[1]); continue; }

    // CommonJS: require('Y')
    const req = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (req) { add(req[1]); continue; }

    // Ruby: require 'Y' or require_relative 'Y'
    const rbReq = trimmed.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
    if (rbReq) { add(rbReq[1]); continue; }

    // SCSS/LESS: @import 'Y', @use 'Y', @forward 'Y'
    const scssImport = trimmed.match(/^@(?:import|use|forward)\s+['"]([^'"]+)['"]/);
    if (scssImport) { add(scssImport[1]); continue; }
  }

  return modules;
}

/**
 * Generate enriched text for embedding that includes file-level context.
 *
 * The enriched text is used **only** for the embedding API call — the stored
 * `text` field in the DB remains the raw source lines. This is a deterministic,
 * zero-LLM-cost alternative to Anthropic's Contextual Retrieval technique.
 *
 * Output format:
 * ```
 * File: src/auth/jwt.ts (typescript)
 * Module symbols: signToken, verifyToken, refreshToken
 * Imports: jsonwebtoken, ../config
 * Current: verifyToken (chunk 2 of 4)
 * ---
 * {raw chunk text}
 * ```
 *
 * Lines are omitted when there's nothing to show (e.g. no symbols → no "Module symbols:" line).
 *
 * @param chunk - The chunk to enrich
 * @param fileChunks - All chunks from the current indexing batch (may include chunks from other files; they are filtered out)
 * @returns Enriched text string for the embedding API
 */
export function enrichForEmbedding(chunk: CodeChunk, fileChunks: CodeChunk[]): string {
  const sameFile = fileChunks.filter((c) => c.filePath === chunk.filePath);

  // Collect unique symbols in order of appearance
  const symbols: string[] = [];
  const seenSymbols = new Set<string>();
  for (const c of sameFile) {
    if (c.symbol && !seenSymbols.has(c.symbol)) {
      seenSymbols.add(c.symbol);
      symbols.push(c.symbol);
    }
  }

  // Extract imports from the first chunk (index 0) — where imports typically live
  const firstChunk = sameFile.find((c) => c.chunkIndex === 0);
  const imports = firstChunk ? extractImportNames(firstChunk.text) : [];

  // Build header lines
  const lines: string[] = [
    `File: ${chunk.filePath} (${chunk.language})`,
  ];
  if (symbols.length > 0) {
    lines.push(`Module symbols: ${symbols.join(", ")}`);
  }
  if (imports.length > 0) {
    lines.push(`Imports: ${imports.join(", ")}`);
  }
  if (chunk.symbol) {
    lines.push(`Current: ${chunk.symbol} (chunk ${chunk.chunkIndex + 1} of ${sameFile.length})`);
  }
  lines.push("---");
  lines.push(chunk.text);

  return lines.join("\n");
}
