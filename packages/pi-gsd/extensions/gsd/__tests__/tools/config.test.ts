/**
 * Tests for gsd_config tool — validates tool delegates to lib/config.ts correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, ensureConfig, getConfig, setConfig, resolveModelForAgent } from '../../lib/config.js';

let tmpDir: string;

function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function write(p: string, content: string): void {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf-8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-config-tool-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('gsd_config tool — load action', () => {
  it('returns default config when no config.json exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.model_profile).toBe('balanced');
    expect(config.commit_docs).toBe(true);
    expect(config.research).toBe(true);
  });

  it('loads values from config.json', () => {
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'budget', commit_docs: false }),
    );
    const config = loadConfig(tmpDir);
    expect(config.model_profile).toBe('budget');
    expect(config.commit_docs).toBe(false);
  });
});

describe('gsd_config tool — ensure action', () => {
  it('creates config.json with defaults when missing', () => {
    ensureConfig(tmpDir);
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(parsed).toHaveProperty('model_profile');
  });

  it('does not overwrite existing config.json', () => {
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality' }),
    );
    ensureConfig(tmpDir);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'config.json'), 'utf-8'),
    );
    expect(parsed.model_profile).toBe('quality');
  });
});

describe('gsd_config tool — get / set actions', () => {
  it('sets and gets a config value', () => {
    write(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({ model_profile: 'balanced' }));
    setConfig(tmpDir, 'model_profile', 'quality');
    const val = getConfig(tmpDir, 'model_profile');
    expect(val).toBe('quality');
  });

  it('parses boolean string values', () => {
    write(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({}));
    setConfig(tmpDir, 'commit_docs', 'false');
    const val = getConfig(tmpDir, 'commit_docs');
    expect(val).toBe(false);
  });

  it('throws when key not found', () => {
    write(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({}));
    expect(() => getConfig(tmpDir, 'nonexistent_key')).toThrow();
  });
});

describe('gsd_config tool — resolve-model action', () => {
  it('returns a model string for a known agent', () => {
    const model = resolveModelForAgent(tmpDir, 'planner');
    expect(typeof model).toBe('string');
    expect(model).toMatch(/anthropic\//);
  });

  it('respects model_overrides', () => {
    write(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_overrides: { planner: 'custom/model' } }),
    );
    const model = resolveModelForAgent(tmpDir, 'planner');
    expect(model).toBe('custom/model');
  });

  it('returns sonnet for unknown agent', () => {
    const model = resolveModelForAgent(tmpDir, 'unknown-agent-xyz');
    expect(model).toContain('sonnet');
  });
});
