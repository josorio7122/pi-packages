/**
 * Handoff file I/O — auto-capture of dispatch results to .crew/phases/.
 *
 * The extension writes handoff files after each dispatch_crew call.
 * Phase gates check for handoff file existence before allowing advancement.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Get the path for a phase handoff file.
 * @returns `.crew/phases/<feature>/<phase>.md`
 */
export function getHandoffPath(cwd: string, feature: string, phase: string): string {
  return path.join(cwd, ".crew", "phases", feature, `${phase}.md`);
}

/**
 * Get the path for a build task file.
 * @returns `.crew/phases/<feature>/build/task-<taskId>.md`
 */
export function getTaskFilePath(cwd: string, feature: string, taskId: string): string {
  return path.join(cwd, ".crew", "phases", feature, "build", `task-${taskId}.md`);
}

/**
 * Write a phase handoff file.
 * Creates `.crew/phases/<feature>/<phase>.md` with the given content.
 * Overwrites if file already exists. Creates directories recursively.
 */
export function writeHandoff(cwd: string, feature: string, phase: string, content: string): void {
  const filePath = getHandoffPath(cwd, feature, phase);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a phase handoff file.
 * @returns File content, or null if file doesn't exist.
 */
export function readHandoff(cwd: string, feature: string, phase: string): string | null {
  const filePath = getHandoffPath(cwd, feature, phase);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Check if a phase handoff file exists.
 */
export function handoffExists(cwd: string, feature: string, phase: string): boolean {
  return fs.existsSync(getHandoffPath(cwd, feature, phase));
}

/**
 * Write a build task file.
 * Creates `.crew/phases/<feature>/build/task-<taskId>.md` with the given content.
 */
export function writeTaskFile(cwd: string, feature: string, taskId: string, content: string): void {
  const filePath = getTaskFilePath(cwd, feature, taskId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}
