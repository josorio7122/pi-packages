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

// Shared mock manager instance — tests configure it per-scenario
const mockManager = {
  hasClients: vi.fn(),
  touchFile: vi.fn(),
  getDiagnostics: vi.fn(),
  getAllDiagnostics: vi.fn(),
  shutdownAll: vi.fn(),
  status: vi.fn(),
};

// Shared config mock return value — tests override per-scenario
let mockConfig = {
  enabled: true,
  diagnosticsEnabled: true,
  autoDownload: false,
  initTimeout: 100,
  diagnosticsTimeout: 100,
  diagnosticsDebounce: 0,
  maxDiagnosticsPerFile: 20,
  maxCrossFileDiagnostics: 5,
  servers: 'auto',
  serversDir: '/tmp/fake',
};

// ── Module mocks (hoisted by vitest) ──────────────────────────────────────

vi.mock('./server-manager.js', () => {
  // Use a real class so `new ServerManager(...)` works
  class MockServerManager {
    hasClients(...args: any[]) { return mockManager.hasClients(...args); }
    touchFile(...args: any[]) { return mockManager.touchFile(...args); }
    getDiagnostics(...args: any[]) { return mockManager.getDiagnostics(...args); }
    getAllDiagnostics(...args: any[]) { return mockManager.getAllDiagnostics(...args); }
    shutdownAll(...args: any[]) { return mockManager.shutdownAll(...args); }
    status(...args: any[]) { return mockManager.status(...args); }
  }
  return { ServerManager: MockServerManager };
});

vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

// Import the extension factory ONCE (mocks are already in place)
const { default: extensionFactory } = await import('./index.js');

// Build a minimal fake ExtensionAPI and extract the tool_result handler
function buildHandler(cfg: typeof mockConfig) {
  mockConfig = cfg;
  const handlers: Record<string, (event: any, ctx: any) => Promise<any>> = {};
  const pi = {
    on: vi.fn((event: string, handler: any) => { handlers[event] = handler; }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  };
  extensionFactory(pi as any);
  return handlers['tool_result'];
}

describe('index.ts tool_result handler — cross-file diagnostics', () => {
  beforeEach(() => {
    mockManager.hasClients.mockResolvedValue(true);
    mockManager.touchFile.mockResolvedValue(undefined);
    mockManager.getDiagnostics.mockReturnValue([]);
    mockManager.getAllDiagnostics.mockReturnValue(new Map());
    mockManager.shutdownAll.mockResolvedValue(undefined);
    mockManager.status.mockReturnValue([]);
    mockConfig = {
      enabled: true,
      diagnosticsEnabled: true,
      autoDownload: false,
      initTimeout: 100,
      diagnosticsTimeout: 100,
      diagnosticsDebounce: 0,
      maxDiagnosticsPerFile: 20,
      maxCrossFileDiagnostics: 5,
      servers: 'auto',
      serversDir: '/tmp/fake',
    };
  });

  it('appends cross-file diagnostics on write when other files have errors', async () => {
    const otherFile = '/project/other.ts';
    mockManager.getAllDiagnostics.mockReturnValue(new Map([[otherFile, [makeError('Other file error')]]]));

    const handler = buildHandler(mockConfig);
    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    expect(text).toContain('LSP errors detected in other files');
    expect(text).toContain('Other file error');
    expect(text).toContain(otherFile);
  });

  it('does NOT append cross-file diagnostics on edit', async () => {
    const otherFile = '/project/other.ts';
    mockManager.getAllDiagnostics.mockReturnValue(new Map([[otherFile, [makeError('Other file error')]]]));

    const handler = buildHandler(mockConfig);
    const event = {
      toolName: 'edit',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    // With no own errors and edit tool, result is undefined
    if (result) {
      const text = result.content[0].text as string;
      expect(text).not.toContain('LSP errors detected in other files');
    }
  });

  it('skips the written file itself when reporting cross-file diagnostics', async () => {
    const writtenFile = '/project/foo.ts';
    mockManager.getDiagnostics.mockReturnValue([]);
    mockManager.getAllDiagnostics.mockReturnValue(new Map([
      [writtenFile, [makeError('Own error')]],
      ['/project/other.ts', [makeError('Other error')]],
    ]));

    const handler = buildHandler(mockConfig);
    const event = {
      toolName: 'write',
      input: { path: writtenFile },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    expect(text).toContain('Other error');
    expect(text).not.toContain('Own error');
  });

  it('respects maxCrossFileDiagnostics=0 (disables cross-file)', async () => {
    mockManager.getAllDiagnostics.mockReturnValue(new Map([
      ['/project/a.ts', [makeError('Error A')]],
      ['/project/b.ts', [makeError('Error B')]],
    ]));

    const handler = buildHandler({ ...mockConfig, maxCrossFileDiagnostics: 0 });
    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    if (result) {
      const text = result.content[0].text as string;
      expect(text).not.toContain('LSP errors detected in other files');
    }
  });

  it('caps cross-file output at maxCrossFileDiagnostics', async () => {
    mockManager.getAllDiagnostics.mockReturnValue(new Map([
      ['/project/a.ts', [makeError('Error A')]],
      ['/project/b.ts', [makeError('Error B')]],
      ['/project/c.ts', [makeError('Error C')]],
    ]));

    const handler = buildHandler({ ...mockConfig, maxCrossFileDiagnostics: 2 });
    const event = {
      toolName: 'write',
      input: { path: '/project/foo.ts' },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    const crossFileSections = (text.match(/LSP errors detected in other files/g) ?? []).length;
    expect(crossFileSections).toBe(2);
  });

  it('shows both own-file and cross-file diagnostics on write', async () => {
    const writtenFile = '/project/foo.ts';
    mockManager.getDiagnostics.mockReturnValue([makeError('Own error')]);
    mockManager.getAllDiagnostics.mockReturnValue(new Map([
      ['/project/other.ts', [makeError('Other error')]],
    ]));

    const handler = buildHandler(mockConfig);
    const event = {
      toolName: 'write',
      input: { path: writtenFile },
      isError: false,
      content: [{ type: 'text', text: 'OK' }],
    };

    const result = await handler(event, {} as any);
    expect(result).toBeDefined();
    const text = result!.content[0].text as string;
    expect(text).toContain('LSP errors detected in this file');
    expect(text).toContain('Own error');
    expect(text).toContain('LSP errors detected in other files');
    expect(text).toContain('Other error');
  });
});
