import fs from 'node:fs/promises';
import path from 'node:path';

export type RootFunction = (file: string, projectRoot: string) => Promise<string | undefined>;

/**
 * Creates a root detection function that walks up from a file's directory
 * looking for any of the include patterns. If exclude patterns are found
 * first, returns undefined (this server shouldn't handle this file).
 *
 * Based on OpenCode's NearestRoot from:
 * /Users/josorio/Code/opencode/packages/opencode/src/lsp/server.ts
 *
 * Algorithm:
 * 1. Start at path.dirname(file)
 * 2. If excludes provided, walk up checking for excludes first — if found, return undefined
 * 3. Walk up from file dir to projectRoot looking for any include file
 * 4. Return the directory containing the first match
 * 5. If nothing found, return projectRoot as fallback
 */
export function nearestRoot(includes: string[], excludes?: string[]): RootFunction {
  return async (file: string, projectRoot: string): Promise<string | undefined> => {
    // Check excludes first
    if (excludes) {
      const excluded = await walkUp(path.dirname(file), projectRoot, excludes);
      if (excluded) return undefined;
    }
    // Check includes
    const found = await walkUp(path.dirname(file), projectRoot, includes);
    if (found) return path.dirname(found);
    return projectRoot;
  };
}

/**
 * Walk up from startDir to stopDir looking for any of the target filenames.
 * Returns the full path of the first match found, or undefined.
 */
async function walkUp(startDir: string, stopDir: string, targets: string[]): Promise<string | undefined> {
  let dir = startDir;
  const resolvedStop = path.resolve(stopDir);
  while (true) {
    for (const target of targets) {
      const candidate = path.join(dir, target);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // not found, continue
      }
    }
    if (path.resolve(dir) === resolvedStop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return undefined;
}
