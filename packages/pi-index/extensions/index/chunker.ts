import { extname, basename } from "node:path";
import { LANGUAGE_MAP, MAX_CHUNK_LINES } from "./constants.js";
import { astSplit, langchainSplit, type ASTRange } from "./ast-chunker.js";

/**
 * A single indexed unit of source code produced by `chunkFile`.
 *
 * Each chunk covers a contiguous range of lines in one file. The `vector` field
 * is empty at chunk time and filled by the embedder before DB insertion.
 */
export type CodeChunk = {
  id: string;
  text: string;
  vector: number[];  // filled by embedder; empty array at chunk time
  filePath: string;
  chunkIndex: number;
  startLine: number;  // 1-based, inclusive
  endLine: number;    // 1-based, inclusive
  language: string;
  extension: string;
  symbol: string;
  mtime: number;
  createdAt: number;
};

// Handle .d.ts correctly — extname(".d.ts") gives ".ts", need basename check
function getExtension(filePath: string): string {
  const base = basename(filePath);
  if (base.endsWith(".d.ts")) return ".d.ts";
  return extname(base);
}

/**
 * Resolve a file extension to its canonical language name.
 *
 * @param ext - File extension including the leading dot (e.g. `".ts"`, `".py"`)
 * @returns Language name string (e.g. `"typescript"`, `"python"`), or `"text"` for unknown extensions
 */
export function detectLanguage(ext: string): string {
  return LANGUAGE_MAP[ext] ?? "text";
}

/**
 * Convert a flat list of AST ranges into full file coverage by filling in gaps
 * between nodes and clamping to the total line count.
 *
 * Gap ranges (preamble, inter-node gaps, trailing lines) get an empty symbol.
 */
function buildChunkRanges(ranges: ASTRange[], totalLines: number): ASTRange[] {
  if (ranges.length === 0) {
    return [{ startLine: 0, endLine: totalLines - 1, symbol: "" }];
  }

  const result: ASTRange[] = [];

  // Preamble (lines before the first node)
  if (ranges[0].startLine > 0) {
    result.push({ startLine: 0, endLine: ranges[0].startLine - 1, symbol: "" });
  }

  // Each AST node + gap between consecutive nodes
  for (let i = 0; i < ranges.length; i++) {
    result.push(ranges[i]);

    const nextStart = i + 1 < ranges.length ? ranges[i + 1].startLine : totalLines;
    if (ranges[i].endLine + 1 < nextStart) {
      result.push({
        startLine: ranges[i].endLine + 1,
        endLine: nextStart - 1,
        symbol: "",
      });
    }
  }

  // Trailing lines after the last node
  const lastEnd = ranges[ranges.length - 1].endLine;
  if (lastEnd < totalLines - 1) {
    result.push({ startLine: lastEnd + 1, endLine: totalLines - 1, symbol: "" });
  }

  return result;
}

/**
 * Sub-split any range that exceeds MAX_CHUNK_LINES into equal-sized pieces.
 */
function subSplit(ranges: ASTRange[]): ASTRange[] {
  const result: ASTRange[] = [];
  for (const range of ranges) {
    const size = range.endLine - range.startLine + 1;
    if (size <= MAX_CHUNK_LINES) {
      result.push(range);
    } else {
      for (let i = range.startLine; i <= range.endLine; i += MAX_CHUNK_LINES) {
        result.push({
          startLine: i,
          endLine: Math.min(i + MAX_CHUNK_LINES - 1, range.endLine),
          symbol: i === range.startLine ? range.symbol : "",
        });
      }
    }
  }
  return result;
}

/**
 * Split a source file into indexable chunks aligned to structural boundaries.
 *
 * Uses tree-sitter AST parsing when a grammar is available for the language,
 * falling back to LangChain's RecursiveCharacterTextSplitter otherwise.
 * Any block exceeding `MAX_CHUNK_LINES` is further sub-split.
 *
 * @param filePath - Relative path of the file (used as the chunk ID prefix and stored in DB)
 * @param content - Full UTF-8 text content of the file
 * @param mtime - File modification time in milliseconds (Unix epoch)
 * @returns Array of `CodeChunk` objects with empty `vector` fields (filled by the embedder)
 */
export async function chunkFile(
  filePath: string,
  content: string,
  mtime: number,
): Promise<CodeChunk[]> {
  if (!content.trim()) return [];

  const ext = getExtension(filePath);
  const language = detectLanguage(ext);
  const lines = content.split("\n");
  const now = Date.now();

  // Try AST splitting first; fall back to LangChain if no grammar or parse failure
  let ranges = astSplit(content, language);

  if (!ranges || ranges.length === 0) {
    ranges = await langchainSplit(content, language);
  }

  // Fill gaps so every line belongs to exactly one chunk
  const chunkRanges = buildChunkRanges(ranges, lines.length);

  // Sub-split any range exceeding MAX_CHUNK_LINES
  const finalRanges = subSplit(chunkRanges);

  return finalRanges.map((range, chunkIndex) => ({
    id: `${filePath}:${chunkIndex}`,
    text: lines.slice(range.startLine, range.endLine + 1).join("\n"),
    vector: [],
    filePath,
    chunkIndex,
    startLine: range.startLine + 1,  // convert to 1-based
    endLine: range.endLine + 1,       // convert to 1-based
    language,
    extension: ext,
    symbol: range.symbol,
    mtime,
    createdAt: now,
  }));
}
