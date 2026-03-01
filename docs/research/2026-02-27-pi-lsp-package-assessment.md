# Assessment: Pi LSP Package — Replicating OpenCode's LSP Integration

**Date:** February 27, 2026
**Status:** Design Assessment

---

## Executive Summary

This document evaluates building a `pi-lsp` package that brings OpenCode's LSP (Language Server Protocol) integration to Pi. The package would give the LLM tools for go-to-definition, find-references, hover, call hierarchy, and — critically — automatic diagnostics after every edit.

---

## What We're Building

### Core Features (from OpenCode)

1. **LSP Tool** — 9 operations the LLM can call: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls
2. **Automatic Diagnostics After Edits** — intercept edit/write tool results and append type errors
3. **Server Lifecycle Management** — auto-spawn, auto-download, and manage LSP servers per language
4. **Multi-language Support** — TypeScript, Python, Go, Rust, C/C++, Java, and more

### What Already Exists in Pi

- **`pi-index`** — semantic search via embeddings (vector + BM25). Answers "what code is related to X?" but doesn't understand types, definitions, or references.
- **Built-in tools** — `read`, `edit`, `write`, `bash`, `grep`, `find`, `ls`. No code intelligence.
- **Extension API** — `pi.registerTool()`, `pi.on("tool_result")`, `pi.on("tool_call")`, `pi.exec()`. Full lifecycle hooks.

### Gap Analysis

| Capability | Pi Today | With pi-lsp |
|---|---|---|
| "Find where X is defined" | `grep` (text match, false positives) | `goToDefinition` (exact, type-aware) |
| "Who calls this function?" | `grep` (text match, misses renames) | `findReferences` (precise) |
| "What type does X return?" | Read the file, guess | `hover` (full type signature) |
| "List all functions in file" | `grep` for `function\|class` | `documentSymbol` (complete, structured) |
| "Errors after edit?" | Run `tsc`/`ruff` via bash (slow, noisy) | Automatic diagnostics (instant, structured) |
| "Find implementations of interface" | Impossible with grep | `goToImplementation` (type-aware) |
| "Call graph" | Impossible | `incomingCalls`/`outgoingCalls` |

---

## Architecture Design

### Package Structure

```
packages/pi-lsp/
├── package.json
├── tsconfig.json
├── extensions/
│   └── lsp/
│       ├── index.ts              # Extension entry point
│       ├── server-registry.ts    # Server definitions (TS, Python, Go, etc.)
│       ├── server-manager.ts     # Lifecycle: spawn, initialize, shutdown
│       ├── client.ts             # JSON-RPC connection wrapper
│       ├── tools.ts              # LLM tool definitions (9 operations)
│       ├── diagnostics.ts        # Edit/write interceptor for auto-diagnostics
│       ├── language-map.ts       # Extension → languageId mapping
│       └── utils.ts              # Helpers (root detection, etc.)
└── README.md
```

### How It Maps to Pi's Extension API

#### 1. LSP Tool → `pi.registerTool()`

```typescript
pi.registerTool({
  name: "lsp",
  label: "LSP",
  description: "Language Server Protocol operations for code intelligence...",
  parameters: Type.Object({
    operation: StringEnum(["goToDefinition", "findReferences", "hover", ...]),
    filePath: Type.String(),
    line: Type.Number(),
    character: Type.Number(),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 1. Resolve file path
    // 2. Find/spawn matching LSP server
    // 3. Ensure file is open in the server
    // 4. Send the LSP request
    // 5. Format and return results
  },
});
```

#### 2. Auto-Diagnostics → `pi.on("tool_result")`

This is the killer feature. Intercept every edit/write result:

```typescript
pi.on("tool_result", async (event, ctx) => {
  if (event.toolName === "edit" || event.toolName === "write") {
    const filePath = event.input.path;
    
    // Touch file in LSP server, wait for diagnostics
    await lspManager.touchFile(filePath);
    const diagnostics = await lspManager.getDiagnostics(filePath);
    const errors = diagnostics.filter(d => d.severity === 1);
    
    if (errors.length > 0) {
      const formatted = errors.map(d => 
        `ERROR [${d.range.start.line + 1}:${d.range.start.character + 1}] ${d.message}`
      ).join("\n");
      
      // Append diagnostics to the tool result
      const existingText = event.content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("\n");
      
      return {
        content: [{
          type: "text",
          text: existingText + `\n\nLSP errors detected, please fix:\n<diagnostics file="${filePath}">\n${formatted}\n</diagnostics>`
        }],
      };
    }
  }
});
```

