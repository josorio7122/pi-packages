import { nearestRoot, type RootFunction } from './root-detector.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ServerInfo {
  id: string;
  extensions: string[];
  root: RootFunction;
  command: string;
  args: string[];
  npmPackage?: string;
  gemPackage?: string;
  initializationOptions?: (root: string) => Promise<Record<string, unknown>>;
}

export function getServersForExtension(ext: string): ServerInfo[] {
  return SERVERS.filter(s => s.extensions.includes(ext));
}

export function getServerById(id: string): ServerInfo | undefined {
  return SERVERS.find(s => s.id === id);
}

async function detectPythonPath(root: string): Promise<string | undefined> {
  const candidates = [
    process.env['VIRTUAL_ENV'] ? path.join(process.env['VIRTUAL_ENV'], 'bin', 'python') : undefined,
    path.join(root, '.venv', 'bin', 'python'),
    path.join(root, 'venv', 'bin', 'python'),
  ].filter((p): p is string => p !== undefined);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  return undefined;
}

export const SERVERS: ServerInfo[] = [
  { id: 'typescript', extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'], root: nearestRoot(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'], ['deno.json', 'deno.jsonc']), command: 'typescript-language-server', args: ['--stdio'], npmPackage: 'typescript-language-server typescript' },
  { id: 'pyright', extensions: ['.py', '.pyi'], root: nearestRoot(['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json']), command: 'pyright-langserver', args: ['--stdio'], npmPackage: 'pyright', initializationOptions: async (root: string) => { const pythonPath = await detectPythonPath(root); return pythonPath ? { pythonPath } : {}; } },
  { id: 'ruby', extensions: ['.rb', '.rake', '.gemspec', '.ru'], root: nearestRoot(['Gemfile', 'Gemfile.lock']), command: 'rubocop', args: ['--lsp'], gemPackage: 'rubocop' },
];
