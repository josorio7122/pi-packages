import { extname, basename } from "node:path";

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

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".d.ts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".sql": "sql",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".txt": "text",
};

// Handle .d.ts correctly — extname(".d.ts") gives ".ts", need basename check
function getExtension(filePath: string): string {
  const base = basename(filePath);
  if (base.endsWith(".d.ts")) return ".d.ts";
  return extname(base);
}

export function detectLanguage(ext: string): string {
  return LANGUAGE_MAP[ext] ?? "text";
}

// Structural boundary patterns per language
// Each entry: [regex that matches the START of a boundary line, function to extract symbol name]
type BoundaryDef = [RegExp, (line: string) => string];

const BOUNDARIES: Record<string, BoundaryDef[]> = {
  typescript: [
    [/^export\s+(?:async\s+)?function\s+(\w+)/, (l) => l.match(/function\s+(\w+)/)?.[1] ?? ""],
    [/^export\s+(?:abstract\s+)?class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
    [/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/, (l) => l.match(/const\s+(\w+)/)?.[1] ?? ""],
    [/^(?:async\s+)?function\s+(\w+)/, (l) => l.match(/function\s+(\w+)/)?.[1] ?? ""],
    [/^abstract\s+class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
    [/^class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
  ],
  javascript: [
    [/^export\s+(?:async\s+)?function\s+(\w+)/, (l) => l.match(/function\s+(\w+)/)?.[1] ?? ""],
    [/^export\s+(?:abstract\s+)?class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
    [/^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(/, (l) => l.match(/const\s+(\w+)/)?.[1] ?? ""],
    [/^(?:async\s+)?function\s+(\w+)/, (l) => l.match(/function\s+(\w+)/)?.[1] ?? ""],
    [/^abstract\s+class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
    [/^class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
  ],
  python: [
    [/^(?:async\s+)?def\s+(\w+)/, (l) => l.match(/def\s+(\w+)/)?.[1] ?? ""],
    [/^class\s+(\w+)/, (l) => l.match(/class\s+(\w+)/)?.[1] ?? ""],
  ],
  sql: [
    [/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i, (l) => l.trim().split(/\s+/).slice(0, 3).join(" ")],
  ],
  markdown: [
    [/^#{2,3}\s+(.+)/, (l) => l.replace(/^#+\s+/, "").trim()],
  ],
  css: [
    [/^\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[,{]|^[a-zA-Z][a-zA-Z0-9_-]*\s*\{/, (l) => l.replace(/[,{].*/, "").trim()],
  ],
};

const MAX_CHUNK_LINES = 80;

function findSymbol(line: string, language: string): string {
  const defs = BOUNDARIES[language] ?? [];
  for (const [regex, extractor] of defs) {
    if (regex.test(line)) return extractor(line);
  }
  return "";
}

function isBoundary(line: string, language: string): boolean {
  const defs = BOUNDARIES[language] ?? [];
  return defs.some(([regex]) => regex.test(line));
}

export function chunkFile(
  filePath: string,
  content: string,
  mtime: number,
): CodeChunk[] {
  if (!content.trim()) return [];

  const ext = getExtension(filePath);
  const language = detectLanguage(ext);
  const lines = content.split("\n");
  const now = Date.now();

  // Collect 0-based boundary indices
  const boundaries: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i], language)) {
      boundaries.push(i);
    }
  }

  // Build chunk ranges from boundaries
  const ranges: Array<{ start: number; end: number }> = [];
  if (boundaries.length === 0) {
    // No boundaries: split by MAX_CHUNK_LINES
    for (let i = 0; i < lines.length; i += MAX_CHUNK_LINES) {
      ranges.push({ start: i, end: Math.min(i + MAX_CHUNK_LINES - 1, lines.length - 1) });
    }
  } else {
    // Lines before the first boundary = preamble chunk
    if (boundaries[0] > 0) {
      ranges.push({ start: 0, end: boundaries[0] - 1 });
    }
    for (let b = 0; b < boundaries.length; b++) {
      const start = boundaries[b];
      const end = b + 1 < boundaries.length ? boundaries[b + 1] - 1 : lines.length - 1;
      ranges.push({ start, end });
    }
  }

  // Sub-split any range exceeding MAX_CHUNK_LINES
  const finalRanges: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    if (range.end - range.start + 1 <= MAX_CHUNK_LINES) {
      finalRanges.push(range);
    } else {
      for (let i = range.start; i <= range.end; i += MAX_CHUNK_LINES) {
        finalRanges.push({ start: i, end: Math.min(i + MAX_CHUNK_LINES - 1, range.end) });
      }
    }
  }

  return finalRanges.map((range, chunkIndex) => {
    const chunkLines = lines.slice(range.start, range.end + 1);
    const text = chunkLines.join("\n");
    const symbol = findSymbol(lines[range.start], language);

    return {
      id: `${filePath}:${chunkIndex}`,
      text,
      vector: [],
      filePath,
      chunkIndex,
      startLine: range.start + 1, // convert to 1-based
      endLine: range.end + 1,     // convert to 1-based
      language,
      extension: ext,
      symbol,
      mtime,
      createdAt: now,
    };
  });
}