#### 3. Server Lifecycle → `pi.on("session_start")` / `pi.on("session_shutdown")`

```typescript
pi.on("session_start", async (_event, ctx) => {
  // Initialize LSP manager with project root
  lspManager = new LSPManager(ctx.cwd);
});

pi.on("session_shutdown", async () => {
  // Gracefully shutdown all LSP servers
  await lspManager.shutdownAll();
});
```

#### 4. File Sync → `pi.on("tool_result")` for read operations

```typescript
pi.on("tool_result", async (event) => {
  if (event.toolName === "read" && !event.isError) {
    // Notify LSP server about file open (warms the cache)
    const filePath = event.input.path;
    lspManager.touchFile(filePath, false); // don't wait for diagnostics
  }
});
```

---

## Technical Decisions

### 1. JSON-RPC Communication

**Use `vscode-jsonrpc`** — same as OpenCode. It's the standard LSP client library, well-maintained, and handles the protocol details.

```json
// package.json dependencies
{
  "dependencies": {
    "vscode-jsonrpc": "^8.2.0",
    "vscode-languageserver-types": "^3.17.5"
  }
}
```

### 2. Which Languages to Support (Phase 1)

Start with the languages that have the most reliable, zero-config LSP servers:

| Priority | Language | Server | Why |
|---|---|---|---|
| P0 | TypeScript/JavaScript | typescript-language-server | Most Pi users are TS/JS devs |
| P0 | Python | pyright | Auto-downloads, great diagnostics |
| P1 | Go | gopls | Auto-installs, excellent |
| P1 | Rust | rust-analyzer | Needs to be pre-installed |
| P2 | CSS/SCSS | vscode-css-languageserver | Auto-downloads |
| P2 | JSON/YAML | vscode-json-languageserver | Auto-downloads |

### 3. Server Auto-Download Strategy

Follow OpenCode's approach:
- Check `Bun.which()` / `which` for system-installed server
- If not found, install to `~/.pi/lsp-servers/<server-name>/`
- For Node.js servers: `npm install` into that directory
- For Go servers: `go install`
- For binary servers: download from GitHub releases

### 4. Root Detection

Same as OpenCode — walk up from the file to find the nearest config:
- TypeScript: `package.json`, `tsconfig.json`, lockfiles
- Python: `pyproject.toml`, `setup.py`, `requirements.txt`
- Go: `go.mod`, `go.work`
- Rust: `Cargo.toml` (walk up to workspace root)

### 5. Configuration

Via environment variables (consistent with pi-index):

| Variable | Default | Description |
|---|---|---|
| `PI_LSP_ENABLED` | `true` | Enable/disable LSP |
| `PI_LSP_SERVERS` | `auto` | Comma-separated servers, or `auto` for all detected |
| `PI_LSP_DOWNLOAD` | `true` | Auto-download missing servers |
| `PI_LSP_DIAGNOSTICS` | `true` | Auto-append diagnostics after edits |
| `PI_LSP_TIMEOUT` | `45000` | Server initialization timeout (ms) |
| `PI_LSP_BIN_DIR` | `~/.pi/lsp-servers` | Where to install servers |

---

## Complexity Assessment

### What's Straightforward

1. **Tool registration** — Pi's `registerTool()` maps cleanly to what we need
2. **Diagnostics interception** — `tool_result` event is perfect for appending diagnostics
3. **JSON-RPC communication** — `vscode-jsonrpc` handles all protocol details
4. **Server spawning** — `child_process.spawn()` + stdin/stdout pipes

### What's Complex

1. **Server lifecycle management** — Handling crashes, restarts, multiple servers per project (e.g., TS + ESLint), cleanup on shutdown
2. **File synchronization** — Keeping the LSP server's in-memory model in sync with disk. Need to send `didOpen`, `didChange`, `didClose` at the right times
3. **Root detection** — Different languages have different project root signals. Monorepos add complexity (multiple TS projects, nested go.mod files)
4. **Diagnostics timing** — After sending `didChange`, need to wait for the server to publish diagnostics. OpenCode uses a 150ms debounce + 3s timeout
5. **Server auto-download** — Platform-specific binaries, extraction, permissions. OpenCode's code for this is 1000+ lines
6. **Windows support** — Path normalization, process spawning differences

