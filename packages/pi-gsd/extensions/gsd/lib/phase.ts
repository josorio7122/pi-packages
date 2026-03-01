/**
 * phase.ts — Phase file operations, decimal calculation, wave grouping
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  normalizePhaseName,
  comparePhaseNum,
  generateSlug,
  toPosixPath,
  phasesDir,
  roadmapPath as getRoadmapPath,
  statePath as getStatePath,
  findPhase,
} from './paths.js';
import { extractFrontmatter } from './frontmatter.js';
import { patchState } from './state.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseListResult {
  directories?: string[];
  files?: string[];
  count: number;
  phase_dir?: string | null;
  error?: string;
}

export interface PhaseFindResult {
  found: boolean;
  directory: string;
  phase_number: string;
  phase_name: string | null;
  plans: string[];
  summaries: string[];
}

export interface DecimalResult {
  found: boolean;
  base_phase: string;
  next: string;
  existing: string[];
}

export interface PhaseAddResult {
  phase_number: number;
  padded: string;
  name: string;
  slug: string | null;
  directory: string;
}

export interface PhaseInsertResult {
  phase_number: string;
  after_phase: string;
  name: string;
  slug: string | null;
  directory: string;
}

export interface PhaseRemoveResult {
  removed: string;
  directory_deleted: string | null;
  renamed_directories: Array<{ from: string; to: string }>;
  renamed_files: Array<{ from: string; to: string }>;
  roadmap_updated: boolean;
  state_updated: boolean;
}

export interface PlanEntry {
  id: string;
  wave: number;
  autonomous: boolean;
  objective: string | null;
  files_modified: string[];
  task_count: number;
  has_summary: boolean;
}

export interface PlanIndexResult {
  phase: string;
  plans: PlanEntry[];
  waves: Record<string, string[]>;
  incomplete: string[];
  has_checkpoints: boolean;
  error?: string;
}

export interface WaveGroup {
  wave: number;
  plans: string[];
}

export interface PhaseCompleteResult {
  completed_phase: string;
  phase_name: string | null;
  plans_executed: string;
  next_phase: string | null;
  next_phase_name: string | null;
  is_last_phase: boolean;
  date: string;
  roadmap_updated: boolean;
  state_updated: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractObjective(content: string): string | null {
  const m = content.match(/<objective>\s*\n?\s*(.+)/);
  return m ? m[1].trim() : null;
}

// ─── listPhases ───────────────────────────────────────────────────────────────

/**
 * List all phase directories with optional filtering by phase number or type.
 */
export function listPhases(
  cwd: string,
  options: { type?: 'plans' | 'summaries'; phase?: string } = {},
): PhaseListResult {
  const phasesDirPath = phasesDir(cwd);
  const { type, phase } = options;

  if (!fs.existsSync(phasesDirPath)) {
    return type ? { files: [], count: 0 } : { directories: [], count: 0 };
  }

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    let dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    dirs.sort(comparePhaseNum);

    if (phase) {
      const normalized = normalizePhaseName(phase);
      const match = dirs.find(d => d.startsWith(normalized));
      if (!match) {
        return { files: [], count: 0, phase_dir: null, error: 'Phase not found' };
      }
      dirs = [match];
    }

    if (type) {
      const files: string[] = [];
      for (const dir of dirs) {
        const dirPath = path.join(phasesDirPath, dir);
        const dirFiles = fs.readdirSync(dirPath);
        let filtered: string[];
        if (type === 'plans') {
          filtered = dirFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
        } else {
          filtered = dirFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        }
        files.push(...filtered.sort());
      }
      return {
        files,
        count: files.length,
        phase_dir: phase ? dirs[0]?.replace(/^\d+(?:\.\d+)*-?/, '') ?? null : null,
      };
    }

    return { directories: dirs, count: dirs.length };
  } catch (e) {
    throw new Error('Failed to list phases: ' + (e as Error).message);
  }
}

// ─── findPhaseDir ─────────────────────────────────────────────────────────────

/**
 * Find a phase directory by phase number.
 * Returns structured info or null if not found.
 */
