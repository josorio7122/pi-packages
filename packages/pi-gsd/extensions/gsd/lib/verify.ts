/**
 * verify.ts — Health checks and validation for .planning/ structure
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { normalizePhaseName, findPhase, getMilestoneInfo } from './paths.js';
import { extractFrontmatter, parseMustHavesBlock } from './frontmatter.js';
import { writeState, loadState } from './state.js';
import { DEFAULT_CONFIG } from './config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifySummaryResult {
  passed: boolean;
  checks: {
    summary_exists: boolean;
    files_created: { checked: number; found: number; missing: string[] };
    commits_exist: boolean;
    self_check: 'passed' | 'failed' | 'not_found';
  };
  errors: string[];
}

export interface VerifyPlanStructureResult {
  valid?: boolean;
  error?: string;
  errors: string[];
  warnings: string[];
  task_count: number;
  tasks: Array<{
    name: string;
    hasFiles: boolean;
    hasAction: boolean;
    hasVerify: boolean;
    hasDone: boolean;
  }>;
  frontmatter_fields?: string[];
  path?: string;
}

export interface VerifyPhaseCompletenessResult {
  complete?: boolean;
  phase?: string;
  plan_count?: number;
  summary_count?: number;
  incomplete_plans: string[];
  orphan_summaries: string[];
  errors: string[];
  warnings: string[];
  error?: string;
}

export interface VerifyReferencesResult {
  valid?: boolean;
  found: number;
  missing: string[];
  total?: number;
  error?: string;
}

export interface VerifyCommitsResult {
  all_valid: boolean;
  valid: string[];
  invalid: string[];
  total: number;
}

export interface HealthIssue {
  code: string;
  message: string;
  fix: string;
  repairable: boolean;
}

export interface RepairAction {
  action: string;
  success: boolean;
  path?: string;
  error?: string;
}

export interface ValidateHealthResult {
  status: 'healthy' | 'degraded' | 'broken';
  errors: HealthIssue[];
  warnings: HealthIssue[];
  info: HealthIssue[];
  repairable_count: number;
  repairs_performed?: RepairAction[];
}

export interface ValidateConsistencyResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  warning_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function execGit(cwd: string, args: string[]): { exitCode: number; stdout: string } {
  try {
    const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
    return {
      exitCode: result.status ?? 1,
      stdout: (result.stdout ?? '').trim(),
    };
  } catch {
    return { exitCode: 1, stdout: '' };
  }
}

// ─── verifySummary ────────────────────────────────────────────────────────────

/**
 * Verify a SUMMARY.md file: check existence, spot-check file refs, commits, self-check section.
 */
export function verifySummary(
  cwd: string,
  summaryPath: string,
  checkFileCount = 2,
): VerifySummaryResult {
  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    return {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        self_check: 'not_found',
      },
      errors: ['SUMMARY.md not found'],
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const errors: string[] = [];

  // Spot-check files mentioned in summary
  const mentionedFiles = new Set<string>();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck = Array.from(mentionedFiles).slice(0, checkFileCount);
  const missing: string[] = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check commits
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes = content.match(commitHashPattern) ?? [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      const result = execGit(cwd, ['cat-file', '-t', hash]);
      if (result.exitCode === 0 && result.stdout === 'commit') {
        commitsExist = true;
        break;
      }
    }
  }

  // Self-check section
  let selfCheck: 'passed' | 'failed' | 'not_found' = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (!commitsExist && hashes.length > 0) errors.push('Referenced commit hashes not found in git history');
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  const passed = missing.length === 0 && selfCheck !== 'failed';

  return {
    passed,
    checks: {
      summary_exists: true,
      files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
      commits_exist: commitsExist,
      self_check: selfCheck,
    },
    errors,
  };
}

// ─── verifyPlanStructure ─────────────────────────────────────────────────────

/**
 * Validate a plan file's frontmatter and task structure.
 */
