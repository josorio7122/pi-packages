import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeError(msg: string): Diagnostic {
  return {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    message: msg,
    severity: 1,
  };
}

// Build a minimal fake ExtensionAPI that captures handlers
function makeFakePI() {
  const handlers: Record<string, (event: any) => Promise<any>> = {};
  const pi = {
    on: vi.fn((event: string, handler: any) => { handlers[event] = handler; }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  };
  return { pi, handlers };
}

// Build a fake ServerManager
function makeManager(opts: {
  hasClients?: boolean;
  ownDiags?: Diagnostic[];
  allDiags?: Map<string, Diagnostic[]>;
}) {
  return {
    hasClients: vi.fn().mockResolvedValue(opts.hasClients ?? true),
    touchFile: vi.fn().mockResolvedValue(undefined),
    getDiagnostics: vi.fn().mockReturnValue(opts.ownDiags ?? []),
    getAllDiagnostics: vi.fn().mockReturnValue(opts.allDiags ?? new Map()),
    shutdownAll: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue([]),
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

// We need to mock the heavy dependencies so tests run without real LSP infra
vi.mock('./server-manager.js', () => ({
  ServerManager: vi.fn(),
}));

vi.mock('./config.js', () => ({
  loadConfig: vi.fn(),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('index.ts tool_result handler — cross-file diagnostics', () => {
  let ServerManagerMock: any;
  let loadConfigMock: any;

  beforeEach(async () => {
    vi.resetModules();
    const sm = await import('./server-manager.js');
    ServerManagerMock = (sm as any).ServerManager;
    const cfg = await import('./config.js');
    loadConfigMock = (cfg as any).loadConfig;
  });

  async function setup(opts: {
    maxCrossFileDiagnostics?: number;
    ownDiags?: Diagnostic[];
    allDiags?: Map<string, Diagnostic[]>;
    hasClients?: boolean;
  }) {
    const manager = makeManager({
      hasClients: opts.hasClients,
      ownDiags: opts.ownDiags ?? [],
      allDiags: opts.allDiags ?? new Map(),
    });
    ServerManagerMock.mockReturnValue(manager);
    loadConfigMock.mockReturnValue({
      enabled: true,
      diagnosticsEnabled: true,
      autoDownload: false,
      initTimeout: 100,
      diagnosticsTimeout: 100,
      diagnosticsDebounce: 0,
      maxDiagnosticsPerFile: 20,
      maxCrossFileDiagnostics: opts.maxCrossFileDiagnostics ?? 5,
      servers: 'auto',
      serversDir: '/tmp/fake',
    });

    const { pi, handlers } = makeFakePI();
    const { default: extensionFactory } = await import('./index.js');
    extensionFactory(pi as any);

    return { manager, handlers };
  }

  it('appends cross-file diagnostics on write when other files have errors', async () => {
    const otherFile = '/project/other.ts';
    const allDiags = new Map([[otherFile, [makeError('Other file error')]]]);

    const { handlers } = await setup({ allDiags });

    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    expect(text).toContain('LSP errors detected in other files');
    expect(text).toContain('Other file error');
    expect(text).toContain(otherFile);
  });

  it('does NOT append cross-file diagnostics on edit', async () => {
    const otherFile = '/project/other.ts';
    const allDiags = new Map([[otherFile, [makeError('Other file error')]]]);

    const { handlers } = await setup({ allDiags });

    const event = {
      toolName: 'edit',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    // For edit with no own errors, result should be undefined (no diagnostics added)
    // OR if own errors, only shows 'in this file' not 'in other files'
    if (result) {
      const text = result.content[0].text as string;
      expect(text).not.toContain('LSP errors detected in other files');
    }
  });

  it('skips the written file itself when reporting cross-file diagnostics', async () => {
    const writtenFile = '/project/foo.ts';
    const allDiags = new Map([
      [writtenFile, [makeError('Own error')]],
      ['/project/other.ts', [makeError('Other error')]],
    ]);

    const { handlers } = await setup({ ownDiags: [], allDiags });

    const event = {
      toolName: 'write',
      input: { path: writtenFile },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    // Should NOT include own file in cross-file section
    expect(text).toContain('Other error');
    expect(text).not.toContain('Own error');
  });

  it('respects maxCrossFileDiagnostics=0 (disables cross-file)', async () => {
    const allDiags = new Map([
      ['/project/a.ts', [makeError('Error A')]],
      ['/project/b.ts', [makeError('Error B')]],
    ]);

    const { handlers } = await setup({ maxCrossFileDiagnostics: 0, allDiags });

    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    if (result) {
      const text = result.content[0].text as string;
      expect(text).not.toContain('LSP errors detected in other files');
    }
  });

  it('caps cross-file output at maxCrossFileDiagnostics', async () => {
    const allDiags = new Map([
      ['/project/a.ts', [makeError('Error A')]],
      ['/project/b.ts', [makeError('Error B')]],
      ['/project/c.ts', [makeError('Error C')]],
    ]);

    const { handlers } = await setup({ maxCrossFileDiagnostics: 2, allDiags });

    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    // Only 2 of 3 other files should appear
    const crossFileSections = (text.match(/LSP errors detected in other files/g) ?? []).length;
    expect(crossFileSections).toBe(2);
  });

  it('shows both own-file and cross-file diagnostics on write', async () => {
    const writtenFile = '/project/foo.ts';
    const allDiags = new Map([
      ['/project/other.ts', [makeError('Other error')]],
    ]);

    const { handlers } = await setup({
      ownDiags: [makeError('Own error')],
      allDiags,
    });

    const event = {
      toolName: 'write',
      input: { path: writtenFile },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handlers['tool_result'](event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    expect(text).toContain('LSP errors detected in this file');
    expect(text).toContain('Own error');
    expect(text).toContain('LSP errors detected in other files');
    expect(text).toContain('Other error');
  });
});