### What's Risky

1. **Memory usage** — Each LSP server is a separate process. TypeScript server can use 500MB+ for large projects. Having 3-4 servers running adds up.
2. **Startup time** — LSP servers take 2-30 seconds to initialize (TypeScript is especially slow on large projects). Need async initialization that doesn't block Pi.
3. **Native dependencies** — Some LSP servers need platform-specific binaries. Auto-download must handle macOS arm64/x64, Linux glibc/musl, Windows.

---

## Effort Estimate

### Phase 1: Core (MVP) — ~3-4 days
- Server manager (spawn, initialize, shutdown)
- JSON-RPC client wrapper
- TypeScript + Python server support only
- LSP tool (all 9 operations)
- Auto-diagnostics after edit/write
- Basic root detection

### Phase 2: Multi-language — ~2-3 days
- Go, Rust, C/C++ server support
- Server auto-download system
- Robust root detection (monorepo-aware)
- Crash recovery and server restart

### Phase 3: Polish — ~1-2 days
- Configuration system (env vars)
- Status command (/lsp-status)
- TUI status indicator (which servers are running)
- Documentation
- Tests

### Total: ~6-9 days

---

## Comparison with OpenCode's Implementation

| Aspect | OpenCode | Pi Package |
|---|---|---|
| Language | TypeScript (Bun) | TypeScript (Node.js via jiti) |
| JSON-RPC | vscode-jsonrpc | vscode-jsonrpc (same) |
| Integration point | Built-in tool + built-in edit hooks | Extension tool + tool_result event |
| Server config | Hardcoded in source | Hardcoded + user config via env vars |
| Diagnostics | Direct integration in edit/write tools | Intercepted via tool_result event hook |
| Server management | Instance.state() pattern | Extension-scoped singleton |
| Servers supported | 25+ | Phase 1: 2, Phase 2: 5-6 |
| File watching | @parcel/watcher | Pi's built-in tool_result hooks |

### Key Architectural Difference

OpenCode integrates LSP **inside** the edit/write tool implementations — they directly call `LSP.touchFile()` and `LSP.diagnostics()` after writing. In Pi, we can't modify built-in tools, but we **can** intercept their results via `tool_result` events. The result is functionally identical — diagnostics appended to the edit result — but achieved through event hooks rather than direct integration.

This is actually **cleaner** — the LSP concern is fully encapsulated in the extension, not spread across multiple built-in tools.

---

## Open Questions

1. **Should we also override `edit`/`write` tools?** Pi allows overriding built-in tools via `registerTool` with the same name. This would give us direct control instead of using event hooks, but it means reimplementing the full edit/write logic.
   - **Recommendation:** No — use `tool_result` hooks. Overriding is fragile and couples to Pi's internal implementation.

2. **Should diagnostics be opt-in or opt-out?** If someone installs pi-lsp, should diagnostics be automatic?
   - **Recommendation:** Opt-out (on by default). The whole point is the tight feedback loop. `PI_LSP_DIAGNOSTICS=false` to disable.

3. **Should we show LSP status in the TUI?** Pi supports `ctx.ui.setStatus()` and `ctx.ui.setWidget()`.
   - **Recommendation:** Yes — show which servers are running in the footer via `setStatus()`.

4. **Should we integrate with pi-index?** LSP provides code intelligence, pi-index provides semantic search. They're complementary.
   - **Recommendation:** Keep them separate for now. A future pi-intelligence meta-package could combine both.

5. **How to handle the /init command?** OpenCode's /init is just a prompt template. We could add a skill for this.
   - **Recommendation:** Create a `pi-init` skill that generates AGENTS.md, separate from pi-lsp. LSP is a runtime tool; /init is a one-time generation task.

---

## Recommendation

**Build it.** The `tool_result` interception pattern makes this clean and non-invasive. The biggest value — automatic diagnostics after every edit — maps perfectly to Pi's event system. Start with TypeScript + Python (covers 90% of Pi users), expand later.

The pi-lsp package would be the highest-impact Pi extension possible — it turns the LLM from "text search + hope" into "type-aware code understanding with instant error feedback."
