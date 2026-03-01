import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";
import path from "node:path";

const FAKE_PKG_DIR = "/tmp/fake-pi-lsp";

describe("loadConfig()", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("PI_LSP_")) delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("PI_LSP_")) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns defaults when no env vars are set", () => {
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.enabled).toBe(true);
    expect(config.diagnosticsEnabled).toBe(true);
    expect(config.autoDownload).toBe(true);
    expect(config.initTimeout).toBe(45000);
    expect(config.diagnosticsTimeout).toBe(3000);
    expect(config.diagnosticsDebounce).toBe(150);
    expect(config.maxDiagnosticsPerFile).toBe(20);
    expect(config.servers).toBe("auto");
    expect(config.serversDir).toBe(path.join(FAKE_PKG_DIR, "lsp-servers"));
  });

  it("PI_LSP_ENABLED=false → enabled: false", () => {
    process.env.PI_LSP_ENABLED = "false";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.enabled).toBe(false);
  });

  it("PI_LSP_DIAGNOSTICS=false → diagnosticsEnabled: false", () => {
    process.env.PI_LSP_DIAGNOSTICS = "false";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.diagnosticsEnabled).toBe(false);
  });

  it("PI_LSP_TIMEOUT=60000 → initTimeout: 60000", () => {
    process.env.PI_LSP_TIMEOUT = "60000";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.initTimeout).toBe(60000);
  });

  it("PI_LSP_TIMEOUT=abc → throws CONFIG_INVALID_VALUE", () => {
    process.env.PI_LSP_TIMEOUT = "abc";
    expect(() => loadConfig(FAKE_PKG_DIR)).toThrow("CONFIG_INVALID_VALUE");
  });

  it("PI_LSP_TIMEOUT=-1 → throws (must be positive)", () => {
    process.env.PI_LSP_TIMEOUT = "-1";
    expect(() => loadConfig(FAKE_PKG_DIR)).toThrow();
  });

  it("PI_LSP_SERVERS=typescript,pyright → servers: 'typescript,pyright'", () => {
    process.env.PI_LSP_SERVERS = "typescript,pyright";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.servers).toBe("typescript,pyright");
  });

  it("PI_LSP_DIAGNOSTICS_TIMEOUT=5000 → diagnosticsTimeout: 5000", () => {
    process.env.PI_LSP_DIAGNOSTICS_TIMEOUT = "5000";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.diagnosticsTimeout).toBe(5000);
  });

  it("PI_LSP_DIAGNOSTICS_DEBOUNCE=200 → diagnosticsDebounce: 200", () => {
    process.env.PI_LSP_DIAGNOSTICS_DEBOUNCE = "200";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.diagnosticsDebounce).toBe(200);
  });

  it("PI_LSP_MAX_DIAGNOSTICS=10 → maxDiagnosticsPerFile: 10", () => {
    process.env.PI_LSP_MAX_DIAGNOSTICS = "10";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.maxDiagnosticsPerFile).toBe(10);
  });

  it("PI_LSP_DOWNLOAD=false → autoDownload: false", () => {
    process.env.PI_LSP_DOWNLOAD = "false";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.autoDownload).toBe(false);
  });

  it("default maxCrossFileDiagnostics is 5", () => {
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.maxCrossFileDiagnostics).toBe(5);
  });

  it("PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS=3 → maxCrossFileDiagnostics: 3", () => {
    process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS = "3";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.maxCrossFileDiagnostics).toBe(3);
  });

  it("PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS=0 → maxCrossFileDiagnostics: 0 (valid, disables)", () => {
    process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS = "0";
    const config = loadConfig(FAKE_PKG_DIR);
    expect(config.maxCrossFileDiagnostics).toBe(0);
  });

  it("PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS=-1 → throws CONFIG_INVALID_VALUE", () => {
    process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS = "-1";
    expect(() => loadConfig(FAKE_PKG_DIR)).toThrow("CONFIG_INVALID_VALUE");
  });

  it("PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS=abc → throws CONFIG_INVALID_VALUE", () => {
    process.env.PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS = "abc";
    expect(() => loadConfig(FAKE_PKG_DIR)).toThrow("CONFIG_INVALID_VALUE");
  });
});
