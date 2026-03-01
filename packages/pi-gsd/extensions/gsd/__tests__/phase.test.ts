import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  listPhases,
  addPhase,
  insertPhase,
  removePhase,
  findPhaseDir,
  getPlanIndex,
  getWaveGroups,
  completePhase,
  nextDecimalPhase,
} from '../lib/phase.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── listPhases ───────────────────────────────────────────────────────────────

describe('listPhases', () => {
  it('returns empty list when phases dir does not exist', () => {
    const result = listPhases(tmpDir);
    expect(result.directories).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns phase directories sorted by number', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '03-deploy'));
    const result = listPhases(tmpDir);
    expect(result.directories).toEqual(['01-setup', '02-feature', '03-deploy']);
    expect(result.count).toBe(3);
  });

  it('filters by phase number when provided', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    const result = listPhases(tmpDir, { phase: '1' });
    expect(result.directories).toHaveLength(1);
    expect(result.directories[0]).toBe('01-setup');
  });

  it('lists plan files when type=plans', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-02-PLAN.md'), '# Plan');
    const result = listPhases(tmpDir, { type: 'plans' });
    expect(result.files).toHaveLength(2);
    expect(result.count).toBe(2);
  });
});

// ─── findPhaseDir ─────────────────────────────────────────────────────────────

describe('findPhaseDir', () => {
  it('returns null when phases dir does not exist', () => {
    const result = findPhaseDir(tmpDir, '1');
    expect(result).toBeNull();
  });

  it('finds phase directory by number', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = findPhaseDir(tmpDir, '1');
    expect(result).not.toBeNull();
    expect(result!.found).toBe(true);
    expect(result!.phase_number).toBe('01');
    expect(result!.phase_name).toBe('setup');
    expect(result!.directory).toBe('.planning/phases/01-setup');
  });

  it('returns null if phase not found', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = findPhaseDir(tmpDir, '5');
    expect(result).toBeNull();
  });

  it('lists plans and summaries in result', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'), '# Summary');
    const result = findPhaseDir(tmpDir, '1');
    expect(result!.plans).toContain('01-01-PLAN.md');
    expect(result!.summaries).toContain('01-01-SUMMARY.md');
  });
});

// ─── nextDecimalPhase ─────────────────────────────────────────────────────────

describe('nextDecimalPhase', () => {
  it('returns .1 when no decimal phases exist', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    const result = nextDecimalPhase(tmpDir, '2');
    expect(result.next).toBe('02.1');
  });

  it('returns .2 when .1 exists', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02.1-hotfix'));
    const result = nextDecimalPhase(tmpDir, '2');
    expect(result.next).toBe('02.2');
    expect(result.existing).toHaveLength(1);
  });

  it('handles no phases dir', () => {
    const result = nextDecimalPhase(tmpDir, '3');
    expect(result.next).toBe('03.1');
    expect(result.found).toBe(false);
  });
});

// ─── addPhase ─────────────────────────────────────────────────────────────────

describe('addPhase', () => {
  it('creates the phase directory', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases'));
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'), '## v1.0: My Project\n\n### Phase 1: Setup\n---\n');

    const result = addPhase(tmpDir, 'New Feature');
    expect(result.phase_number).toBe(2);
    const dirPath = path.join(tmpDir, '.planning', 'phases', result.directory.replace('.planning/phases/', ''));
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  it('adds phase entry to ROADMAP.md', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases'));
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'), '## v1.0: Project\n\n### Phase 1: Setup\n---\n');

    addPhase(tmpDir, 'New Feature');
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    expect(roadmap).toContain('Phase 2');
    expect(roadmap).toContain('New Feature');
  });

  it('throws if ROADMAP.md missing', () => {
    expect(() => addPhase(tmpDir, 'Something')).toThrow();
  });
});

// ─── insertPhase ─────────────────────────────────────────────────────────────

describe('insertPhase', () => {
  it('creates decimal phase directory', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n\n### Phase 2: Feature\n---\n');

    const result = insertPhase(tmpDir, '1', 'Hotfix');
    expect(result.phase_number).toBe('01.1');
    const dirPath = path.join(tmpDir, '.planning', 'phases', '01.1-hotfix');
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  it('increments decimal when one already exists', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '01.1-hotfix'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n\n### Phase 2: Feature\n---\n');

    const result = insertPhase(tmpDir, '1', 'Another Hotfix');
    expect(result.phase_number).toBe('01.2');
  });

  it('throws if ROADMAP.md missing', () => {
    expect(() => insertPhase(tmpDir, '1', 'Hotfix')).toThrow();
  });

  it('throws if after-phase not found in ROADMAP', () => {
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n---\n');
    expect(() => insertPhase(tmpDir, '99', 'Hotfix')).toThrow();
  });
});

