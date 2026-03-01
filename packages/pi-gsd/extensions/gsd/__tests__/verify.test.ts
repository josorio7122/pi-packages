import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  verifyPlanStructure,
  verifyPhaseCompleteness,
  verifyReferences,
  validateConsistency,
  validateHealth,
  verifySummary,
} from '../lib/verify.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-verify-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── verifySummary ────────────────────────────────────────────────────────────

describe('verifySummary', () => {
  it('returns passed=false when summary does not exist', () => {
    const result = verifySummary(tmpDir, 'nonexistent.md');
    expect(result.passed).toBe(false);
    expect(result.checks.summary_exists).toBe(false);
  });

  it('returns passed=true for a valid summary', () => {
    write(
      path.join(tmpDir, 'summary.md'),
      '# Summary\n\nSome content without file references.\n',
    );
    const result = verifySummary(tmpDir, 'summary.md');
    expect(result.checks.summary_exists).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('detects failed self-check section', () => {
    write(
      path.join(tmpDir, 'summary.md'),
      '# Summary\n\n## Self-Check\n\nFail: test did not pass\n',
    );
    const result = verifySummary(tmpDir, 'summary.md');
    expect(result.passed).toBe(false);
    expect(result.checks.self_check).toBe('failed');
  });

  it('detects passed self-check section', () => {
    write(
      path.join(tmpDir, 'summary.md'),
      '# Summary\n\n## Self-Check\n\nAll checks pass ✓\n',
    );
    const result = verifySummary(tmpDir, 'summary.md');
    expect(result.checks.self_check).toBe('passed');
  });
});

// ─── verifyPlanStructure ─────────────────────────────────────────────────────

describe('verifyPlanStructure', () => {
  it('returns error when file not found', () => {
    const result = verifyPlanStructure(tmpDir, 'nonexistent.md');
    expect(result.error).toBeDefined();
  });

  it('detects missing required frontmatter fields', () => {
    write(
      path.join(tmpDir, 'plan.md'),
      '---\nphase: "01"\n---\n# Plan\n',
    );
    const result = verifyPlanStructure(tmpDir, 'plan.md');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates a correctly structured plan', () => {
    const content = `---
phase: "01"
plan: "01"
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
---
# Plan

<task>
<name>Task 1</name>
<action>Do something</action>
<verify>Check it</verify>
<done>It is done</done>
</task>
`;
    write(path.join(tmpDir, 'plan.md'), content);
    const result = verifyPlanStructure(tmpDir, 'plan.md');
    expect(result.valid).toBe(true);
    expect(result.task_count).toBe(1);
  });

  it('warns about tasks missing verify element', () => {
    const content = `---
phase: "01"
plan: "01"
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
---
# Plan

<task>
<name>Task 1</name>
<action>Do something</action>
</task>
`;
    write(path.join(tmpDir, 'plan.md'), content);
    const result = verifyPlanStructure(tmpDir, 'plan.md');
    expect(result.warnings.some(w => w.includes('verify'))).toBe(true);
  });
});

// ─── verifyPhaseCompleteness ─────────────────────────────────────────────────

describe('verifyPhaseCompleteness', () => {
  it('returns error when phase not found', () => {
    const result = verifyPhaseCompleteness(tmpDir, '99');
    expect(result.error).toBeDefined();
  });

  it('returns complete=true when all plans have summaries', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'), '# Summary');

    const result = verifyPhaseCompleteness(tmpDir, '1');
    expect(result.complete).toBe(true);
    expect(result.incomplete_plans).toHaveLength(0);
  });

  it('returns complete=false when plans lack summaries', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'), '# Plan');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-02-PLAN.md'), '# Plan 2');
    write(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'), '# Summary');

    const result = verifyPhaseCompleteness(tmpDir, '1');
    expect(result.complete).toBe(false);
    expect(result.incomplete_plans).toContain('01-02');
  });
});

// ─── verifyReferences ────────────────────────────────────────────────────────

describe('verifyReferences', () => {
  it('returns error when file not found', () => {
    const result = verifyReferences(tmpDir, 'nonexistent.md');
    expect(result.error).toBeDefined();
  });

  it('reports valid when no file references', () => {
    write(path.join(tmpDir, 'doc.md'), '# No references here\n');
    const result = verifyReferences(tmpDir, 'doc.md');
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('detects missing referenced files', () => {
    write(
      path.join(tmpDir, 'doc.md'),
      '# Doc\n\nSee `src/nonexistent/file.ts` for details.\n',
    );
    const result = verifyReferences(tmpDir, 'doc.md');
    expect(result.missing).toContain('src/nonexistent/file.ts');
  });

  it('reports found=true for existing files', () => {
    write(path.join(tmpDir, 'src', 'existing.ts'), 'export {};');
    write(
      path.join(tmpDir, 'doc.md'),
      '# Doc\n\nSee `src/existing.ts` for details.\n',
    );
    const result = verifyReferences(tmpDir, 'doc.md');
    expect(result.found).toBeGreaterThan(0);
  });
});

// ─── validateConsistency ─────────────────────────────────────────────────────

describe('validateConsistency', () => {
  it('returns failed when ROADMAP.md missing', () => {
    const result = validateConsistency(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes for consistent structure', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n---\n',
    );
    const result = validateConsistency(tmpDir);
    expect(result.passed).toBe(true);
  });

  it('warns about phases on disk not in ROADMAP', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    mkdir(path.join(tmpDir, '.planning', 'phases', '02-orphan'));
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '### Phase 1: Setup\n---\n',
    );
    const result = validateConsistency(tmpDir);
    const hasOrphanWarning = result.warnings.some(w => w.includes('2') && w.includes('disk'));
    expect(hasOrphanWarning).toBe(true);
  });

  it('warns about phases in ROADMAP missing from disk', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '### Phase 1: Setup\n\n### Phase 2: Feature\n---\n',
    );
    const result = validateConsistency(tmpDir);
    const hasMissingWarning = result.warnings.some(w => w.includes('2') && !w.includes('disk') || w.includes('ROADMAP'));
    expect(hasMissingWarning).toBe(true);
  });
});

