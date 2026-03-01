/**
 * state.ts — STATE.md read/write/patch/advance/snapshot operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { statePath, phasesDir, getMilestoneInfo } from './paths.js';
import { extractFrontmatter, reconstructFrontmatter, spliceFrontmatter } from './frontmatter.js';
import type { FrontmatterData } from './types.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Extract the value of a `**FieldName:** value` pattern from markdown body. */
function stateExtractField(content: string, fieldName: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

/** Replace the value of a `**FieldName:** value` pattern in markdown body. */
function stateReplaceField(content: string, fieldName: string, newValue: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');
  if (pattern.test(content)) {
    return content.replace(pattern, (_match, prefix) => `${prefix}${newValue}`);
  }
  return null;
}

/** Strip YAML frontmatter delimiters from content. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

/**
 * Build a machine-readable YAML frontmatter object from the STATE.md body text.
 * Extracts **Field:** patterns and file-system state (plans/summaries counts).
 */
function buildStateFrontmatter(bodyContent: string, cwd: string): FrontmatterData {
  const extractField = (fieldName: string): string | null => {
    const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
    const match = bodyContent.match(pattern);
    return match ? match[1].trim() : null;
  };

  const currentPhase = extractField('Current Phase');
  const currentPhaseName = extractField('Current Phase Name');
  const currentPlan = extractField('Current Plan');
  const totalPhasesRaw = extractField('Total Phases');
  const totalPlansRaw = extractField('Total Plans in Phase');
  const status = extractField('Status');
  const progressRaw = extractField('Progress');
  const lastActivity = extractField('Last Activity');
  const stoppedAt = extractField('Stopped At') ?? extractField('Stopped at');
  const pausedAt = extractField('Paused At');

  let milestone: string | null = null;
  let milestoneName: string | null = null;
  try {
    const info = getMilestoneInfo(cwd);
    milestone = info.version;
    milestoneName = info.name;
  } catch {
    // ignore — no ROADMAP.md
  }

  let totalPhases = totalPhasesRaw ? parseInt(totalPhasesRaw, 10) : null;
  let completedPhases: number | null = null;
  let totalPlans: number | null = totalPlansRaw ? parseInt(totalPlansRaw, 10) : null;
  let completedPlans: number | null = null;

  // Count plans/summaries from disk if phases dir exists
  try {
    const phasesDirPath = phasesDir(cwd);
    if (fs.existsSync(phasesDirPath)) {
      const phaseDirs = fs
        .readdirSync(phasesDirPath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

      let diskTotalPlans = 0;
      let diskTotalSummaries = 0;
      let diskCompletedPhases = 0;

      for (const dir of phaseDirs) {
        const files = fs.readdirSync(path.join(phasesDirPath, dir));
        const plans = files.filter(f => f.match(/-PLAN\.md$/i)).length;
        const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i)).length;
        diskTotalPlans += plans;
        diskTotalSummaries += summaries;
        if (plans > 0 && summaries >= plans) diskCompletedPhases++;
      }

      if (totalPhases === null) totalPhases = phaseDirs.length;
      completedPhases = diskCompletedPhases;
      totalPlans = diskTotalPlans;
      completedPlans = diskTotalSummaries;
    }
  } catch {
    // ignore
  }

  let progressPercent: number | null = null;
  if (progressRaw) {
    const pctMatch = progressRaw.match(/(\d+)%/);
    if (pctMatch) progressPercent = parseInt(pctMatch[1], 10);
  }

  // Normalize status
  let normalizedStatus = status ?? 'unknown';
  const statusLower = (status ?? '').toLowerCase();
  if (statusLower.includes('paused') || statusLower.includes('stopped') || pausedAt) {
    normalizedStatus = 'paused';
  } else if (statusLower.includes('executing') || statusLower.includes('in progress') || statusLower.includes('ready to execute')) {
    normalizedStatus = 'executing';
  } else if (statusLower.includes('planning') || statusLower.includes('ready to plan')) {
    normalizedStatus = 'planning';
  } else if (statusLower.includes('discussing')) {
    normalizedStatus = 'discussing';
  } else if (statusLower.includes('verif')) {
    normalizedStatus = 'verifying';
  } else if (statusLower.includes('complete') || statusLower.includes('done')) {
    normalizedStatus = 'completed';
  }

  const fm: FrontmatterData = { gsd_state_version: '1.0' };

  if (milestone) fm.milestone = milestone;
  if (milestoneName) fm.milestone_name = milestoneName;
  if (currentPhase) fm.current_phase = currentPhase;
  if (currentPhaseName) fm.current_phase_name = currentPhaseName;
  if (currentPlan) fm.current_plan = currentPlan;
  fm.status = normalizedStatus;
  if (stoppedAt) fm.stopped_at = stoppedAt;
  if (pausedAt) fm.paused_at = pausedAt;
  fm.last_updated = new Date().toISOString();
  if (lastActivity) fm.last_activity = lastActivity;

  const progress: FrontmatterData = {};
  if (totalPhases !== null) progress.total_phases = totalPhases;
  if (completedPhases !== null) progress.completed_phases = completedPhases;
  if (totalPlans !== null) progress.total_plans = totalPlans;
  if (completedPlans !== null) progress.completed_plans = completedPlans;
  if (progressPercent !== null) progress.percent = progressPercent;
  if (Object.keys(progress).length > 0) fm.progress = progress;

  return fm;
}

