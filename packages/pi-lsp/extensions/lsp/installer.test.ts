import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Mock child_process so we control execFile behavior in all tests
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { findBinary, getInstallDir, installServer } from './installer.js';

// Helper: configure the execFile mock to reject all `which` calls (binary not on PATH)
function mockWhichNotFound() {
  vi.mocked(execFile).mockImplementation((...args: Parameters<typeof execFile>) => {
    const cb = args[args.length - 1] as (err: Error | null) => void;
    cb(new Error('not found'));
    return undefined as ReturnType<typeof execFile>;
  });
}

describe('getInstallDir', () => {
  it('returns serversDir/serverId path', () => {
    expect(getInstallDir('/base/lsp-servers', 'typescript')).toBe('/base/lsp-servers/typescript');
  });

  it('returns serversDir/serverId for pyright', () => {
    expect(getInstallDir('/base/lsp-servers', 'pyright')).toBe('/base/lsp-servers/pyright');
  });
});

describe('findBinary', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-test-'));
    // which always fails → fall back to filesystem checks
    mockWhichNotFound();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('returns undefined when binary does not exist in serversDir', async () => {
    const result = await findBinary('nonexistent-binary', tmpDir, 'some-server');
    expect(result).toBeUndefined();
  });

  it('finds binary in serversDir/serverId/node_modules/.bin/', async () => {
    const binDir = path.join(tmpDir, 'typescript', 'node_modules', '.bin');
    await fs.mkdir(binDir, { recursive: true });
    const binPath = path.join(binDir, 'typescript-language-server');
    await fs.writeFile(binPath, '#!/bin/sh\necho hi', { mode: 0o755 });

    const result = await findBinary('typescript-language-server', tmpDir, 'typescript');
    expect(result).toBe(binPath);
  });

  it('finds gem-installed binary directly in serversDir', async () => {
    const binPath = path.join(tmpDir, 'rubocop');
    await fs.writeFile(binPath, '#!/bin/sh\necho hi', { mode: 0o755 });

    const result = await findBinary('rubocop', tmpDir, 'ruby');
    expect(result).toBe(binPath);
  });
});

describe('installServer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-install-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('returns undefined when server has no npmPackage or gemPackage', async () => {
    const server = { id: 'test', extensions: [], root: async () => '/tmp', command: 'test', args: [] };
    const result = await installServer(server, tmpDir);
    expect(result).toBeUndefined();
  });

  it('dispatches to gem installer when gemPackage is set', async () => {
    // Mock: which gem succeeds, gem install succeeds
    vi.mocked(execFile).mockImplementation((...args: Parameters<typeof execFile>) => {
      const cb = args[args.length - 1] as (err: Error | null, result?: { stdout: string }) => void;
      const cmd = args[0] as string;
      const cmdArgs = args[1] as string[];
      if (cmd === 'which' && cmdArgs?.[0] === 'gem') {
        cb(null, { stdout: '/usr/bin/gem\n' });
      } else if (cmd === 'gem' && cmdArgs?.[0] === 'install') {
        cb(null, { stdout: '' });
      } else {
        cb(new Error(`Unexpected: ${cmd}`));
      }
      return undefined as ReturnType<typeof execFile>;
    });

    // Place the binary so access check succeeds after gem install
    const binPath = path.join(tmpDir, 'rubocop');
    await fs.writeFile(binPath, '#!/bin/sh\necho hi', { mode: 0o755 });

    const progress: string[] = [];
    const server = {
      id: 'ruby',
      extensions: ['.rb'],
      root: async () => '/tmp',
      command: 'rubocop',
      args: ['--lsp'],
      gemPackage: 'rubocop',
    };
    const result = await installServer(server, tmpDir, (msg) => progress.push(msg));
    expect(result).toBe(binPath);
    expect(progress.some((m) => m.includes('rubocop'))).toBe(true);
  });

  it('returns undefined and reports Ruby gem not installed when gem is unavailable', async () => {
    // Mock: which gem fails
    vi.mocked(execFile).mockImplementation((...args: Parameters<typeof execFile>) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(new Error('not found'));
      return undefined as ReturnType<typeof execFile>;
    });

    const progress: string[] = [];
    const server = {
      id: 'ruby',
      extensions: ['.rb'],
      root: async () => '/tmp',
      command: 'rubocop',
      args: ['--lsp'],
      gemPackage: 'rubocop',
    };
    const result = await installServer(server, tmpDir, (msg) => progress.push(msg));
    expect(result).toBeUndefined();
    expect(progress.some((m) => m.includes('Ruby gem is not installed'))).toBe(true);
  });
});
