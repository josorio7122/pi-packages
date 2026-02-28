import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { LSPClient } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockServerPath = path.join(__dirname, 'test-helpers', 'mock-lsp-server.mjs');

const SHORT_OPTS = {
  diagnosticsDebounce: 50,
  diagnosticsTimeout: 500,
  initTimeout: 5000,
};

function spawnMockServer() {
  return spawn('node', [mockServerPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// ─── Test 1: create() initializes successfully ───────────────────────────────

describe('LSPClient.create()', () => {
  let client: LSPClient;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-test-'));
    const proc = spawnMockServer();
    client = await LSPClient.create({
      serverID: 'mock',
      process: proc as any,
      root: tmpDir,
      ...SHORT_OPTS,
    });
  });

  afterAll(async () => {
    await client.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes connection with mock server', () => {
    expect(client).toBeDefined();
    expect(client.serverID).toBe('mock');
    expect(client.root).toBe(tmpDir);
  });
});

// ─── Test 2–6: openFile() and diagnostics ────────────────────────────────────

describe('LSPClient diagnostics', () => {
  let client: LSPClient;
  let tmpDir: string;
  let testFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-test-'));
    testFile = path.join(tmpDir, 'test.ts');
    await fs.writeFile(testFile, 'const x = 1;\n');

    const proc = spawnMockServer();
    client = await LSPClient.create({
      serverID: 'mock',
      process: proc as any,
      root: tmpDir,
      ...SHORT_OPTS,
    });
  });

  afterAll(async () => {
    await client.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('openFile() triggers textDocument/didOpen and diagnostics arrive', async () => {
    const waitPromise = client.waitForDiagnostics(testFile);
    await client.openFile(testFile);
    await waitPromise;
    const diags = client.getDiagnostics(testFile);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe('Test error from mock server');
    expect(diags[0].severity).toBe(1);
  });

  it('openFile() on same file triggers textDocument/didChange (version incremented)', async () => {
    const waitPromise = client.waitForDiagnostics(testFile);
    await client.openFile(testFile);
    await waitPromise;
    const diags = client.getDiagnostics(testFile);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe('Updated error from mock server');
  });

  it('getDiagnostics() returns diagnostics from mock server', () => {
    const diags = client.getDiagnostics(testFile);
    expect(Array.isArray(diags)).toBe(true);
    expect(diags.length).toBeGreaterThan(0);
  });

  it('getDiagnostics() returns empty array for unknown files', () => {
    const diags = client.getDiagnostics('/nonexistent/file.ts');
    expect(diags).toEqual([]);
  });

  it('waitForDiagnostics() resolves when diagnostics arrive', async () => {
    const anotherFile = path.join(tmpDir, 'another.ts');
    await fs.writeFile(anotherFile, 'const y = 2;\n');

    const waitPromise = client.waitForDiagnostics(anotherFile);
    await client.openFile(anotherFile);
    await waitPromise;

    const diags = client.getDiagnostics(anotherFile);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe('Test error from mock server');
  });
});

// ─── Test 7–11: LSP request methods ──────────────────────────────────────────

describe('LSPClient LSP requests', () => {
  let client: LSPClient;
  let tmpDir: string;
  let testFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-test-'));
    testFile = path.join(tmpDir, 'test.ts');
    await fs.writeFile(testFile, 'function test() {}\n');

    const proc = spawnMockServer();
    client = await LSPClient.create({
      serverID: 'mock',
      process: proc as any,
      root: tmpDir,
      ...SHORT_OPTS,
    });

    // Open file so it's registered
    const waitPromise = client.waitForDiagnostics(testFile);
    await client.openFile(testFile);
    await waitPromise;
  });

  afterAll(async () => {
    await client.shutdown();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('definition() returns locations from mock server', async () => {
    const locs = await client.definition(testFile, 0, 0);
    expect(Array.isArray(locs)).toBe(true);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs[0].range.start.line).toBe(10);
  });

  it('references() returns locations from mock server', async () => {
    const locs = await client.references(testFile, 0, 0);
    expect(Array.isArray(locs)).toBe(true);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs[0].range.start.line).toBe(5);
  });

  it('hover() returns hover info from mock server', async () => {
    const hover = await client.hover(testFile, 0, 0);
    expect(hover).toBeDefined();
    expect(hover.contents.value).toBe('function test(): void');
  });

  it('documentSymbol() returns symbols from mock server', async () => {
    const uri = pathToFileURL(testFile).href;
    const symbols = await client.documentSymbol(uri);
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols[0].name).toBe('testFunction');
  });

  it('workspaceSymbol() returns symbols from mock server', async () => {
    const symbols = await client.workspaceSymbol('Test');
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols[0].name).toBe('TestClass');
  });
});

// ─── Test 12: shutdown ────────────────────────────────────────────────────────

describe('LSPClient.shutdown()', () => {
  it('cleanly closes connection', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-test-'));
    const proc = spawnMockServer();
    const client = await LSPClient.create({
      serverID: 'mock',
      process: proc as any,
      root: tmpDir,
      ...SHORT_OPTS,
    });

    await expect(client.shutdown()).resolves.toBeUndefined();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
