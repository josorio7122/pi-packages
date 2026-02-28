import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ServerInfo } from './server-registry.js';

const execFileAsync = promisify(execFile);

export function getInstallDir(serversDir: string, serverId: string): string {
  return path.join(serversDir, serverId);
}

/**
 * Look for a binary in these locations (in order):
 * 1. System PATH (via which)
 * 2. serversDir/serverId/node_modules/.bin/<command> (for npm-installed servers)
 * 3. serversDir/<command> (for Go-installed binaries)
 */
export async function findBinary(
  command: string,
  serversDir: string,
  serverId: string,
): Promise<string | undefined> {
  // Check system PATH
  try {
    const { stdout } = await execFileAsync('which', [command]);
    const systemPath = stdout.trim();
    if (systemPath) return systemPath;
  } catch {
    // not in PATH
  }

  // Check serversDir/serverId/node_modules/.bin/
  const npmBin = path.join(serversDir, serverId, 'node_modules', '.bin', command);
  try {
    await fs.access(npmBin, fs.constants.X_OK);
    return npmBin;
  } catch {
    // not there
  }

  // Check serversDir/<command> directly (Go binaries)
  const directBin = path.join(serversDir, command);
  try {
    await fs.access(directBin, fs.constants.X_OK);
    return directBin;
  } catch {
    // not there
  }

  return undefined;
}

/**
 * Install a server's binary to serversDir.
 * Returns the path to the installed binary, or undefined on failure.
 */
export async function installServer(
  server: ServerInfo,
  serversDir: string,
  onProgress?: (msg: string) => void,
): Promise<string | undefined> {
  if (server.npmPackage) {
    return installNpmServer(server, serversDir, onProgress);
  }
  if (server.goPackage) {
    return installGoServer(server, serversDir, onProgress);
  }
  return undefined;
}

async function installNpmServer(
  server: ServerInfo,
  serversDir: string,
  onProgress?: (msg: string) => void,
): Promise<string | undefined> {
  const installDir = getInstallDir(serversDir, server.id);
  await fs.mkdir(installDir, { recursive: true });

  // Create package.json if it doesn't exist
  const pkgJsonPath = path.join(installDir, 'package.json');
  try {
    await fs.access(pkgJsonPath);
  } catch {
    await fs.writeFile(pkgJsonPath, JSON.stringify({ name: `pi-lsp-${server.id}`, version: '1.0.0', private: true }));
  }

  onProgress?.(`Installing ${server.npmPackage}...`);
  try {
    const packages = server.npmPackage!.split(' ');
    await execFileAsync('npm', ['install', ...packages], {
      cwd: installDir,
      timeout: 120_000,
      env: { ...process.env },
    });
    onProgress?.(`Installed ${server.id}`);
    // Return the binary path
    return findBinary(server.command, serversDir, server.id);
  } catch (err) {
    onProgress?.(`Failed to install ${server.id}: ${err}`);
    return undefined;
  }
}

async function installGoServer(
  server: ServerInfo,
  serversDir: string,
  onProgress?: (msg: string) => void,
): Promise<string | undefined> {
  // Check if Go is available
  try {
    await execFileAsync('which', ['go']);
  } catch {
    onProgress?.('Go is not installed, cannot install ' + server.id);
    return undefined;
  }

  onProgress?.(`Installing ${server.goPackage}...`);
  try {
    await execFileAsync('go', ['install', server.goPackage!], {
      timeout: 120_000,
      env: { ...process.env, GOBIN: serversDir },
    });
    onProgress?.(`Installed ${server.id}`);
    const binPath = path.join(serversDir, server.command);
    try {
      await fs.access(binPath, fs.constants.X_OK);
      return binPath;
    } catch {
      return undefined;
    }
  } catch (err) {
    onProgress?.(`Failed to install ${server.id}: ${err}`);
    return undefined;
  }
}
