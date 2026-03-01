/**
 * Tests for gsd_phase tool — validates tool delegates to lib/phase.ts correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listPhases, getPlanIndex, getWaveGroups } from '../../lib/phase.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

function setupPhase(num: string, name: string): string {
  const dir = path.join(tmpDir, '.planning', 'phases', `${num}-${name}`);
  mkdir(dir);
  return dir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase-tool-test-'));
  mkdir(path.join(tmpDir, '.planning', 'phases'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('gsd_phase tool — list action', () => {
  it('returns empty list when no phases exist', () => {
    const result = listPhases(tmpDir);
    expect(result.directories).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('lists phase directories', () => {
    setupPhase('01', 'setup');
    setupPhase('02', 'implement');
    const result = listPhases(tmpDir);
    expect(result.count).toBe(2);
    expect(result.directories).toContain('01-setup');
    expect(result.directories).toContain('02-implement');
  });
});

describe('gsd_phase tool — plan-index action', () => {
  it('returns error when phase not found', () => {
    const result = getPlanIndex(tmpDir, '99');
    expect(result.error).toBe('Phase not found');
    expect(result.plans).toEqual([]);
  });

  it('returns plan index for existing phase', () => {
    const dir = setupPhase('01', 'setup');
    write(
      path.join(dir, 'phase-01-01-PLAN.md'),
      '---\nphase: 1\nplan: 1\nwave: 1\nautonomous: true\nfiles_modified: []\ndepends_on: []\ntype: feature\nmust_haves: []\nobjective: Do setup\n---\n<task>\n<name>Task 1</name>\n<action>Do it</action>\n</task>\n',
    );
    const result = getPlanIndex(tmpDir, '1');
    expect(result.plans.length).toBe(1);
    expect(result.plans[0].wave).toBe(1);
    expect(result.incomplete).toContain('phase-01-01');
  });
});

describe('gsd_phase tool — wave-group action', () => {
  it('returns empty array when phase has no plans', () => {
    setupPhase('01', 'setup');
    const groups = getWaveGroups(tmpDir, '1');
    expect(groups).toEqual([]);
  });

  it('groups plans by wave', () => {
    const dir = setupPhase('01', 'setup');
    const planFm = (wave: number) =>
      `---\nphase: 1\nplan: 1\nwave: ${wave}\nautonomous: true\nfiles_modified: []\ndepends_on: []\ntype: feature\nmust_haves: []\n---\n`;
    write(path.join(dir, 'phase-01-01-PLAN.md'), planFm(1));
    write(path.join(dir, 'phase-01-02-PLAN.md'), planFm(1));
    write(path.join(dir, 'phase-01-03-PLAN.md'), planFm(2));
    const groups = getWaveGroups(tmpDir, '1');
    expect(groups.length).toBe(2);
    expect(groups[0].wave).toBe(1);
    expect(groups[0].plans.length).toBe(2);
    expect(groups[1].wave).toBe(2);
    expect(groups[1].plans.length).toBe(1);
  });
});
