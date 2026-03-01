/**
 * config.ts — Config.json CRUD and model profile resolution
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PlanningConfig, ModelTier, ProfileName } from './types.js';

// ─── Model profiles ───────────────────────────────────────────────────────────

export const MODEL_PROFILES: Record<string, Record<ProfileName, ModelTier>> = {
  'planner':              { quality: 'opus',   balanced: 'opus',   budget: 'sonnet' },
  'roadmapper':           { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet' },
  'executor':             { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet' },
  'phase-researcher':     { quality: 'opus',   balanced: 'sonnet', budget: 'haiku' },
  'project-researcher':   { quality: 'opus',   balanced: 'sonnet', budget: 'haiku' },
  'research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'debugger':             { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet' },
  'codebase-mapper':      { quality: 'sonnet', balanced: 'haiku',  budget: 'haiku' },
  'verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'plan-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

const TIER_TO_PI_MODEL: Record<ModelTier, string> = {
  opus:   'anthropic/claude-opus-4',
  sonnet: 'anthropic/claude-sonnet-4',
  haiku:  'anthropic/claude-haiku-3.5',
};

// ─── Default config ───────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: PlanningConfig = {
  model_profile: 'balanced',
  commit_docs: true,
  search_gitignored: false,
  branching_strategy: 'none',
  phase_branch_template: 'gsd/phase-{phase}-{slug}',
  milestone_branch_template: 'gsd/{milestone}-{slug}',
  research: true,
  plan_checker: true,
  verifier: true,
  nyquist_validation: false,
  parallelization: true,
  brave_search: false,
  model_overrides: null,
};

// ─── Config loading ───────────────────────────────────────────────────────────

/**
 * Load config from .planning/config.json, merging with defaults.
 * Returns DEFAULT_CONFIG if the file does not exist or cannot be parsed.
 */
export function loadConfig(cwd: string): PlanningConfig {
  const configFilePath = path.join(cwd, '.planning', 'config.json');

  try {
    const raw = fs.readFileSync(configFilePath, 'utf-8');
    const parsed: Record<string, unknown> = JSON.parse(raw);

    // Helper to read from top-level or a nested section (for legacy config shapes)
    function get(key: string, nested?: { section: string; field: string }): unknown {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested) {
        const section = parsed[nested.section];
        if (section && typeof section === 'object' && !Array.isArray(section)) {
          const val = (section as Record<string, unknown>)[nested.field];
          if (val !== undefined) return val;
        }
      }
      return undefined;
    }

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) {
        return (val as { enabled: boolean }).enabled;
      }
      return DEFAULT_CONFIG.parallelization;
    })();

    return {
      model_profile: (get('model_profile') ?? DEFAULT_CONFIG.model_profile) as PlanningConfig['model_profile'],
      commit_docs: (get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? DEFAULT_CONFIG.commit_docs) as boolean,
      search_gitignored: (get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? DEFAULT_CONFIG.search_gitignored) as boolean,
      branching_strategy: (get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? DEFAULT_CONFIG.branching_strategy) as string,
      phase_branch_template: (get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? DEFAULT_CONFIG.phase_branch_template) as string,
      milestone_branch_template: (get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? DEFAULT_CONFIG.milestone_branch_template) as string,
      research: (get('research', { section: 'workflow', field: 'research' }) ?? DEFAULT_CONFIG.research) as boolean,
      plan_checker: (get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? DEFAULT_CONFIG.plan_checker) as boolean,
      verifier: (get('verifier', { section: 'workflow', field: 'verifier' }) ?? DEFAULT_CONFIG.verifier) as boolean,
      nyquist_validation: (get('nyquist_validation', { section: 'workflow', field: 'nyquist_validation' }) ?? DEFAULT_CONFIG.nyquist_validation) as boolean,
      parallelization,
      brave_search: (get('brave_search') ?? DEFAULT_CONFIG.brave_search) as boolean,
      model_overrides: (parsed.model_overrides as Record<string, string> | null | undefined) ?? null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ─── Config mutation ──────────────────────────────────────────────────────────

/**
 * Create .planning/config.json with defaults if it does not already exist.
 */
export function ensureConfig(cwd: string): void {
  const planDir = path.join(cwd, '.planning');
  const configFilePath = path.join(planDir, 'config.json');

  if (!fs.existsSync(planDir)) {
    fs.mkdirSync(planDir, { recursive: true });
  }

  if (fs.existsSync(configFilePath)) return;

  const defaults = {
    model_profile: DEFAULT_CONFIG.model_profile,
    commit_docs: DEFAULT_CONFIG.commit_docs,
    search_gitignored: DEFAULT_CONFIG.search_gitignored,
    branching_strategy: DEFAULT_CONFIG.branching_strategy,
    phase_branch_template: DEFAULT_CONFIG.phase_branch_template,
    milestone_branch_template: DEFAULT_CONFIG.milestone_branch_template,
    workflow: {
      research: DEFAULT_CONFIG.research,
      plan_check: DEFAULT_CONFIG.plan_checker,
      verifier: DEFAULT_CONFIG.verifier,
      nyquist_validation: DEFAULT_CONFIG.nyquist_validation,
    },
    parallelization: DEFAULT_CONFIG.parallelization,
    brave_search: DEFAULT_CONFIG.brave_search,
  };

  fs.writeFileSync(configFilePath, JSON.stringify(defaults, null, 2), 'utf-8');
}

/**
 * Set a config value using dot-notation key path (e.g. "workflow.research").
 * Parses "true"/"false" as booleans, numeric strings as numbers.
 */
export function setConfig(cwd: string, keyPath: string, value: string): void {
  const configFilePath = path.join(cwd, '.planning', 'config.json');

  // Parse value
  let parsedValue: string | boolean | number = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (value !== '' && !isNaN(Number(value))) parsedValue = Number(value);

  // Load existing or start fresh
  let config: Record<string, unknown> = {};
  if (fs.existsSync(configFilePath)) {
    config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as Record<string, unknown>;
  }

  // Traverse and set via dot notation
  const keys = keyPath.split('.');
  let current: Record<string, unknown> = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = parsedValue;

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get a config value using dot-notation key path (e.g. "workflow.auto_advance").
 * Throws if the file does not exist or the key is not found.
 */
export function getConfig(cwd: string, keyPath: string): unknown {
  const configFilePath = path.join(cwd, '.planning', 'config.json');

  if (!fs.existsSync(configFilePath)) {
    throw new Error(`No config.json found at ${configFilePath}`);
  }

  const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as Record<string, unknown>;

  const keys = keyPath.split('.');
  let current: unknown = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      throw new Error(`Key not found: ${keyPath}`);
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (current === undefined) {
    throw new Error(`Key not found: ${keyPath}`);
  }

  return current;
}

// ─── Model resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the pi model string for a given agent, based on the configured profile.
 * Checks per-agent overrides first, then falls back to the profile table.
 */
export function resolveModelForAgent(cwd: string, agent: string): string {
  const config = loadConfig(cwd);

  // Check per-agent override first
  const override = config.model_overrides?.[agent];
  if (override) return override;

  // Fall back to profile lookup
  const profile = config.model_profile ?? 'balanced';
  const agentModels = MODEL_PROFILES[agent];
  if (!agentModels) return TIER_TO_PI_MODEL.sonnet;

  const tier = agentModels[profile] ?? agentModels.balanced ?? 'sonnet';
  return TIER_TO_PI_MODEL[tier];
}
