/**
 * template.test.ts — Tests for the template module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  renderTemplate,
  loadTemplate,
  renderTemplateFile,
} from '../lib/template.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-template-test-'));
  fs.mkdirSync(path.join(tmpDir, 'templates'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── renderTemplate ───────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('replaces {{variable}} with provided value', () => {
    const result = renderTemplate('Hello, {{name}}!', { name: 'World' });
    expect(result).toBe('Hello, World!');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const result = renderTemplate('{{x}} + {{x}} = two {{x}}s', { x: 'apple' });
    expect(result).toBe('apple + apple = two apples');
  });

  it('replaces multiple different variables', () => {
    const result = renderTemplate('{{greeting}}, {{name}}! You are {{age}} years old.', {
      greeting: 'Hello',
      name: 'Alice',
      age: '30',
    });
    expect(result).toBe('Hello, Alice! You are 30 years old.');
  });

  it('leaves unknown {{placeholder}} unchanged', () => {
    const result = renderTemplate('Hello, {{unknown}}!', {});
    expect(result).toBe('Hello, {{unknown}}!');
  });

  it('replaces {{TIMESTAMP}} with an ISO 8601 date string', () => {
    const result = renderTemplate('Timestamp: {{TIMESTAMP}}', {});
    // Should be an ISO date string like 2024-01-15T10:30:00.000Z
    expect(result).toMatch(/Timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('replaces {{DATE}} with YYYY-MM-DD format', () => {
    const result = renderTemplate('Date: {{DATE}}', {});
    expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}$/);
  });

  it('handles template with no placeholders', () => {
    const result = renderTemplate('No placeholders here.', { name: 'Alice' });
    expect(result).toBe('No placeholders here.');
  });

  it('handles empty template', () => {
    const result = renderTemplate('', { name: 'Alice' });
    expect(result).toBe('');
  });

  it('handles empty variables', () => {
    const result = renderTemplate('Hello, {{name}}!', {});
    expect(result).toBe('Hello, {{name}}!');
  });
});

// ─── loadTemplate ─────────────────────────────────────────────────────────────

describe('loadTemplate', () => {
  it('reads a template file from runtime/templates/ directory', () => {
    const templateContent = '# Hello, {{name}}!\n\nThis is a template.';
    fs.writeFileSync(path.join(tmpDir, 'templates', 'test.md'), templateContent, 'utf-8');

    const result = loadTemplate(tmpDir, 'test.md');
    expect(result).toBe(templateContent);
  });

  it('throws when template file does not exist', () => {
    expect(() => loadTemplate(tmpDir, 'nonexistent.md')).toThrow();
  });

  it('reads the template raw without variable substitution', () => {
    const templateContent = 'Project: {{PROJECT_NAME}}\nPhase: {{PHASE}}';
    fs.writeFileSync(path.join(tmpDir, 'templates', 'project.md'), templateContent, 'utf-8');

    const result = loadTemplate(tmpDir, 'project.md');
    expect(result).toContain('{{PROJECT_NAME}}');
    expect(result).toContain('{{PHASE}}');
  });
});

// ─── renderTemplateFile ───────────────────────────────────────────────────────

describe('renderTemplateFile', () => {
  it('loads a template and renders it with variables', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'greeting.md'),
      'Hello, {{name}}! Welcome to {{project}}.',
      'utf-8',
    );

    const result = renderTemplateFile(tmpDir, 'greeting.md', {
      name: 'Alice',
      project: 'GSD',
    });

    expect(result).toBe('Hello, Alice! Welcome to GSD.');
  });

  it('handles {{TIMESTAMP}} substitution in file templates', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'dated.md'),
      'Generated at: {{TIMESTAMP}}',
      'utf-8',
    );

    const result = renderTemplateFile(tmpDir, 'dated.md', {});
    expect(result).toMatch(/Generated at: \d{4}-\d{2}-\d{2}T/);
  });

  it('throws when template file does not exist', () => {
    expect(() => renderTemplateFile(tmpDir, 'missing.md', {})).toThrow();
  });
});
