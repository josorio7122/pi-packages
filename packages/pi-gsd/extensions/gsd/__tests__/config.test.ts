import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  loadConfig,
  ensureConfig,
  setConfig,
  getConfig,
  resolveModelForAgent,
  MODEL_PROFILES,
  DEFAULT_CONFIG,
} from '../lib/config.js';

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function planningDir(): string {
  return path.join(tmpDir, '.planning');
}

function writeConfig(data: object): void {
  fs.mkdirSync(planningDir(), { recursive: true });
  fs.writeFileSync(path.join(planningDir(), 'config.json'), JSON.stringify(data, null, 2), 'utf-8');
}

// ─── loadConfig ───────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns defaults when config.json does not exist', () => {
    const config = loadConfig(tmpDir);
    expect(config.model_profile).toBe('balanced');
    expect(config.commit_docs).toBe(true);
    expect(config.search_gitignored).toBe(false);
    expect(config.branching_strategy).toBe('none');
    expect(config.research).toBe(true);
    expect(config.plan_checker).toBe(true);
    expect(config.verifier).toBe(true);
    expect(config.nyquist_validation).toBe(false);
    expect(config.parallelization).toBe(true);
    expect(config.brave_search).toBe(false);
    expect(config.model_overrides).toBeNull();
  });

  it('reads and parses config.json with top-level fields', () => {
    writeConfig({
      model_profile: 'quality',
      commit_docs: false,
      research: false,
      brave_search: true,
    });
    const config = loadConfig(tmpDir);
    expect(config.model_profile).toBe('quality');
    expect(config.commit_docs).toBe(false);
    expect(config.research).toBe(false);
    expect(config.brave_search).toBe(true);
  });

  it('reads nested workflow section for plan_checker', () => {
    writeConfig({
      workflow: {
        plan_check: false,
        verifier: false,
        nyquist_validation: true,
      },
    });
    const config = loadConfig(tmpDir);
    expect(config.plan_checker).toBe(false);
    expect(config.verifier).toBe(false);
    expect(config.nyquist_validation).toBe(true);
  });

  it('reads parallelization from object with enabled field', () => {
    writeConfig({ parallelization: { enabled: false } });
    const config = loadConfig(tmpDir);
    expect(config.parallelization).toBe(false);
  });

  it('reads model_overrides', () => {
    writeConfig({ model_overrides: { planner: 'anthropic/claude-haiku-3.5' } });
    const config = loadConfig(tmpDir);
    expect(config.model_overrides).toEqual({ planner: 'anthropic/claude-haiku-3.5' });
  });

  it('top-level fields take precedence over nested sections', () => {
    writeConfig({
      research: true,
      workflow: { research: false },
    });
    const config = loadConfig(tmpDir);
    expect(config.research).toBe(true);
  });
});

// ─── ensureConfig ────────────────────────────────────────────────────────────

describe('ensureConfig', () => {
  it('creates .planning directory and config.json if missing', () => {
    ensureConfig(tmpDir);
    expect(fs.existsSync(path.join(planningDir(), 'config.json'))).toBe(true);
  });

  it('created config contains default model_profile', () => {
    ensureConfig(tmpDir);
    const raw = fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.model_profile).toBe('balanced');
  });

  it('does not overwrite existing config.json', () => {
    writeConfig({ model_profile: 'quality' });
    ensureConfig(tmpDir);
    const raw = fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.model_profile).toBe('quality');
  });
});

// ─── setConfig ───────────────────────────────────────────────────────────────

