/**
 * init.ts — Compound init commands for workflow bootstrapping
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  findPhase,
  getMilestoneInfo,
  generateSlug,
  toPosixPath,
  statePath,
  roadmapPath,
  phasesDir,
} from './paths.js';
import { loadConfig } from './config.js';
import { resolveModelForAgent } from './config.js';
import { getRoadmapPhase } from './roadmap.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pathExists(cwd: string, relPath: string): boolean {
  return fs.existsSync(path.join(cwd, relPath));
}

function resolveModel(cwd: string, agent: string): string {
  // Strip 'gsd-' prefix for lookup
  const agentKey = agent.replace(/^gsd-/, '');
  return resolveModelForAgent(cwd, agentKey);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewProjectInit {
  researcher_model: string;
  synthesizer_model: string;
  roadmapper_model: string;
  commit_docs: boolean;
  project_exists: boolean;
  has_codebase_map: boolean;
  planning_exists: boolean;
  has_existing_code: boolean;
  has_package_file: boolean;
  is_brownfield: boolean;
  needs_codebase_map: boolean;
  has_git: boolean;
  brave_search_available: boolean;
  project_path: string;
}

export interface NewMilestoneInit {
  researcher_model: string;
  synthesizer_model: string;
  roadmapper_model: string;
  commit_docs: boolean;
  research_enabled: boolean;
  current_milestone: string;
  current_milestone_name: string;
  project_exists: boolean;
  roadmap_exists: boolean;
  state_exists: boolean;
  project_path: string;
  roadmap_path: string;
  state_path: string;
}

export interface PhaseOpInit {
  commit_docs: boolean;
  brave_search: boolean;
  phase_found: boolean;
  phase_dir: string | null;
  phase_number: string | null;
  phase_name: string | null;
  phase_slug: string | null;
  padded_phase: string | null;
  has_research: boolean;
  has_context: boolean;
  has_plans: boolean;
  has_verification: boolean;
  plan_count: number;
  roadmap_exists: boolean;
  planning_exists: boolean;
  state_path: string;
  roadmap_path: string;
  requirements_path: string;
  context_path?: string;
  research_path?: string;
  verification_path?: string;
  uat_path?: string;
}

export interface ExecutePhaseInit {
  executor_model: string;
  verifier_model: string;
  commit_docs: boolean;
  parallelization: boolean;
  branching_strategy: string;
  phase_branch_template: string;
  milestone_branch_template: string;
  verifier_enabled: boolean;
  phase_found: boolean;
  phase_dir: string | null;
  phase_number: string | null;
  phase_name: string | null;
  phase_slug: string | null;
  phase_req_ids: string | null;
  plans: string[];
  summaries: string[];
  incomplete_plans: string[];
  plan_count: number;
  incomplete_count: number;
  branch_name: string | null;
  milestone_version: string;
  milestone_name: string;
  milestone_slug: string | null;
  state_exists: boolean;
  roadmap_exists: boolean;
  config_exists: boolean;
  state_path: string;
  roadmap_path: string;
  config_path: string;
}

export interface PlanPhaseInit {
  researcher_model: string;
  planner_model: string;
  checker_model: string;
  research_enabled: boolean;
  plan_checker_enabled: boolean;
  nyquist_validation_enabled: boolean;
  commit_docs: boolean;
  phase_found: boolean;
  phase_dir: string | null;
  phase_number: string | null;
  phase_name: string | null;
  phase_slug: string | null;
  padded_phase: string | null;
  phase_req_ids: string | null;
  has_research: boolean;
  has_context: boolean;
  has_plans: boolean;
  plan_count: number;
  planning_exists: boolean;
  roadmap_exists: boolean;
  state_path: string;
  roadmap_path: string;
  requirements_path: string;
  context_path?: string;
  research_path?: string;
  verification_path?: string;
  uat_path?: string;
}

export interface QuickInit {
  planner_model: string;
  executor_model: string;
  checker_model: string;
  verifier_model: string;
  commit_docs: boolean;
  next_num: number;
  slug: string | null;
  description: string | null;
  date: string;
  timestamp: string;
  quick_dir: string;
  task_dir: string | null;
  roadmap_exists: boolean;
  planning_exists: boolean;
}

export interface ResumeInit {
  state_exists: boolean;
  roadmap_exists: boolean;
  project_exists: boolean;
  planning_exists: boolean;
  state_path: string;
  roadmap_path: string;
  project_path: string;
  has_interrupted_agent: boolean;
  interrupted_agent_id: string | null;
  commit_docs: boolean;
}

export interface ProgressPhaseInfo {
  number: string;
  name: string | null;
  directory: string;
  status: 'complete' | 'in_progress' | 'researched' | 'pending';
  plan_count: number;
  summary_count: number;
  has_research: boolean;
}

export interface ProgressInit {
  executor_model: string;
  planner_model: string;
  commit_docs: boolean;
  milestone_version: string;
  milestone_name: string;
  phases: ProgressPhaseInfo[];
  phase_count: number;
  completed_count: number;
  in_progress_count: number;
  current_phase: ProgressPhaseInfo | null;
  next_phase: ProgressPhaseInfo | null;
  paused_at: string | null;
  has_work_in_progress: boolean;
  project_exists: boolean;
  roadmap_exists: boolean;
  state_exists: boolean;
  state_path: string;
  roadmap_path: string;
  project_path: string;
  config_path: string;
}

export interface MilestoneOpInit {
  commit_docs: boolean;
  milestone_version: string;
  milestone_name: string;
  milestone_slug: string | null;
  phase_count: number;
  completed_phases: number;
  all_phases_complete: boolean;
  archived_milestones: string[];
  archive_count: number;
  project_exists: boolean;
  roadmap_exists: boolean;
  state_exists: boolean;
  archive_exists: boolean;
  phases_dir_exists: boolean;
}

export interface VerifyWorkInit {
  planner_model: string;
  checker_model: string;
  commit_docs: boolean;
  phase_found: boolean;
  phase_dir: string | null;
  phase_number: string | null;
  phase_name: string | null;
  has_verification: boolean;
}

// ─── initNewProject ───────────────────────────────────────────────────────────

/**
 * Load init context for new-project command.
 */
