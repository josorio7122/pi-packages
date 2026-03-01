/**
 * roadmap.ts — ROADMAP.md parsing and phase extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import { roadmapPath, normalizePhaseName, phasesDir } from './paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoadmapPhase {
  /** Canonical phase number string as extracted from ROADMAP.md */
  phase_number: string;
  phase_name: string;
  goal: string | null;
  depends_on: string | null;
  success_criteria: string[];
  section: string;
}

/** Internal representation used in parseRoadmap phases array */
interface ParsedPhaseEntry {
  number: string;
  name: string;
  goal: string | null;
  depends_on: string | null;
  success_criteria: string[];
  section: string;
}

export interface RoadmapMilestone {
  heading: string;
  version: string;
}

export interface ParsedRoadmap {
  phases: ParsedPhaseEntry[];
  milestones: RoadmapMilestone[];
}

export interface RoadmapAnalysis {
  phase_count: number;
  completed_phases: number;
  total_plans: number;
  total_summaries: number;
  progress_percent: number;
  phases: Array<{
    number: string;
    name: string;
    goal: string | null;
    disk_status: string;
    plan_count: number;
    summary_count: number;
  }>;
  milestones: RoadmapMilestone[];
  current_phase: string | null;
  next_phase: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSuccessCriteria(section: string): string[] {
  // Match both `**Success Criteria:**` (colon inside) and `**Success Criteria**:` (colon outside)
  const criteriaMatch = section.match(
    /\*\*Success Criteria[:\*][^\n]*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i,
  );
  if (!criteriaMatch) return [];
  return criteriaMatch[1]
    .trim()
    .split('\n')
    .map(line => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function extractPhases(content: string): ParsedPhaseEntry[] {
  const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
  const phases: ParsedPhaseEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = phasePattern.exec(content)) !== null) {
    const phaseNum = match[1];
    const phaseName = match[2].replace(/\(INSERTED\)/i, '').trim();
    const headerIndex = match.index;

    // Find section end (next phase header or end of file)
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch
      ? headerIndex + nextHeaderMatch.index!
      : content.length;

    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch = section.match(/\*\*Depends on:\*\*\s*([^\n]+)/i);
    const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

    const success_criteria = extractSuccessCriteria(section);

    phases.push({ number: phaseNum, name: phaseName, goal, depends_on, success_criteria, section });
  }

  return phases;
}

function extractMilestones(content: string): RoadmapMilestone[] {
  const milestones: RoadmapMilestone[] = [];
  const milestonePattern = /##\s*(.*v(\d+\.\d+)[^(\n]*)/gi;
  let mMatch: RegExpExecArray | null;

  while ((mMatch = milestonePattern.exec(content)) !== null) {
    milestones.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
    });
  }

  return milestones;
}

// ─── parseRoadmap ─────────────────────────────────────────────────────────────

/**
 * Parse ROADMAP.md into structured data: phases and milestones.
 * Returns null if ROADMAP.md does not exist.
 */
export function parseRoadmap(cwd: string): ParsedRoadmap | null {
  const filePath = roadmapPath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const phases = extractPhases(content);
  const milestones = extractMilestones(content);

  return { phases, milestones };
}

// ─── getRoadmapPhase ─────────────────────────────────────────────────────────

/**
 * Extract a single phase section from ROADMAP.md.
 * Returns null if ROADMAP.md is missing or the phase is not found.
 */
export function getRoadmapPhase(cwd: string, phaseNum: string | number): RoadmapPhase | null {
  const filePath = roadmapPath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const escapedPhase = escapeRegex(String(phaseNum));

  const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
  const headerMatch = content.match(phasePattern);

  if (!headerMatch) return null;

  const phaseName = headerMatch[1].trim();
  const headerIndex = headerMatch.index!;

  const restOfContent = content.slice(headerIndex);
  const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
  const sectionEnd = nextHeaderMatch
    ? headerIndex + nextHeaderMatch.index!
    : content.length;

  const section = content.slice(headerIndex, sectionEnd).trim();

  const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
  const goal = goalMatch ? goalMatch[1].trim() : null;

  const dependsMatch = section.match(/\*\*Depends on:\*\*\s*([^\n]+)/i);
  const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

  const success_criteria = extractSuccessCriteria(section);

  return {
    phase_number: String(phaseNum),
    phase_name: phaseName,
    goal,
    depends_on,
    success_criteria,
    section,
  };
}

