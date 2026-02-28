import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';
import type { Diagnostic } from 'vscode-languageserver-types';
import { getLanguageId } from './language-map.js';

export interface LSPClientOptions {
  serverID: string;
  process: ChildProcessWithoutNullStreams;
  root: string;
  initializationOptions?: Record<string, unknown>;
  initTimeout?: number;
  diagnosticsDebounce?: number;
  diagnosticsTimeout?: number;
}

export class LSPClient {
  readonly serverID: string;
  readonly root: string;
  private connection: MessageConnection;
  private process: ChildProcessWithoutNullStreams;
  private diagnosticsMap = new Map<string, Diagnostic[]>();
  private fileVersions = new Map<string, number>();
  private diagnosticsListeners = new Map<string, Array<() => void>>();
  private diagnosticsDebounce: number;
  private diagnosticsTimeout: number;

  private constructor(options: LSPClientOptions, connection: MessageConnection) {
    this.serverID = options.serverID;
    this.root = options.root;
    this.connection = connection;
    this.process = options.process;
    this.diagnosticsDebounce = options.diagnosticsDebounce ?? 150;
    this.diagnosticsTimeout = options.diagnosticsTimeout ?? 3000;
  }

  static async create(options: LSPClientOptions): Promise<LSPClient> {
    const connection = createMessageConnection(
      new StreamMessageReader(options.process.stdout),
      new StreamMessageWriter(options.process.stdin),
    );

    const client = new LSPClient(options, connection);

    // Collect diagnostics from server
    connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
      let filePath: string;
      try {
        filePath = fileURLToPath(params.uri);
      } catch {
        filePath = params.uri;
      }
      client.diagnosticsMap.set(filePath, params.diagnostics);
      const listeners = client.diagnosticsListeners.get(filePath);
      if (listeners) {
        for (const listener of [...listeners]) listener();
      }
    });

    // Handle server-initiated requests
    connection.onRequest('window/workDoneProgress/create', () => null);
    connection.onRequest('workspace/configuration', () =>
      [options.initializationOptions ?? {}],
    );
    connection.onRequest('client/registerCapability', () => null);
    connection.onRequest('client/unregisterCapability', () => null);
    connection.onRequest('workspace/workspaceFolders', () => [
      { name: 'workspace', uri: pathToFileURL(options.root).href },
    ]);

    connection.listen();

    const timeout = options.initTimeout ?? 45_000;
    const initPromise = connection.sendRequest('initialize', {
      rootUri: pathToFileURL(options.root).href,
      processId: options.process.pid ?? null,
      workspaceFolders: [
        { name: 'workspace', uri: pathToFileURL(options.root).href },
      ],
      initializationOptions: options.initializationOptions ?? {},
      capabilities: {
        window: { workDoneProgress: true },
        workspace: {
          configuration: true,
          didChangeWatchedFiles: { dynamicRegistration: true },
        },
        textDocument: {
          synchronization: { didOpen: true, didChange: true },
          publishDiagnostics: { versionSupport: true },
        },
      },
    });

    await Promise.race([
      initPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LSP initialize timeout')), timeout),
      ),
    ]);

    await connection.sendNotification('initialized', {});

    if (options.initializationOptions) {
      await connection.sendNotification('workspace/didChangeConfiguration', {
        settings: options.initializationOptions,
      });
    }

    return client;
  }

  async openFile(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    const text = await fs.readFile(absolutePath, 'utf-8');
    const uri = pathToFileURL(absolutePath).href;
    const languageId = getLanguageId(absolutePath);
    const version = this.fileVersions.get(absolutePath);

    if (version !== undefined) {
      // Already open — send didChange
      const next = version + 1;
      this.fileVersions.set(absolutePath, next);
      await this.connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: next },
        contentChanges: [{ text }],
      });
    } else {
      // First open
      this.diagnosticsMap.delete(absolutePath);
      await this.connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 0, text },
      });
      this.fileVersions.set(absolutePath, 0);
    }
  }

  getDiagnostics(filePath: string): Diagnostic[] {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    return this.diagnosticsMap.get(absolutePath) ?? [];
  }

  getAllDiagnostics(): Map<string, Diagnostic[]> {
    return new Map(this.diagnosticsMap);
  }

  waitForDiagnostics(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);

    return new Promise<void>((resolve) => {
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        clearTimeout(overallTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        const listeners = this.diagnosticsListeners.get(absolutePath);
        if (listeners) {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
          if (listeners.length === 0) this.diagnosticsListeners.delete(absolutePath);
        }
      };

      const listener = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, this.diagnosticsDebounce);
      };

      const overallTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, this.diagnosticsTimeout);

      if (!this.diagnosticsListeners.has(absolutePath)) {
        this.diagnosticsListeners.set(absolutePath, []);
      }
      this.diagnosticsListeners.get(absolutePath)!.push(listener);
    });
  }

  async definition(file: string, line: number, character: number): Promise<any[]> {
    return this.sendPositionRequest('textDocument/definition', file, line, character);
  }

  async references(file: string, line: number, character: number): Promise<any[]> {
    return this.connection
      .sendRequest('textDocument/references', {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
        context: { includeDeclaration: true },
      })
      .then((r: any) => (Array.isArray(r) ? r : r ? [r] : []))
      .catch(() => []);
  }

  async hover(file: string, line: number, character: number): Promise<any> {
    return this.connection
      .sendRequest('textDocument/hover', {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      })
      .catch(() => null);
  }

  async documentSymbol(uri: string): Promise<any[]> {
    return this.connection
      .sendRequest('textDocument/documentSymbol', {
        textDocument: { uri },
      })
      .then((r: any) => (Array.isArray(r) ? r : []))
      .catch(() => []);
  }

  async workspaceSymbol(query: string): Promise<any[]> {
    return this.connection
      .sendRequest('workspace/symbol', { query })
      .then((r: any) => (Array.isArray(r) ? r : []))
      .catch(() => []);
  }

  async implementation(file: string, line: number, character: number): Promise<any[]> {
    return this.sendPositionRequest('textDocument/implementation', file, line, character);
  }

  async prepareCallHierarchy(file: string, line: number, character: number): Promise<any[]> {
    return this.sendPositionRequest('textDocument/prepareCallHierarchy', file, line, character);
  }

  async incomingCalls(file: string, line: number, character: number): Promise<any[]> {
    const items = await this.prepareCallHierarchy(file, line, character);
    if (!items.length) return [];
    return this.connection
      .sendRequest('callHierarchy/incomingCalls', { item: items[0] })
      .then((r: any) => (Array.isArray(r) ? r : []))
      .catch(() => []);
  }

  async outgoingCalls(file: string, line: number, character: number): Promise<any[]> {
    const items = await this.prepareCallHierarchy(file, line, character);
    if (!items.length) return [];
    return this.connection
      .sendRequest('callHierarchy/outgoingCalls', { item: items[0] })
      .then((r: any) => (Array.isArray(r) ? r : []))
      .catch(() => []);
  }

  async shutdown(): Promise<void> {
    try {
      this.connection.end();
      this.connection.dispose();
    } catch {
      // ignore disposal errors
    }
    this.process.kill();
  }

  private async sendPositionRequest(
    method: string,
    file: string,
    line: number,
    character: number,
  ): Promise<any[]> {
    return this.connection
      .sendRequest(method, {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      })
      .then((r: any) => (Array.isArray(r) ? r : r ? [r] : []))
      .catch(() => []);
  }
}
