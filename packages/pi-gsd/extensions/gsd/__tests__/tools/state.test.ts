/**
 * Tests for gsd_state tool — validates tool delegates to lib/state.ts correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadState,
  patchState,
  getStateField,
  advancePlan,
  addDecision,
  addBlocker,
  resolveBlocker,
  snapshotState,
  stateToJson,
} from '../../lib/state.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

const BASIC_STATE = `---
status: executing
---

**Status:** In progress
**Current Phase:** 1
**Current Plan:** 1
**Total Plans in Phase:** 3
**Last Activity:** 2024-01-01

### Decisions

None yet.

### Blockers/Concerns

None.
`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-state-tool-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('gsd_state tool — load action', () => {
  it('returns null when STATE.md does not exist', () => {
    expect(loadState(tmpDir)).toBe(null);
  });

  it('returns state object when STATE.md exists', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const result = loadState(tmpDir);
    expect(result).not.toBe(null);
    expect(result?.frontmatter).toBeDefined();
    expect(result?.body).toBeDefined();
  });
});

describe('gsd_state tool — get action', () => {
  it('returns null for missing field', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    expect(getStateField(tmpDir, 'nonexistent')).toBe(null);
  });

  it('returns field value from frontmatter', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const result = getStateField(tmpDir, 'status');
    expect(result).toBe('executing');
  });
});

describe('gsd_state tool — patch action', () => {
  it('returns false when STATE.md does not exist', () => {
    expect(patchState(tmpDir, { status: 'paused' })).toBe(false);
  });

  it('patches frontmatter and returns true', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const success = patchState(tmpDir, { custom_field: 'hello' });
    expect(success).toBe(true);
    const state = loadState(tmpDir);
    expect(state?.frontmatter.custom_field).toBe('hello');
  });
});

describe('gsd_state tool — advance-plan action', () => {
  it('advances Current Plan field', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const result = advancePlan(tmpDir);
    expect(result.advanced).toBe(true);
    expect(result.current_plan).toBe(2);
    expect(result.previous_plan).toBe(1);
  });

  it('returns last_plan reason when at last plan', () => {
    const lastPlanState = BASIC_STATE.replace('**Current Plan:** 1', '**Current Plan:** 3');
    write(path.join(tmpDir, '.planning', 'STATE.md'), lastPlanState);
    const result = advancePlan(tmpDir);
    expect(result.advanced).toBe(false);
    expect(result.reason).toBe('last_plan');
  });
});

describe('gsd_state tool — add-decision action', () => {
  it('appends decision to Decisions section', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const ok = addDecision(tmpDir, { phase: '1', summary: 'Use TypeScript', rationale: 'Type safety' });
    expect(ok).toBe(true);
    const raw = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    expect(raw).toContain('Use TypeScript');
  });
});

describe('gsd_state tool — add-blocker / resolve-blocker actions', () => {
  it('adds and resolves a blocker', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    addBlocker(tmpDir, 'CI is broken');
    const withBlocker = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    expect(withBlocker).toContain('CI is broken');

    resolveBlocker(tmpDir, 'CI is broken');
    const resolved = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    expect(resolved).not.toContain('CI is broken');
  });
});

describe('gsd_state tool — snapshot action', () => {
  it('creates a snapshot file', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const snapshotPath = snapshotState(tmpDir);
    expect(snapshotPath).not.toBe(null);
    expect(fs.existsSync(snapshotPath!)).toBe(true);
  });

  it('returns null when STATE.md is missing', () => {
    expect(snapshotState(tmpDir)).toBe(null);
  });
});

describe('gsd_state tool — json action', () => {
  it('returns state as JSON object', () => {
    write(path.join(tmpDir, '.planning', 'STATE.md'), BASIC_STATE);
    const json = stateToJson(tmpDir);
    expect(json).not.toBe(null);
    expect(typeof json).toBe('object');
  });

  it('returns null when STATE.md missing', () => {
    expect(stateToJson(tmpDir)).toBe(null);
  });
});
