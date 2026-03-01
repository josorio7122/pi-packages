/**
 * state.test.ts — Tests for the state module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  loadState,
  writeState,
  patchState,
  getStateField,
  advancePlan,
  addDecision,
  addBlocker,
  resolveBlocker,
  recordSession,
  snapshotState,
  stateToJson,
} from '../lib/state.js';
import type { FrontmatterData } from '../lib/types.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-state-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Sample STATE.md content ──────────────────────────────────────────────────

function makeStateBody(): string {
  return `# Project State

## Current Position

**Current Phase:** 2
**Current Phase Name:** Implementation
**Total Phases:** 5
**Current Plan:** 1
**Total Plans in Phase:** 3
**Status:** Ready to execute
**Progress:** [████░░░░░░] 40%
**Last Activity:** 2024-01-15

## Decisions

- [Phase 1]: Use TypeScript — type safety

## Blockers

None

## Performance Metrics

| Phase/Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|

## Session

**Last Date:** 2024-01-15T00:00:00.000Z
**Stopped At:** task 1
**Resume File:** None
`;
}

function writeStateMd(cwd: string, content: string): void {
  fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), content, 'utf-8');
}

// ─── loadState ────────────────────────────────────────────────────────────────

describe('loadState', () => {
  it('returns null when STATE.md is missing', () => {
    const result = loadState(tmpDir);
    expect(result).toBeNull();
  });

  it('returns { frontmatter, body, raw } when STATE.md exists', () => {
    const body = makeStateBody();
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'executing' };
    writeState(tmpDir, fm, body);

    const result = loadState(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.raw).toBeTruthy();
    expect(result!.body).toBeTruthy();
    expect(result!.frontmatter).toBeDefined();
  });

  it('returns body without frontmatter delimiters', () => {
    const body = makeStateBody();
    const fm: FrontmatterData = { status: 'executing' };
    writeState(tmpDir, fm, body);

    const result = loadState(tmpDir);
    // Body should not start with frontmatter block
    expect(result!.body).not.toMatch(/^---\n/);
    expect(result!.body).toContain('# Project State');
  });

  it('returns frontmatter as object', () => {
    const body = makeStateBody();
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'executing' };
    writeState(tmpDir, fm, body);

    const result = loadState(tmpDir);
    expect(result!.frontmatter).toHaveProperty('status');
  });
});

// ─── writeState ───────────────────────────────────────────────────────────────

describe('writeState', () => {
  it('creates STATE.md with frontmatter and body', () => {
    const body = makeStateBody();
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'planning' };

    writeState(tmpDir, fm, body);

    const filePath = path.join(tmpDir, '.planning', 'STATE.md');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('# Project State');
  });

  it('writes frontmatter YAML correctly', () => {
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'planning', current_phase: '1' };
    writeState(tmpDir, fm, makeStateBody());

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('gsd_state_version');
    expect(content).toContain('status');
  });

  it('round-trips: write → load produces same frontmatter keys', () => {
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'executing', current_phase: '2' };
    const body = makeStateBody();
    writeState(tmpDir, fm, body);

    const result = loadState(tmpDir);
    expect(result!.frontmatter).toHaveProperty('gsd_state_version');
    expect(result!.frontmatter).toHaveProperty('status');
    expect(result!.frontmatter).toHaveProperty('current_phase');
  });
});

// ─── patchState ───────────────────────────────────────────────────────────────

describe('patchState', () => {
  it('merges updates into existing frontmatter', () => {
    const fm: FrontmatterData = { status: 'planning', current_phase: '1' };
    writeState(tmpDir, fm, makeStateBody());

    const success = patchState(tmpDir, { status: 'executing', current_phase: '2' });
    expect(success).toBe(true);

    const result = loadState(tmpDir);
    expect(result!.frontmatter.status).toBe('executing');
    expect(result!.frontmatter.current_phase).toBe('2');
  });

  it('returns false when STATE.md is missing', () => {
    const success = patchState(tmpDir, { status: 'executing' });
    expect(success).toBe(false);
  });

  it('preserves existing frontmatter keys not in updates', () => {
    const fm: FrontmatterData = { status: 'planning', current_phase: '1', gsd_state_version: '1.0' };
    writeState(tmpDir, fm, makeStateBody());

    patchState(tmpDir, { status: 'executing' });

    const result = loadState(tmpDir);
    expect(result!.frontmatter.gsd_state_version).toBeDefined();
    expect(result!.frontmatter.current_phase).toBe('1');
  });
});

// ─── getStateField ────────────────────────────────────────────────────────────

describe('getStateField', () => {
  it('returns a specific frontmatter field', () => {
    const fm: FrontmatterData = { status: 'executing', current_phase: '3' };
    writeState(tmpDir, fm, makeStateBody());

    const status = getStateField(tmpDir, 'status');
    expect(status).toBe('executing');
  });

  it('returns null for missing field', () => {
    const fm: FrontmatterData = { status: 'executing' };
    writeState(tmpDir, fm, makeStateBody());

    const result = getStateField(tmpDir, 'nonexistent_field');
    expect(result).toBeNull();
  });

  it('returns null when STATE.md is missing', () => {
    const result = getStateField(tmpDir, 'status');
    expect(result).toBeNull();
  });
});

// ─── advancePlan ─────────────────────────────────────────────────────────────

describe('advancePlan', () => {
  it('increments current_plan in state body', () => {
    const body = makeStateBody(); // Has **Current Plan:** 1, **Total Plans in Phase:** 3
    writeState(tmpDir, { status: 'executing' }, body);

    const result = advancePlan(tmpDir);
    expect(result.advanced).toBe(true);
    expect(result.current_plan).toBe(2);
    expect(result.previous_plan).toBe(1);
  });

  it('does not advance past total plans', () => {
    const body = `# Project State\n\n**Current Plan:** 3\n**Total Plans in Phase:** 3\n**Status:** Ready to execute\n**Last Activity:** 2024-01-15\n`;
    writeState(tmpDir, { status: 'executing' }, body);

    const result = advancePlan(tmpDir);
    expect(result.advanced).toBe(false);
    expect(result.reason).toBe('last_plan');
  });

  it('returns error result when STATE.md is missing', () => {
    const result = advancePlan(tmpDir);
    expect(result.advanced).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── addDecision ─────────────────────────────────────────────────────────────

describe('addDecision', () => {
  it('appends a decision to the Decisions section', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    const success = addDecision(tmpDir, { phase: '2', summary: 'Use vitest' });
    expect(success).toBe(true);

    const result = loadState(tmpDir);
    expect(result!.body).toContain('Use vitest');
  });

  it('appends decision with rationale', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    addDecision(tmpDir, { phase: '2', summary: 'Use postgres', rationale: 'performance' });

    const result = loadState(tmpDir);
    expect(result!.body).toContain('Use postgres');
    expect(result!.body).toContain('performance');
  });

  it('returns false when STATE.md is missing', () => {
    const success = addDecision(tmpDir, { phase: '1', summary: 'test' });
    expect(success).toBe(false);
  });

  it('returns false when Decisions section is missing', () => {
    const body = `# Project State\n\n**Status:** Ready to execute\n`;
    writeState(tmpDir, {}, body);

    const success = addDecision(tmpDir, { phase: '1', summary: 'test' });
    expect(success).toBe(false);
  });
});

// ─── addBlocker / resolveBlocker ─────────────────────────────────────────────

describe('addBlocker', () => {
  it('appends a blocker to the Blockers section', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    const success = addBlocker(tmpDir, 'API is down');
    expect(success).toBe(true);

    const result = loadState(tmpDir);
    expect(result!.body).toContain('API is down');
  });

  it('returns false when STATE.md is missing', () => {
    const success = addBlocker(tmpDir, 'some blocker');
    expect(success).toBe(false);
  });

  it('returns false when Blockers section is missing', () => {
    const body = `# Project State\n\n**Status:** Ready to execute\n`;
    writeState(tmpDir, {}, body);

    const success = addBlocker(tmpDir, 'test blocker');
    expect(success).toBe(false);
  });
});

describe('resolveBlocker', () => {
  it('removes a matching blocker from the Blockers section', () => {
    const body = `# Project State\n\n**Status:** Ready to execute\n\n## Blockers\n\n- API is down\n- Waiting for review\n`;
    writeState(tmpDir, { status: 'executing' }, body);

    const success = resolveBlocker(tmpDir, 'API is down');
    expect(success).toBe(true);

    const result = loadState(tmpDir);
    expect(result!.body).not.toContain('API is down');
    expect(result!.body).toContain('Waiting for review');
  });

  it('returns false when STATE.md is missing', () => {
    const success = resolveBlocker(tmpDir, 'blocker');
    expect(success).toBe(false);
  });
});

// ─── recordSession ────────────────────────────────────────────────────────────

describe('recordSession', () => {
  it('updates session fields in the body', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    const success = recordSession(tmpDir, { stopped_at: 'task 3', resume_file: 'resume.md' });
    expect(success).toBe(true);

    const result = loadState(tmpDir);
    expect(result!.body).toContain('task 3');
    expect(result!.body).toContain('resume.md');
  });

  it('returns false when STATE.md is missing', () => {
    const success = recordSession(tmpDir, { stopped_at: 'task 1' });
    expect(success).toBe(false);
  });
});

// ─── snapshotState ────────────────────────────────────────────────────────────

describe('snapshotState', () => {
  it('creates a timestamped snapshot file', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    const snapshotPath = snapshotState(tmpDir);
    expect(snapshotPath).not.toBeNull();
    expect(fs.existsSync(snapshotPath!)).toBe(true);
  });

  it('snapshot contains same content as STATE.md', () => {
    writeState(tmpDir, { status: 'executing' }, makeStateBody());

    const snapshotPath = snapshotState(tmpDir);
    const originalContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    const snapshotContent = fs.readFileSync(snapshotPath!, 'utf-8');

    expect(snapshotContent).toBe(originalContent);
  });

  it('returns null when STATE.md is missing', () => {
    const result = snapshotState(tmpDir);
    expect(result).toBeNull();
  });
});

// ─── stateToJson ─────────────────────────────────────────────────────────────

describe('stateToJson', () => {
  it('returns state as JSON object with frontmatter data', () => {
    const fm: FrontmatterData = { gsd_state_version: '1.0', status: 'executing', current_phase: '2' };
    writeState(tmpDir, fm, makeStateBody());

    const result = stateToJson(tmpDir);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('gsd_state_version');
  });

  it('returns null when STATE.md is missing', () => {
    const result = stateToJson(tmpDir);
    expect(result).toBeNull();
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('write → load produces same data', () => {
    const fm: FrontmatterData = {
      gsd_state_version: '1.0',
      status: 'executing',
      current_phase: '2',
      current_plan: '1',
    };
    const body = makeStateBody();

    writeState(tmpDir, fm, body);
    const result = loadState(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.gsd_state_version).toBe('1.0');
    expect(result!.frontmatter.status).toBe('executing');
    expect(result!.frontmatter.current_phase).toBe('2');
    expect(result!.body.trim()).toContain('# Project State');
  });
});