export function initNewProject(cwd: string): NewProjectInit {
  const config = loadConfig(cwd);

  // Detect Brave Search API key
  const braveKeyFile = path.join(os.homedir(), '.gsd', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Detect existing code
  let hasCode = false;
  try {
    const files = execSync(
      'find . -maxdepth 3 \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" \\) 2>/dev/null | grep -v node_modules | grep -v .git | head -5',
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    hasCode = files.trim().length > 0;
  } catch {
    // ignore
  }

  const hasPackageFile =
    pathExists(cwd, 'package.json') ||
    pathExists(cwd, 'requirements.txt') ||
    pathExists(cwd, 'Cargo.toml') ||
    pathExists(cwd, 'go.mod') ||
    pathExists(cwd, 'Package.swift');

  return {
    researcher_model: resolveModel(cwd, 'gsd-project-researcher'),
    synthesizer_model: resolveModel(cwd, 'gsd-research-synthesizer'),
    roadmapper_model: resolveModel(cwd, 'gsd-roadmapper'),
    commit_docs: config.commit_docs,
    project_exists: pathExists(cwd, '.planning/PROJECT.md'),
    has_codebase_map: pathExists(cwd, '.planning/codebase'),
    planning_exists: pathExists(cwd, '.planning'),
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: (hasCode || hasPackageFile) && !pathExists(cwd, '.planning/codebase'),
    has_git: pathExists(cwd, '.git'),
    brave_search_available: hasBraveSearch,
    project_path: '.planning/PROJECT.md',
  };
}

// ─── initNewMilestone ─────────────────────────────────────────────────────────

/**
 * Load init context for new-milestone command.
 */
export function initNewMilestone(cwd: string): NewMilestoneInit {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  return {
    researcher_model: resolveModel(cwd, 'gsd-project-researcher'),
    synthesizer_model: resolveModel(cwd, 'gsd-research-synthesizer'),
    roadmapper_model: resolveModel(cwd, 'gsd-roadmapper'),
    commit_docs: config.commit_docs,
    research_enabled: config.research,
    current_milestone: milestone.version,
    current_milestone_name: milestone.name,
    project_exists: pathExists(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExists(cwd, '.planning/STATE.md'),
    project_path: '.planning/PROJECT.md',
    roadmap_path: '.planning/ROADMAP.md',
    state_path: '.planning/STATE.md',
  };
}

// ─── initPhaseOp ─────────────────────────────────────────────────────────────

/**
 * Load environment for a phase operation (resolve phase, load config, path info).
 */
export function initPhaseOp(cwd: string, phase: string): PhaseOpInit {
  const config = loadConfig(cwd);
  let phaseInfo = findPhase(cwd, phase);

  // Fallback to ROADMAP.md if no directory exists
  if (!phaseInfo) {
    const roadmapPhase = getRoadmapPhase(cwd, phase);
    if (roadmapPhase) {
      const phaseName = roadmapPhase.phase_name;
      phaseInfo = {
        found: true,
        directory: '',
        phase_number: roadmapPhase.phase_number,
        phase_name: phaseName,
        phase_slug: phaseName
          ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          : null,
        plans: [],
        summaries: [],
        incomplete_plans: [],
        has_research: false,
        has_context: false,
        has_verification: false,
      };
    }
  }

  const result: PhaseOpInit = {
    commit_docs: config.commit_docs,
    brave_search: config.brave_search,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    padded_phase: phaseInfo?.phase_number?.padStart(2, '0') || null,
    has_research: phaseInfo?.has_research ?? false,
    has_context: phaseInfo?.has_context ?? false,
    has_plans: (phaseInfo?.plans?.length ?? 0) > 0,
    has_verification: phaseInfo?.has_verification ?? false,
    plan_count: phaseInfo?.plans?.length ?? 0,
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExists(cwd, '.planning'),
    state_path: '.planning/STATE.md',
    roadmap_path: '.planning/ROADMAP.md',
    requirements_path: '.planning/REQUIREMENTS.md',
  };

  if (phaseInfo?.directory) {
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) result.context_path = toPosixPath(path.join(phaseInfo.directory, contextFile));
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) result.research_path = toPosixPath(path.join(phaseInfo.directory, researchFile));
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) result.verification_path = toPosixPath(path.join(phaseInfo.directory, verificationFile));
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) result.uat_path = toPosixPath(path.join(phaseInfo.directory, uatFile));
    } catch {
      // ignore
    }
  }

  return result;
}