export function verifyPlanStructure(cwd: string, filePath: string): VerifyPlanStructureResult {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) {
    return { error: 'File not found', path: filePath, errors: [], warnings: [], task_count: 0, tasks: [] };
  }

  const fm = extractFrontmatter(content);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required frontmatter
  const required = ['phase', 'plan', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'];
  for (const field of required) {
    if (fm[field] === undefined) errors.push(`Missing required frontmatter field: ${field}`);
  }

  // Parse task elements
  const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
  const tasks: VerifyPlanStructureResult['tasks'] = [];
  let taskMatch: RegExpExecArray | null;

  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskContent = taskMatch[1];
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasFiles = /<files>/.test(taskContent);
    const hasAction = /<action>/.test(taskContent);
    const hasVerify = /<verify>/.test(taskContent);
    const hasDone = /<done>/.test(taskContent);

    if (!nameMatch) errors.push('Task missing <name> element');
    if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
    if (!hasVerify) warnings.push(`Task '${taskName}' missing <verify>`);
    if (!hasDone) warnings.push(`Task '${taskName}' missing <done>`);
    if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);

    tasks.push({ name: taskName, hasFiles, hasAction, hasVerify, hasDone });
  }

  if (tasks.length === 0) warnings.push('No <task> elements found');

  // Wave/depends_on consistency
  if (fm.wave && parseInt(String(fm.wave)) > 1) {
    const dependsOn = fm.depends_on;
    if (!dependsOn || (Array.isArray(dependsOn) && dependsOn.length === 0)) {
      warnings.push('Wave > 1 but depends_on is empty');
    }
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
  if (hasCheckpoints && fm.autonomous !== 'false' && fm.autonomous !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    task_count: tasks.length,
    tasks,
    frontmatter_fields: Object.keys(fm),
  };
}

// ─── verifyPhaseCompleteness ─────────────────────────────────────────────────

/**
 * Check that all plans in a phase have corresponding summaries.
 */
