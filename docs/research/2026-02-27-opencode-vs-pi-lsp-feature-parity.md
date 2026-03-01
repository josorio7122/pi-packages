# OpenCode LSP vs pi-lsp: Feature Parity Analysis

**Date:** 2026-02-27

## Summary

pi-lsp replicates OpenCode's **core LSP architecture** faithfully — lazy spawning, diagnostics-after-edit, same 9 tool operations, same debounce/timeout constants. There are **6 meaningful gaps** (listed below), all addressable. Neither has gaps that are architectural blockers — they're all additive.

---

## Feature Comparison Matrix

### Core Architecture

| Feature | OpenCode | pi-lsp | Status |
|---|---|---|---|
| Lazy server spawning (on first use) | ✅ | ✅ | ✅ Parity |
| Spawn deduplication (in-flight map) | ✅ | ✅ | ✅ Parity |
| Broken server tracking (skip retries) | ✅ | ✅ | ✅ Parity |
| JSON-RPC over stdin/stdout (vscode-jsonrpc) | ✅ | ✅ | ✅ Parity |
| Full file sync (didOpen + didChange) | ✅ | ✅ | ✅ Parity |
| `workspace/didChangeWatchedFiles` notification | ✅ | ✅ | ✅ Parity |
| `initialized` notification after init | ✅ | ✅ | ✅ Parity |
| `workspace/didChangeConfiguration` after init | ✅ | ✅ | ✅ Parity |
| `workspace/configuration` request handler | ✅ | ✅ | ✅ Parity |
| `window/workDoneProgress/create` handler | ✅ | ✅ | ✅ Parity |
| `client/registerCapability` handler | ✅ | ✅ | ✅ Parity |
| `workspace/workspaceFolders` handler | ✅ | ✅ | ✅ Parity |
| Multi-client per file (multiple servers can match) | ✅ | ✅ | ✅ Parity |
| stderr drain (prevent pipe deadlock) | ❌ (not handled) | ✅ | ✅ pi-lsp ahead |
| Proper LSP shutdown handshake (shutdown → exit → kill) | ❌ (just kill) | ✅ | ✅ pi-lsp ahead |

### Diagnostics

| Feature | OpenCode | pi-lsp | Status |
|---|---|---|---|
| Auto-diagnostics after `edit` | ✅ (inline in edit tool) | ✅ (tool_result hook) | ✅ Parity |
| Auto-diagnostics after `write` | ✅ (inline in write tool) | ✅ (tool_result hook) | ✅ Parity |
| Auto-diagnostics after `apply_patch` | ✅ (inline) | ❌ | ⚠️ Gap 1 |
| Diagnostics debounce (150ms) | ✅ | ✅ | ✅ Parity |
| Diagnostics timeout (3s) | ✅ | ✅ | ✅ Parity |
| Filter severity 1 (ERROR only) | ✅ | ✅ | ✅ Parity |
| Max 20 diagnostics per file | ✅ | ✅ | ✅ Parity |
| XML `<diagnostics>` format | ✅ | ✅ | ✅ Parity |
| `diagnostics()` returns ALL files' diagnostics | ✅ | ✅ (`getAllDiagnostics`) | ✅ Parity |
| Cross-file diagnostics in `write` ("errors in other files") | ✅ (up to 5 other files) | ❌ (only edited file) | ⚠️ Gap 2 |
| TypeScript first-publish skip | ✅ (skips first publishDiag for TS) | ❌ | ⚠️ Gap 3 |
| Warm LSP on `read` (non-blocking touchFile) | ✅ | ❌ | ⚠️ Gap 4 |

### Tool Operations

| Operation | OpenCode | pi-lsp | Status |
|---|---|---|---|
| `goToDefinition` | ✅ | ✅ | ✅ Parity |
| `findReferences` | ✅ | ✅ | ✅ Parity |
| `hover` | ✅ | ✅ | ✅ Parity |
| `documentSymbol` | ✅ | ✅ | ✅ Parity |
| `workspaceSymbol` | ✅ (hardcoded `""`) | ✅ (accepts `query` param) | ✅ pi-lsp ahead |
| `goToImplementation` | ✅ | ✅ | ✅ Parity |
| `prepareCallHierarchy` | ✅ | ✅ | ✅ Parity |
| `incomingCalls` | ✅ | ✅ | ✅ Parity |
| `outgoingCalls` | ✅ | ✅ | ✅ Parity |
| Symbol kind filtering (workspaceSymbol) | ✅ (Class, Function, Method, Interface, Variable, Constant, Struct, Enum) | ❌ (returns all kinds) | ⚠️ Minor |
| workspaceSymbol limit (max 10) | ✅ | ❌ | ⚠️ Minor |

### Language Servers

