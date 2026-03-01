import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Resolved, validated configuration for the pi-lsp extension.
 *
 * Produced by `loadConfig` from environment variables. All numeric fields are
 * positive; boolean fields are true/false.
 */
export interface LSPConfig {
  /** Whether the LSP extension is active. PI_LSP_ENABLED, default: true */
  enabled: boolean;
  /** Whether automatic diagnostics are active. PI_LSP_DIAGNOSTICS, default: true */
  diagnosticsEnabled: boolean;
  /** Whether to auto-download missing language servers. PI_LSP_DOWNLOAD, default: true */
  autoDownload: boolean;
  /** Milliseconds to wait for a language server to initialize. PI_LSP_TIMEOUT, default: 45000 */
  initTimeout: number;
  /** Milliseconds to wait for diagnostics to arrive after a file change. PI_LSP_DIAGNOSTICS_TIMEOUT, default: 3000 */
  diagnosticsTimeout: number;
  /** Milliseconds to debounce diagnostics requests. PI_LSP_DIAGNOSTICS_DEBOUNCE, default: 150 */
  diagnosticsDebounce: number;
  /** Maximum number of diagnostics to report per file. PI_LSP_MAX_DIAGNOSTICS, default: 20 */
  maxDiagnosticsPerFile: number;
  /** Max number of other files to show diagnostics for after write. PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS, default: 5 */
  maxCrossFileDiagnostics: number;
  /** Comma-separated server list or 'auto'. PI_LSP_SERVERS, default: 'auto' */
  servers: string;
  /** Absolute path to the lsp-servers/ directory inside the package. Computed. */
  serversDir: string;
}

function parseEnvInt(name: string, value: string): number {
  const v = parseInt(value, 10);
  if (Number.isNaN(v)) {
    throw new Error(
      `CONFIG_INVALID_VALUE: ${name} must be a valid integer (got "${value}")`
    );
  }
  return v;
}

/**
 * Build an `LSPConfig` from environment variables.
 *
 * @param packageDir - Optional override for the package root directory. When omitted,
 *   resolved from `import.meta.url`. Used to compute `serversDir`.
 * @returns Validated `LSPConfig`
 * @throws {Error} With `CONFIG_INVALID_VALUE` when an env var contains an invalid value
 * @throws {Error} When a numeric env var is not a positive integer
 */
export function loadConfig(packageDir?: string): LSPConfig {
  // Resolve package directory
  const resolvedPackageDir =
    packageDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  // Boolean fields
  const enabled = process.env.PI_LSP_ENABLED !== "false";
  const diagnosticsEnabled = process.env.PI_LSP_DIAGNOSTICS !== "false";
  const autoDownload = process.env.PI_LSP_DOWNLOAD !== "false";

  // initTimeout
  let initTimeout = 45000;
  if (process.env.PI_LSP_TIMEOUT !== undefined) {
    initTimeout = parseEnvInt("PI_LSP_TIMEOUT", process.env.PI_LSP_TIMEOUT);
    if (initTimeout <= 0) {
      throw new Error(
        `CONFIG_INVALID_VALUE: PI_LSP_TIMEOUT must be a positive integer (got "${process.env.PI_LSP_TIMEOUT}")`
      );
    }
  }

  // diagnosticsTimeout
  let diagnosticsTimeout = 3000;
  if (process.env.PI_LSP_DIAGNOSTICS_TIMEOUT !== undefined) {
    diagnosticsTimeout = parseEnvInt(
      "PI_LSP_DIAGNOSTICS_TIMEOUT",
      process.env.PI_LSP_DIAGNOSTICS_TIMEOUT
    );
    if (diagnosticsTimeout <= 0) {
      throw new Error(
        `CONFIG_INVALID_VALUE: PI_LSP_DIAGNOSTICS_TIMEOUT must be a positive integer (got "${process.env.PI_LSP_DIAGNOSTICS_TIMEOUT}")`
      );
    }
  }

  // diagnosticsDebounce
  let diagnosticsDebounce = 150;
  if (process.env.PI_LSP_DIAGNOSTICS_DEBOUNCE !== undefined) {
    diagnosticsDebounce = parseEnvInt(
      "PI_LSP_DIAGNOSTICS_DEBOUNCE",
      process.env.PI_LSP_DIAGNOSTICS_DEBOUNCE
    );
    if (diagnosticsDebounce < 0) {
      throw new Error(
        `CONFIG_INVALID_VALUE: PI_LSP_DIAGNOSTICS_DEBOUNCE must be >= 0 (got "${process.env.PI_LSP_DIAGNOSTICS_DEBOUNCE}")`
      );
    }
  }

  // maxDiagnosticsPerFile
  let maxDiagnosticsPerFile = 20;
  if (process.env.PI_LSP_MAX_DIAGNOSTICS !== undefined) {
    maxDiagnosticsPerFile = parseEnvInt(
      "PI_LSP_MAX_DIAGNOSTICS",
      process.env.PI_LSP_MAX_DIAGNOSTICS
    );
    if (maxDiagnosticsPerFile <= 0) {
      throw new Error(
        `CONFIG_INVALID_VALUE: PI_LSP_MAX_DIAGNOSTICS must be a positive integer (got "${process.env.PI_LSP_MAX_DIAGNOSTICS}")`
      );
    }
  }

  // maxCrossFileDiagnostics
  let maxCrossFileDiagnostics = 5;
  if (process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS !== undefined) {
    maxCrossFileDiagnostics = parseEnvInt(
      "PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS",
      process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS
    );
    if (maxCrossFileDiagnostics < 0) {
      throw new Error(
        `CONFIG_INVALID_VALUE: PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS must be >= 0 (got "${process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS}")`
      );
    }
  }

  // servers
  const servers = process.env.PI_LSP_SERVERS ?? "auto";

  // serversDir — always resolved relative to package root
  const serversDir = path.join(resolvedPackageDir, "lsp-servers");

  return {
    enabled,
    diagnosticsEnabled,
    autoDownload,
    initTimeout,
    diagnosticsTimeout,
    diagnosticsDebounce,
    maxDiagnosticsPerFile,
    maxCrossFileDiagnostics,
    servers,
    serversDir,
  };
}
