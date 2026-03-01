/**
 * paths.ts — Path resolution utilities for the .planning directory structure
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PhaseInfo, MilestoneInfo } from './types.js';

// ─── Normalization ────────────────────────────────────────────────────────────

/** Normalize a path to always use forward slashes (cross-platform). */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

// ─── Planning directory paths ────────────────────────────────────────────────

export function planningDir(cwd: string): string {
  return path.join(cwd, '.planning');
}

export function phasesDir(cwd: string): string {
  return path.join(cwd, '.planning', 'phases');
}

export function configPath(cwd: string): string {
  return path.join(cwd, '.planning', 'config.json');
}

export function statePath(cwd: string): string {
  return path.join(cwd, '.planning', 'STATE.md');
}

export function roadmapPath(cwd: string): string {
  return path.join(cwd, '.planning', 'ROADMAP.md');
}

export function milestonesDir(cwd: string): string {
  return path.join(cwd, '.planning', 'milestones');
}

// ─── Phase name utilities ─────────────────────────────────────────────────────

/**
 * Normalize a phase identifier: pad the numeric part to 2 digits,
 * uppercase any letter suffix, preserve decimal sub-phases.
 * '1' → '01', '1A' → '01A', '12A.1' → '12A.1'
 */
export function normalizePhaseName(phase: string | number): string {
  const match = String(phase).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!match) return String(phase);
  const padded = match[1].padStart(2, '0');
  const letter = match[2] ? match[2].toUpperCase() : '';
  const decimal = match[3] ?? '';
  return padded + letter + decimal;
}

/**
 * Compare two phase numbers for sorting.
 * Handles: integer part, optional letter suffix, optional decimal sub-phases.
 */
export function comparePhaseNum(a: string, b: string): number {
  const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!pa || !pb) return String(a).localeCompare(String(b));

  const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
  if (intDiff !== 0) return intDiff;

  // No letter < letter: 12 < 12A < 12B
  const la = (pa[2] ?? '').toUpperCase();
  const lb = (pb[2] ?? '').toUpperCase();
  if (la !== lb) {
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : 1;
  }

  // Segment-by-segment decimal comparison: 12A < 12A.1 < 12A.1.2 < 12A.2
  const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];

  if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
  if (bDecParts.length === 0 && aDecParts.length > 0) return 1;

  const maxLen = Math.max(aDecParts.length, bDecParts.length);
  for (let i = 0; i < maxLen; i++) {
    const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
    const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ─── Slug generation ──────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from arbitrary text.
 * Returns null for empty/falsy input.
 */
export function generateSlug(text: string): string | null {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Phase searching ──────────────────────────────────────────────────────────

/**
 * Search for a phase directory within a specific base directory.
 * Returns a PhaseInfo (without `archived`) or null if not found.
 */
export function searchPhaseInDir(
  baseDir: string,
  relBase: string,
  normalized: string,
): Omit<PhaseInfo, 'archived'> | null {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(comparePhaseNum);

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(baseDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);

    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = phaseFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedPlanIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')),
    );
    const incompletePlans = plans.filter(p => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    return {
      found: true,
      directory: toPosixPath(path.join(relBase, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName
        ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch {
    return null;
  }
}

/**
 * Find a phase directory by phase number.
 * Searches current phases first, then archived milestone phases (newest first).
 * Returns null if not found.
 */
export function findPhase(cwd: string, phase: string | number): PhaseInfo | null {
  if (!phase) return null;

  const currentPhasesDir = phasesDir(cwd);
  const normalized = normalizePhaseName(phase);

  // Search current phases first
  const current = searchPhaseInDir(currentPhasesDir, '.planning/phases', normalized);
  if (current) return current as PhaseInfo;

  // Search archived milestone phases (newest first)
  const milestonesDirPath = milestonesDir(cwd);
  if (!fs.existsSync(milestonesDirPath)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDirPath, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const versionMatch = archiveName.match(/^(v[\d.]+)-phases$/);
      const version = versionMatch ? versionMatch[1] : archiveName;
      const archivePath = path.join(milestonesDirPath, archiveName);
      const relBase = '.planning/milestones/' + archiveName;
      const result = searchPhaseInDir(archivePath, relBase, normalized);
      if (result) {
        return { ...result, archived: version };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * List all archived phase directories across all milestone archives.
 */
export function getArchivedPhaseDirs(cwd: string): Array<{
  name: string;
  milestone: string;
  basePath: string;
  fullPath: string;
}> {
  const milestonesDirPath = milestonesDir(cwd);
  const results: Array<{ name: string; milestone: string; basePath: string; fullPath: string }> = [];

  if (!fs.existsSync(milestonesDirPath)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDirPath, { withFileTypes: true });
    const phaseDirNames = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of phaseDirNames) {
      const versionMatch = archiveName.match(/^(v[\d.]+)-phases$/);
      const version = versionMatch ? versionMatch[1] : archiveName;
      const archivePath = path.join(milestonesDirPath, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort(comparePhaseNum);

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch {
    // ignore
  }

  return results;
}

// ─── Milestone info ───────────────────────────────────────────────────────────

/**
 * Extract milestone version and name from ROADMAP.md.
 * Returns { version: 'v1.0', name: 'milestone' } as fallback.
 */
export function getMilestoneInfo(cwd: string): MilestoneInfo {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    // Strip <details>...</details> blocks so shipped milestones don't interfere
    const cleaned = roadmap.replace(/<details>[\s\S]*?<\/details>/gi, '');
    // Extract version and name from the same ## heading
    const headingMatch = cleaned.match(/## .*v(\d+\.\d+)[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return {
        version: 'v' + headingMatch[1],
        name: headingMatch[2].trim(),
      };
    }
    // Fallback: try bare version match
    const versionMatch = cleaned.match(/v(\d+\.\d+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}
