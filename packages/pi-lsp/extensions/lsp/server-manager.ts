import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Diagnostic } from 'vscode-languageserver-types';
import { LSPClient } from './client.js';
import { findBinary, installServer } from './installer.js';
import { getServersForExtension, type ServerInfo } from './server-registry.js';
import type { LSPConfig } from './config.js';

export interface ServerStatus {
  id: string;
  root: string;
  status: 'connected' | 'error';
}

export class ServerManager {
  private clients: LSPClient[] = [];
  private broken = new Set<string>();
  private spawning = new Map<string, Promise<LSPClient | undefined>>();
  private config: LSPConfig;
  private projectRoot: string;
  private customServers?: ServerInfo[];

  constructor(config: LSPConfig, projectRoot: string, customServers?: ServerInfo[]) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.customServers = customServers;
  }

  private getServersForFile(filePath: string): ServerInfo[] {
    const ext = path.extname(filePath) || path.basename(filePath);
    if (this.customServers) {
      return this.customServers.filter(s => s.extensions.includes(ext));
    }
    // Filter by config.servers if not "auto"
    let servers = getServersForExtension(ext);
    if (this.config.servers !== 'auto') {
      const allowed = this.config.servers.split(',').map(s => s.trim());
      servers = servers.filter(s => allowed.includes(s.id));
    }
    return servers;
  }

  async getClients(filePath: string): Promise<LSPClient[]> {
    const servers = this.getServersForFile(filePath);
    const result: LSPClient[] = [];

    for (const server of servers) {
      const root = await server.root(filePath, this.projectRoot);
      if (!root) continue;

      const key = root + server.id;
      if (this.broken.has(key)) continue;

      // Check existing client
      const existing = this.clients.find(c => c.root === root && c.serverID === server.id);
      if (existing) {
        result.push(existing);
        continue;
      }

      // Check in-flight spawn
      const inflight = this.spawning.get(key);
      if (inflight) {
        const client = await inflight;
        if (client) result.push(client);
        continue;
      }

      // Spawn new
      const task = this.spawnClient(server, root, key);
      this.spawning.set(key, task);
      task.finally(() => {
        if (this.spawning.get(key) === task) {
          this.spawning.delete(key);
        }
      });

      const client = await task;
      if (client) result.push(client);
    }

    return result;
  }

  private async spawnClient(server: ServerInfo, root: string, key: string): Promise<LSPClient | undefined> {
    try {
      // Find or install binary
      let binary = await findBinary(server.command, this.config.serversDir, server.id);
      if (!binary && this.config.autoDownload) {
        binary = await installServer(server, this.config.serversDir);
      }
      if (!binary) {
        // For custom servers (tests), the command might be the binary itself (e.g. 'node')
        binary = server.command;
      }

      const proc = spawn(binary, server.args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });

      const initOptions = server.initializationOptions
        ? await server.initializationOptions(root)
        : undefined;

      const client = await LSPClient.create({
        serverID: server.id,
        process: proc as any,
        root,
        initializationOptions: initOptions,
        initTimeout: this.config.initTimeout,
        diagnosticsDebounce: this.config.diagnosticsDebounce,
        diagnosticsTimeout: this.config.diagnosticsTimeout,
      });

      this.clients.push(client);
      return client;
    } catch (err) {
      this.broken.add(key);
      return undefined;
    }
  }

  async touchFile(filePath: string, waitForDiagnostics?: boolean): Promise<void> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    const clients = await this.getClients(absolutePath);
    await Promise.all(
      clients.map(async (client) => {
        if (waitForDiagnostics) {
          const wait = client.waitForDiagnostics(absolutePath);
          await client.openFile(absolutePath);
          return wait;
        } else {
          await client.openFile(absolutePath);
        }
      }),
    ).catch(() => {});
  }

  getDiagnostics(filePath: string): Diagnostic[] {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    const results: Diagnostic[] = [];
    for (const client of this.clients) {
      results.push(...client.getDiagnostics(absolutePath));
    }
    return results;
  }

  getAllDiagnostics(): Map<string, Diagnostic[]> {
    const results = new Map<string, Diagnostic[]>();
    for (const client of this.clients) {
      for (const [filePath, diags] of client.getAllDiagnostics()) {
        const existing = results.get(filePath) ?? [];
        existing.push(...diags);
        results.set(filePath, existing);
      }
    }
    return results;
  }

  async hasClients(filePath: string): Promise<boolean> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    const servers = this.getServersForFile(absolutePath);
    for (const server of servers) {
      const root = await server.root(absolutePath, this.projectRoot);
      if (!root) continue;
      if (this.broken.has(root + server.id)) continue;
      return true;
    }
    return false;
  }

  // LSP operations — delegate to matching clients
  private async run<T>(file: string, fn: (client: LSPClient) => Promise<T>): Promise<T[]> {
    const clients = await this.getClients(file);
    return Promise.all(clients.map(fn));
  }

  async definition(file: string, line: number, char: number) {
    return this.run(file, c => c.definition(file, line, char)).then(r => r.flat());
  }

  async references(file: string, line: number, char: number) {
    return this.run(file, c => c.references(file, line, char)).then(r => r.flat());
  }

  async hover(file: string, line: number, char: number) {
    return this.run(file, c => c.hover(file, line, char)).then(r => r.flat().filter(Boolean));
  }

  async documentSymbol(uri: string) {
    const file = uri.startsWith('file://') ? new URL(uri).pathname : uri;
    return this.run(file, c => c.documentSymbol(uri)).then(r => r.flat());
  }

  async workspaceSymbol(query: string) {
    return Promise.all(this.clients.map(c => c.workspaceSymbol(query))).then(r => r.flat());
  }

  async implementation(file: string, line: number, char: number) {
    return this.run(file, c => c.implementation(file, line, char)).then(r => r.flat());
  }

  async prepareCallHierarchy(file: string, line: number, char: number) {
    return this.run(file, c => c.prepareCallHierarchy(file, line, char)).then(r => r.flat());
  }

  async incomingCalls(file: string, line: number, char: number) {
    return this.run(file, c => c.incomingCalls(file, line, char)).then(r => r.flat());
  }

  async outgoingCalls(file: string, line: number, char: number) {
    return this.run(file, c => c.outgoingCalls(file, line, char)).then(r => r.flat());
  }

  status(): ServerStatus[] {
    return this.clients.map(c => ({
      id: c.serverID,
      root: c.root,
      status: 'connected' as const,
    }));
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(this.clients.map(c => c.shutdown().catch(() => {})));
    this.clients = [];
    this.broken.clear();
    this.spawning.clear();
  }
}
