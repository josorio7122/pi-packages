import { readdir, stat, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, relative, resolve, extname, basename } from "node:path";

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
    if (entry.isDirectory()) {
      await walkDir(abs, indexRoot, supportedExtensions, maxFileKB, results, counts);
    } else if (entry.isFile()) {
      const ext = getExt(entry.name);
      if (!supportedExtensions.has(ext)) continue;
      try {
        const s = await stat(abs);
        const sizeKB = s.size / 1024;
        if (sizeKB > maxFileKB) {
          counts.skippedLarge++;
          continue;
        }
        results.push({
          relativePath: relative(indexRoot, abs).replace(/\\/g, "/"),
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
  const results: FileRecord[] = [];
  const counts = { skippedLarge: 0 };
  for (const dir of dirs) {
    await walkDir(dir, indexRoot, extSet, maxFileKB, results, counts);
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