/**
 * Sync YAML frontmatter from the body text and write STATE.md.
 * All writes to STATE.md use this to keep machine-readable FM in sync.
 */
function syncAndWrite(filePath: string, body: string, cwd: string): void {
  const autoFm = buildStateFrontmatter(body, cwd);
  const yamlStr = reconstructFrontmatter(autoFm);
  const content = `---\n${yamlStr}\n---\n\n${body}`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── loadState ────────────────────────────────────────────────────────────────

/**
 * Read STATE.md and return `{ frontmatter, body, raw }`.
 * Returns null if STATE.md does not exist.
 */
export function loadState(
  cwd: string,
): { frontmatter: FrontmatterData; body: string; raw: string } | null {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = extractFrontmatter(raw);
  const body = stripFrontmatter(raw);

  return { frontmatter, body, raw };
}

// ─── writeState ───────────────────────────────────────────────────────────────

/**
 * Write STATE.md with the given frontmatter and body.
 * The YAML frontmatter is synced from the body using `spliceFrontmatter`.
 * Caller-provided frontmatter is merged into the auto-built frontmatter.
 */
export function writeState(cwd: string, frontmatter: FrontmatterData, body: string): void {
  const filePath = statePath(cwd);

  // Build machine-readable FM from body, then merge caller's FM on top
  const autoFm = buildStateFrontmatter(body, cwd);
  const mergedFm: FrontmatterData = { ...autoFm, ...frontmatter };

  // Use spliceFrontmatter to produce the final content
  const bodyWithAutoFm = spliceFrontmatter(body, mergedFm);
  fs.writeFileSync(filePath, bodyWithAutoFm, 'utf-8');
}

// ─── patchState ───────────────────────────────────────────────────────────────

/**
 * Merge updates into STATE.md frontmatter and write back.
 * Returns true on success, false if STATE.md does not exist.
 */
export function patchState(cwd: string, updates: FrontmatterData): boolean {
  const state = loadState(cwd);
  if (!state) return false;

  const mergedFm: FrontmatterData = { ...state.frontmatter, ...updates };
  const content = spliceFrontmatter(state.body, mergedFm);
  fs.writeFileSync(statePath(cwd), content, 'utf-8');
  return true;
}

// ─── getStateField ────────────────────────────────────────────────────────────

/**
 * Get a single field value from STATE.md frontmatter.
 * Returns null if STATE.md is missing or the field is not present.
 */
export function getStateField(cwd: string, field: string): string | null {
  const state = loadState(cwd);
  if (!state) return null;

  const value = state.frontmatter[field];
  if (value === undefined || value === null) return null;
  return String(value);
}

// ─── advancePlan ─────────────────────────────────────────────────────────────

/**
 * Advance the Current Plan counter in STATE.md body.
 * Returns result object indicating whether advancement occurred.
 */
export function advancePlan(cwd: string): {
  advanced: boolean;
  current_plan?: number;
  previous_plan?: number;
  total_plans?: number;
  status?: string;
  reason?: string;
  error?: string;
} {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) {
    return { advanced: false, error: 'STATE.md not found' };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let body = stripFrontmatter(raw);
  const today = new Date().toISOString().split('T')[0];

  const currentPlan = parseInt(stateExtractField(body, 'Current Plan') ?? '', 10);
  const totalPlans = parseInt(stateExtractField(body, 'Total Plans in Phase') ?? '', 10);

  if (isNaN(currentPlan) || isNaN(totalPlans)) {
    return { advanced: false, error: 'Cannot parse Current Plan or Total Plans in Phase from STATE.md' };
  }

  if (currentPlan >= totalPlans) {
    const updated =
      stateReplaceField(body, 'Status', 'Phase complete — ready for verification') ?? body;
    body = stateReplaceField(updated, 'Last Activity', today) ?? updated;
    syncAndWrite(filePath, body, cwd);
    return {
      advanced: false,
      reason: 'last_plan',
      current_plan: currentPlan,
      total_plans: totalPlans,
      status: 'ready_for_verification',
    };
  }

  const newPlan = currentPlan + 1;
  let updated = stateReplaceField(body, 'Current Plan', String(newPlan)) ?? body;
  updated = stateReplaceField(updated, 'Status', 'Ready to execute') ?? updated;
  updated = stateReplaceField(updated, 'Last Activity', today) ?? updated;
  syncAndWrite(filePath, updated, cwd);

  return {
    advanced: true,
    previous_plan: currentPlan,
    current_plan: newPlan,
    total_plans: totalPlans,
  };
}

// ─── addDecision ─────────────────────────────────────────────────────────────

/**
 * Append a decision entry to the Decisions section in STATE.md body.
 * Returns true on success, false if section not found or STATE.md missing.
 */
export function addDecision(
  cwd: string,
  options: { phase?: string; summary: string; rationale?: string },
): boolean {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, 'utf-8');
  let body = stripFrontmatter(raw);

  const { phase, summary, rationale } = options;
  const entry = `- [Phase ${phase ?? '?'}]: ${summary}${rationale ? ` — ${rationale}` : ''}`;

  const sectionPattern =
    /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = body.match(sectionPattern);

  if (!match) return false;

  let sectionBody = match[2];
  sectionBody = sectionBody.replace(/None yet\.?\s*\n?/gi, '').replace(/No decisions yet\.?\s*\n?/gi, '');
  sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';

  body = body.replace(sectionPattern, (_m, header) => `${header}${sectionBody}`);
  syncAndWrite(filePath, body, cwd);
  return true;
}

