import { describe, it, expect } from 'vitest';

import {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  FRONTMATTER_SCHEMAS,
} from '../lib/frontmatter.js';

// ─── extractFrontmatter ───────────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  it('returns empty object when no frontmatter', () => {
    expect(extractFrontmatter('# Hello\nNo frontmatter')).toEqual({});
  });

  it('parses simple key-value pairs', () => {
    const content = '---\nphase: 01\nplan: auth\ntype: feature\n---\n\n# Body';
    const fm = extractFrontmatter(content);
    expect(fm.phase).toBe('01');
    expect(fm.plan).toBe('auth');
    expect(fm.type).toBe('feature');
  });

  it('parses boolean values as strings (raw YAML)', () => {
    const content = '---\nautonomous: true\nverified: false\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.autonomous).toBe('true');
    expect(fm.verified).toBe('false');
  });

  it('parses inline arrays', () => {
    const content = '---\ntags: [auth, api, backend]\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.tags).toEqual(['auth', 'api', 'backend']);
  });

  it('parses multi-line arrays', () => {
    const content = '---\nfiles_modified:\n  - src/auth.ts\n  - src/config.ts\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.files_modified).toEqual(['src/auth.ts', 'src/config.ts']);
  });

  it('parses nested objects', () => {
    const content = '---\nmust_haves:\n  artifacts:\n    - path: src/auth.ts\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.must_haves).toBeDefined();
  });

  it('strips quotes from values', () => {
    const content = '---\nphase: "01"\nplan: \'auth\'\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.phase).toBe('01');
    expect(fm.plan).toBe('auth');
  });

  it('handles empty frontmatter block', () => {
    const content = '---\n\n---\n';
    expect(extractFrontmatter(content)).toEqual({});
  });
});

// ─── reconstructFrontmatter ───────────────────────────────────────────────────

describe('reconstructFrontmatter', () => {
  it('serializes simple string values', () => {
    const result = reconstructFrontmatter({ phase: '01', plan: 'auth' });
    expect(result).toContain('phase: 01');
    expect(result).toContain('plan: auth');
  });

  it('quotes values containing colons', () => {
    const result = reconstructFrontmatter({ url: 'http://example.com' });
    expect(result).toContain('"http://example.com"');
  });

  it('quotes values containing hashes', () => {
    const result = reconstructFrontmatter({ note: 'value # comment' });
    expect(result).toContain('"value # comment"');
  });

  it('serializes empty arrays', () => {
    const result = reconstructFrontmatter({ tags: [] });
    expect(result).toContain('tags: []');
  });

  it('serializes short arrays inline', () => {
    const result = reconstructFrontmatter({ tags: ['auth', 'api'] });
    expect(result).toContain('tags: [auth, api]');
  });

  it('serializes long arrays as multi-line', () => {
    const result = reconstructFrontmatter({
      files: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(result).toContain('files:');
    expect(result).toContain('  - a');
  });

  it('skips null and undefined values', () => {
    const result = reconstructFrontmatter({ phase: '01', nullVal: null, undefVal: undefined });
    expect(result).not.toContain('nullVal');
    expect(result).not.toContain('undefVal');
    expect(result).toContain('phase: 01');
  });

  it('serializes nested objects', () => {
    const result = reconstructFrontmatter({
      must_haves: { artifacts: [] },
    });
    expect(result).toContain('must_haves:');
    expect(result).toContain('  artifacts: []');
  });

  it('serializes boolean values', () => {
    const result = reconstructFrontmatter({ autonomous: true, verified: false });
    expect(result).toContain('autonomous: true');
    expect(result).toContain('verified: false');
  });
});

// ─── spliceFrontmatter ────────────────────────────────────────────────────────

describe('spliceFrontmatter', () => {
  it('replaces existing frontmatter', () => {
    const content = '---\nphase: 01\n---\n\n# Body\n';
    const newFm = { phase: '02', plan: 'backend' };
    const result = spliceFrontmatter(content, newFm);
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('phase: 02');
    expect(result).toContain('plan: backend');
    expect(result).not.toContain('phase: 01');
    expect(result).toContain('# Body');
  });

  it('adds frontmatter to content that has none', () => {
    const content = '# Just a heading\n\nSome body text.';
    const result = spliceFrontmatter(content, { phase: '01' });
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('phase: 01');
    expect(result).toContain('# Just a heading');
  });

  it('preserves body content after frontmatter replacement', () => {
    const content = '---\nphase: 01\n---\n\nBody line 1\nBody line 2\n';
    const result = spliceFrontmatter(content, { phase: '99' });
    expect(result).toContain('Body line 1');
    expect(result).toContain('Body line 2');
  });
});

// ─── parseMustHavesBlock ─────────────────────────────────────────────────────

describe('parseMustHavesBlock', () => {
  it('returns empty array when no frontmatter', () => {
    expect(parseMustHavesBlock('No frontmatter', 'artifacts')).toEqual([]);
  });

  it('returns empty array when block not found', () => {
    const content = '---\nphase: 01\n---\n';
    expect(parseMustHavesBlock(content, 'artifacts')).toEqual([]);
  });

  it('parses simple artifact items', () => {
    const content = [
      '---',
      'phase: 01',
      'must_haves:',
      '    artifacts:',
      '      - path: src/auth.ts',
      '        provides: authentication',
      '---',
      '',
    ].join('\n');
    const items = parseMustHavesBlock(content, 'artifacts');
    expect(items).toHaveLength(1);
    expect((items[0] as Record<string, string>).path).toBe('src/auth.ts');
    expect((items[0] as Record<string, string>).provides).toBe('authentication');
  });

  it('parses multiple artifact items', () => {
    const content = [
      '---',
      'phase: 01',
      'must_haves:',
      '    artifacts:',
      '      - path: src/a.ts',
      '        provides: thing-a',
      '      - path: src/b.ts',
      '        provides: thing-b',
      '---',
      '',
    ].join('\n');
    const items = parseMustHavesBlock(content, 'artifacts');
    expect(items).toHaveLength(2);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('extract → reconstruct → extract produces the same result for simple data', () => {
    const original = { phase: '01', plan: 'auth', tags: ['a', 'b'], autonomous: 'true' };
    const yaml = reconstructFrontmatter(original);
    const content = `---\n${yaml}\n---\n\n# Body`;
    const extracted = extractFrontmatter(content);
    expect(extracted.phase).toBe('01');
    expect(extracted.plan).toBe('auth');
    expect(extracted.tags).toEqual(['a', 'b']);
    expect(extracted.autonomous).toBe('true');
  });
});

// ─── FRONTMATTER_SCHEMAS ─────────────────────────────────────────────────────

describe('FRONTMATTER_SCHEMAS', () => {
  it('defines required fields for plan schema', () => {
    expect(FRONTMATTER_SCHEMAS.plan.required).toContain('phase');
    expect(FRONTMATTER_SCHEMAS.plan.required).toContain('must_haves');
  });

  it('defines required fields for summary schema', () => {
    expect(FRONTMATTER_SCHEMAS.summary.required).toContain('phase');
    expect(FRONTMATTER_SCHEMAS.summary.required).toContain('completed');
  });

  it('defines required fields for verification schema', () => {
    expect(FRONTMATTER_SCHEMAS.verification.required).toContain('status');
    expect(FRONTMATTER_SCHEMAS.verification.required).toContain('score');
  });
});
