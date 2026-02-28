# Implementation Plan: `@josorio/pi-lsp`

**Branch:** `feature/pi-lsp`
**Date:** February 27, 2026
**Status:** Ready for execution

---

## Overview

Build a Pi package that provides Language Server Protocol (LSP) integration — giving the LLM code intelligence tools (go-to-definition, find-references, hover, diagnostics) and automatically appending type errors to every `edit`/`write` result.

**Source of truth:** OpenCode's LSP implementation at `/Users/josorio/Code/opencode/packages/opencode/src/lsp/`

---

## Architecture

```
packages/pi-lsp/
├── package.json                    # Pi package manifest (pi.extensions)
├── tsconfig.json                   # Extends ../../tsconfig.base.json
├── vitest.config.ts                # Test config
├── README.md
└── extensions/
    └── lsp/
        ├── index.ts                # Extension entry point — registers tools, events, commands
        ├── config.ts               # Configuration from env vars
        ├── config.test.ts
        ├── language-map.ts         # File extension → LSP languageId mapping
        ├── language-map.test.ts
        ├── root-detector.ts        # Find project root per language (walk up for tsconfig, go.mod, etc.)
        ├── root-detector.test.ts
        ├── server-registry.ts      # Server definitions (id, extensions, spawn command, install logic)
        ├── server-registry.test.ts
        ├── server-manager.ts       # Lifecycle: spawn, initialize, track, shutdown, restart
        ├── server-manager.test.ts
        ├── client.ts               # JSON-RPC connection, didOpen/didChange, diagnostics collection
        ├── client.test.ts
        ├── diagnostics.ts          # Format diagnostics, filter errors, build output strings
        ├── diagnostics.test.ts
        ├── tools.ts                # LSP tool definition (9 operations)
        ├── tools.test.ts
        └── installer.ts            # Download/install missing LSP servers
            installer.test.ts
```

---

## Dependencies