// ─── initExecutePhase ─────────────────────────────────────────────────────────

/**
 * Full init for phase execution: models, plans, wave data, branch info.
 */
export function initExecutePhase(cwd: string, phase: string): ExecutePhaseInit {
  if (!phase) throw new Error('phase required for initExecutePhase');

  const config = loadConfig(cwd);
  const phaseInfo = findPhase(cwd, phase);
  const milestone = getMilestoneInfo(cwd);

  // Extract phase requirements from ROADMAP
  const roadmapPhase = getRoadmapPhase(cwd, phase);
  const reqMatch = roadmapPhase?.section?.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  const reqExtracted = reqMatch
    ? reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : null;
  const phase_req_ids = reqExtracted && reqExtracted !== 'TBD' ? reqExtracted : null;

  // Compute branch name
  let branch_name: string | null = null;
  if (config.branching_strategy === 'phase' && phaseInfo) {
    branch_name = config.phase_branch_template
      .replace('{phase}', phaseInfo.phase_number)
      .replace('{slug}', phaseInfo.phase_slug ?? 'phase');
  } else if (config.branching_strategy === 'milestone') {
    branch_name = config.milestone_branch_template
      .replace('{milestone}', milestone.version)
      .replace('{slug}', generateSlug(milestone.name) ?? 'milestone');
  }

  return {
    executor_model: resolveModel(cwd, 'gsd-executor'),
    verifier_model: resolveModel(cwd, 'gsd-verifier'),
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    branching_strategy: config.branching_strategy,
    phase_branch_template: config.phase_branch_template,
    milestone_branch_template: config.milestone_branch_template,
    verifier_enabled: config.verifier,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory ?? null,
    phase_number: phaseInfo?.phase_number ?? null,
    phase_name: phaseInfo?.phase_name ?? null,
    phase_slug: phaseInfo?.phase_slug ?? null,
    phase_req_ids,
    plans: phaseInfo?.plans ?? [],
    summaries: phaseInfo?.summaries ?? [],
    incomplete_plans: phaseInfo?.incomplete_plans ?? [],
    plan_count: phaseInfo?.plans?.length ?? 0,
    incomplete_count: phaseInfo?.incomplete_plans?.length ?? 0,
    branch_name,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlug(milestone.name),
    state_exists: pathExists(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    config_exists: pathExists(cwd, '.planning/config.json'),
    state_path: '.planning/STATE.md',
    roadmap_path: '.planning/ROADMAP.md',
    config_path: '.planning/config.json',
  };
}

// ─── initPlanPhase ────────────────────────────────────────────────────────────

/**
 * Load init context for plan-phase command.
 */
export function initPlanPhase(cwd: string, phase: string): PlanPhaseInit {
  if (!phase) throw new Error('phase required for initPlanPhase');

  const config = loadConfig(cwd);
  const phaseInfo = findPhase(cwd, phase);

  const roadmapPhase = getRoadmapPhase(cwd, phase);
  const reqMatch = roadmapPhase?.section?.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  const reqExtracted = reqMatch
    ? reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : null;
  const phase_req_ids = reqExtracted && reqExtracted !== 'TBD' ? reqExtracted : null;

  const result: PlanPhaseInit = {
    researcher_model: resolveModel(cwd, 'gsd-phase-researcher'),
    planner_model: resolveModel(cwd, 'gsd-planner'),
    checker_model: resolveModel(cwd, 'gsd-plan-checker'),
    research_enabled: config.research,
    plan_checker_enabled: config.plan_checker,
    nyquist_validation_enabled: config.nyquist_validation,
    commit_docs: config.commit_docs,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory ?? null,
    phase_number: phaseInfo?.phase_number ?? null,
    phase_name: phaseInfo?.phase_name ?? null,
    phase_slug: phaseInfo?.phase_slug ?? null,
    padded_phase: phaseInfo?.phase_number?.padStart(2, '0') ?? null,
    phase_req_ids,
    has_research: phaseInfo?.has_research ?? false,
    has_context: phaseInfo?.has_context ?? false,
    has_plans: (phaseInfo?.plans?.length ?? 0) > 0,
    plan_count: phaseInfo?.plans?.length ?? 0,
    planning_exists: pathExists(cwd, '.planning'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    state_path: '.planning/STATE.md',
    roadmap_path: '.planning/ROADMAP.md',
    requirements_path: '.planning/REQUIREMENTS.md',
  };

  if (phaseInfo?.directory) {
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) result.context_path = toPosixPath(path.join(phaseInfo.directory, contextFile));
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) result.research_path = toPosixPath(path.join(phaseInfo.directory, researchFile));
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) result.verification_path = toPosixPath(path.join(phaseInfo.directory, verificationFile));
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) result.uat_path = toPosixPath(path.join(phaseInfo.directory, uatFile));
    } catch {
      // ignore
    }
  }

  return result;
}

