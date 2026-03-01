import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  completeMilestone,
  markRequirementsComplete,
  listMilestones,
} from '../lib/milestone.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-milestone-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── markRequirementsComplete ─────────────────────────────────────────────────

describe('markRequirementsComplete', () => {
  it('returns not-updated when REQUIREMENTS.md missing', () => {
    const result = markRequirementsComplete(tmpDir, ['REQ-01']);
    expect(result.updated).toBe(false);
  });

  it('marks checkbox complete in REQUIREMENTS.md', () => {
    write(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '- [ ] **REQ-01** Do something\n- [ ] **REQ-02** Do another thing\n',
    );
    const result = markRequirementsComplete(tmpDir, ['REQ-01']);
    expect(result.updated).toBe(true);
    expect(result.marked_complete).toContain('REQ-01');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');
    expect(content).toContain('- [x] **REQ-01**');
    expect(content).toContain('- [ ] **REQ-02**');
  });

  it('reports not_found for IDs not in file', () => {
    write(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '- [ ] **REQ-01** Do something\n',
    );
    const result = markRequirementsComplete(tmpDir, ['REQ-99']);
    expect(result.not_found).toContain('REQ-99');
  });

  it('handles multiple IDs at once', () => {
    write(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '- [ ] **REQ-01** First\n- [ ] **REQ-02** Second\n',
    );
    const result = markRequirementsComplete(tmpDir, ['REQ-01', 'REQ-02']);
    expect(result.marked_complete).toHaveLength(2);
  });
});

// ─── completeMilestone ────────────────────────────────────────────────────────

describe('completeMilestone', () => {
  function setupMilestoneProject(): void {
    // phases
    mkdir(path.join(tmpDir, '.planning', 'phases', '01-setup'));
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md'),
      '# Plan',
    );
    write(
      path.join(tmpDir, '.planning', 'phases', '01-setup', '01-01-SUMMARY.md'),
      '---\none-liner: Set up the project\n---\n# Summary\n## Task 1\ndone',
    );
    // ROADMAP
    write(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## v1.0: Initial Release\n\n### Phase 1: Setup\n---\n',
    );
    // STATE
    write(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\n---\n\n**Status:** In progress\n**Last Activity:** 2024-01-01\n',
    );
  }

  it('creates milestones archive directory', () => {
    setupMilestoneProject();
    completeMilestone(tmpDir, 'v1.0');
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones'))).toBe(true);
  });

  it('archives ROADMAP.md to milestones dir', () => {
    setupMilestoneProject();
    completeMilestone(tmpDir, 'v1.0');
    expect(
      fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0-ROADMAP.md')),
    ).toBe(true);
  });

  it('creates or updates MILESTONES.md with version entry', () => {
    setupMilestoneProject();
    completeMilestone(tmpDir, 'v1.0');
    const milestonesFile = path.join(tmpDir, '.planning', 'MILESTONES.md');
    expect(fs.existsSync(milestonesFile)).toBe(true);
    const content = fs.readFileSync(milestonesFile, 'utf-8');
    expect(content).toContain('v1.0');
  });

  it('returns phase and plan counts', () => {
    setupMilestoneProject();
    const result = completeMilestone(tmpDir, 'v1.0');
    expect(result.version).toBe('v1.0');
    expect(result.phases).toBeGreaterThan(0);
    expect(result.milestones_updated).toBe(true);
  });

  it('archives phase dirs when archivePhases is true', () => {
    setupMilestoneProject();
    completeMilestone(tmpDir, 'v1.0', { archivePhases: true });
    const phaseArchiveDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0-phases');
    expect(fs.existsSync(phaseArchiveDir)).toBe(true);
  });

  it('uses custom milestone name', () => {
    setupMilestoneProject();
    const result = completeMilestone(tmpDir, 'v1.0', { name: 'Initial Release' });
    expect(result.name).toBe('Initial Release');
  });
});

// ─── listMilestones ────────────────────────────────────────────────────────────

describe('listMilestones', () => {
  it('returns empty list when no milestones exist', () => {
    const result = listMilestones(tmpDir);
    expect(result).toEqual([]);
  });

  it('lists archived milestone versions', () => {
    write(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0-ROADMAP.md'),
      '# Roadmap v1.0',
    );
    write(
      path.join(tmpDir, '.planning', 'milestones', 'v2.0-ROADMAP.md'),
      '# Roadmap v2.0',
    );
    const result = listMilestones(tmpDir);
    expect(result).toContain('v1.0');
    expect(result).toContain('v2.0');
  });
});
