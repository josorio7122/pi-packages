/**
 * Tests for gsd_init tool — validates tool delegates to lib/init.ts correctly.
 * We test via the lib functions directly since the tool is a thin wrapper.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initNewProject, initResume, initQuick } from '../../lib/init.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-init-tool-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('gsd_init tool — new-project action delegates to initNewProject', () => {
  it('returns project_exists: false when .planning not yet created', () => {
    const result = initNewProject(tmpDir);
    expect(result.project_exists).toBe(false);
    expect(result.planning_exists).toBe(false);
    expect(result.project_path).toBe('.planning/PROJECT.md');
  });

  it('returns project_exists: true when PROJECT.md exists', () => {
    write(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n');
    const result = initNewProject(tmpDir);
    expect(result.project_exists).toBe(true);
    expect(result.planning_exists).toBe(true);
  });

  it('includes model fields in the result', () => {
    const result = initNewProject(tmpDir);
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('synthesizer_model');
    expect(result).toHaveProperty('roadmapper_model');
    expect(typeof result.researcher_model).toBe('string');
  });
});

describe('gsd_init tool — resume action delegates to initResume', () => {
  it('returns state_exists: false when STATE.md is missing', () => {
    const result = initResume(tmpDir);
    expect(result.state_exists).toBe(false);
    expect(result.has_interrupted_agent).toBe(false);
    expect(result.interrupted_agent_id).toBe(null);
  });

  it('detects interrupted agent from current-agent-id.txt', () => {
    write(path.join(tmpDir, '.planning', 'current-agent-id.txt'), 'agent-abc123\n');
    const result = initResume(tmpDir);
    expect(result.has_interrupted_agent).toBe(true);
    expect(result.interrupted_agent_id).toBe('agent-abc123');
  });
});

describe('gsd_init tool — quick action delegates to initQuick', () => {
  it('returns next_num: 1 on empty quick dir', () => {
    const result = initQuick(tmpDir, 'my task');
    expect(result.next_num).toBe(1);
    expect(result.description).toBe('my task');
    expect(result.slug).toBeTruthy();
    expect(result.quick_dir).toBe('.planning/quick');
  });

  it('generates a task_dir based on slug when description provided', () => {
    const result = initQuick(tmpDir, 'add tests');
    expect(result.task_dir).toContain('add-tests');
  });

  it('returns null task_dir when no description', () => {
    const result = initQuick(tmpDir);
    expect(result.task_dir).toBe(null);
    expect(result.description).toBe(null);
  });
});