export function findPhaseDir(cwd: string, phase: string | number): PhaseFindResult | null {
  const phasesDirPath = phasesDir(cwd);
  const normalized = normalizePhaseName(phase);

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(comparePhaseNum);

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const phaseDir = path.join(phasesDirPath, match);
    const phaseFiles = fs.readdirSync(phaseDir);
    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    return {
      found: true,
      directory: toPosixPath(path.join('.planning', 'phases', match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      plans,
      summaries,
    };
  } catch {
    return null;
  }
}

// ─── nextDecimalPhase ─────────────────────────────────────────────────────────

/**
 * Calculate the next available decimal phase number for a given base phase.
 * E.g. if '02.1' exists, returns '02.2'.
 */
export function nextDecimalPhase(cwd: string, basePhase: string): DecimalResult {
  const phasesDirPath = phasesDir(cwd);
  const normalized = normalizePhaseName(basePhase);

  if (!fs.existsSync(phasesDirPath)) {
    return { found: false, base_phase: normalized, next: `${normalized}.1`, existing: [] };
  }

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    const baseExists = dirs.some(d => d.startsWith(normalized + '-') || d === normalized);

    const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
    const existingDecimals: string[] = [];
    for (const dir of dirs) {
      const m = dir.match(decimalPattern);
      if (m) existingDecimals.push(`${normalized}.${m[1]}`);
    }
    existingDecimals.sort(comparePhaseNum);

    let nextDecimal: string;
    if (existingDecimals.length === 0) {
      nextDecimal = `${normalized}.1`;
    } else {
      const lastDecimal = existingDecimals[existingDecimals.length - 1];
      const lastNum = parseInt(lastDecimal.split('.').pop()!, 10);
      nextDecimal = `${normalized}.${lastNum + 1}`;
    }

    return { found: baseExists, base_phase: normalized, next: nextDecimal, existing: existingDecimals };
  } catch (e) {
    throw new Error('Failed to calculate next decimal phase: ' + (e as Error).message);
  }
}

// ─── addPhase ─────────────────────────────────────────────────────────────────

/**
 * Add a new phase to .planning/phases/ and append an entry to ROADMAP.md.
 */
export function addPhase(cwd: string, description: string): PhaseAddResult {
  if (!description) throw new Error('description required for phase add');

  const roadmap = getRoadmapPath(cwd);
  if (!fs.existsSync(roadmap)) throw new Error('ROADMAP.md not found');

  const content = fs.readFileSync(roadmap, 'utf-8');
  const slug = generateSlug(description);

  const phasePattern = /#{2,4}\s*Phase\s+(\d+)[A-Z]?(?:\.\d+)*:/gi;
  let maxPhase = 0;
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    if (num > maxPhase) maxPhase = num;
  }

  const newPhaseNum = maxPhase + 1;
  const paddedNum = String(newPhaseNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  const dirPath = path.join(phasesDir(cwd), dirName);

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  const phaseEntry = `\n### Phase ${newPhaseNum}: ${description}\n\n**Goal:** [To be planned]\n**Requirements**: TBD\n**Depends on:** Phase ${maxPhase}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /gsd:plan-phase ${newPhaseNum} to break down)\n`;

  let updatedContent: string;
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = content.slice(0, lastSeparator) + phaseEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + phaseEntry;
  }

  fs.writeFileSync(roadmap, updatedContent, 'utf-8');

  return {
    phase_number: newPhaseNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: toPosixPath(path.join('.planning', 'phases', dirName)),
  };
}

// ─── insertPhase ─────────────────────────────────────────────────────────────

/**
 * Insert a new phase after an existing phase using decimal numbering.
 */