describe('setConfig', () => {
  it('sets a top-level value', () => {
    writeConfig({ model_profile: 'balanced' });
    setConfig(tmpDir, 'model_profile', 'budget');
    const config = loadConfig(tmpDir);
    expect(config.model_profile).toBe('budget');
  });

  it('sets a nested value via dot notation', () => {
    writeConfig({});
    setConfig(tmpDir, 'workflow.research', 'false');
    const raw = JSON.parse(fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8'));
    expect(raw.workflow.research).toBe(false);
  });

  it('creates intermediate objects for deep dot notation', () => {
    writeConfig({});
    setConfig(tmpDir, 'a.b.c', 'hello');
    const raw = JSON.parse(fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8'));
    expect(raw.a.b.c).toBe('hello');
  });

  it('parses boolean strings', () => {
    writeConfig({});
    setConfig(tmpDir, 'commit_docs', 'false');
    const raw = JSON.parse(fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8'));
    expect(raw.commit_docs).toBe(false);
  });

  it('parses numeric strings', () => {
    writeConfig({});
    setConfig(tmpDir, 'score', '42');
    const raw = JSON.parse(fs.readFileSync(path.join(planningDir(), 'config.json'), 'utf-8'));
    expect(raw.score).toBe(42);
  });
});

// ─── getConfig ───────────────────────────────────────────────────────────────

describe('getConfig', () => {
  it('reads a top-level value', () => {
    writeConfig({ model_profile: 'quality' });
    expect(getConfig(tmpDir, 'model_profile')).toBe('quality');
  });

  it('reads a nested value via dot notation', () => {
    writeConfig({ workflow: { research: false } });
    expect(getConfig(tmpDir, 'workflow.research')).toBe(false);
  });

  it('throws when key does not exist', () => {
    writeConfig({});
    expect(() => getConfig(tmpDir, 'nonexistent.key')).toThrow();
  });

  it('throws when config.json does not exist', () => {
    expect(() => getConfig(tmpDir, 'model_profile')).toThrow();
  });
});

// ─── MODEL_PROFILES ──────────────────────────────────────────────────────────

describe('MODEL_PROFILES', () => {
  const expectedAgents = [
    'planner', 'roadmapper', 'executor',
    'phase-researcher', 'project-researcher', 'research-synthesizer',
    'debugger', 'codebase-mapper', 'verifier', 'plan-checker', 'integration-checker',
  ];

  it('covers all 11 agents', () => {
    for (const agent of expectedAgents) {
      expect(MODEL_PROFILES[agent], `Missing profile for ${agent}`).toBeDefined();
    }
  });

  it('each agent has quality, balanced, and budget tiers', () => {
    for (const [agent, tiers] of Object.entries(MODEL_PROFILES)) {
      expect(tiers.quality, `${agent} missing quality`).toBeDefined();
      expect(tiers.balanced, `${agent} missing balanced`).toBeDefined();
      expect(tiers.budget, `${agent} missing budget`).toBeDefined();
    }
  });
});

// ─── DEFAULT_CONFIG ───────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('exports the default configuration object', () => {
    expect(DEFAULT_CONFIG.model_profile).toBe('balanced');
    expect(DEFAULT_CONFIG.commit_docs).toBe(true);
  });
});

// ─── resolveModelForAgent ─────────────────────────────────────────────────────

describe('resolveModelForAgent', () => {
  it('resolves planner/quality to opus model', () => {
    writeConfig({ model_profile: 'quality' });
    const model = resolveModelForAgent(tmpDir, 'planner');
    expect(model).toBe('anthropic/claude-opus-4');
  });

  it('resolves executor/balanced to sonnet model', () => {
    writeConfig({ model_profile: 'balanced' });
    const model = resolveModelForAgent(tmpDir, 'executor');
    expect(model).toBe('anthropic/claude-sonnet-4');
  });

  it('resolves codebase-mapper/budget to haiku model', () => {
    writeConfig({ model_profile: 'budget' });
    const model = resolveModelForAgent(tmpDir, 'codebase-mapper');
    expect(model).toBe('anthropic/claude-haiku-3.5');
  });

  it('returns sonnet for unknown agents', () => {
    writeConfig({ model_profile: 'balanced' });
    const model = resolveModelForAgent(tmpDir, 'unknown-agent');
    expect(model).toBe('anthropic/claude-sonnet-4');
  });

  it('uses per-agent override when set', () => {
    writeConfig({
      model_profile: 'balanced',
      model_overrides: { planner: 'anthropic/claude-haiku-3.5' },
    });
    const model = resolveModelForAgent(tmpDir, 'planner');
    expect(model).toBe('anthropic/claude-haiku-3.5');
  });

  it('falls back to defaults when no config.json', () => {
    // balanced profile → planner uses opus
    const model = resolveModelForAgent(tmpDir, 'planner');
    expect(model).toBe('anthropic/claude-opus-4');
  });

  it('resolves research-synthesizer/budget to haiku', () => {
    writeConfig({ model_profile: 'budget' });
    const model = resolveModelForAgent(tmpDir, 'research-synthesizer');
    expect(model).toBe('anthropic/claude-haiku-3.5');
  });
});
