/**
 * types.ts — Shared TypeScript types for the GSD library
 */

export interface PlanningConfig {
  model_profile: 'quality' | 'balanced' | 'budget';
  commit_docs: boolean;
  search_gitignored: boolean;
  branching_strategy: string;
  phase_branch_template: string;
  milestone_branch_template: string;
  research: boolean;
  plan_checker: boolean;
  verifier: boolean;
  nyquist_validation: boolean;
  parallelization: boolean;
  brave_search: boolean;
  model_overrides?: Record<string, string> | null;
}

export interface PhaseInfo {
  found: boolean;
  directory: string;
  phase_number: string;
  phase_name: string | null;
  phase_slug: string | null;
  plans: string[];
  summaries: string[];
  incomplete_plans: string[];
  has_research: boolean;
  has_context: boolean;
  has_verification: boolean;
  archived?: string;
}

export interface FrontmatterData {
  [key: string]: string | number | boolean | string[] | FrontmatterData | null | undefined;
}

export interface MilestoneInfo {
  version: string;
  name: string;
}

// Agent names for dispatch
export type AgentName =
  | 'executor' | 'planner' | 'verifier' | 'plan-checker'
  | 'project-researcher' | 'phase-researcher' | 'research-synthesizer'
  | 'roadmapper' | 'codebase-mapper' | 'debugger' | 'integration-checker';

// Model profile tiers
export type ModelTier = 'opus' | 'sonnet' | 'haiku';
export type ProfileName = 'quality' | 'balanced' | 'budget';
