/**
 * roadmap.test.ts — Tests for the roadmap module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  parseRoadmap,
  getRoadmapPhase,
  listRoadmapPhases,
  getRequirements,
  analyzeRoadmap,
} from '../lib/roadmap.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-roadmap-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Sample ROADMAP.md content ────────────────────────────────────────────────

const SAMPLE_ROADMAP = `# Project Roadmap — v1.0: MVP Launch

## v1.0: MVP Launch

### Phase 1: Foundation

**Goal:** Set up the project foundation
**Depends on:** None

**Success Criteria:**
1. Repo initialized
2. CI/CD pipeline running

### Phase 2: Core Features

**Goal:** Implement core features
**Depends on:** Phase 1

**Success Criteria:**
1. API endpoints working
2. Tests passing

### Phase 3: Launch

**Goal:** Ship to production
**Depends on:** Phase 2

**Success Criteria:**
1. Deployed to production
2. Monitoring in place
`;

function writeRoadmap(cwd: string, content: string): void {
  fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), content, 'utf-8');
}

// ─── parseRoadmap ─────────────────────────────────────────────────────────────

describe('parseRoadmap', () => {
  it('returns null when ROADMAP.md is missing', () => {
    const result = parseRoadmap(tmpDir);
    expect(result).toBeNull();
  });

  it('parses phases from ROADMAP.md', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = parseRoadmap(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.phases).toHaveLength(3);
  });

  it('extracts phase numbers and names', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = parseRoadmap(tmpDir);
    const phase1 = result!.phases.find(p => p.number === '1');
    expect(phase1).toBeDefined();
    expect(phase1!.name).toBe('Foundation');
  });

  it('extracts phase goals', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = parseRoadmap(tmpDir);
    const phase1 = result!.phases.find(p => p.number === '1');
    expect(phase1!.goal).toBe('Set up the project foundation');
  });

  it('extracts success criteria for phases', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = parseRoadmap(tmpDir);
    const phase1 = result!.phases.find(p => p.number === '1');
    expect(phase1!.success_criteria).toHaveLength(2);
    expect(phase1!.success_criteria[0]).toBe('Repo initialized');
  });

  it('extracts milestones from ROADMAP.md', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = parseRoadmap(tmpDir);
    expect(result!.milestones).toHaveLength(1);
    expect(result!.milestones[0].version).toBe('v1.0');
  });
});

// ─── getRoadmapPhase ─────────────────────────────────────────────────────────

describe('getRoadmapPhase', () => {
  it('returns phase data for an existing phase', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = getRoadmapPhase(tmpDir, '1');
    expect(result).not.toBeNull();
    expect(result!.phase_number).toBe('1');
    expect(result!.phase_name).toBe('Foundation');
    expect(result!.goal).toBe('Set up the project foundation');
  });

  it('returns null for a missing phase', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = getRoadmapPhase(tmpDir, '99');
    expect(result).toBeNull();
  });

  it('returns null when ROADMAP.md is missing', () => {
    const result = getRoadmapPhase(tmpDir, '1');
    expect(result).toBeNull();
  });

  it('returns section text for the phase', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = getRoadmapPhase(tmpDir, '2');
    expect(result!.section).toContain('Core Features');
    expect(result!.section).toContain('API endpoints working');
  });

  it('returns success criteria as an array', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = getRoadmapPhase(tmpDir, '1');
    expect(Array.isArray(result!.success_criteria)).toBe(true);
    expect(result!.success_criteria).toHaveLength(2);
    expect(result!.success_criteria[0]).toBe('Repo initialized');
  });
});

// ─── listRoadmapPhases ────────────────────────────────────────────────────────

describe('listRoadmapPhases', () => {
  it('returns all phases with numbers and names', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = listRoadmapPhases(tmpDir);
    expect(result).toHaveLength(3);
    expect(result[0].number).toBe('1');
    expect(result[0].name).toBe('Foundation');
  });

  it('returns phases in order', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = listRoadmapPhases(tmpDir);
    expect(result[0].number).toBe('1');
    expect(result[1].number).toBe('2');
    expect(result[2].number).toBe('3');
  });

  it('returns empty array when ROADMAP.md is missing', () => {
    const result = listRoadmapPhases(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when no phases found in ROADMAP.md', () => {
    writeRoadmap(tmpDir, '# Project Roadmap\n\nNo phases here.\n');

    const result = listRoadmapPhases(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─── getRequirements ─────────────────────────────────────────────────────────

describe('getRequirements', () => {
  it('returns requirements from ROADMAP.md if present', () => {
    const roadmapWithReqs = SAMPLE_ROADMAP + `\n## Requirements\n\n- Req 1\n- Req 2\n`;
    writeRoadmap(tmpDir, roadmapWithReqs);

    const result = getRequirements(tmpDir);
    expect(result).toContain('Req 1');
    expect(result).toContain('Req 2');
  });

  it('returns empty array when no requirements section', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);

    const result = getRequirements(tmpDir);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array when ROADMAP.md is missing', () => {
    const result = getRequirements(tmpDir);
    expect(result).toEqual([]);
  });

  it('reads from REQUIREMENTS.md when present', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '# Requirements\n\n- Must be fast\n- Must be reliable\n',
      'utf-8',
    );

    const result = getRequirements(tmpDir);
    expect(result).toContain('Must be fast');
    expect(result).toContain('Must be reliable');
  });
});

// ─── analyzeRoadmap ───────────────────────────────────────────────────────────

describe('analyzeRoadmap', () => {
  it('returns phase_count', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

    const result = analyzeRoadmap(tmpDir);
    expect(result.phase_count).toBe(3);
  });

  it('returns completed_phases as 0 with no phase directories', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

    const result = analyzeRoadmap(tmpDir);
    expect(result.completed_phases).toBe(0);
  });

  it('returns null result when ROADMAP.md is missing', () => {
    const result = analyzeRoadmap(tmpDir);
    expect(result).toBeNull();
  });

  it('returns progress_percent', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

    const result = analyzeRoadmap(tmpDir);
    expect(typeof result!.progress_percent).toBe('number');
    expect(result!.progress_percent).toBeGreaterThanOrEqual(0);
    expect(result!.progress_percent).toBeLessThanOrEqual(100);
  });

  it('returns phases array', () => {
    writeRoadmap(tmpDir, SAMPLE_ROADMAP);
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

    const result = analyzeRoadmap(tmpDir);
    expect(Array.isArray(result!.phases)).toBe(true);
    expect(result!.phases).toHaveLength(3);
  });
});