export function verifyPhaseCompleteness(cwd: string, phase: string): VerifyPhaseCompletenessResult {
  const phaseInfo = findPhase(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    return {
      error: 'Phase not found',
      incomplete_plans: [],
      orphan_summaries: [],
      errors: [],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const phaseDir = path.join(cwd, phaseInfo.directory);

  let files: string[];
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    return {
      error: 'Cannot read phase directory',
      incomplete_plans: [],
      orphan_summaries: [],
      errors: [],
      warnings: [],
    };
  }

  const plans = files.filter(f => f.match(/-PLAN\.md$/i));
  const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i));

  const planIds = new Set(plans.map(p => p.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set(summaries.map(s => s.replace(/-SUMMARY\.md$/i, '')));

  const incompletePlans = [...planIds].filter(id => !summaryIds.has(id));
  if (incompletePlans.length > 0) {
    errors.push(`Plans without summaries: ${incompletePlans.join(', ')}`);
  }

  const orphanSummaries = [...summaryIds].filter(id => !planIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  return {
    complete: errors.length === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    summary_count: summaries.length,
    incomplete_plans: incompletePlans,
    orphan_summaries: orphanSummaries,
    errors,
    warnings,
  };
}

// ─── verifyReferences ────────────────────────────────────────────────────────

/**
 * Find @-references and backtick file paths in a file and check if they exist.
 */
export function verifyReferences(cwd: string, filePath: string): VerifyReferencesResult {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) {
    return { error: 'File not found', found: 0, missing: [] };
  }

  const found: string[] = [];
  const missing: string[] = [];

  // Find @-references
  const atRefs = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) ?? [];
  for (const ref of atRefs) {
    const cleanRef = ref.slice(1);
    const resolved = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME ?? '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths
  const backtickRefs = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) ?? [];
  for (const ref of backtickRefs) {
    const cleanRef = ref.slice(1, -1);
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue;
    const resolved = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  return {
    valid: missing.length === 0,
    found: found.length,
    missing,
    total: found.length + missing.length,
  };
}

// ─── verifyCommits ────────────────────────────────────────────────────────────

/**
 * Verify that commit hashes exist in the git history.
 */
export function verifyCommits(cwd: string, hashes: string[]): VerifyCommitsResult {
  if (!hashes || hashes.length === 0) throw new Error('At least one commit hash required');

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const hash of hashes) {
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  return { all_valid: invalid.length === 0, valid, invalid, total: hashes.length };
}

// ─── validateConsistency ─────────────────────────────────────────────────────

/**
 * Check consistency between ROADMAP.md and on-disk phases.
 */
export function validateConsistency(cwd: string): ValidateConsistencyResult {
  const roadmap = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDirPath = path.join(cwd, '.planning', 'phases');
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(roadmap)) {
    errors.push('ROADMAP.md not found');
    return { passed: false, errors, warnings, warning_count: warnings.length };
  }

  const roadmapContent = fs.readFileSync(roadmap, 'utf-8');

  // Extract phases from ROADMAP
  const roadmapPhases = new Set<string>();
  const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(roadmapContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  const diskPhases = new Set<string>();
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const dm = e.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
        if (dm) diskPhases.add(dm[1]);
      }
    }
  } catch {
    // ignore
  }

  // Phases in ROADMAP but not on disk
  for (const p of roadmapPhases) {
    const padded = String(parseInt(p, 10)).padStart(2, '0');
    if (!diskPhases.has(p) && !diskPhases.has(padded) && !diskPhases.has(normalizePhaseName(p))) {
      warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Phases on disk but not in ROADMAP
  for (const p of diskPhases) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
      warnings.push(`Phase ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Sequential phase number check
  const integerPhases = [...diskPhases]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      warnings.push(`Gap in phase numbering: ${integerPhases[i - 1]} → ${integerPhases[i]}`);
    }
  }

  // Plan numbering within phases
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDirPath, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md')).sort();
      const planNums = plans
        .map(p => { const pm = p.match(/-(\d{2})-PLAN\.md$/); return pm ? parseInt(pm[1], 10) : null; })
        .filter((n): n is number => n !== null);

      for (let i = 1; i < planNums.length; i++) {
        if (planNums[i] !== planNums[i - 1] + 1) {
          warnings.push(`Gap in plan numbering in ${dir}: plan ${planNums[i - 1]} → ${planNums[i]}`);
        }
      }

      // Summaries without matching plans
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md'));
      const planIds = new Set(plans.map(p => p.replace('-PLAN.md', '')));
      const summaryIds = new Set(summaries.map(s => s.replace('-SUMMARY.md', '')));
      for (const sid of summaryIds) {
        if (!planIds.has(sid)) {
          warnings.push(`Summary ${sid}-SUMMARY.md in ${dir} has no matching PLAN.md`);
        }
      }

      // Check wave frontmatter
      for (const plan of plans) {
        const content = fs.readFileSync(path.join(phasesDirPath, dir, plan), 'utf-8');
        const fm = extractFrontmatter(content);
        if (!fm.wave) {
          warnings.push(`${dir}/${plan}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {
    // ignore
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    warning_count: warnings.length,
  };
}

// ─── validateHealth ───────────────────────────────────────────────────────────

/**
 * Comprehensive health check of .planning/ directory. Optionally repairs issues.
 */
export function validateHealth(
  cwd: string,
  options: { repair?: boolean } = {},
): ValidateHealthResult {
  const planningDir = path.join(cwd, '.planning');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  const stateFile = path.join(planningDir, 'STATE.md');
  const configFile = path.join(planningDir, 'config.json');
  const phasesDirPath = path.join(planningDir, 'phases');

  const errors: HealthIssue[] = [];
  const warnings: HealthIssue[] = [];
  const info: HealthIssue[] = [];
  const repairs: string[] = [];

  function addIssue(
    severity: 'error' | 'warning' | 'info',
    code: string,
    message: string,
    fix: string,
    repairable = false,
  ): void {
    const issue: HealthIssue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  }

  // Check 1: .planning/ exists
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', '.planning/ directory not found', 'Run /gsd:new-project to initialize');
    return { status: 'broken', errors, warnings, info, repairable_count: 0 };
  }

  // Check 2: PROJECT.md exists and has required sections
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /gsd:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // Check 3: ROADMAP.md exists
  if (!fs.existsSync(roadmapFile)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /gsd:new-milestone to create roadmap');
  }

  // Check 4: STATE.md exists
  if (!fs.existsSync(stateFile)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /gsd:health --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(stateFile, 'utf-8');
    const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)*)/g)].map(m => m[1]);
    const diskPhases = new Set<string>();
    try {
      const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const m = e.name.match(/^(\d+(?:\.\d+)*)/);
          if (m) diskPhases.add(m[1]);
        }
      }
    } catch {
      // ignore
    }
    for (const ref of phaseRefs) {
      const normalizedRef = String(parseInt(ref, 10)).padStart(2, '0');
      if (!diskPhases.has(ref) && !diskPhases.has(normalizedRef) && !diskPhases.has(String(parseInt(ref, 10)))) {
        if (diskPhases.size > 0) {
          addIssue('warning', 'W002',
            `STATE.md references phase ${ref}, but only phases ${[...diskPhases].sort().join(', ')} exist`,
            'Run /gsd:health --repair to regenerate STATE.md', true);
          if (!repairs.includes('regenerateState')) repairs.push('regenerateState');
        }
      }
    }
  }

  // Check 5: config.json valid
  if (!fs.existsSync(configFile)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /gsd:health --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const rawConfig = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(rawConfig) as Record<string, unknown>;
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (parsed.model_profile && !validProfiles.includes(String(parsed.model_profile))) {
        addIssue('warning', 'W004',
          `config.json: invalid model_profile "${parsed.model_profile}"`,
          `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005',
        `config.json: JSON parse error - ${(err as Error).message}`,
        'Run /gsd:health --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // Check 6: Phase directory naming (NN-name format)
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)*-[\w-]+$/)) {
        addIssue('warning', 'W005',
          `Phase directory "${e.name}" doesn't follow NN-name format`,
          'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch {
    // ignore
  }

  // Check 7: Orphaned plans
  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const phaseFiles = fs.readdirSync(path.join(phasesDirPath, e.name));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

      for (const plan of plans) {
        const planBase = plan.replace('-PLAN.md', '').replace('PLAN.md', '');
        if (!summaryBases.has(planBase)) {
          addIssue('info', 'I001', `${e.name}/${plan} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch {
    // ignore
  }

  // Check 8: Consistency with ROADMAP
  if (fs.existsSync(roadmapFile)) {
    const roadmapContent = fs.readFileSync(roadmapFile, 'utf-8');
    const roadmapPhases = new Set<string>();
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let phm: RegExpExecArray | null;
    while ((phm = phasePattern.exec(roadmapContent)) !== null) {
      roadmapPhases.add(phm[1]);
    }

    const diskPhases = new Set<string>();
    try {
      const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
          if (dm) diskPhases.add(dm[1]);
        }
      }
    } catch {
      // ignore
    }

    for (const p of roadmapPhases) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskPhases.has(p) && !diskPhases.has(padded)) {
        addIssue('warning', 'W006', `Phase ${p} in ROADMAP.md but no directory on disk`,
          'Create phase directory or remove from roadmap');
      }
    }

    for (const p of diskPhases) {
      const unpadded = String(parseInt(p, 10));
      if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
        addIssue('warning', 'W007', `Phase ${p} exists on disk but not in ROADMAP.md`,
          'Add to roadmap or remove directory');
      }
    }
  }

  // Perform repairs
  const repairActions: RepairAction[] = [];
  if (options.repair && repairs.length > 0) {
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            fs.writeFileSync(configFile, JSON.stringify({ ...DEFAULT_CONFIG }, null, 2), 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            if (fs.existsSync(stateFile)) {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const backupPath = `${stateFile}.bak-${timestamp}`;
              fs.copyFileSync(stateFile, backupPath);
              repairActions.push({ action: 'backupState', success: true, path: backupPath });
            }
            const milestone = getMilestoneInfo(cwd);
            const stateBody = [
              '# Session State',
              '',
              '## Project Reference',
              '',
              'See: .planning/PROJECT.md',
              '',
              '## Position',
              '',
              `**Milestone:** ${milestone.version} ${milestone.name}`,
              '**Current phase:** (determining...)',
              '**Status:** Resuming',
              '',
              '## Session Log',
              '',
              `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /gsd:health --repair`,
              '',
            ].join('\n');
            const existingState = loadState(cwd);
            writeState(cwd, existingState?.frontmatter ?? {}, stateBody);
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: (err as Error).message });
      }
    }
  }

  // Determine status
  let status: ValidateHealthResult['status'];
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount =
    errors.filter(e => e.repairable).length + warnings.filter(w => w.repairable).length;

  return {
    status,
    errors,
    warnings,
    info,
    repairable_count: repairableCount,
    ...(repairActions.length > 0 ? { repairs_performed: repairActions } : {}),
  };
}
