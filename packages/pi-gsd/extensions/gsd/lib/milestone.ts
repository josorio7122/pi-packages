/**
 * milestone.ts — Milestone archive/complete/list operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { milestonesDir, phasesDir, roadmapPath, statePath } from './paths.js';
import { extractFrontmatter } from './frontmatter.js';
import { patchState } from './state.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequirementsResult {
  updated: boolean;
  reason?: string;
  ids?: string[];
  marked_complete: string[];
  not_found: string[];
  total: number;
}

export interface MilestoneCompleteResult {
  version: string;
  name: string;
  date: string;
  phases: number;
  plans: number;
  tasks: number;
  accomplishments: string[];
  archived: {
    roadmap: boolean;
    requirements: boolean;
    audit: boolean;
    phases: boolean;
  };
  milestones_updated: boolean;
  state_updated: boolean;
}

// ─── markRequirementsComplete ─────────────────────────────────────────────────

/**
 * Mark requirement IDs as complete in REQUIREMENTS.md.
 */
export function markRequirementsComplete(
  cwd: string,
  reqIds: string[],
): RequirementsResult {
  if (!reqIds || reqIds.length === 0) {
    throw new Error('requirement IDs required');
  }

  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) {
    return {
      updated: false,
      reason: 'REQUIREMENTS.md not found',
      ids: reqIds,
      marked_complete: [],
      not_found: reqIds,
      total: reqIds.length,
    };
  }

  let reqContent = fs.readFileSync(reqPath, 'utf-8');
  const updated: string[] = [];
  const notFound: string[] = [];

  for (const reqId of reqIds) {
    let found = false;

    // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi');
    if (checkboxPattern.test(reqContent)) {
      reqContent = reqContent.replace(
        new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi'),
        '$1x$2',
      );
      found = true;
    }

    // Update traceability table
    const tablePattern = new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi');
    if (tablePattern.test(reqContent)) {
      reqContent = reqContent.replace(
        new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
        '$1 Complete $2',
      );
      found = true;
    }

    if (found) {
      updated.push(reqId);
    } else {
      notFound.push(reqId);
    }
  }

  if (updated.length > 0) {
    fs.writeFileSync(reqPath, reqContent, 'utf-8');
  }

  return {
    updated: updated.length > 0,
    marked_complete: updated,
    not_found: notFound,
    total: reqIds.length,
  };
}

// ─── completeMilestone ────────────────────────────────────────────────────────

/**
 * Archive the current milestone: save ROADMAP, REQUIREMENTS, update STATE and MILESTONES.md.
 */