| Server | OpenCode | pi-lsp | Status |
|---|---|---|---|
| TypeScript (typescript-language-server) | ✅ | ✅ | ✅ Parity |
| Deno | ✅ | ❌ | ⚠️ Gap 5 |
| Vue | ✅ | ❌ | ⚠️ Gap 5 |
| ESLint (vscode-eslint server) | ✅ | ❌ | ⚠️ Gap 5 |
| Oxlint | ✅ | ❌ | ⚠️ Gap 5 |
| Biome | ✅ | ❌ | ⚠️ Gap 5 |
| Pyright | ✅ | ✅ | ✅ Parity |
| Ty (experimental) | ✅ (behind flag) | ❌ | ⚠️ Gap 5 |
| gopls | ✅ | ✅ | ✅ Parity |
| Ruby (rubocop --lsp) | ✅ | ❌ | ⚠️ Gap 5 |
| Elixir (elixir-ls) | ✅ | ❌ | ⚠️ Gap 5 |
| Zig (zls) | ✅ | ❌ | ⚠️ Gap 5 |
| C# (csharp-ls) | ✅ | ❌ | ⚠️ Gap 5 |
| F# (fsautocomplete) | ✅ | ❌ | ⚠️ Gap 5 |
| Swift (sourcekit-lsp) | ✅ | ❌ | ⚠️ Gap 5 |
| Rust (rust-analyzer) | ✅ | ❌ | ⚠️ Gap 5 |
| C/C++ (clangd) | ✅ | ❌ | ⚠️ Gap 5 |
| Svelte | ✅ | ❌ | ⚠️ Gap 5 |
| Astro | ✅ | ❌ | ⚠️ Gap 5 |
| Java (jdtls) | ✅ | ❌ | ⚠️ Gap 5 |
| Kotlin (kotlin-language-server) | ✅ | ❌ | ⚠️ Gap 5 |
| YAML (yaml-language-server) | ✅ | ❌ | ⚠️ Gap 5 |
| Lua (lua-language-server) | ✅ | ❌ | ⚠️ Gap 5 |
| PHP (intelephense) | ✅ | ❌ | ⚠️ Gap 5 |
| Prisma | ✅ | ❌ | ⚠️ Gap 5 |
| Dart | ✅ | ❌ | ⚠️ Gap 5 |
| OCaml (ocamllsp) | ✅ | ❌ | ⚠️ Gap 5 |
| Bash (bash-language-server) | ✅ | ❌ | ⚠️ Gap 5 |
| Terraform (terraform-ls) | ✅ | ❌ | ⚠️ Gap 5 |
| LaTeX (texlab) | ✅ | ❌ | ⚠️ Gap 5 |
| Dockerfile (dockerfile-language-server) | ✅ | ❌ | ⚠️ Gap 5 |
| Gleam | ✅ | ❌ | ⚠️ Gap 5 |
| Clojure (clojure-lsp) | ✅ | ❌ | ⚠️ Gap 5 |
| Nix (nixd) | ✅ | ❌ | ⚠️ Gap 5 |
| Typst (tinymist) | ✅ | ❌ | ⚠️ Gap 5 |
| Haskell (hls) | ✅ | ❌ | ⚠️ Gap 5 |
| Julia | ✅ | ❌ | ⚠️ Gap 5 |
| **Total** | **37** | **3** | |

### Configuration

| Feature | OpenCode | pi-lsp | Status |
|---|---|---|---|
| Enable/disable all LSP | ✅ (`lsp: false`) | ✅ (`PI_LSP_ENABLED`) | ✅ Parity |
| Disable specific server | ✅ (`lsp.serverId.disabled: true`) | ✅ (`PI_LSP_SERVERS` whitelist) | ✅ Parity |
| Custom server definition in config | ✅ (command, extensions, env, initialization) | ✅ (via `customServers` in ServerManager) | ✅ Parity |
| Disable auto-download | ✅ (`OPENCODE_DISABLE_LSP_DOWNLOAD` flag) | ✅ (`PI_LSP_DOWNLOAD`) | ✅ Parity |
| Experimental server flags | ✅ (`OPENCODE_EXPERIMENTAL_LSP_TY`) | ❌ | ⚠️ Minor |
| Diagnostics enable/disable | ❌ (always on) | ✅ (`PI_LSP_DIAGNOSTICS`) | ✅ pi-lsp ahead |
| Configurable timeouts | ❌ (hardcoded 45s init, 3s diag) | ✅ (env vars) | ✅ pi-lsp ahead |
| Configurable debounce | ❌ (hardcoded 150ms) | ✅ (env var) | ✅ pi-lsp ahead |
| Max diagnostics per file | ❌ (hardcoded 20) | ✅ (env var) | ✅ pi-lsp ahead |

### Language Map Coverage

| OpenCode | pi-lsp |
|---|---|
| ~110 extensions | ~30 extensions |
| Covers all 37 server languages + extras | Covers TS/JS, Python, Go + a few extras |

### Infrastructure