// ─── addBlocker ───────────────────────────────────────────────────────────────

/**
 * Append a blocker entry to the Blockers section in STATE.md body.
 * Returns true on success, false if section not found or STATE.md missing.
 */
export function addBlocker(cwd: string, text: string): boolean {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, 'utf-8');
  let body = stripFrontmatter(raw);

  const entry = `- ${text}`;
  const sectionPattern =
    /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = body.match(sectionPattern);

  if (!match) return false;

  let sectionBody = match[2];
  sectionBody = sectionBody.replace(/None\.?\s*\n?/gi, '').replace(/None yet\.?\s*\n?/gi, '');
  sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';

  body = body.replace(sectionPattern, (_m, header) => `${header}${sectionBody}`);
  syncAndWrite(filePath, body, cwd);
  return true;
}

// ─── resolveBlocker ──────────────────────────────────────────────────────────

/**
 * Remove a blocker matching the given text (case-insensitive) from STATE.md body.
 * Returns true on success, false if section not found or STATE.md missing.
 */
export function resolveBlocker(cwd: string, text: string): boolean {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, 'utf-8');
  let body = stripFrontmatter(raw);

  const sectionPattern =
    /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = body.match(sectionPattern);

  if (!match) return false;

  const sectionBody = match[2];
  const lines = sectionBody.split('\n');
  const filtered = lines.filter(line => {
    if (!line.startsWith('- ')) return true;
    return !line.toLowerCase().includes(text.toLowerCase());
  });

  let newBody = filtered.join('\n');
  if (!newBody.trim() || !newBody.includes('- ')) {
    newBody = 'None\n';
  }

  body = body.replace(sectionPattern, (_m, header) => `${header}${newBody}`);
  syncAndWrite(filePath, body, cwd);
  return true;
}

// ─── recordSession ────────────────────────────────────────────────────────────

/**
 * Update session fields in STATE.md body (Last Date, Stopped At, Resume File).
 * Returns true if any field was updated, false if STATE.md is missing.
 */
export function recordSession(
  cwd: string,
  options: { stopped_at?: string; resume_file?: string },
): boolean {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return false;

  const raw = fs.readFileSync(filePath, 'utf-8');
  let body = stripFrontmatter(raw);

  const now = new Date().toISOString();
  let updated = false;

  // Update Last session / Last Date
  const lastSessionResult = stateReplaceField(body, 'Last session', now);
  if (lastSessionResult) { body = lastSessionResult; updated = true; }
  const lastDateResult = stateReplaceField(body, 'Last Date', now);
  if (lastDateResult) { body = lastDateResult; updated = true; }

  // Update Stopped At
  if (options.stopped_at) {
    const r = stateReplaceField(body, 'Stopped At', options.stopped_at)
      ?? stateReplaceField(body, 'Stopped at', options.stopped_at);
    if (r) { body = r; updated = true; }
  }

  // Update Resume File
  const resumeFile = options.resume_file ?? 'None';
  const rr = stateReplaceField(body, 'Resume File', resumeFile)
    ?? stateReplaceField(body, 'Resume file', resumeFile);
  if (rr) { body = rr; updated = true; }

  if (updated) {
    syncAndWrite(filePath, body, cwd);
  }

  return updated;
}

// ─── snapshotState ────────────────────────────────────────────────────────────

/**
 * Create a timestamped copy of STATE.md in `.planning/snapshots/`.
 * Returns the path of the created snapshot, or null if STATE.md is missing.
 */
export function snapshotState(cwd: string): string | null {
  const filePath = statePath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const snapshotsDir = path.join(cwd, '.planning', 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = path.join(snapshotsDir, `STATE-${timestamp}.md`);
  fs.writeFileSync(snapshotFile, content, 'utf-8');

  return snapshotFile;
}

// ─── stateToJson ─────────────────────────────────────────────────────────────

/**
 * Return the full state as a JSON object (the YAML frontmatter data).
 * Returns null if STATE.md does not exist.
 */
export function stateToJson(cwd: string): FrontmatterData | null {
  const state = loadState(cwd);
  if (!state) return null;

  const fm = state.frontmatter;

  // If frontmatter is empty, build it from the body
  if (Object.keys(fm).length === 0) {
    return buildStateFrontmatter(state.body, cwd);
  }

  return fm;
}
