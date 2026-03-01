import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  toPosixPath,
  normalizePhaseName,
  comparePhaseNum,
  generateSlug,
  planningDir,
  phasesDir,
  configPath,
  statePath,
  roadmapPath,
  milestonesDir,
  findPhase,
  getMilestoneInfo,
} from '../lib/paths.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-paths-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── toPosixPath ─────────────────────────────────────────────────────────────

describe('toPosixPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosixPath('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  it('leaves forward slashes unchanged', () => {
    expect(toPosixPath('foo/bar/baz')).toBe('foo/bar/baz');
  });

  it('handles empty string', () => {
    expect(toPosixPath('')).toBe('');
  });
});

// ─── normalizePhaseName ───────────────────────────────────────────────────────

describe('normalizePhaseName', () => {
  it('pads single digit to 2 digits', () => {
    expect(normalizePhaseName('1')).toBe('01');
  });

  it('leaves double digit unchanged', () => {
    expect(normalizePhaseName('12')).toBe('12');
  });

  it('pads and uppercases letter suffix: 1A → 01A', () => {
    expect(normalizePhaseName('1A')).toBe('01A');
  });

  it('handles lowercase letter: 1a → 01A', () => {
    expect(normalizePhaseName('1a')).toBe('01A');
  });

  it('handles decimal suffix: 12A.1 → 12A.1', () => {
    expect(normalizePhaseName('12A.1')).toBe('12A.1');
  });

  it('pads with letter and decimal: 2A.1 → 02A.1', () => {
    expect(normalizePhaseName('2A.1')).toBe('02A.1');
  });
});

// ─── comparePhaseNum ──────────────────────────────────────────────────────────

describe('comparePhaseNum', () => {
  it('sorts integers numerically: 01 < 02', () => {
    expect(comparePhaseNum('01', '02')).toBeLessThan(0);
    expect(comparePhaseNum('02', '01')).toBeGreaterThan(0);
  });

  it('treats equal phases as 0', () => {
    expect(comparePhaseNum('02', '02')).toBe(0);
  });

  it('sorts letter variants: 02 < 02A < 02B', () => {
    expect(comparePhaseNum('02', '02A')).toBeLessThan(0);
    expect(comparePhaseNum('02A', '02B')).toBeLessThan(0);
    expect(comparePhaseNum('02B', '02A')).toBeGreaterThan(0);
  });

  it('sorts across integer boundaries: 02B < 03', () => {
    expect(comparePhaseNum('02B', '03')).toBeLessThan(0);
  });

  it('sorts decimal suffixes: 03 < 03.1 < 03.2', () => {
    expect(comparePhaseNum('03', '03.1')).toBeLessThan(0);
    expect(comparePhaseNum('03.1', '03.2')).toBeLessThan(0);
    expect(comparePhaseNum('03.2', '03.1')).toBeGreaterThan(0);
  });

  it('full ordering: 01 < 02 < 02A < 02B < 03 < 03.1 < 03.2', () => {
    const phases = ['03.2', '02A', '01', '03', '02', '02B', '03.1'];
    const sorted = [...phases].sort(comparePhaseNum);
    expect(sorted).toEqual(['01', '02', '02A', '02B', '03', '03.1', '03.2']);
  });
});

// ─── generateSlug ─────────────────────────────────────────────────────────────

describe('generateSlug', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('strips leading and trailing dashes', () => {
    expect(generateSlug('  Hello World  ')).toBe('hello-world');
  });

  it('collapses multiple non-alphanumeric chars into one dash', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world');
  });

  it('returns null for empty/falsy input', () => {
    expect(generateSlug('')).toBeNull();
    expect(generateSlug(null as unknown as string)).toBeNull();
  });
});

// ─── Path utilities ───────────────────────────────────────────────────────────

describe('path utilities', () => {
  it('planningDir returns .planning subdirectory', () => {
    expect(planningDir('/project')).toBe('/project/.planning');
  });

  it('phasesDir returns .planning/phases', () => {
    expect(phasesDir('/project')).toBe('/project/.planning/phases');
  });

  it('configPath returns .planning/config.json', () => {
    expect(configPath('/project')).toBe('/project/.planning/config.json');
  });

  it('statePath returns .planning/STATE.md', () => {
    expect(statePath('/project')).toBe('/project/.planning/STATE.md');
  });

  it('roadmapPath returns .planning/ROADMAP.md', () => {
    expect(roadmapPath('/project')).toBe('/project/.planning/ROADMAP.md');
  });

  it('milestonesDir returns .planning/milestones', () => {
    expect(milestonesDir('/project')).toBe('/project/.planning/milestones');
  });
});