// ─── listRoadmapPhases ────────────────────────────────────────────────────────

/**
 * List all phases found in ROADMAP.md as { number, name } pairs.
 * Returns empty array if ROADMAP.md is missing or has no phases.
 */
export function listRoadmapPhases(cwd: string): Array<{ number: string; name: string }> {
  const filePath = roadmapPath(cwd);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const phases = extractPhases(content);

  return phases.map(p => ({ number: p.number, name: p.name }));
}

// ─── getRequirements ─────────────────────────────────────────────────────────

/**
 * Extract requirements from ROADMAP.md (## Requirements section)
 * or REQUIREMENTS.md if it exists. Returns an array of requirement strings.
 * Returns empty array if neither source is found.
 */
export function getRequirements(cwd: string): string[] {
  const planDir = path.join(cwd, '.planning');
  const requirementsFile = path.join(planDir, 'REQUIREMENTS.md');

  // Try REQUIREMENTS.md first
  if (fs.existsSync(requirementsFile)) {
    const content = fs.readFileSync(requirementsFile, 'utf-8');
    return parseRequirementsList(content);
  }

  // Fall back to Requirements section in ROADMAP.md
  const filePath = roadmapPath(cwd);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const reqSectionMatch = content.match(/##\s*Requirements\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!reqSectionMatch) return [];

  return parseRequirementsList(reqSectionMatch[1]);
}

function parseRequirementsList(text: string): string[] {
  const items = text.match(/^-\s+(.+)$/gm) || [];
  return items.map(item => item.replace(/^-\s+/, '').trim()).filter(Boolean);
}

// ─── analyzeRoadmap ───────────────────────────────────────────────────────────

/**
 * Summary analysis of ROADMAP.md: phase count, disk status, progress.
 * Returns null if ROADMAP.md is missing.
 */
export function analyzeRoadmap(cwd: string): RoadmapAnalysis | null {
  const filePath = roadmapPath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const phases = extractPhases(content);
  const milestones = extractMilestones(content);
  const phasesDirPath = phasesDir(cwd);

  // Augment phases with disk status
  const augmented = phases.map(p => {
    const normalized = normalizePhaseName(p.number);
    let diskStatus = 'no_directory';
    let planCount = 0;
    let summaryCount = 0;

    try {
      const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized));

      if (dirMatch) {
        const phaseFiles = fs.readdirSync(path.join(phasesDirPath, dirMatch));
        planCount = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
        summaryCount = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        const hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
        const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        if (summaryCount >= planCount && planCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (planCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch {
      // ignore — no phases dir
    }

    return {
      number: p.number,
      name: p.name,
      goal: p.goal,
      disk_status: diskStatus,
      plan_count: planCount,
      summary_count: summaryCount,
    };
  });

  const completedPhases = augmented.filter(p => p.disk_status === 'complete').length;
  const totalPlans = augmented.reduce((sum, p) => sum + p.plan_count, 0);
  const totalSummaries = augmented.reduce((sum, p) => sum + p.summary_count, 0);
  const progressPercent =
    totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;

  const currentPhase =
    augmented.find(p => p.disk_status === 'planned' || p.disk_status === 'partial') ?? null;
  const nextPhase =
    augmented.find(
      p =>
        p.disk_status === 'empty' ||
        p.disk_status === 'no_directory' ||
        p.disk_status === 'discussed' ||
        p.disk_status === 'researched',
    ) ?? null;

  return {
    phase_count: phases.length,
    completed_phases: completedPhases,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    progress_percent: progressPercent,
    phases: augmented,
    milestones,
    current_phase: currentPhase ? currentPhase.number : null,
    next_phase: nextPhase ? nextPhase.number : null,
  };
}