// ─── removePhase ─────────────────────────────────────────────────────────────

describe('removePhase', () => {
  it('removes phase directory', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '02-feature');
    mkdir(phaseDir);
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n\n### Phase 2: Feature\n---\n');

    removePhase(tmpDir, '2');
    expect(fs.existsSync(phaseDir)).toBe(false);
  });

  it('throws if phase has summaries and force not set', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    mkdir(phaseDir);
    write(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'), '### Phase 1: Setup\n---\n');

    expect(() => removePhase(tmpDir, '1')).toThrow();
  });

  it('removes with force even when summaries exist', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    mkdir(phaseDir);
    write(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'), '### Phase 1: Setup\n---\n');

    removePhase(tmpDir, '1', { force: true });
    expect(fs.existsSync(phaseDir)).toBe(false);
  });
});

// ─── getPlanIndex ─────────────────────────────────────────────────────────────

describe('getPlanIndex', () => {
  it('returns empty plans for phase with no plan files', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = getPlanIndex(tmpDir, '1');
    expect(result.plans).toEqual([]);
    expect(result.waves).toEqual({});
    expect(result.incomplete).toEqual([]);
  });

  it('extracts wave from frontmatter', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const planContent = `---
phase: "01"
plan: "01"
wave: 2
depends_on: []
files_modified: []
autonomous: true
must_haves:
---
# Plan
`;
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), planContent);

    const result = getPlanIndex(tmpDir, '1');
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].wave).toBe(2);
    expect(result.waves['2']).toContain('01-01');
  });

  it('marks plan as incomplete when no summary exists', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '---\nwave: 1\n---\n# Plan');

    const result = getPlanIndex(tmpDir, '1');
    expect(result.incomplete).toContain('01-01');
  });

  it('marks plan as complete when summary exists', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '---\nwave: 1\n---\n# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'), '# Summary');

    const result = getPlanIndex(tmpDir, '1');
    expect(result.incomplete).not.toContain('01-01');
    expect(result.plans[0].has_summary).toBe(true);
  });

  it('returns error when phase not found', () => {
    const result = getPlanIndex(tmpDir, '99');
    expect(result.error).toBeDefined();
  });
});

// ─── getWaveGroups ────────────────────────────────────────────────────────────

describe('getWaveGroups', () => {
  it('returns empty array when phase has no plans', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    const result = getWaveGroups(tmpDir, '1');
    expect(result).toEqual([]);
  });

  it('groups plans by wave number', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '---\nwave: 1\n---\n# Plan A',
    );
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-02-PLAN.md'),
      '---\nwave: 2\n---\n# Plan B',
    );
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-03-PLAN.md'),
      '---\nwave: 1\n---\n# Plan C',
    );

    const result = getWaveGroups(tmpDir, '1');
    expect(result).toHaveLength(2);

    const wave1 = result.find(g => g.wave === 1);
    const wave2 = result.find(g => g.wave === 2);
    expect(wave1).toBeDefined();
    expect(wave2).toBeDefined();
    expect(wave1!.plans).toHaveLength(2);
    expect(wave2!.plans).toHaveLength(1);
  });

  it('sorts waves in ascending order', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '---\nwave: 3\n---\n# Plan',
    );
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-02-PLAN.md'),
      '---\nwave: 1\n---\n# Plan',
    );

    const result = getWaveGroups(tmpDir, '1');
    expect(result[0].wave).toBe(1);
    expect(result[1].wave).toBe(3);
  });

  it('defaults to wave 1 when frontmatter wave missing', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '# Plan with no frontmatter',
    );

    const result = getWaveGroups(tmpDir, '1');
    expect(result).toHaveLength(1);
    expect(result[0].wave).toBe(1);
  });

  it('returns empty array when phase not found', () => {
    const result = getWaveGroups(tmpDir, '99');
    expect(result).toEqual([]);
  });
});

// ─── completePhase ────────────────────────────────────────────────────────────

describe('completePhase', () => {
  it('marks phase complete in ROADMAP', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'), '# Summary');
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n\n**Goal:** Setup\n**Requirements**: TBD\n**Depends on:** none\n**Plans:** 1 plans\n\n- [ ] Phase 1: setup task\n---\n');

    const result = completePhase(tmpDir, '1');
    expect(result.completed_phase).toBe('1');
    expect(result.roadmap_updated).toBe(true);
  });

  it('returns next phase info when available', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-feature'));
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '### Phase 1: Setup\n### Phase 2: Feature\n---\n');

    const result = completePhase(tmpDir, '1');
    expect(result.next_phase).toBe('02');
  });

  it('throws when phase not found', () => {
    write(path.join(tmpDir, '.planning', 'ROADMAP.md'), '### Phase 1: Setup\n---\n');
    expect(() => completePhase(tmpDir, '99')).toThrow();
  });
});