// ─── validateHealth ───────────────────────────────────────────────────────────

describe('validateHealth', () => {
  it('returns broken when .planning/ missing', () => {
    const result = validateHealth(tmpDir);
    expect(result.status).toBe('broken');
    expect(result.errors.some(e => e.code === 'E001')).toBe(true);
  });

  it('returns broken when ROADMAP.md missing', () => {
    mkdir(path.join(tmpDir, '.planning'));
    write(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '## What This Is\n## Core Value\n## Requirements\n',
    );
    const result = validateHealth(tmpDir);
    expect(result.status).toBe('broken');
  });

  it('returns healthy for valid setup', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases'));
    write(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '## What This Is\n## Core Value\n## Requirements\n',
    );
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Project\n\n### Phase 1: Setup\n---\n',
    );
    write(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\n---\n\n**Status:** Ready\n',
    );
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' }),
    );
    // Create matching phase dir
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));

    const result = validateHealth(tmpDir);
    expect(result.status).toBe('healthy');
  });

  it('returns degraded when config.json missing', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases'));
    write(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '## What This Is\n## Core Value\n## Requirements\n',
    );
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '### Phase 1: Setup\n---\n',
    );
    write(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\n---\n\n**Status:** Ready\n',
    );
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));

    const result = validateHealth(tmpDir);
    expect(result.status).toBe('degraded');
    expect(result.warnings.some(w => w.code === 'W003')).toBe(true);
  });

  it('repairs missing config.json when repair=true', () => {
    mkdir(path.join(tmpDir, '.planning', 'phases'));
    write(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '## What This Is\n## Core Value\n## Requirements\n',
    );
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '### Phase 1: Setup\n---\n',
    );
    write(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\n---\n\n**Status:** Ready\n',
    );
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));

    const result = validateHealth(tmpDir, { repair: true });
    expect(result.repairs_performed?.length).toBeGreaterThan(0);
    expect(
      fs.existsSync(path.join(tmpDir, '.planning', 'config.json')),
    ).toBe(true);
  });
});
