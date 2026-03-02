// ── State Management ────────────────────────────────────────────────
// Read/write .crew/ directory files: config.json, state.md, phase dirs.

import * as fs from "node:fs";
import * as path from "node:path";

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

/**
 * Get the phase directory for a feature.
 * @param cwd - Working directory
 * @param feature - Feature name
 * @returns Path to .crew/phases/{feature}
 */
export function getPhaseDir(cwd: string, feature: string): string {
  return path.join(crewDir(cwd), PHASES_DIR, feature);
}

/**
 * List all feature directories.
 * @param cwd - Working directory
 * @returns Array of feature names
 */
export function listFeatures(cwd: string): string[] {
  const dir = path.join(crewDir(cwd), PHASES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
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
 * Read a phase skill's SKILL.md content, stripping YAML frontmatter.
 * Reads from {packageRoot}/skills/crew-{phase}/SKILL.md.
 * @param packageRoot - Package root directory
 * @param phase - Phase name (explore, design, plan, build, review, ship)
 * @returns Skill content without frontmatter, or null if file doesn't exist
 */
export function readPhaseSkill(packageRoot: string, phase: string): string | null {
  const skillPath = path.join(packageRoot, "skills", `crew-${phase}`, "SKILL.md");

  try {
    const raw = fs.readFileSync(skillPath, "utf-8");
    // Strip YAML frontmatter
    const stripped = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
    return stripped.trim() || null;
  } catch {
    return null;
  }
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
 * Render workflow progress with checkmarks and current phase highlighted.
 * Example: "explore ✓ → design ✓ → **plan** → build → review → ship"
 * @param state - CrewState object
 * @returns Formatted progress string (empty if no workflow)
 */
export function getWorkflowProgress(state: CrewState): string {
  if (!state.workflow || state.workflow.length === 0) return "";

  const currentIdx = state.phase ? state.workflow.indexOf(state.phase) : -1;

  return state.workflow
    .map((phase, idx) => {
      if (idx < currentIdx) return `${phase} ✓`;
      if (idx === currentIdx) return `**${phase}**`;
      return phase;
    })
    .join(" → ");
}
