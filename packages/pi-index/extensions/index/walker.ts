import { readdir, stat, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, relative, resolve, extname, basename } from "node:path";

// ---------------------------------------------------------------------------
// .gitignore support
// ---------------------------------------------------------------------------

/** Directories that are always excluded, regardless of .gitignore. */
const ALWAYS_EXCLUDED_DIRS = new Set(["node_modules", ".git"]);

/**
 * Convert a single .gitignore pattern line to a RegExp that matches
 * relative POSIX paths.
 *
 * Supported patterns (subset sufficient for common usage):
 *   *.log        → any file ending in .log anywhere in the tree
 *   build/       → any path segment named "build" (directory marker)
 *   src/*.ts     → rooted glob (contains slash, not trailing)
 */
function gitPatternToRegex(pattern: string): RegExp {
  const isDirOnly = pattern.endsWith("/");
  const p = isDirOnly ? pattern.slice(0, -1) : pattern;

  // Escape regex metacharacters except * (handled separately below)
  const escaped = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace ** and * in two safe passes using a null-byte placeholder so that
  // the .* produced for ** is never re-processed by the * replacement:
  //   ** = match across any number of path segments (placeholder → .*)
  //   *  = match within a single path segment ([^/]*)
  const regexBody = escaped
    .replace(/\*\*/g, "\x00")   // step 1: stash ** as null byte
    .replace(/\*/g, "[^/]*")    // step 2: single-segment wildcard
    .replace(/\x00/g, ".*");    // step 3: restore ** as cross-segment wildcard

  if (isDirOnly || !p.includes("/")) {
    // Match the pattern as any path segment (anywhere in the tree)
    return new RegExp(`(?:^|/)${regexBody}(?:/|$)`);
  } else {
    // Rooted pattern — match from the start of the relative path
    return new RegExp(`^${regexBody}(?:/|$)`);
  }
}

/** Read .gitignore from rootDir and return compiled matchers. */
async function loadGitignorePatterns(rootDir: string): Promise<RegExp[]> {
  try {
    const content = await readFile(join(rootDir, ".gitignore"), "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map(gitPatternToRegex);
  } catch {
    return [];
  }
}

function isIgnoredByPatterns(relativePath: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(relativePath));
}

export type FileRecord = {
  relativePath: string;
  absolutePath: string;
  mtime: number;
  sizeKB: number;
  extension: string;
};

export type MtimeEntry = {
  filePath: string;
  mtime: number;
  chunkCount: number;
  indexedAt: number;
};

export type FileDiff = {
  toAdd: FileRecord[];
  toUpdate: FileRecord[];
  toDelete: string[]; // relative paths
};

function getExt(filePath: string): string {
  const base = basename(filePath);
  if (base.endsWith(".d.ts")) return ".d.ts";
  return extname(base);
}

export type WalkResult = {
  files: FileRecord[];
  skippedLarge: number;
};

async function walkDir(
  dir: string,
  indexRoot: string,
  supportedExtensions: Set<string>,
  maxFileKB: number,
  gitignorePatterns: RegExp[],
  results: FileRecord[],
  counts: { skippedLarge: number },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // directory not accessible — skip silently
  }

  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(indexRoot, abs).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      // Always skip hardcoded directories
      if (ALWAYS_EXCLUDED_DIRS.has(entry.name)) continue;
      // Skip directories that match .gitignore patterns (check with trailing /)
      if (isIgnoredByPatterns(rel + "/", gitignorePatterns)) continue;
      if (isIgnoredByPatterns(rel, gitignorePatterns)) continue;
      await walkDir(abs, indexRoot, supportedExtensions, maxFileKB, gitignorePatterns, results, counts);
    } else if (entry.isFile()) {
      const ext = getExt(entry.name);
      if (!supportedExtensions.has(ext)) continue;
      // Skip files that match .gitignore patterns
      if (isIgnoredByPatterns(rel, gitignorePatterns)) continue;
      try {
        const s = await stat(abs);
        const sizeKB = s.size / 1024;
        if (sizeKB > maxFileKB) {
          counts.skippedLarge++;
          continue;
        }
        results.push({
          relativePath: rel,
          absolutePath: abs,
          mtime: s.mtimeMs,
          sizeKB,
          extension: ext,
        });
      } catch {
        // file not stat-able — skip
      }
    }
  }
}

export async function walkDirs(
  dirs: string[],
  indexRoot: string,
  supportedExtensions: string[],
  maxFileKB: number,
): Promise<WalkResult> {
  const extSet = new Set(supportedExtensions);
  const gitignorePatterns = await loadGitignorePatterns(indexRoot);
  const results: FileRecord[] = [];
  const counts = { skippedLarge: 0 };
  for (const dir of dirs) {
    await walkDir(dir, indexRoot, extSet, maxFileKB, gitignorePatterns, results, counts);
  }
  return { files: results, skippedLarge: counts.skippedLarge };
}

export async function readMtimeCache(
  cachePath: string,
): Promise<Map<string, MtimeEntry>> {
  try {
    const raw = await readFile(cachePath, "utf-8");
    const entries: MtimeEntry[] = JSON.parse(raw);
    return new Map(entries.map((e) => [e.filePath, e]));
  } catch {
    return new Map();
  }
}

export async function writeMtimeCache(
  cachePath: string,
  cache: Map<string, MtimeEntry>,
): Promise<void> {
  const dir = resolve(cachePath, "..");
  await mkdir(dir, { recursive: true });
  const entries = Array.from(cache.values());
  const json = JSON.stringify(entries, null, 2);
  const tmp = cachePath + ".tmp";
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, cachePath); // atomic on POSIX
}

export function diffFileSet(
  current: FileRecord[],
  cache: Map<string, MtimeEntry>,
): FileDiff {
  const currentPaths = new Set(current.map((f) => f.relativePath));
  const toAdd: FileRecord[] = [];
  const toUpdate: FileRecord[] = [];

  for (const file of current) {
    const cached = cache.get(file.relativePath);
    if (!cached) {
      toAdd.push(file);
    } else if (file.mtime !== cached.mtime) {
      toUpdate.push(file);
    }
    // else: unchanged — skip
  }

  const toDelete: string[] = [];
  for (const filePath of cache.keys()) {
    if (!currentPaths.has(filePath)) {
      toDelete.push(filePath);
    }
  }

  return { toAdd, toUpdate, toDelete };
}
