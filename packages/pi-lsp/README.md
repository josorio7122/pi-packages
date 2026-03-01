# @josorio/pi-lsp

Language Server Protocol (LSP) integration for [pi](https://github.com/mariozechner/pi) — the AI coding agent.

`pi-lsp` gives the LLM code intelligence tools (go-to-definition, find-references, hover, call hierarchy) and automatically appends type errors to every `edit`/`write` result, creating a tight feedback loop that catches bugs instantly.

---

## Features

- **9 LSP operations** — goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls
- **Automatic diagnostics** — type errors appended to every edit/write result as `<diagnostics>` XML
- **Lazy server spawning** — LSP servers start on first use, not on session start
- **Multi-language** — TypeScript/JavaScript, Python, Ruby (Phase 1)
- **Auto-install** — missing LSP servers are downloaded automatically
- **Zero config** — works out of the box for most projects

---

## How It Works

### Before pi-lsp

```
LLM: edit("src/api.ts", ...)
Pi:  "Edit applied successfully."
LLM: (hopes it's correct, or runs tsc via bash to check)
```

### After pi-lsp

```
LLM: edit("src/api.ts", ...)
Pi:  "Edit applied successfully.

     LSP errors detected in this file, please fix:
     <diagnostics file="src/api.ts">
     ERROR [42:15] Argument of type 'number' is not assignable to type 'string'.
     ERROR [67:3] Property 'naem' does not exist on type 'User'. Did you mean 'name'?
     </diagnostics>"
LLM: (immediately fixes the errors)
```

The LLM also gains access to precise code navigation:

```
LLM: lsp({ operation: "goToDefinition", filePath: "src/api.ts", line: 15, character: 10 })
Pi:  [{ uri: "file:///src/models/user.ts", range: { start: { line: 5, character: 0 }, ... } }]
```

---

## Installation

```bash
pi install git:github.com/josorio7122/pi-packages
```

Or add to your pi settings:

```json
{
  "packages": [
    "git:github.com/josorio7122/pi-packages"
  ]
}
```

---

## Prerequisites

pi-lsp auto-installs LSP servers on first use. The following package managers must be available:

| Language | Requirement |
|---|---|
| TypeScript / JavaScript | `npm` (for `typescript-language-server` and `pyright`) |
| Python | `npm` |
| Ruby | `gem` (for `rubocop`) |

---

## Configuration

pi-lsp is configured via environment variables. All settings are optional — defaults work for most projects.

| Variable | Default | Description |
|---|---|---|
| `PI_LSP_ENABLED` | `true` | Enable/disable LSP integration |
| `PI_LSP_DIAGNOSTICS` | `true` | Auto-append diagnostics after edit/write |
| `PI_LSP_DOWNLOAD` | `true` | Auto-download missing LSP servers |
| `PI_LSP_TIMEOUT` | `45000` | Server initialization timeout (ms) |
| `PI_LSP_DIAGNOSTICS_TIMEOUT` | `3000` | Max wait for diagnostics after edit (ms) |
| `PI_LSP_DIAGNOSTICS_DEBOUNCE` | `150` | Debounce window for diagnostic batches (ms) |
| `PI_LSP_MAX_DIAGNOSTICS` | `20` | Max error lines shown per file |
| `PI_LSP_MAX_CROSS_FILE_DIAGNOSTICS` | `5` | Max other files to show diagnostics for after write |
| `PI_LSP_SERVERS` | `auto` | Comma-separated server IDs, or `auto` for all |

---

## Tools

### `lsp`

Interact with Language Server Protocol servers for code intelligence.

```
operation: string   — one of the 9 operations below
filePath: string    — absolute or relative path to the file
line: number        — line number (1-based)
character: number   — character offset (1-based)
query?: string      — search query (for workspaceSymbol only)
```

#### Operations

| Operation | Description | Uses line/char? |
|---|---|---|
| `goToDefinition` | Jump to where a symbol is defined | ✓ |
| `findReferences` | Find all references to a symbol | ✓ |
| `hover` | Get type signature and documentation | ✓ |
| `documentSymbol` | List all symbols in a file | ✗ (lists all) |
| `workspaceSymbol` | Search symbols across the workspace | ✗ (uses `query`) |
| `goToImplementation` | Find implementations of an interface | ✓ |
| `prepareCallHierarchy` | Get call hierarchy item at position | ✓ |
| `incomingCalls` | Find all callers of a function | ✓ |
| `outgoingCalls` | Find all callees of a function | ✓ |

---

## Auto-Diagnostics

When `PI_LSP_DIAGNOSTICS=true` (default), pi-lsp intercepts every `edit` and `write` tool result:

1. After the built-in tool writes the file, pi-lsp notifies the LSP server
2. Waits up to 3 seconds for diagnostic results (with 150ms debounce)
3. Filters to severity 1 (ERROR) only
4. Appends formatted errors to the tool result

The LLM sees the errors in the same response as the edit confirmation, so it can fix them immediately without an extra turn.

### Cross-file diagnostics

- After `write`, diagnostics from up to 5 other files are also shown (catches cascade errors in files that import the written file)
- After `edit`, only the edited file's diagnostics are shown
- **TypeScript first-publish skip**: on the very first `textDocument/didOpen`, TypeScript publishes syntactic-only diagnostics before semantic analysis completes. pi-lsp skips that first publish and waits for the full semantic result.

### Read pre-heating

When the LLM reads a file, the LSP server is pre-heated in the background (fire-and-forget). This means the first `edit` after a `read` gets diagnostics faster because the server has already opened and analyzed the file.

---

## Slash Commands

| Command | Description |
|---|---|
| `/lsp-status` | Show which LSP servers are running |

---

## Supported Languages

### Phase 1 (current)

| Language | Server | Extensions | Auto-install? |
|---|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | ✓ (npm) |
| Python | `pyright` | `.py`, `.pyi` | ✓ (npm) |
| Ruby | `rubocop` | `.rb`, `.rake`, `.gemspec`, `.ru` | ✓ (gem) |

### How Server Detection Works

Each server defines root detection patterns:

- **TypeScript**: walks up looking for `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`. Skips if `deno.json` is found.
- **Python**: walks up looking for `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`, `pyrightconfig.json`. Auto-detects `.venv/bin/python`.
- **Ruby**: walks up looking for `Gemfile`, `Gemfile.lock`.

---

## Architecture

```
extensions/lsp/
├── index.ts               Extension entry point — registers tool, events, commands
├── config.ts              Configuration from environment variables
├── language-map.ts        File extension → LSP languageId mapping
├── root-detector.ts       Walk-up project root detection
├── server-registry.ts     Server definitions (TS, Python, Ruby)
├── installer.ts           Auto-download missing servers
├── client.ts              JSON-RPC client (file sync, diagnostics, LSP requests)
├── diagnostics.ts         Format diagnostics as XML for LLM
├── server-manager.ts      Orchestrator: lazy spawn, client reuse, crash recovery
├── tools.ts               LSP tool definition (9 operations)
└── test-helpers/
    └── mock-lsp-server.mjs  Mock LSP server for testing
```

### Key Design Decisions

1. **Diagnostics via `tool_result` event** — intercepts edit/write results without overriding built-in tools
2. **Lazy spawning** — servers start when first needed, not on session start
3. **Spawn deduplication** — concurrent requests for the same server+root share a single spawn
4. **Broken server tracking** — failed servers are marked and not retried in the same session
5. **Proper LSP lifecycle** — shutdown request → exit notification → process kill
6. **stderr drain** — prevents deadlock from verbose server logs

### Diagnostics Flow

```
LLM calls read("src/api.ts")
  ↓
pi-lsp's tool_result handler fires (fire-and-forget pre-heat)
  └── Spawns/finds LSP server, sends textDocument/didOpen in background

LLM calls edit("src/api.ts", ...)
  ↓
Pi's built-in edit tool writes the file
  ↓
pi-lsp's tool_result handler fires
  ↓
manager.touchFile("src/api.ts", true)
  ├── Find/spawn matching LSP server (already warm if file was read first)
  ├── Send textDocument/didChange (full content sync)
  └── Wait for publishDiagnostics notification (150ms debounce, 3s timeout)
  ↓
manager.getDiagnostics("src/api.ts")
  ├── Filter severity === 1 (ERROR only)
  └── Format as <diagnostics> XML
  ↓
Append to edit result → LLM sees errors immediately
```

---

## Development

```bash
# Run tests
pnpm --filter @josorio/pi-lsp test

# Type check
pnpm --filter @josorio/pi-lsp exec tsc --noEmit

# Run specific test file
pnpm --filter @josorio/pi-lsp exec vitest run extensions/lsp/client.test.ts
```

### Testing Strategy

Tests use a real mock LSP server (`mock-lsp-server.mjs`) — a standalone Node.js script that speaks JSON-RPC over stdin/stdout. This provides high-fidelity integration tests without mocking the wire protocol.

---

## License

MIT