export function insertPhase(cwd: string, afterPhase: string, description: string): PhaseInsertResult {
  if (!afterPhase || !description) {
    throw new Error('after-phase and description required for phase insert');
  }

  const roadmap = getRoadmapPath(cwd);
  if (!fs.existsSync(roadmap)) throw new Error('ROADMAP.md not found');

  const content = fs.readFileSync(roadmap, 'utf-8');
  const slug = generateSlug(description);

  const normalizedAfter = normalizePhaseName(afterPhase);
  const unpadded = normalizedAfter.replace(/^0+/, '') || normalizedAfter;
  const afterPhaseEscaped = unpadded.replace(/\./g, '\\.');
  const targetPattern = new RegExp(`#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:`, 'i');
  if (!targetPattern.test(content)) {
    throw new Error(`Phase ${afterPhase} not found in ROADMAP.md`);
  }

  const phasesDirPath = phasesDir(cwd);
  const normalizedBase = normalizePhaseName(afterPhase);
  const existingDecimals: number[] = [];

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const decimalPattern = new RegExp(`^${normalizedBase}\\.(\\d+)`);
    for (const dir of dirs) {
      const dm = dir.match(decimalPattern);
      if (dm) existingDecimals.push(parseInt(dm[1], 10));
    }
  } catch {
    // phases dir might not exist yet
  }

  const nextDecimal = existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
  const decimalPhase = `${normalizedBase}.${nextDecimal}`;
  const dirName = `${decimalPhase}-${slug}`;
  const dirPath = path.join(phasesDirPath, dirName);

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  const phaseEntry = `\n### Phase ${decimalPhase}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Requirements**: TBD\n**Depends on:** Phase ${afterPhase}\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /gsd:plan-phase ${decimalPhase} to break down)\n`;

  const headerPattern = new RegExp(`(#{2,4}\\s*Phase\\s+0*${afterPhaseEscaped}:[^\\n]*\\n)`, 'i');
  const headerMatch = content.match(headerPattern);
  if (!headerMatch) throw new Error(`Could not find Phase ${afterPhase} header`);

  const headerIdx = content.indexOf(headerMatch[0]);
  const afterHeader = content.slice(headerIdx + headerMatch[0].length);
  const nextPhaseMatch = afterHeader.match(/\n#{2,4}\s+Phase\s+\d/i);

  let insertIdx: number;
  if (nextPhaseMatch) {
    insertIdx = headerIdx + headerMatch[0].length + nextPhaseMatch.index!;
  } else {
    insertIdx = content.length;
  }

  const updatedContent = content.slice(0, insertIdx) + phaseEntry + content.slice(insertIdx);
  fs.writeFileSync(roadmap, updatedContent, 'utf-8');

  return {
    phase_number: decimalPhase,
    after_phase: afterPhase,
    name: description,
    slug,
    directory: toPosixPath(path.join('.planning', 'phases', dirName)),
  };
}

// ─── removePhase ─────────────────────────────────────────────────────────────

/**
 * Remove a phase directory and update ROADMAP.md.
 */
