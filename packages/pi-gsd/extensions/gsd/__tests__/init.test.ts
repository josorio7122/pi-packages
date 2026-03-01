import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  initNewProject,
  initPhaseOp,
  initExecutePhase,
  initPlanPhase,
  initNewMilestone,
  initQuick,
  initResume,
  initProgress,
  initMilestoneOp,
} from '../lib/init.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

function setupBasicProject(): void {
  mkdir(path.join(tmpDir, '.planning', 'phases'));
  write(
    path.join(tmpDir, '.planning', 'ROADMAP.md'),
    '## v1.0: My Project\n\n### Phase 1: Setup\n\n**Goal:** Do setup\n**Requirements**: TBD\n**Depends on:** none\n---\n',
  );
  write(
    path.join(tmpDir, '.planning', 'STATE.md'),
    '---\n---\n\n**Status:** In progress\n**Current Phase:** 1\n',
  );
  write(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({ model_profile: 'balanced', commit_docs: true }),
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-init-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── initNewProject ───────────────────────────────────────────────────────────

describe('initNewProject', () => {
  it('returns model assignments', () => {
    const result = initNewProject(tmpDir);
    expect(result.researcher_model).toBeDefined();
    expect(result.synthesizer_model).toBeDefined();
    expect(result.roadmapper_model).toBeDefined();
  });

  it('reports file existence flags', () => {
    const result = initNewProject(tmpDir);
    expect(result.planning_exists).toBe(false);
    expect(result.project_exists).toBe(false);
  });

  it('detects existing .planning dir', () => {
    mkdir(path.join(tmpDir, '.planning'));
    const result = initNewProject(tmpDir);
    expect(result.planning_exists).toBe(true);
  });

  it('returns commit_docs from config', () => {
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced', commit_docs: false }),
    );
    const result = initNewProject(tmpDir);
    expect(result.commit_docs).toBe(false);
  });
});

// ─── initPhaseOp ─────────────────────────────────────────────────────────────

describe('initPhaseOp', () => {
  it('returns phase_found=false when no phase exists', () => {
    setupBasicProject();
    const result = initPhaseOp(tmpDir, '99');
    expect(result.phase_found).toBe(false);
  });

  it('finds phase when directory exists', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = initPhaseOp(tmpDir, '1');
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
    expect(result.phase_name).toBe('setup');
  });

  it('returns planning_exists flag', () => {
    setupBasicProject();
    const result = initPhaseOp(tmpDir, '1');
    expect(result.planning_exists).toBe(true);
  });

  it('returns context_path when context file exists', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-CONTEXT.md'),
      '# Context',
    );
    const result = initPhaseOp(tmpDir, '1');
    expect(result.context_path).toBeDefined();
  });

  it('falls back to ROADMAP when no directory exists', () => {
    setupBasicProject();
    // Phase 1 is in ROADMAP but no directory
    const result = initPhaseOp(tmpDir, '1');
    // Should find from ROADMAP.md
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('1');
  });
});

// ─── initExecutePhase ─────────────────────────────────────────────────────────

describe('initExecutePhase', () => {
  it('returns executor and verifier models', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = initExecutePhase(tmpDir, '1');
    expect(result.executor_model).toBeDefined();
    expect(result.verifier_model).toBeDefined();
  });

  it('returns plan inventory for phase', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '# Plan',
    );
    const result = initExecutePhase(tmpDir, '1');
    expect(result.plan_count).toBe(1);
    expect(result.plans).toHaveLength(1);
  });

  it('returns milestone info', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = initExecutePhase(tmpDir, '1');
    expect(result.milestone_version).toBe('v1.0');
  });

  it('includes branch name when branching_strategy is phase', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    // Update config
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        commit_docs: true,
        branching_strategy: 'phase',
        phase_branch_template: 'gsd/phase-{phase}-{slug}',
      }),
    );
    const result = initExecutePhase(tmpDir, '1');
    expect(result.branch_name).toContain('gsd/phase-');
  });
});

// ─── initPlanPhase ────────────────────────────────────────────────────────────

describe('initPlanPhase', () => {
  it('returns planner model', () => {
    setupBasicProject();
    const result = initPlanPhase(tmpDir, '1');
    expect(result.planner_model).toBeDefined();
  });

  it('reports research_enabled from config', () => {
    setupBasicProject();
    const result = initPlanPhase(tmpDir, '1');
    expect(typeof result.research_enabled).toBe('boolean');
  });
});

// ─── initNewMilestone ─────────────────────────────────────────────────────────

describe('initNewMilestone', () => {
  it('returns roadmapper model', () => {
    const result = initNewMilestone(tmpDir);
    expect(result.roadmapper_model).toBeDefined();
  });

  it('reports current milestone version', () => {
    setupBasicProject();
    const result = initNewMilestone(tmpDir);
    expect(result.current_milestone).toBe('v1.0');
  });
});

// ─── initQuick ────────────────────────────────────────────────────────────────

describe('initQuick', () => {
  it('returns next_num starting at 1', () => {
    const result = initQuick(tmpDir);
    expect(result.next_num).toBe(1);
  });

  it('generates slug from description', () => {
    const result = initQuick(tmpDir, 'Fix the bug');
    expect(result.slug).toBe('fix-the-bug');
  });

  it('increments next_num when quick tasks exist', () => {
    mkdir(path.join(tmpDir, '.planning', 'quick', '1-fix-bug'));
    const result = initQuick(tmpDir, 'Another task');
    expect(result.next_num).toBe(2);
  });

  it('returns date and timestamp', () => {
    const result = initQuick(tmpDir);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.timestamp).toBeDefined();
  });
});

// ─── initResume ────────────────────────────────────────────────────────────────

describe('initResume', () => {
  it('returns state_exists=false when no STATE.md', () => {
    const result = initResume(tmpDir);
    expect(result.state_exists).toBe(false);
    expect(result.planning_exists).toBe(false);
  });

  it('returns state_exists=true when STATE.md present', () => {
    setupBasicProject();
    const result = initResume(tmpDir);
    expect(result.state_exists).toBe(true);
  });

  it('detects interrupted agent id', () => {
    mkdir(path.join(tmpDir, '.planning'));
    write(path.join(tmpDir, '.planning', 'current-agent-id.txt'), 'agent-abc-123');
    const result = initResume(tmpDir);
    expect(result.has_interrupted_agent).toBe(true);
    expect(result.interrupted_agent_id).toBe('agent-abc-123');
  });
});

// ─── initProgress ─────────────────────────────────────────────────────────────

describe('initProgress', () => {
  it('returns empty phases list when no phases exist', () => {
    const result = initProgress(tmpDir);
    expect(result.phases).toEqual([]);
    expect(result.phase_count).toBe(0);
  });

  it('categorizes phase status correctly', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '# Plan',
    );
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'),
      '# Summary',
    );

    const result = initProgress(tmpDir);
    expect(result.phase_count).toBe(1);
    const phase = result.phases[0];
    expect(phase.status).toBe('complete');
  });
});

// ─── initMilestoneOp ─────────────────────────────────────────────────────────

describe('initMilestoneOp', () => {
  it('returns phase counts', () => {
    setupBasicProject();
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = initMilestoneOp(tmpDir);
    expect(result.phase_count).toBe(1);
    expect(typeof result.all_phases_complete).toBe('boolean');
  });

  it('returns milestone version', () => {
    setupBasicProject();
    const result = initMilestoneOp(tmpDir);
    expect(result.milestone_version).toBe('v1.0');
  });
});