export function completeMilestone(
  cwd: string,
  version: string,
  options: { name?: string; archivePhases?: boolean } = {},
): MilestoneCompleteResult {
  if (!version) throw new Error('version required for milestone complete');

  const roadmap = roadmapPath(cwd);
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const stateFile = statePath(cwd);
  const milestonesPath = path.join(cwd, '.planning', 'MILESTONES.md');
  const archiveDir = milestonesDir(cwd);
  const phasesDirPath = phasesDir(cwd);
  const today = new Date().toISOString().split('T')[0];
  const milestoneName = options.name ?? version;

  fs.mkdirSync(archiveDir, { recursive: true });

  // Determine which phases belong to current milestone
  const milestonePhaseNums = new Set<string>();
  if (fs.existsSync(roadmap)) {
    try {
      const roadmapContent = fs.readFileSync(roadmap, 'utf-8');
      const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
      let phaseMatch: RegExpExecArray | null;
      while ((phaseMatch = phasePattern.exec(roadmapContent)) !== null) {
        milestonePhaseNums.add(phaseMatch[1]);
      }
    } catch {
      // ignore
    }
  }

  const normalizedPhaseNums = new Set(
    [...milestonePhaseNums].map(num => (num.replace(/^0+/, '') || '0').toLowerCase()),
  );

  function isDirInMilestone(dirName: string): boolean {
    if (normalizedPhaseNums.size === 0) return true;
    const m = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
    if (!m) return false;
    return normalizedPhaseNums.has(m[1].toLowerCase());
  }

  // Gather stats from phases
  let phaseCount = 0;
  let totalPlans = 0;
  let totalTasks = 0;
  const accomplishments: string[] = [];

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      if (!isDirInMilestone(dir)) continue;
      phaseCount++;
      const phaseFiles = fs.readdirSync(path.join(phasesDirPath, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      totalPlans += plans.length;

      for (const s of summaries) {
        try {
          const content = fs.readFileSync(path.join(phasesDirPath, dir, s), 'utf-8');
          const fm = extractFrontmatter(content);
          if (fm['one-liner']) accomplishments.push(String(fm['one-liner']));
          const taskMatches = content.match(/##\s*Task\s*\d+/gi) ?? [];
          totalTasks += taskMatches.length;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  // Archive ROADMAP.md
  if (fs.existsSync(roadmap)) {
    const roadmapContent = fs.readFileSync(roadmap, 'utf-8');
    fs.writeFileSync(path.join(archiveDir, `${version}-ROADMAP.md`), roadmapContent, 'utf-8');
  }

  // Archive REQUIREMENTS.md
  if (fs.existsSync(reqPath)) {
    const reqContent = fs.readFileSync(reqPath, 'utf-8');
    const archiveHeader = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    fs.writeFileSync(
      path.join(archiveDir, `${version}-REQUIREMENTS.md`),
      archiveHeader + reqContent,
      'utf-8',
    );
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, '.planning', `${version}-MILESTONE-AUDIT.md`);
  if (fs.existsSync(auditFile)) {
    fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
  }

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map(a => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing = fs.readFileSync(milestonesPath, 'utf-8');
    const headerMatch = existing.match(/^(#{1,3}\s+[^\n]*\n\n?)/);
    if (headerMatch) {
      const header = headerMatch[1];
      const rest = existing.slice(header.length);
      fs.writeFileSync(milestonesPath, header + milestoneEntry + rest, 'utf-8');
    } else {
      fs.writeFileSync(milestonesPath, milestoneEntry + existing, 'utf-8');
    }
  } else {
    fs.writeFileSync(milestonesPath, `# Milestones\n\n${milestoneEntry}`, 'utf-8');
  }

  // Update STATE.md
  const stateUpdated = fs.existsSync(stateFile);
  if (stateUpdated) {
    patchState(cwd, {
      status: `${version} milestone complete`,
      last_activity: today,
    });
  }

  // Archive phase directories if requested
  let phasesArchived = false;
  if (options.archivePhases) {
    try {
      const phaseArchiveDir = path.join(archiveDir, `${version}-phases`);
      fs.mkdirSync(phaseArchiveDir, { recursive: true });

      const phaseEntries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      const phaseDirNames = phaseEntries.filter(e => e.isDirectory()).map(e => e.name);
      let archivedCount = 0;
      for (const dir of phaseDirNames) {
        if (!isDirInMilestone(dir)) continue;
        fs.renameSync(path.join(phasesDirPath, dir), path.join(phaseArchiveDir, dir));
        archivedCount++;
      }
      phasesArchived = archivedCount > 0;
    } catch {
      // ignore
    }
  }

  return {
    version,
    name: milestoneName,
    date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
    archived: {
      roadmap: fs.existsSync(path.join(archiveDir, `${version}-ROADMAP.md`)),
      requirements: fs.existsSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`)),
      audit: fs.existsSync(path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)),
      phases: phasesArchived,
    },
    milestones_updated: true,
    state_updated: stateUpdated,
  };
}

// ─── listMilestones ───────────────────────────────────────────────────────────

/**
 * List all archived milestone versions (extracted from *-ROADMAP.md files).
 */
export function listMilestones(cwd: string): string[] {
  const archiveDir = milestonesDir(cwd);
  if (!fs.existsSync(archiveDir)) return [];

  try {
    const files = fs.readdirSync(archiveDir);
    const versions = files
      .filter(f => f.endsWith('-ROADMAP.md'))
      .map(f => f.replace('-ROADMAP.md', ''));
    return versions.sort();
  } catch {
    return [];
  }
}