export function removePhase(
  cwd: string,
  targetPhase: string,
  options: { force?: boolean } = {},
): PhaseRemoveResult {
  if (!targetPhase) throw new Error('phase number required for phase remove');

  const roadmap = getRoadmapPath(cwd);
  const phasesDirPath = phasesDir(cwd);
  const force = options.force ?? false;

  if (!fs.existsSync(roadmap)) throw new Error('ROADMAP.md not found');

  const normalized = normalizePhaseName(targetPhase);
  const isDecimal = targetPhase.includes('.');

  let targetDir: string | null = null;
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(comparePhaseNum);
    targetDir = dirs.find(d => d.startsWith(normalized + '-') || d === normalized) ?? null;
  } catch {
    // phases dir might not exist
  }

  // Check for executed work
  if (targetDir && !force) {
    const targetPath = path.join(phasesDirPath, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      throw new Error(
        `Phase ${targetPhase} has ${summaries.length} executed plan(s). Use force option to remove anyway.`,
      );
    }
  }

  if (targetDir) {
    fs.rmSync(path.join(phasesDirPath, targetDir), { recursive: true, force: true });
  }

  const renamedDirs: Array<{ from: string; to: string }> = [];
  const renamedFiles: Array<{ from: string; to: string }> = [];

  if (isDecimal) {
    const baseParts = normalized.split('.');
    const baseInt = baseParts[0];
    const removedDecimal = parseInt(baseParts[1], 10);

    try {
      const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort(comparePhaseNum);

      const decPattern = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
      const toRename: Array<{ dir: string; oldDecimal: number; slug: string }> = [];
      for (const dir of dirs) {
        const dm = dir.match(decPattern);
        if (dm && parseInt(dm[1], 10) > removedDecimal) {
          toRename.push({ dir, oldDecimal: parseInt(dm[1], 10), slug: dm[2] });
        }
      }
      toRename.sort((a, b) => b.oldDecimal - a.oldDecimal);

      for (const item of toRename) {
        const newDecimal = item.oldDecimal - 1;
        const oldPhaseId = `${baseInt}.${item.oldDecimal}`;
        const newPhaseId = `${baseInt}.${newDecimal}`;
        const newDirName = `${baseInt}.${newDecimal}-${item.slug}`;

        fs.renameSync(path.join(phasesDirPath, item.dir), path.join(phasesDirPath, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        const dirFiles = fs.readdirSync(path.join(phasesDirPath, newDirName));
        for (const f of dirFiles) {
          if (f.includes(oldPhaseId)) {
            const newFileName = f.replace(oldPhaseId, newPhaseId);
            fs.renameSync(
              path.join(phasesDirPath, newDirName, f),
              path.join(phasesDirPath, newDirName, newFileName),
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {
      // ignore
    }
  } else {
    const removedInt = parseInt(normalized, 10);

    try {
      const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort(comparePhaseNum);

      const toRename: Array<{
        dir: string;
        oldInt: number;
        letter: string;
        decimal: number | null;
        slug: string;
      }> = [];

      for (const dir of dirs) {
        const dm = dir.match(/^(\d+)([A-Z])?(?:\.(\d+))?-(.+)$/i);
        if (!dm) continue;
        const dirInt = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          toRename.push({
            dir,
            oldInt: dirInt,
            letter: dm[2] ? dm[2].toUpperCase() : '',
            decimal: dm[3] ? parseInt(dm[3], 10) : null,
            slug: dm[4],
          });
        }
      }

      toRename.sort((a, b) => {
        if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
        return (b.decimal ?? 0) - (a.decimal ?? 0);
      });

      for (const item of toRename) {
        const newInt = item.oldInt - 1;
        const newPadded = String(newInt).padStart(2, '0');
        const oldPadded = String(item.oldInt).padStart(2, '0');
        const letterSuffix = item.letter;
        const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
        const oldPrefix = `${oldPadded}${letterSuffix}${decimalSuffix}`;
        const newPrefix = `${newPadded}${letterSuffix}${decimalSuffix}`;
        const newDirName = `${newPrefix}-${item.slug}`;

        fs.renameSync(path.join(phasesDirPath, item.dir), path.join(phasesDirPath, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        const dirFiles = fs.readdirSync(path.join(phasesDirPath, newDirName));
        for (const f of dirFiles) {
          if (f.startsWith(oldPrefix)) {
            const newFileName = newPrefix + f.slice(oldPrefix.length);
            fs.renameSync(
              path.join(phasesDirPath, newDirName, f),
              path.join(phasesDirPath, newDirName, newFileName),
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Update ROADMAP.md — remove target phase section
  let roadmapContent = fs.readFileSync(roadmap, 'utf-8');
  const targetEscaped = escapeRegex(targetPhase);
  const sectionPattern = new RegExp(
    `\\n?#{2,4}\\s*Phase\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Phase\\s+\\d|$)`,
    'i',
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  const checkboxPattern = new RegExp(
    `\\n?-\\s*\\[[ x]\\]\\s*.*Phase\\s+${targetEscaped}[:\\s][^\\n]*`,
    'gi',
  );
  roadmapContent = roadmapContent.replace(checkboxPattern, '');
  fs.writeFileSync(roadmap, roadmapContent, 'utf-8');

  // Update STATE.md phase count if exists
  const stateFilePath = getStatePath(cwd);
  const stateUpdated = fs.existsSync(stateFilePath);
  if (stateUpdated) {
    const stateContent = fs.readFileSync(stateFilePath, 'utf-8');
    const totalPattern = /(\*\*Total Phases:\*\*\s*)(\d+)/;
    const totalMatch = stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[2], 10);
      patchState(cwd, { total_phases: oldTotal - 1 });
    }
  }

  return {
    removed: targetPhase,
    directory_deleted: targetDir,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: stateUpdated,
  };
}

// ─── getPlanIndex ─────────────────────────────────────────────────────────────

/**
 * List all plans in a phase with wave, autonomy, and completion status.
 */
export function getPlanIndex(cwd: string, phase: string): PlanIndexResult {
  if (!phase) throw new Error('phase required for getPlanIndex');

  const phasesDirPath = phasesDir(cwd);
  const normalized = normalizePhaseName(phase);

  let phaseDir: string | null = null;
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(comparePhaseNum);
    const match = dirs.find(d => d.startsWith(normalized));
    if (match) phaseDir = path.join(phasesDirPath, match);
  } catch {
    // phases dir doesn't exist
  }

  if (!phaseDir) {
    return { phase: normalized, error: 'Phase not found', plans: [], waves: {}, incomplete: [], has_checkpoints: false };
  }

  const phaseFiles = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

  const completedPlanIds = new Set(
    summaryFiles.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')),
  );

  const plans: PlanEntry[] = [];
  const waves: Record<string, string[]> = {};
  const incomplete: string[] = [];
  let hasCheckpoints = false;

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '').replace('PLAN.md', '');
    const planPath = path.join(phaseDir, planFile);
    const content = fs.readFileSync(planPath, 'utf-8');
    const fm = extractFrontmatter(content);

    const xmlTasks = content.match(/<task[\s>]/gi) ?? [];
    const mdTasks = content.match(/##\s*Task\s*\d+/gi) ?? [];
    const taskCount = xmlTasks.length || mdTasks.length;

    const wave = parseInt(String(fm.wave), 10) || 1;

    let autonomous = true;
    if (fm.autonomous !== undefined) {
      autonomous = fm.autonomous === 'true' || fm.autonomous === true;
    }
    if (!autonomous) hasCheckpoints = true;

    let filesModified: string[] = [];
    const fmFiles = fm['files_modified'] ?? fm['files-modified'];
    if (fmFiles) {
      filesModified = Array.isArray(fmFiles) ? (fmFiles as string[]) : [String(fmFiles)];
    }

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) incomplete.push(planId);

    const plan: PlanEntry = {
      id: planId,
      wave,
      autonomous,
      objective: extractObjective(content) ?? (fm.objective ? String(fm.objective) : null),
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    };

    plans.push(plan);

    const waveKey = String(wave);
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(planId);
  }

  return { phase: normalized, plans, waves, incomplete, has_checkpoints: hasCheckpoints };
}

// ─── getWaveGroups ────────────────────────────────────────────────────────────

/**
 * Group plans in a phase by wave number for parallel execution.
 * Returns sorted array of { wave, plans[] }.
 */
export function getWaveGroups(cwd: string, phase: string): WaveGroup[] {
  const index = getPlanIndex(cwd, phase);
  if (index.error || index.plans.length === 0) return [];

  const waveMap = new Map<number, string[]>();
  for (const plan of index.plans) {
    const existing = waveMap.get(plan.wave) ?? [];
    existing.push(plan.id);
    waveMap.set(plan.wave, existing);
  }

  const groups: WaveGroup[] = [];
  for (const [wave, plans] of waveMap) {
    groups.push({ wave, plans });
  }
  groups.sort((a, b) => a.wave - b.wave);

  return groups;
}

// ─── completePhase ────────────────────────────────────────────────────────────

/**
 * Mark a phase as complete in ROADMAP.md and STATE.md.
 */
export function completePhase(cwd: string, phaseNum: string): PhaseCompleteResult {
  if (!phaseNum) throw new Error('phase number required for completePhase');

  const roadmap = getRoadmapPath(cwd);
  const phasesDirPath = phasesDir(cwd);
  const normalized = normalizePhaseName(phaseNum);
  const today = new Date().toISOString().split('T')[0];

  const phaseInfo = findPhase(cwd, phaseNum);
  if (!phaseInfo) throw new Error(`Phase ${phaseNum} not found`);

  const planCount = phaseInfo.plans.length;
  const summaryCount = phaseInfo.summaries.length;

  // Update ROADMAP.md
  const roadmapExists = fs.existsSync(roadmap);
  if (roadmapExists) {
    let roadmapContent = fs.readFileSync(roadmap, 'utf-8');
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${escapeRegex(phaseNum)}[:\\s][^\\n]*)`,
      'i',
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);
    fs.writeFileSync(roadmap, roadmapContent, 'utf-8');
  }

  // Find next phase
  let nextPhaseNum: string | null = null;
  let nextPhaseName: string | null = null;
  let isLastPhase = true;

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(comparePhaseNum);

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
      if (dm && comparePhaseNum(dm[1], phaseNum) > 0) {
        nextPhaseNum = dm[1];
        nextPhaseName = dm[2] || null;
        isLastPhase = false;
        break;
      }
    }
  } catch {
    // ignore
  }

  // Update STATE.md if exists
  const stateFilePath = getStatePath(cwd);
  const stateUpdated = fs.existsSync(stateFilePath);
  if (stateUpdated) {
    patchState(cwd, {
      current_phase: nextPhaseNum ?? phaseNum,
      ...(nextPhaseName ? { current_phase_name: nextPhaseName.replace(/-/g, ' ') } : {}),
      status: isLastPhase ? 'Milestone complete' : 'Ready to plan',
      last_activity: today,
    });
  }

  return {
    completed_phase: phaseNum,
    phase_name: phaseInfo.phase_name,
    plans_executed: `${summaryCount}/${planCount}`,
    next_phase: nextPhaseNum,
    next_phase_name: nextPhaseName,
    is_last_phase: isLastPhase,
    date: today,
    roadmap_updated: roadmapExists,
    state_updated: stateUpdated,
  };
}
