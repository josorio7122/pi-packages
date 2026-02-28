import { nearestRoot, type RootFunction } from './root-detector.js';
import path from 'node:path';

export interface ServerInfo {
  id: string;
  extensions: string[];
  root: RootFunction;
  command: string;  // binary name to look for
  args: string[];   // CLI args for the binary
  npmPackage?: string; // package name for npm install (if auto-downloadable)
  goPackage?: string; // go package path for go install (if Go-based)
  initializationOptions?: (root: string) => Promise<Record<string, any>>;
}

export function getServersForExtension(ext: string): ServerInfo[] {
  return SERVERS.filter(s => s.extensions.includes(ext));
}

export function getServerById(id: string): ServerInfo | undefined {
  return SERVERS.find(s => s.id === id);
}

/** Detect Python venv path for pyright initialization */
async function detectPythonPath(root: string): Promise<string | undefined> {
  const fs = await import('node:fs/promises');
  const candidates = [
    process.env['VIRTUAL_ENV'] ? path.join(process.env['VIRTUAL_ENV'], 'bin', 'python') : undefined,
    path.join(root, '.venv', 'bin', 'python'),
    path.join(root, 'venv', 'bin', 'python'),
  ].filter((p): p is string => p !== undefined);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not found
    }
  }
  return undefined;
}

export const SERVERS: ServerInfo[] = [
  {
    id: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
    root: nearestRoot(
      ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'],
      ['deno.json', 'deno.jsonc'],
    ),
    command: 'typescript-language-server',
    args: ['--stdio'],
    npmPackage: 'typescript-language-server typescript',
  },
  {
    id: 'pyright',
    extensions: ['.py', '.pyi'],
    root: nearestRoot([
      'pyproject.toml', 'setup.py', 'setup.cfg',
      'requirements.txt', 'Pipfile', 'pyrightconfig.json',
    ]),
    command: 'pyright-langserver',
    args: ['--stdio'],
    npmPackage: 'pyright',
    initializationOptions: async (root: string) => {
      const pythonPath = await detectPythonPath(root);
      return pythonPath ? { pythonPath } : {};
    },
  },
  {
    id: 'gopls',
    extensions: ['.go'],
    root: async (file: string, projectRoot: string) => {
      // Prefer go.work over go.mod
      const workRoot = await nearestRoot(['go.work'])(file, projectRoot);
      if (workRoot && workRoot !== projectRoot) return workRoot;
      return nearestRoot(['go.mod', 'go.sum'])(file, projectRoot);
    },
    command: 'gopls',
    args: [],
    goPackage: 'golang.org/x/tools/gopls@latest',
  },
];