```json
{
  "dependencies": {
    "vscode-jsonrpc": "8.2.1",
    "vscode-languageserver-types": "3.17.5"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*",
    "@mariozechner/pi-ai": "*",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

**Note:** `vscode-jsonrpc` and `vscode-languageserver-types` versions match OpenCode exactly.

---

## Key Design Decisions

### 1. Diagnostics via `tool_result` Event (Not Tool Override)

Pi's `pi.on("tool_result", ...)` event lets us intercept `edit` and `write` results and append diagnostics without overriding built-in tools. This is cleaner than OpenCode's approach (which embeds diagnostics inside `edit.ts`).

**OpenCode reference:** `packages/opencode/src/tool/edit.ts` lines ~195-210:
```typescript
await LSP.touchFile(filePath, true)
const diagnostics = await LSP.diagnostics()
const errors = issues.filter((item) => item.severity === 1)
// ... appends to output as <diagnostics> XML
```

**Pi equivalent:**
```typescript
pi.on("tool_result", async (event, ctx) => {
  if (event.toolName === "edit" || event.toolName === "write") {
    const filePath = event.input.path;
    await manager.touchFile(filePath, true);
    const errors = manager.getDiagnostics(filePath).filter(d => d.severity === 1);
    if (errors.length > 0) {
      // Return modified content with diagnostics appended
      return { content: [...event.content, { type: "text", text: diagnosticsXml }] };
    }
  }
});
```

### 2. Server Storage in Package Installation Directory

LSP servers are stored under the package's own installation directory, not `~/.pi/lsp-servers/`. This keeps everything self-contained.

```
<package-install-dir>/lsp-servers/
├── typescript-language-server/     # npm install here
├── pyright/                        # npm install here
└── gopls                           # go install binary
```

The package detects its own directory at runtime via `import.meta.url` or `__dirname`.

### 3. Lazy Server Spawning

Servers are NOT spawned on session start. They spawn lazily when:
- The `lsp` tool is called for a file type
- An `edit`/`write` result is intercepted for a file type

This avoids 500MB+ memory usage for servers that are never needed.

### 4. Diagnostics Timing (from OpenCode)

**OpenCode reference:** `packages/opencode/src/lsp/client.ts`:
- `DIAGNOSTICS_DEBOUNCE_MS = 150` — wait 150ms after last diagnostic event
- `withTimeout(..., 3000)` — give up after 3 seconds total
- The debounce handles LSP servers that send multiple diagnostic batches (e.g., syntax errors first, then semantic)

### 5. File Synchronization Protocol

**OpenCode reference:** `packages/opencode/src/lsp/client.ts` `notify.open()`:
- First time a file is seen → `textDocument/didOpen` + `workspace/didChangeWatchedFiles` (type: Created)
- Subsequent opens → `textDocument/didChange` (full content sync) + `workspace/didChangeWatchedFiles` (type: Changed)
- Tracks version numbers per file path (`files: { [path: string]: number }`)

### 6. LSP Initialize Capabilities

**OpenCode reference:** `packages/opencode/src/lsp/client.ts` initialize request:
```typescript
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
}
```

### 7. Root Detection per Language

**OpenCode reference:** `packages/opencode/src/lsp/server.ts` `NearestRoot()`:
- Walks up from file directory to project root looking for config files
- TypeScript: `package-lock.json`, `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock` (excludes if `deno.json` present)
- Python: `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Pipfile`, `pyrightconfig.json`
- Go: `go.work` first, then `go.mod`/`go.sum`
- Rust: `Cargo.toml` then walks up to find `[workspace]`

---

## Tasks

### Task 0: Scaffold Package

**Files:** `packages/pi-lsp/package.json`, `packages/pi-lsp/tsconfig.json`, `packages/pi-lsp/vitest.config.ts`

**Steps:**
1. `mkdir -p packages/pi-lsp/extensions/lsp`
2. `cd packages/pi-lsp && pnpm init` — creates package.json
3. Edit package.json to add: name `@josorio/pi-lsp`, pi manifest, scripts, dependencies, peerDependencies
4. Create `tsconfig.json` extending `../../tsconfig.base.json` (copy pattern from pi-index)
5. Create `vitest.config.ts` (copy pattern from pi-memory)
6. `pnpm install` from monorepo root to link everything
7. Verify `pnpm --filter @josorio/pi-lsp exec tsc --noEmit` runs clean

**Package.json pi manifest:**
```json
{
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

**Commit:** `chore: scaffold pi-lsp package`

---

### Task 1: Configuration Module

**Files:** `extensions/lsp/config.ts`, `extensions/lsp/config.test.ts`

**Purpose:** Load and validate LSP configuration from environment variables.

**Config shape:**
```typescript
export interface LSPConfig {
  enabled: boolean;              // PI_LSP_ENABLED, default: true
  diagnosticsEnabled: boolean;   // PI_LSP_DIAGNOSTICS, default: true
  autoDownload: boolean;         // PI_LSP_DOWNLOAD, default: true
  initTimeout: number;           // PI_LSP_TIMEOUT, default: 45000 (ms)
  diagnosticsTimeout: number;    // PI_LSP_DIAGNOSTICS_TIMEOUT, default: 3000 (ms)
  diagnosticsDebounce: number;   // PI_LSP_DIAGNOSTICS_DEBOUNCE, default: 150 (ms)
  maxDiagnosticsPerFile: number; // PI_LSP_MAX_DIAGNOSTICS, default: 20
  servers: string;               // PI_LSP_SERVERS, default: "auto" (comma-separated or "auto")
  serversDir: string;            // Computed: resolved path to lsp-servers/ inside the package
}
```

**Test cases (TDD — write these FIRST):**
- `loadConfig()` returns defaults when no env vars set
- `PI_LSP_ENABLED=false` → `enabled: false`
- `PI_LSP_DIAGNOSTICS=false` → `diagnosticsEnabled: false`
- `PI_LSP_TIMEOUT=60000` → `initTimeout: 60000`
- `PI_LSP_TIMEOUT=abc` → throws `CONFIG_INVALID_VALUE`
- `PI_LSP_TIMEOUT=-1` → throws (must be positive)
- `PI_LSP_SERVERS=typescript,pyright` → `servers: "typescript,pyright"`
- `serversDir` resolves to `<packageDir>/lsp-servers/`

**OpenCode reference:** OpenCode doesn't use env vars for LSP config — it uses a `config.lsp` object. We follow Pi's convention (env vars, matching pi-index pattern).

**Commit:** `feat(pi-lsp): add configuration module`

---

### Task 2: Language Map Module

**Files:** `extensions/lsp/language-map.ts`, `extensions/lsp/language-map.test.ts`

**Purpose:** Map file extensions to LSP language IDs.

**Implementation:** Port the `LANGUAGE_EXTENSIONS` map from OpenCode.

**OpenCode reference:** `packages/opencode/src/lsp/language.ts` — full map of ~100 extensions to language IDs.

**Exported functions:**
```typescript
export const LANGUAGE_EXTENSIONS: Record<string, string> = { ... };
export function getLanguageId(filePath: string): string;  // Returns languageId or "plaintext"
```

**Test cases:**
- `.ts` → `"typescript"`, `.tsx` → `"typescriptreact"`
- `.py` → `"python"`, `.go` → `"go"`, `.rs` → `"rust"`
- `.js` → `"javascript"`, `.jsx` → `"javascriptreact"`
- `.unknown` → `"plaintext"`
- Works with full paths: `/foo/bar.ts` → `"typescript"`
- Works with filenames without leading dot: `Makefile` → `"makefile"`

**Commit:** `feat(pi-lsp): add language map`

---

### Task 3: Root Detector Module

**Files:** `extensions/lsp/root-detector.ts`, `extensions/lsp/root-detector.test.ts`

**Purpose:** Walk up from a file's directory to find the project root for a given language.

**OpenCode reference:** `packages/opencode/src/lsp/server.ts` — the `NearestRoot()` function:
```typescript
const NearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
  return async (file) => {
    // Walk up from file directory looking for includePatterns
    // If excludePatterns found first, return undefined (skip this server)
    // Falls back to project root if nothing found
  }
}
```

**Exported functions:**
```typescript
export type RootFunction = (file: string, projectRoot: string) => Promise<string | undefined>;
export function nearestRoot(includes: string[], excludes?: string[]): RootFunction;
```

**Key behavior:**
- Walks up directory tree from `path.dirname(file)` to `projectRoot` (stops there)
- Checks each directory for any file in `includes` (using `fs.access()`)
- If `excludes` provided and found, returns `undefined` (this server shouldn't handle this file)
- If nothing found, returns `projectRoot` as fallback
- Rust special: walks up from `Cargo.toml` to find `[workspace]` in parent Cargo.toml files

**Test cases (use temp directories with real files):**
- Finds `tsconfig.json` in parent directory
- Finds `package.json` two levels up
- Returns `projectRoot` when nothing found
- Returns `undefined` when exclude pattern (`deno.json`) found
- Stops at `projectRoot`, doesn't walk above it
- Go: prefers `go.work` over `go.mod`

**Commit:** `feat(pi-lsp): add root detector`

---

### Task 4: Server Registry Module

**Files:** `extensions/lsp/server-registry.ts`, `extensions/lsp/server-registry.test.ts`

**Purpose:** Define which LSP servers are available, their file extensions, root detection strategies, and spawn commands.

**OpenCode reference:** `packages/opencode/src/lsp/server.ts` — each server is an `Info` object:
```typescript
export interface Info {
  id: string;
  extensions: string[];
  root: RootFunction;
  spawn(root: string): Promise<Handle | undefined>;
}
```

**Our interface:**
```typescript
export interface ServerInfo {
  id: string;                           // "typescript", "pyright", "gopls", etc.
  extensions: string[];                 // [".ts", ".tsx", ".js", ".jsx", ...]
  root: RootFunction;                   // From root-detector.ts
  command: string;                      // Binary name or path
  args: string[];                       // CLI arguments
  install?: (serversDir: string) => Promise<string | undefined>;  // Returns binary path or undefined
  initializationOptions?: Record<string, any>;  // Sent during LSP initialize
  findBinary: (serversDir: string) => Promise<string | undefined>;  // Locate binary
}
```

**Phase 1 servers (detailed):**

1. **TypeScript** (`typescript-language-server`):
   - Extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`
   - Root: `NearestRoot(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"], ["deno.json", "deno.jsonc"])`
   - Binary: `typescript-language-server` (check `which` first, then `<serversDir>/node_modules/.bin/typescript-language-server`)
   - Install: `npm install typescript-language-server typescript --prefix <serversDir>/typescript-language-server`
   - Args: `["--stdio"]`
   - OpenCode ref: `LSPServer.Typescript` in server.ts — spawns `bun x typescript-language-server --stdio` with tsserver path

2. **Pyright** (`pyright-langserver`):
   - Extensions: `.py`, `.pyi`
   - Root: `NearestRoot(["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"])`
   - Binary: `pyright-langserver` (check `which` first, then `<serversDir>/node_modules/.bin/pyright-langserver`)
   - Install: `npm install pyright --prefix <serversDir>/pyright`
   - Args: `["--stdio"]`
   - Init options: `{ pythonPath: <detected venv python> }` — check `VIRTUAL_ENV`, `<root>/.venv/bin/python`, `<root>/venv/bin/python`
   - OpenCode ref: `LSPServer.Pyright` in server.ts

3. **gopls**:
   - Extensions: `.go`
   - Root: First try `NearestRoot(["go.work"])`, then `NearestRoot(["go.mod", "go.sum"])`
   - Binary: `gopls` (check `which` first, then `<serversDir>/gopls`)
   - Install: `go install golang.org/x/tools/gopls@latest` with `GOBIN=<serversDir>`
   - Args: `[]` (no args needed)
   - OpenCode ref: `LSPServer.Gopls` in server.ts

**Test cases:**
- `getServersForFile(".ts")` returns typescript server
- `getServersForFile(".py")` returns pyright server
- `getServersForFile(".go")` returns gopls server
- `getServersForFile(".txt")` returns empty array
- Multiple servers can match same extension (e.g., eslint + typescript for .ts)
- `findBinary` returns system binary path when available
- `findBinary` returns serversDir binary path when installed there
- `findBinary` returns undefined when not installed

**Commit:** `feat(pi-lsp): add server registry with TS, Python, Go`

---

### Task 5: Installer Module

**Files:** `extensions/lsp/installer.ts`, `extensions/lsp/installer.test.ts`

**Purpose:** Download/install missing LSP servers to the package's `lsp-servers/` directory.

**Implementation:**
```typescript
export async function installServer(
  server: ServerInfo,
  serversDir: string,
  onProgress?: (msg: string) => void,
): Promise<string | undefined>;
```

- Uses `child_process.execFile` (via `pi.exec` pattern) to run install commands
- TypeScript: `npm install typescript-language-server typescript --prefix <dir>`
- Pyright: `npm install pyright --prefix <dir>`
- Go: `go install golang.org/x/tools/gopls@latest` with `GOBIN=<dir>`
- Returns the binary path on success, `undefined` on failure
- Creates `<serversDir>/<server-id>/` directory structure

**Test cases (use real npm install to a temp dir — minimal mocking):**
- Installing to a temp directory creates the directory
- After install, the binary exists at expected path
- Returns `undefined` when the install command fails (e.g., `npm` not found)
- Skips install when `autoDownload` is false
- Idempotent — doesn't reinstall if binary already exists

**Note on testing:** These tests use real file system and real `npm install` (for TypeScript server). They should be marked with a `@slow` tag or put in a separate test file (`installer.integration.test.ts`) that can be skipped in CI. For unit tests, we test the path resolution and decision logic only.

**Commit:** `feat(pi-lsp): add server installer`

---

### Task 6: JSON-RPC Client Module

**Files:** `extensions/lsp/client.ts`, `extensions/lsp/client.test.ts`

**Purpose:** Manage a JSON-RPC connection to a single LSP server — initialization, file sync, diagnostics collection, LSP requests.

**OpenCode reference:** `packages/opencode/src/lsp/client.ts` — the full `LSPClient.create()` function.

**Exported class/interface:**
```typescript
export interface LSPClientOptions {
  serverID: string;
  process: ChildProcessWithoutNullStreams;
  root: string;
  initializationOptions?: Record<string, any>;
  initTimeout: number;          // ms, from config
  diagnosticsDebounce: number;  // ms, from config
  diagnosticsTimeout: number;   // ms, from config
}

export class LSPClient {
  // Construction
  static async create(options: LSPClientOptions): Promise<LSPClient>;

  // Properties
  readonly serverID: string;
  readonly root: string;

  // File sync
  async openFile(filePath: string): Promise<void>;

  // Diagnostics
  getDiagnostics(filePath: string): Diagnostic[];
  getAllDiagnostics(): Map<string, Diagnostic[]>;
  async waitForDiagnostics(filePath: string): Promise<void>;

  // LSP requests
  async definition(file: string, line: number, char: number): Promise<Location[]>;
  async references(file: string, line: number, char: number): Promise<Location[]>;
  async hover(file: string, line: number, char: number): Promise<Hover | null>;
  async documentSymbol(uri: string): Promise<DocumentSymbol[]>;
  async workspaceSymbol(query: string): Promise<SymbolInformation[]>;
  async implementation(file: string, line: number, char: number): Promise<Location[]>;
  async prepareCallHierarchy(file: string, line: number, char: number): Promise<CallHierarchyItem[]>;
  async incomingCalls(file: string, line: number, char: number): Promise<CallHierarchyIncomingCall[]>;
  async outgoingCalls(file: string, line: number, char: number): Promise<CallHierarchyOutgoingCall[]>;

  // Lifecycle
  async shutdown(): Promise<void>;
}
```

**Key implementation details (from OpenCode `client.ts`):**

1. **Connection setup:**
   ```typescript
   import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
   const connection = createMessageConnection(
     new StreamMessageReader(process.stdout),
     new StreamMessageWriter(process.stdin),
   );
   ```

2. **Diagnostic collection via notification handler:**
   ```typescript
   connection.onNotification("textDocument/publishDiagnostics", (params) => {
     const filePath = fileURLToPath(params.uri);
     diagnostics.set(filePath, params.diagnostics);
   });
   ```

3. **Server-side request handlers (required for LSP protocol):**
   ```typescript
   connection.onRequest("window/workDoneProgress/create", () => null);
   connection.onRequest("workspace/configuration", () => [initializationOptions ?? {}]);
   connection.onRequest("client/registerCapability", () => {});
   connection.onRequest("client/unregisterCapability", () => {});
   connection.onRequest("workspace/workspaceFolders", () => [{ name: "workspace", uri: pathToFileURL(root).href }]);
   ```

4. **File sync (OpenCode `notify.open()`):**
   - Tracks version per file: `files: Record<string, number>`
   - First open: `textDocument/didOpen` + `workspace/didChangeWatchedFiles` (type: 1 = Created)
   - Subsequent: `textDocument/didChange` (full content) + `workspace/didChangeWatchedFiles` (type: 2 = Changed)
   - Always reads current file content from disk via `fs.readFile()`
   - Uses `getLanguageId()` from language-map for `didOpen`

5. **waitForDiagnostics (OpenCode pattern):**
   - Subscribe to diagnostic events for the specific file
   - Debounce timer (150ms) — resets each time a diagnostic comes in
   - Overall timeout (3000ms) — resolves even if no diagnostics arrive
   - Cleans up subscription on resolve or timeout

6. **LSP requests — all follow the same pattern:**
   ```typescript
   async definition(file, line, char) {
     return connection.sendRequest("textDocument/definition", {
       textDocument: { uri: pathToFileURL(file).href },
       position: { line, character: char },
     }).catch(() => null);
   }
   ```

**Test cases:**
- `create()` sends initialize request and receives response
- `openFile()` sends `textDocument/didOpen` for new files
- `openFile()` sends `textDocument/didChange` for already-opened files
- `getDiagnostics()` returns diagnostics received via `publishDiagnostics` notification
- `getDiagnostics()` returns empty array for unknown files
- `waitForDiagnostics()` resolves when diagnostics arrive
- `waitForDiagnostics()` resolves after timeout even with no diagnostics
- `shutdown()` ends connection and kills process
- All LSP request methods (`definition`, `references`, `hover`, etc.) send correct protocol messages
- Handles connection errors gracefully (returns null/empty)

**Testing approach:** Create a mock LSP server (a Node.js script that speaks JSON-RPC over stdin/stdout). Spawn it as a child process. This gives us a REAL JSON-RPC connection without mocking the wire protocol.

**Mock server script (`test-helpers/mock-lsp-server.ts`):**
```typescript
// Minimal LSP server for testing
// Responds to initialize, textDocument/definition, etc. with canned responses
// Sends publishDiagnostics notifications on didOpen/didChange
```

**Commit:** `feat(pi-lsp): add JSON-RPC client`

---

### Task 7: Diagnostics Formatter Module

**Files:** `extensions/lsp/diagnostics.ts`, `extensions/lsp/diagnostics.test.ts`

**Purpose:** Format LSP diagnostics into the XML format the LLM expects.

**OpenCode reference:** `packages/opencode/src/lsp/index.ts` `Diagnostic.pretty()`:
```typescript
export function pretty(diagnostic: LSPClient.Diagnostic) {
  const severityMap = { 1: "ERROR", 2: "WARN", 3: "INFO", 4: "HINT" };
  const severity = severityMap[diagnostic.severity || 1];
  const line = diagnostic.range.start.line + 1;
  const col = diagnostic.range.start.character + 1;
  return `${severity} [${line}:${col}] ${diagnostic.message}`;
}
```

**OpenCode reference:** `packages/opencode/src/tool/edit.ts` diagnostic output format:
```typescript
output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filePath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
```

**Exported functions:**
```typescript
import type { Diagnostic } from "vscode-languageserver-types";

export function formatDiagnostic(d: Diagnostic): string;
export function formatDiagnosticsXml(filePath: string, diagnostics: Diagnostic[], maxPerFile?: number): string;
export function filterErrors(diagnostics: Diagnostic[]): Diagnostic[];
```

**Test cases:**
- `formatDiagnostic` with severity 1 → `"ERROR [5:10] Type 'string' not assignable to 'number'"`
- `formatDiagnostic` with severity 2 → `"WARN [...]"`
- `formatDiagnostic` default severity → `"ERROR"`
- Line/column are 1-indexed in output (LSP is 0-indexed)
- `filterErrors` keeps only severity === 1
- `formatDiagnosticsXml` wraps in `<diagnostics file="...">` tags
- `formatDiagnosticsXml` truncates at `maxPerFile` with `"... and N more"` suffix
- `formatDiagnosticsXml` returns empty string when no errors
- Default `maxPerFile` is 20 (from OpenCode's `MAX_DIAGNOSTICS_PER_FILE`)

**Commit:** `feat(pi-lsp): add diagnostics formatter`

---

### Task 8: Server Manager Module

**Files:** `extensions/lsp/server-manager.ts`, `extensions/lsp/server-manager.test.ts`

**Purpose:** Orchestrate server lifecycle — spawn on demand, track clients per root, handle crashes, provide the public API.

**OpenCode reference:** `packages/opencode/src/lsp/index.ts` — the `state()`, `getClients()`, `touchFile()`, `diagnostics()` functions.

**Exported class:**
```typescript
export class ServerManager {
  constructor(config: LSPConfig, projectRoot: string);

  // Core API (maps to OpenCode's LSP namespace)
  async touchFile(filePath: string, waitForDiagnostics?: boolean): Promise<void>;
  getDiagnostics(filePath: string): Diagnostic[];
  getAllDiagnostics(): Map<string, Diagnostic[]>;
  async hasClients(filePath: string): Promise<boolean>;

  // LSP operations (delegate to matching client)
  async definition(file: string, line: number, char: number): Promise<any[]>;
  async references(file: string, line: number, char: number): Promise<any[]>;
  async hover(file: string, line: number, char: number): Promise<any>;
  async documentSymbol(uri: string): Promise<any[]>;
  async workspaceSymbol(query: string): Promise<any[]>;
  async implementation(file: string, line: number, char: number): Promise<any[]>;
  async prepareCallHierarchy(file: string, line: number, char: number): Promise<any[]>;
  async incomingCalls(file: string, line: number, char: number): Promise<any[]>;
  async outgoingCalls(file: string, line: number, char: number): Promise<any[]>;

  // Lifecycle
  status(): ServerStatus[];
  async shutdownAll(): Promise<void>;
}
```

**Key implementation details (from OpenCode `index.ts`):**

1. **Lazy client spawning (`getClients()`):**
   - Given a file path, find all matching servers by extension
   - For each server, detect root directory
   - Check if a client already exists for (serverID, root) pair
   - If not, check if spawn is in-flight (deduplication via `spawning` Map)
   - If not, spawn server + create client
   - Track broken servers in a `broken: Set<string>` (key = `root + serverID`)

2. **Crash recovery:**
   - If `spawn()` throws or returns undefined → add to `broken` set
   - If `LSPClient.create()` throws → add to `broken`, kill the process
   - Broken servers are never retried in the same session

3. **Multiple servers per file:**
   - A `.ts` file can match both TypeScript and ESLint servers
   - `getClients(file)` returns ALL matching clients
   - `touchFile()` notifies all matching clients
   - `diagnostics()` merges from all clients

4. **Run helper pattern:**
   ```typescript
   // Run operation on all clients matching a file
   async function run<T>(file: string, fn: (client: LSPClient) => Promise<T>): Promise<T[]> {
     const clients = await getClients(file);
     return Promise.all(clients.map(fn));
   }
   ```

**Test cases (using mock LSP server):**
- `touchFile("foo.ts")` spawns TypeScript server on first call
- `touchFile("foo.ts")` reuses existing client on second call
- `touchFile("foo.py")` spawns different server than `touchFile("foo.ts")`
- `getDiagnostics()` returns empty before any file is touched
- `getDiagnostics()` returns diagnostics after touchFile + wait
- `hasClients("foo.txt")` returns false (no server for .txt)
- `shutdownAll()` kills all spawned servers
- Failed spawn adds server to broken set (not retried)
- Multiple calls to same server+root are deduplicated (only one spawn)
- `definition()`, `references()`, etc. delegate to correct client

**Commit:** `feat(pi-lsp): add server manager`

---

### Task 9: LSP Tool Definition

**Files:** `extensions/lsp/tools.ts`, `extensions/lsp/tools.test.ts`

**Purpose:** Define the `lsp` tool the LLM can call with 9 operations.

**OpenCode reference:** `packages/opencode/src/tool/lsp.ts` — the tool definition and execute function.

**Tool schema (using TypeBox + StringEnum for Google compatibility):**
```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

const operations = [
  "goToDefinition", "findReferences", "hover",
  "documentSymbol", "workspaceSymbol", "goToImplementation",
  "prepareCallHierarchy", "incomingCalls", "outgoingCalls",
] as const;

export const lspToolDefinition = {
  name: "lsp",
  label: "LSP",
  description: `Interact with Language Server Protocol servers for code intelligence.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get type info and documentation for a symbol
- documentSymbol: List all symbols in a file
- workspaceSymbol: Search symbols across the workspace
- goToImplementation: Find implementations of an interface
- prepareCallHierarchy: Get call hierarchy at a position
- incomingCalls: Find callers of a function
- outgoingCalls: Find callees of a function

All operations require filePath, line (1-based), character (1-based).
If no LSP server is available for the file type, an error is returned.`,
  parameters: Type.Object({
    operation: StringEnum(operations),
    filePath: Type.String({ description: "Absolute or relative path to the file" }),
    line: Type.Number({ description: "Line number (1-based)" }),
    character: Type.Number({ description: "Character offset (1-based)" }),
  }),
};
```

**Execute function:**
```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  const file = path.isAbsolute(params.filePath)
    ? params.filePath
    : path.resolve(ctx.cwd, params.filePath);

  // Check file exists
  // Check LSP server available
  // Touch file (open/sync with server)
  // Dispatch operation to server manager
  // Convert 1-based to 0-based (line - 1, character - 1)
  // Format result as JSON
  // Return { content, details }
}
```

**Important:** OpenCode converts 1-based input to 0-based for LSP protocol:
```typescript
const position = {
  file,
  line: args.line - 1,
  character: args.character - 1,
}
```

**Test cases:**
- Tool definition has correct name, description, parameters
- Execute resolves relative paths against cwd
- Execute converts 1-based to 0-based positions
- Returns error when file doesn't exist
- Returns error when no LSP server available
- Each operation dispatches to correct server manager method
- Result is JSON-formatted
- `documentSymbol` and `workspaceSymbol` don't need line/character but accept them

**Commit:** `feat(pi-lsp): add LSP tool definition`

---

### Task 10: Extension Entry Point + Event Hooks

**Files:** `extensions/lsp/index.ts`

**Purpose:** Wire everything together — register the `lsp` tool, intercept `edit`/`write` results for diagnostics, manage lifecycle.

**OpenCode reference:** Combination of:
- `packages/opencode/src/lsp/index.ts` (initialization, state management)
- `packages/opencode/src/tool/edit.ts` lines ~195-210 (diagnostics in tool results)

**Implementation:**
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  const config = loadConfig();
  if (!config.enabled) return; // Register nothing if disabled

  const projectRoot = process.cwd();
  const manager = new ServerManager(config, projectRoot);

  // 1. Register LSP tool
  pi.registerTool({
    ...lspToolDefinition,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // ... (from Task 9)
    },
  });

  // 2. Intercept edit/write results for auto-diagnostics
  if (config.diagnosticsEnabled) {
    pi.on("tool_result", async (event, ctx) => {
      if (event.toolName !== "edit" && event.toolName !== "write") return;

      const filePath = event.input?.path;
      if (!filePath || event.isError) return;

      // Check if we have a server for this file type
      const hasServer = await manager.hasClients(filePath);
      if (!hasServer) return;

      // Touch file and wait for diagnostics
      await manager.touchFile(filePath, true);
      const diagnostics = manager.getDiagnostics(filePath);
      const errors = filterErrors(diagnostics);

      if (errors.length === 0) return;

      // Append diagnostics to the tool result
      const diagnosticsText = formatDiagnosticsXml(filePath, errors, config.maxDiagnosticsPerFile);
      const existingText = event.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: existingText + "\n\n" + diagnosticsText,
        }],
      };
    });
  }

  // 3. Shutdown on session end
  pi.on("session_shutdown", async () => {
    await manager.shutdownAll();
  });

  // 4. Register /lsp-status command
  pi.registerCommand("lsp-status", {
    description: "Show LSP server status",
    handler: async (_args, ctx) => {
      const servers = manager.status();
      if (servers.length === 0) {
        ctx.ui.notify("No LSP servers running. Servers start when you first edit/read a supported file.", "info");
        return;
      }
      const lines = servers.map(s =>
        `${s.id}: ${s.status} (root: ${path.relative(projectRoot, s.root)})`
      );
      ctx.ui.notify(["LSP Servers:", ...lines].join("\n"), "info");
    },
  });

  // 5. Show status in footer
  pi.on("tool_result", async (event, ctx) => {
    // Update status after any tool that might have spawned a server
    const servers = manager.status();
    if (servers.length > 0) {
      const summary = servers.map(s => `${s.id} ✓`).join("  ");
      ctx.ui.setStatus("lsp", `LSP: ${summary}`);
    }
  });
}
```

**Test cases:**
- Extension registers `lsp` tool when enabled
- Extension registers nothing when `PI_LSP_ENABLED=false`
- `tool_result` handler appends diagnostics to edit results
- `tool_result` handler skips non-edit/write tools
- `tool_result` handler skips when no LSP server available
- `tool_result` handler skips when no errors found
- `session_shutdown` calls `manager.shutdownAll()`
- `/lsp-status` command shows running servers

**Commit:** `feat(pi-lsp): add extension entry point with diagnostics interception`

---

### Task 11: README Documentation

**Files:** `packages/pi-lsp/README.md`

**Purpose:** Complete documentation following pi-index's README pattern.

**Sections:**
1. Features
2. Prerequisites (Node.js for typescript-language-server, Python for pyright, Go for gopls)
3. Installation
4. Configuration (env vars table)
5. Tools (lsp tool with all 9 operations)
6. Slash Commands (/lsp-status)
7. Auto-diagnostics (how it works, format)
8. Supported Languages (phase 1: TS/JS, Python, Go)
9. Architecture (file layout)
10. How It Works (lifecycle, lazy spawning, diagnostics flow)
11. Development

**Commit:** `docs(pi-lsp): add README`

---

## Task Dependency Graph

```
Task 0 (scaffold)
  ├──► Task 1 (config)
  ├──► Task 2 (language-map)
  └──► Task 3 (root-detector)
         ├──► Task 4 (server-registry) ← also depends on Task 2
         │      └──► Task 5 (installer)
         │             └──► Task 6 (client) ← also depends on Task 2
         │                    ├──► Task 7 (diagnostics)
         │                    └──► Task 8 (server-manager) ← depends on Tasks 4, 5, 6
         │                           └──► Task 9 (tools) ← depends on Task 8
         │                                  └──► Task 10 (entry point) ← depends on Tasks 1, 7, 8, 9
         │                                         └──► Task 11 (README)
