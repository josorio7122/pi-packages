// ── State Management ────────────────────────────────────────────────
// Read/write .crew/ directory files: config.json, state.md, phase dirs.

import * as fs from "node:fs";
import * as path from "node:path";
import { handoffExists } from "./handoff.js";

// ── Types ───────────────────────────────────────────────────────────

export interface CrewConfig {
  profile: string; // "quality" | "balanced" | "budget"
  overrides: Record<string, string>; // agent name → model override
}

export interface CrewState {
  feature: string | null;
  phase: string | null; // explore | design | plan | build | review | ship
  progress: string | null; // e.g. "2/5"
  workflow: string[] | null; // e.g. ["explore", "design", "plan", "build", "review", "ship"]
}

// ── Constants ───────────────────────────────────────────────────────

const CREW_DIR = ".crew";
const CONFIG_FILE = "config.json";
const STATE_FILE = "state.md";
const PHASES_DIR = "phases";

const DEFAULT_CONFIG: CrewConfig = {
  profile: "balanced",
  overrides: {},
};

// ── Directory Helpers ───────────────────────────────────────────────

function crewDir(cwd: string): string {
  return path.join(cwd, CREW_DIR);
}

/**
 * Ensure .crew/ directory exists.
 * @param cwd - Working directory
 */
export function ensureCrewDir(cwd: string): void {
  const dir = crewDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
}

// ── Config ──────────────────────────────────────────────────────────

/**
 * Read .crew/config.json.
 * Returns default config (profile: balanced, overrides: {}) if file doesn't exist.
 * @param cwd - Working directory
 * @returns CrewConfig object
 */
export function readConfig(cwd: string): CrewConfig {
  const configPath = path.join(crewDir(cwd), CONFIG_FILE);
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      profile: parsed.profile || DEFAULT_CONFIG.profile,
      overrides: parsed.overrides || {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write .crew/config.json.
 * Creates .crew/ directory if it doesn't exist.
 * @param cwd - Working directory
 * @param config - Config object to write
 */
export function writeConfig(cwd: string, config: CrewConfig): void {
  ensureCrewDir(cwd);
  const configPath = path.join(crewDir(cwd), CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ── State ───────────────────────────────────────────────────────────

/**
 * Read .crew/state.md as raw string (for LLM injection).
 * @param cwd - Working directory
 * @returns State markdown content or null if file doesn't exist
 */
export function readStateRaw(cwd: string): string | null {
  const statePath = path.join(crewDir(cwd), STATE_FILE);
  if (!fs.existsSync(statePath)) return null;

  try {
    return fs.readFileSync(statePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Read .crew/state.md and parse YAML frontmatter.
 * Returns parsed CrewState object with feature, phase, progress, workflow fields.
 * @param cwd - Working directory
 * @returns Parsed CrewState or null if file doesn't exist
 */
export function readState(cwd: string): CrewState | null {
  const raw = readStateRaw(cwd);
  if (!raw) return null;

  return parseFrontmatter(raw);
}

/**
 * Parse YAML frontmatter from state.md content.
 * Extracts feature, phase, progress, and workflow fields from --- delimited YAML block.
 * @param content - Raw state.md content
 * @returns Parsed CrewState object
 */
export function parseFrontmatter(content: string): CrewState {
  const state: CrewState = { feature: null, phase: null, progress: null, workflow: null };

  // Match content between --- delimiters
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return state;

  const frontmatter = match[1];
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "feature":
        state.feature = value || null;
        break;
      case "phase":
        state.phase = value || null;
        break;
      case "progress":
        state.progress = value || null;
        break;
      case "workflow":
        if (value) {
          state.workflow = value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (state.workflow.length === 0) state.workflow = null;
        }
        break;
    }
  }

  return state;
}

/**
 * Check if the workflow is complete (current phase = last phase in workflow).
 * Returns true if there's no workflow defined (no enforcement).
 * @param state - CrewState object
 * @returns True if workflow is complete or no workflow exists
 */
export function isWorkflowComplete(state: CrewState): boolean {
  if (!state.workflow || state.workflow.length === 0) return true;
  if (!state.phase) return false;
  return state.phase === state.workflow[state.workflow.length - 1];
}

/**
 * Write state.md with YAML frontmatter.
 * Creates .crew/ directory if needed.
 * @param cwd - Project working directory
 * @param state - CrewState to write
 */
export function writeState(cwd: string, state: CrewState): void {
  const crewDir = path.join(cwd, CREW_DIR);
  fs.mkdirSync(crewDir, { recursive: true });

  let yaml = `---\nfeature: ${state.feature}\nphase: ${state.phase}\n`;
  if (state.progress) {
    yaml += `progress: ${state.progress}\n`;
  }
  if (state.workflow) {
    yaml += `workflow: ${state.workflow.join(",")}\n`;
  }
  yaml += `---\n`;

  fs.writeFileSync(path.join(crewDir, "state.md"), yaml, "utf-8");
}

/**
 * Advance the workflow to the next phase if the current phase's handoff exists.
 * Updates state.md with the new phase and clears progress.
 *
 * @param cwd - Project working directory
 * @returns True if phase was advanced, false otherwise
 */
export function advancePhase(cwd: string): boolean {
  const state = readState(cwd);
  if (!state || !state.workflow || state.workflow.length === 0 || !state.phase || !state.feature) {
    return false;
  }

  const currentIdx = state.workflow.indexOf(state.phase);
  // Already at last phase or phase not in workflow
  if (currentIdx < 0 || currentIdx >= state.workflow.length - 1) {
    return false;
  }

  // Check handoff exists for current phase
  if (!handoffExists(cwd, state.feature, state.phase)) {
    return false;
  }

  // Advance to next phase
  const nextPhase = state.workflow[currentIdx + 1];
  writeState(cwd, {
    ...state,
    phase: nextPhase,
    progress: null, // Clear progress on phase change
  });
  return true;
}
