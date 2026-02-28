import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ServerManager } from './server-manager.js';
import type { LSPConfig } from './config.js';
import type { ServerInfo } from './server-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockServerPath = path.join(__dirname, 'test-helpers', 'mock-lsp-server.mjs');

const mockServerInfo: ServerInfo = {
  id: 'mock-typescript',
  extensions: ['.ts', '.tsx'],
  root: async (_file, projectRoot) => projectRoot,
  command: 'node',
  args: [mockServerPath],
};

function makeConfig(overrides: Partial<LSPConfig> = {}): LSPConfig {
  return {
    enabled: true,
    diagnosticsEnabled: true,
    autoDownload: false,
    initTimeout: 5000,
    diagnosticsTimeout: 1000,
    diagnosticsDebounce: 50,
    maxDiagnosticsPerFile: 20,
    servers: 'auto',
    serversDir: '/tmp/lsp-servers-test',
    ...overrides,
  };
}

describe('ServerManager', () => {
  let tmpDir: string;
  let manager: ServerManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-sm-test-'));
    manager = new ServerManager(makeConfig(), tmpDir, [mockServerInfo]);
  });

  afterEach(async () => {
    await manager.shutdownAll();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Test 1: touchFile spawns a server and opens the file ─────────────────

  it('touchFile spawns a server and opens the file', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);

    const status = manager.status();
    expect(status).toHaveLength(1);
    expect(status[0].id).toBe('mock-typescript');
    expect(status[0].status).toBe('connected');
  });

  // ─── Test 2: touchFile on the same file reuses the existing client ─────────

  it('touchFile on the same file reuses the existing client', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);
    await manager.touchFile(testFile);

    // Only one client should have been spawned
    const status = manager.status();
    expect(status).toHaveLength(1);
  });

  // ─── Test 3: getDiagnostics returns diagnostics after touchFile ────────────

  it('getDiagnostics returns diagnostics after touchFile', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    // Touch with waitForDiagnostics
    await manager.touchFile(testFile, true);

    const diags = manager.getDiagnostics(testFile);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe('Test error from mock server');
  });

  // ─── Test 4: hasClients returns true for known extensions ─────────────────

  it('hasClients returns true for .ts files (known extension)', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    const result = await manager.hasClients(testFile);
    expect(result).toBe(true);
  });

  it('hasClients returns false for unknown extensions', async () => {
    const testFile = path.join(tmpDir, 'foo.py');
    const result = await manager.hasClients(testFile);
    expect(result).toBe(false);
  });

  // ─── Test 5: definition delegates to the correct client ───────────────────

  it('definition delegates to the correct client', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);
    const results = await manager.definition(testFile, 0, 0);

    expect(results).toHaveLength(1);
    expect(results[0].range.start.line).toBe(10);
  });

  // ─── Test 6: references delegates to the correct client ───────────────────

  it('references delegates to the correct client', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);
    const results = await manager.references(testFile, 0, 0);

    expect(results).toHaveLength(1);
    expect(results[0].range.start.line).toBe(5);
  });

  // ─── Test 7: hover delegates to the correct client ────────────────────────

  it('hover delegates to the correct client', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);
    const results = await manager.hover(testFile, 0, 0);

    expect(results).toHaveLength(1);
    expect((results[0] as any).contents.value).toBe('function test(): void');
  });

  // ─── Test 8: shutdownAll kills all servers ─────────────────────────────────

  it('shutdownAll kills all servers', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);
    expect(manager.status()).toHaveLength(1);

    await manager.shutdownAll();
    expect(manager.status()).toHaveLength(0);
  });

  // ─── Test 9: status returns running servers ────────────────────────────────

  it('status returns running servers with id and root', async () => {
    const testFile = path.join(tmpDir, 'foo.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    await manager.touchFile(testFile);

    const status = manager.status();
    expect(status).toHaveLength(1);
    expect(status[0].id).toBe('mock-typescript');
    expect(status[0].root).toBe(tmpDir);
    expect(status[0].status).toBe('connected');
  });
});