```

**Parallelizable groups:**
- Tasks 1, 2, 3 can run in parallel (no dependencies between them)
- Tasks 4, 5 can run in parallel after Task 3

**Sequential chain:**
- Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11

---

## Testing Strategy

### Principle: Minimal Mocking, Real Behavior

1. **Config tests** — mock only `process.env` (real validation logic)
2. **Language map tests** — pure function, no mocks
3. **Root detector tests** — use real temp directories with real files
4. **Server registry tests** — mock `which` for binary detection, real for everything else
5. **Installer tests** — split into:
   - Unit tests: path resolution logic (no mocks)
   - Integration tests: real `npm install` to temp dir (slow, separate file)
6. **Client tests** — use a REAL mock LSP server (a tiny Node.js script speaking JSON-RPC). Spawn it as a child process. This tests the actual wire protocol.
7. **Diagnostics tests** — pure functions, no mocks
8. **Server manager tests** — use mock LSP server from #6
9. **Tool tests** — test parameter handling and dispatch (mock server manager)
10. **Entry point tests** — mock `ExtensionAPI` (it's the boundary)

### Mock LSP Server

Create `extensions/lsp/test-helpers/mock-lsp-server.ts`:
- A standalone Node.js script that reads JSON-RPC from stdin, writes to stdout
- Responds to `initialize` with capabilities
- Responds to `textDocument/definition` with canned locations
- Sends `textDocument/publishDiagnostics` after `didOpen`/`didChange`
- Can be configured via command-line args to control behavior

This file is NOT part of the extension — it's only used in tests.

---

## OpenCode File References

For any implementer picking up this plan, here are the exact source files to reference:

| Module | OpenCode Source | Key Lines |
|---|---|---|
| Client (JSON-RPC) | `/Users/josorio/Code/opencode/packages/opencode/src/lsp/client.ts` | Full file (200 lines) |
| Server definitions | `/Users/josorio/Code/opencode/packages/opencode/src/lsp/server.ts` | Lines 1-100 (types), Typescript ~85-115, Pyright ~310-380, Gopls ~230-270 |
| Manager/orchestrator | `/Users/josorio/Code/opencode/packages/opencode/src/lsp/index.ts` | Full file (350 lines) — state, getClients, touchFile, diagnostics, all LSP operations |
| LSP tool | `/Users/josorio/Code/opencode/packages/opencode/src/tool/lsp.ts` | Full file (90 lines) |
| Edit diagnostics | `/Users/josorio/Code/opencode/packages/opencode/src/tool/edit.ts` | Lines 190-210 (diagnostics block) |
| Language map | `/Users/josorio/Code/opencode/packages/opencode/src/lsp/language.ts` | Full file (100 lines) |
| Tool description | `/Users/josorio/Code/opencode/packages/opencode/src/tool/lsp.txt` | Full file (15 lines) |

---

## Monorepo Context

- **Root:** `/Users/josorio/Code/pi-packages/`
- **Workspace:** `pnpm-workspace.yaml` → `packages/*`
- **Base TS config:** `tsconfig.base.json` (ES2022, NodeNext, strict)
- **Turbo tasks:** build, test, lint
- **Existing packages:** `pi-index` (semantic search), `pi-memory` (memory system)
- **Test runner:** vitest
- **Package manager:** pnpm

---

## Pi Extension API Quick Reference

| API | Use |
|---|---|
| `pi.registerTool({ name, description, parameters, execute })` | Register LLM-callable tool |
| `pi.on("tool_result", handler)` | Intercept/modify tool results |
| `pi.on("session_shutdown", handler)` | Cleanup on exit |
| `pi.registerCommand("name", { handler })` | Register `/command` |
| `ctx.ui.notify(msg, level)` | Show notification |
| `ctx.ui.setStatus("key", "text")` | Footer status |
| `ctx.cwd` | Working directory |
| `pi.exec(cmd, args, opts)` | Run shell command |
| TypeBox `Type.Object({})` | Tool parameter schemas |
| `StringEnum([...] as const)` | String enums (Google-compatible) |
| `isToolCallEventType("edit", event)` | Type-narrow tool events |
| `event.content`, `event.input`, `event.isError` | tool_result event fields |