// ─── findPhase ────────────────────────────────────────────────────────────────

describe('findPhase', () => {
  function setupPhase(baseDir: string, dirName: string, files: string[] = []) {
    const phaseDir = path.join(baseDir, '.planning', 'phases', dirName);
    fs.mkdirSync(phaseDir, { recursive: true });
    for (const f of files) {
      fs.writeFileSync(path.join(phaseDir, f), '', 'utf-8');
    }
    return phaseDir;
  }

  it('returns null when phases directory does not exist', () => {
    expect(findPhase(tmpDir, '01')).toBeNull();
  });

  it('returns null when phase is not found', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
    expect(findPhase(tmpDir, '99')).toBeNull();
  });

  it('finds a phase by number', () => {
    setupPhase(tmpDir, '01-auth', ['PLAN.md', 'SUMMARY.md']);
    const result = findPhase(tmpDir, '1');
    expect(result).not.toBeNull();
    expect(result!.found).toBe(true);
    expect(result!.phase_number).toBe('01');
    expect(result!.phase_name).toBe('auth');
  });

  it('reports plans and summaries', () => {
    setupPhase(tmpDir, '02-backend', ['backend-PLAN.md', 'backend-SUMMARY.md', 'extra-PLAN.md']);
    const result = findPhase(tmpDir, '2');
    expect(result!.plans).toContain('backend-PLAN.md');
    expect(result!.plans).toContain('extra-PLAN.md');
    expect(result!.summaries).toContain('backend-SUMMARY.md');
  });

  it('reports incomplete plans (plans without matching summaries)', () => {
    setupPhase(tmpDir, '03-frontend', ['api-PLAN.md', 'ui-PLAN.md', 'api-SUMMARY.md']);
    const result = findPhase(tmpDir, '3');
    expect(result!.incomplete_plans).toEqual(['ui-PLAN.md']);
  });

  it('detects research, context, and verification files', () => {
    setupPhase(tmpDir, '04-infra', ['RESEARCH.md', 'CONTEXT.md', 'VERIFICATION.md']);
    const result = findPhase(tmpDir, '4');
    expect(result!.has_research).toBe(true);
    expect(result!.has_context).toBe(true);
    expect(result!.has_verification).toBe(true);
  });

  it('has_research is false when no research file', () => {
    setupPhase(tmpDir, '05-clean', ['PLAN.md']);
    const result = findPhase(tmpDir, '5');
    expect(result!.has_research).toBe(false);
  });

  it('generates phase_slug from phase name', () => {
    setupPhase(tmpDir, '06-My Phase Name', []);
    const result = findPhase(tmpDir, '6');
    expect(result!.phase_slug).toBe('my-phase-name');
  });

  it('searches archived milestone phases when not found in current', () => {
    // Set up archived phase
    const archiveDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0-phases', '01-archived');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

    const result = findPhase(tmpDir, '1');
    expect(result).not.toBeNull();
    expect(result!.archived).toBe('v1.0');
  });
});

// ─── getMilestoneInfo ────────────────────────────────────────────────────────

describe('getMilestoneInfo', () => {
  it('returns defaults when ROADMAP.md does not exist', () => {
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v1.0');
    expect(info.name).toBe('milestone');
  });

  it('extracts version and name from ROADMAP.md heading', () => {
    const planningPath = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningPath, { recursive: true });
    fs.writeFileSync(
      path.join(planningPath, 'ROADMAP.md'),
      '## Milestone v2.3: My Feature\n\nSome content.',
      'utf-8',
    );
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v2.3');
    expect(info.name).toBe('My Feature');
  });

  it('ignores versions inside details blocks', () => {
    const planningPath = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningPath, { recursive: true });
    fs.writeFileSync(
      path.join(planningPath, 'ROADMAP.md'),
      '<details>\n## Old v1.0: Old Milestone\n</details>\n## Current v2.0: New Milestone\n',
      'utf-8',
    );
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v2.0');
    expect(info.name).toBe('New Milestone');
  });
});
