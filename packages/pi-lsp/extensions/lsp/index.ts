import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { ServerManager } from './server-manager.js';
import { lspToolDefinition, type LSPOperation } from './tools.js';
import { filterErrors, formatDiagnosticsXml } from './diagnostics.js';

export default function (pi: ExtensionAPI): void {
  const config = loadConfig();

  if (!config.enabled) return;

  const projectRoot = process.cwd();
  const manager = new ServerManager(config, projectRoot);

  // 1. Register LSP tool
  pi.registerTool({
    ...lspToolDefinition,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const file = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.resolve(ctx.cwd, params.filePath);

      // Check file exists
      try {
        await fs.access(file);
      } catch {
        return {
          content: [{ type: 'text', text: `File not found: ${file}` }],
          details: { error: `File not found: ${file}` },
          isError: true,
        };
      }

      // Check if LSP server available
      const hasServer = await manager.hasClients(file);
      if (!hasServer) {
        return {
          content: [{ type: 'text', text: 'No LSP server available for this file type.' }],
          details: { error: 'No LSP server available for this file type.' },
          isError: true,
        };
      }

      // Touch file to sync with server
      await manager.touchFile(file, true);

      // Convert 1-based to 0-based
      const line = params.line - 1;
      const character = params.character - 1;
      const operation = params.operation as LSPOperation;

      const result: unknown[] = await (async () => {
        switch (operation) {
          case 'goToDefinition': return manager.definition(file, line, character);
          case 'findReferences': return manager.references(file, line, character);
          case 'hover': return manager.hover(file, line, character);
          case 'documentSymbol': return manager.documentSymbol(pathToFileURL(file).href);
          case 'workspaceSymbol': return manager.workspaceSymbol(params.query ?? '');
          case 'goToImplementation': return manager.implementation(file, line, character);
          case 'prepareCallHierarchy': return manager.prepareCallHierarchy(file, line, character);
          case 'incomingCalls': return manager.incomingCalls(file, line, character);
          case 'outgoingCalls': return manager.outgoingCalls(file, line, character);
        }
      })();

      const relPath = path.relative(projectRoot, file);
      const title = `${operation} ${relPath}:${params.line}:${params.character}`;

      const output = result.length === 0
        ? `No results found for ${operation}`
        : JSON.stringify(result, null, 2);

      return {
        content: [{ type: 'text', text: output }],
        details: { title, result },
      };
    },
  });

  // 2. Pre-heat LSP on read (non-blocking, no diagnostics)
  pi.on('tool_result', async (event) => {
    if (event.toolName !== 'read') return;
    const filePath = (event.input as any)?.path;
    if (!filePath || event.isError) return;
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath);
    manager.touchFile(abs, false).catch(() => {}); // fire-and-forget
  });

  // 3. Intercept edit/write results for auto-diagnostics
  if (config.diagnosticsEnabled) {
    pi.on('tool_result', async (event) => {
      if (event.toolName !== 'edit' && event.toolName !== 'write') return;

      const filePath = (event.input as any)?.path;
      if (!filePath || event.isError) return;

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(projectRoot, filePath);

      // Check if we have a server for this file type
      const hasServer = await manager.hasClients(absolutePath);
      if (!hasServer) return;

      // Touch file and wait for diagnostics
      await manager.touchFile(absolutePath, true);
      const diagnostics = manager.getDiagnostics(absolutePath);
      const errors = filterErrors(diagnostics);

      const existingText = (event.content as any[])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      let diagnosticsText = '';

      // Own-file diagnostics (edit and write)
      if (errors.length > 0) {
        diagnosticsText += formatDiagnosticsXml(absolutePath, errors, config.maxDiagnosticsPerFile);
      }

      // Cross-file diagnostics (write only)
      if (event.toolName === 'write' && config.maxCrossFileDiagnostics > 0) {
        const allDiags = manager.getAllDiagnostics();
        let crossFileCount = 0;
        for (const [file, diags] of allDiags) {
          if (file === absolutePath) continue;
          const fileErrors = filterErrors(diags);
          if (fileErrors.length === 0) continue;
          if (crossFileCount >= config.maxCrossFileDiagnostics) break;
          crossFileCount++;
          const crossFileXml = formatDiagnosticsXml(file, fileErrors, config.maxDiagnosticsPerFile)
            .replace('LSP errors detected in this file', 'LSP errors detected in other files');
          diagnosticsText += (diagnosticsText ? '\n\n' : '') + crossFileXml;
        }
      }

      if (!diagnosticsText) return;

      return {
        content: [{
          type: 'text' as const,
          text: existingText + '\n\n' + diagnosticsText,
        }],
      };
    });
  }

  // 4. Shutdown on session end
  pi.on('session_shutdown', async () => {
    await manager.shutdownAll();
  });

  // 5. Register /lsp-status command
  pi.registerCommand('lsp-status', {
    description: 'Show LSP server status',
    handler: async (_args, ctx) => {
      const servers = manager.status();
      if (servers.length === 0) {
        ctx.ui.notify(
          'No LSP servers running. Servers start when you first use the lsp tool or edit a supported file.',
          'info',
        );
        return;
      }
      const lines = servers.map(s =>
        `  ${s.id}: ${s.status} (root: ${path.relative(projectRoot, s.root) || '.'})`
      );
      ctx.ui.notify(['LSP Servers:', ...lines].join('\n'), 'info');
    },
  });
}