// ─── initQuick ────────────────────────────────────────────────────────────────

/**
 * Load init context for quick task command.
 */
export function initQuick(cwd: string, description?: string): QuickInit {
  const config = loadConfig(cwd);
  const now = new Date();
  const slug = description ? (generateSlug(description)?.substring(0, 40) ?? null) : null;

  const quickDir = path.join(cwd, '.planning', 'quick');
  let nextNum = 1;
  try {
    const existing = fs
      .readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) nextNum = Math.max(...existing) + 1;
  } catch {
    // ignore — dir doesn't exist
  }

  return {
    planner_model: resolveModel(cwd, 'gsd-planner'),
    executor_model: resolveModel(cwd, 'gsd-executor'),
    checker_model: resolveModel(cwd, 'gsd-plan-checker'),
    verifier_model: resolveModel(cwd, 'gsd-verifier'),
    commit_docs: config.commit_docs,
    next_num: nextNum,
    slug,
    description: description ?? null,
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    quick_dir: '.planning/quick',
    task_dir: slug ? `.planning/quick/${nextNum}-${slug}` : null,
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExists(cwd, '.planning'),
  };
}

// ─── initResume ───────────────────────────────────────────────────────────────

/**
 * Load init context for resume command.
 */
export function initResume(cwd: string): ResumeInit {
  const config = loadConfig(cwd);

  let interruptedAgentId: string | null = null;
  try {
    interruptedAgentId = fs
      .readFileSync(path.join(cwd, '.planning', 'current-agent-id.txt'), 'utf-8')
      .trim();
  } catch {
    // ignore
  }

  return {
    state_exists: pathExists(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    project_exists: pathExists(cwd, '.planning/PROJECT.md'),
    planning_exists: pathExists(cwd, '.planning'),
    state_path: '.planning/STATE.md',
    roadmap_path: '.planning/ROADMAP.md',
    project_path: '.planning/PROJECT.md',
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,
    commit_docs: config.commit_docs,
  };
}

// ─── initVerifyWork ───────────────────────────────────────────────────────────

/**
 * Load init context for verify-work command.
 */
export function initVerifyWork(cwd: string, phase: string): VerifyWorkInit {
  if (!phase) throw new Error('phase required for initVerifyWork');

  const config = loadConfig(cwd);
  const phaseInfo = findPhase(cwd, phase);

  return {
    planner_model: resolveModel(cwd, 'gsd-planner'),
    checker_model: resolveModel(cwd, 'gsd-plan-checker'),
    commit_docs: config.commit_docs,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory ?? null,
    phase_number: phaseInfo?.phase_number ?? null,
    phase_name: phaseInfo?.phase_name ?? null,
    has_verification: phaseInfo?.has_verification ?? false,
  };
}

// ─── initProgress ─────────────────────────────────────────────────────────────

/**
 * Load progress context: phase overview, current/next phase, paused state.
 */
export function initProgress(cwd: string): ProgressInit {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phasesDirPath = phasesDir(cwd);
  const phases: ProgressPhaseInfo[] = [];
  let currentPhase: ProgressPhaseInfo | null = null;
  let nextPhase: ProgressPhaseInfo | null = null;

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    for (const dir of dirs) {
      const match = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
      const phaseNumber = match ? match[1] : dir;
      const phaseName = match && match[2] ? match[2] : null;

      const phasePath = path.join(phasesDirPath, dir);
      const phaseFiles = fs.readdirSync(phasePath);

      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

      const status: ProgressPhaseInfo['status'] =
        summaries.length >= plans.length && plans.length > 0
          ? 'complete'
          : plans.length > 0
            ? 'in_progress'
            : hasResearch
              ? 'researched'
              : 'pending';

      const phaseInfoEntry: ProgressPhaseInfo = {
        number: phaseNumber,
        name: phaseName,
        directory: '.planning/phases/' + dir,
        status,
        plan_count: plans.length,
        summary_count: summaries.length,
        has_research: hasResearch,
      };

      phases.push(phaseInfoEntry);

      if (!currentPhase && (status === 'in_progress' || status === 'researched')) {
        currentPhase = phaseInfoEntry;
      }
      if (!nextPhase && status === 'pending') {
        nextPhase = phaseInfoEntry;
      }
    }
  } catch {
    // ignore
  }

  let pausedAt: string | null = null;
  try {
    const stateContent = fs.readFileSync(statePath(cwd), 'utf-8');
    const pauseMatch = stateContent.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  } catch {
    // ignore
  }

  return {
    executor_model: resolveModel(cwd, 'gsd-executor'),
    planner_model: resolveModel(cwd, 'gsd-planner'),
    commit_docs: config.commit_docs,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases,
    phase_count: phases.length,
    completed_count: phases.filter(p => p.status === 'complete').length,
    in_progress_count: phases.filter(p => p.status === 'in_progress').length,
    current_phase: currentPhase,
    next_phase: nextPhase,
    paused_at: pausedAt,
    has_work_in_progress: !!currentPhase,
    project_exists: pathExists(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExists(cwd, '.planning/STATE.md'),
    state_path: '.planning/STATE.md',
    roadmap_path: '.planning/ROADMAP.md',
    project_path: '.planning/PROJECT.md',
    config_path: '.planning/config.json',
  };
}

// ─── initMilestoneOp ──────────────────────────────────────────────────────────

/**
 * Load init context for milestone operations.
 */
export function initMilestoneOp(cwd: string): MilestoneOpInit {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phasesDirPath = phasesDir(cwd);

  let phaseCount = 0;
  let completedPhases = 0;

  try {
    const entries = fs.readdirSync(phasesDirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    phaseCount = dirs.length;

    for (const dir of dirs) {
      try {
        const phaseFiles = fs.readdirSync(path.join(phasesDirPath, dir));
        const hasSummary = phaseFiles.some(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        if (hasSummary) completedPhases++;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones: string[] = [];
  try {
    archivedMilestones = fs
      .readdirSync(archiveDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    // ignore
  }

  return {
    commit_docs: config.commit_docs,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlug(milestone.name),
    phase_count: phaseCount,
    completed_phases: completedPhases,
    all_phases_complete: phaseCount > 0 && phaseCount === completedPhases,
    archived_milestones: archivedMilestones,
    archive_count: archivedMilestones.length,
    project_exists: pathExists(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExists(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExists(cwd, '.planning/STATE.md'),
    archive_exists: pathExists(cwd, '.planning/archive'),
    phases_dir_exists: pathExists(cwd, '.planning/phases'),
  };
}
