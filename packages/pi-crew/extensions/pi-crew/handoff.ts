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
 * Write a dispatch log entry.
 * Always called after any dispatch_crew execution, regardless of workflow state.
 * Logs to .crew/dispatches/<timestamp>-<preset>.md
 *
 * @param cwd - Working directory
 * @param preset - Agent preset name
 * @param task - Task description (first 200 chars)
 * @param output - Agent output
 */
export function writeDispatchLog(
  cwd: string,
  preset: string,
  task: string,
  output: string,
): void {
  const dir = path.join(cwd, ".crew", "dispatches");
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}-${preset}.md`;
  const content = `# ${preset} dispatch

## Task
${task.slice(0, 500)}

## Output
${output}
`;

  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

/**
 * List all dispatch log entries.
 * @param cwd - Working directory
 * @returns Array of filenames sorted by timestamp
 */
export function listDispatchLogs(cwd: string): string[] {
  const dir = path.join(cwd, ".crew", "dispatches");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
}

// ── Findings ────────────────────────────────────────────────────────
// Mode 2 (understand) research handoffs — persisted context for reuse.

/**
 * Write a finding file.
 * Creates `.crew/findings/<topic>.md` with the given content.
 * Overwrites if file already exists.
 *
 * @param cwd - Working directory
 * @param topic - Topic slug (used as filename)
 * @param content - Finding content (markdown)
 */
export function writeFinding(cwd: string, topic: string, content: string): void {
  const dir = path.join(cwd, ".crew", "findings");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${topic}.md`), content, "utf-8");
}

/**
 * Read a finding file.
 * @returns File content, or null if file doesn't exist.
 */
export function readFinding(cwd: string, topic: string): string | null {
  const filePath = path.join(cwd, ".crew", "findings", `${topic}.md`);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * List all finding topics.
 * @returns Array of topic names (without .md extension), sorted alphabetically.
 */
export function listFindings(cwd: string): string[] {
  const dir = path.join(cwd, ".crew", "findings");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}
