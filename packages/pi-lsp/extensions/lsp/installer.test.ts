import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { findBinary, getInstallDir } from './installer.js';

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
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
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

  it('finds go binary directly in serversDir', async () => {
    const binPath = path.join(tmpDir, 'gopls');
    await fs.writeFile(binPath, '#!/bin/sh\necho hi', { mode: 0o755 });

    const result = await findBinary('gopls', tmpDir, 'gopls');
    expect(result).toBe(binPath);
  });
});