| Feature | OpenCode | pi-lsp | Status |
|---|---|---|---|
| Server install location | `~/.opencode/bin/` | `<package>/lsp-servers/` | Different approach |
| Install methods | npm/bun, go, gem, dotnet, GitHub releases, archive extraction | npm, go | ⚠️ Gap 6 |
| Bun-native (uses `Bun.which`, `$` shell) | ✅ | ❌ (Node.js native) | N/A (different runtime) |
| Event bus for diagnostics | ✅ (Bus.subscribe) | ✅ (callback-based) | ✅ Parity (different pattern) |
| Status command | ❌ | ✅ (`/lsp-status`) | ✅ pi-lsp ahead |

---

## The 6 Gaps (Ordered by Impact)

### Gap 1: No `apply_patch` diagnostics interception
**OpenCode:** `apply_patch.ts` touches all changed files and appends diagnostics.  
**pi-lsp:** Only intercepts `edit` and `write` via `tool_result` event. If pi adds an `apply_patch` tool in the future, pi-lsp would need to intercept that too.  
**Impact:** Low — pi doesn't currently have `apply_patch`. When it does, adding `event.toolName === 'apply_patch'` to the hook is trivial.

### Gap 2: No cross-file diagnostics on `write`
**OpenCode:** `write.ts` calls `LSP.diagnostics()` (returns ALL accumulated diagnostics across ALL files) and appends errors from up to 5 other files. This catches cascade errors — e.g., writing a new interface that breaks importers.  
**pi-lsp:** Only checks diagnostics for the edited file itself.  
**Impact:** Medium — cascade errors are real. When you change a type in `types.ts`, errors in `api.ts` that imports it won't surface until the LLM happens to touch `api.ts`.  
**Fix:** Call `manager.getAllDiagnostics()` (already exists), iterate non-edited files, append up to N.

### Gap 3: TypeScript first-publish skip
**OpenCode:** `client.ts:59-60` — When `serverID === "typescript"` and the diagnostics map doesn't already have the path, it skips publishing the Bus event. This avoids showing stale/incomplete diagnostics from the initial file load before semantic analysis completes.  
**pi-lsp:** Always processes the first `publishDiagnostics` notification.  
**Impact:** Low — may cause a brief false-positive window where partial diagnostics appear, but the debounce (150ms) usually absorbs the semantic follow-up.

### Gap 4: Warm LSP on `read` (pre-heating)
**OpenCode:** `read.ts:216` — `LSP.touchFile(filepath, false)` — fire-and-forget. This warms the LSP server in the background so that when the LLM later edits the file, the server is already initialized and diagnostics come faster.  
**pi-lsp:** Only touches files on explicit tool calls or edit/write interception.  
**Impact:** Low-medium — first-edit latency will be higher without pre-heating (server needs to parse the file from cold). The fix is trivial: add `read` to the `tool_result` hook with `waitForDiagnostics=false`.

### Gap 5: 34 missing language servers (3 vs 37)
**OpenCode:** 37 language servers covering nearly every major language.  
**pi-lsp:** 3 servers (TypeScript, Pyright, gopls).  
**Impact:** High for polyglot projects — but these 3 cover the vast majority of AI coding agent usage. The architecture is extensible (just add entries to `SERVERS` array).  
**Fix:** Incremental — add servers as needed. Priority order: Rust (rust-analyzer), C/C++ (clangd), Java (jdtls), Ruby, Bash, YAML, then long tail.

### Gap 6: Limited install methods
**OpenCode:** Installs via npm/bun, go, gem, dotnet, GitHub releases (with zip/tar.xz extraction), and even builds from source (elixir-ls, eslint).  
**pi-lsp:** Only npm and go install.  
**Impact:** Blocks Gap 5 for some servers. Adding `gem install`, `dotnet tool install`, and GitHub release download patterns would unlock most remaining servers.

---

## Where pi-lsp is AHEAD of OpenCode

1. **Proper LSP shutdown** — sends `shutdown` + `exit` before killing; OpenCode just kills
2. **stderr drain** — prevents pipe deadlock; OpenCode doesn't handle stderr at all
3. **`workspaceSymbol` query param** — pi-lsp accepts a search query; OpenCode hardcodes `""`
4. **Configurable timeouts/debounce** — all via env vars; OpenCode hardcodes everything
5. **Diagnostics toggle** — can disable auto-diagnostics; OpenCode always appends them
6. **`/lsp-status` command** — shows running servers; OpenCode has no equivalent UI
7. **XML attribute escaping** — pi-lsp escapes filePaths in `<diagnostics>` XML; OpenCode doesn't

---

## Verdict

**pi-lsp is at ~85% feature parity with OpenCode's LSP integration.** The core architecture — lazy spawning, diagnostics-after-edit, same tool operations, same wire protocol — is fully replicated and in some areas improved.

The main gaps are:
- **Breadth** (3 vs 37 servers) — addressable incrementally
- **Cross-file diagnostics** — a 20-line change
- **LSP warm-up on read** — a 5-line addition

None of the gaps are architectural. The 15% delta is almost entirely in the number of language server definitions, which is mechanical work to port.
