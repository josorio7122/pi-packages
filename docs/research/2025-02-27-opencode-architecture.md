# Research: OpenCode Terminal AI Agent Architecture

## Project Summary
**Repository:** [opencode-ai/opencode](https://github.com/opencode-ai/opencode)  
**Status:** Archived (moved to [Crush](https://github.com/charmbracelet/crush))  
**Language:** Go  
**Architecture:** Terminal-based TUI (Bubble Tea) with pluggable LLM providers  
**Stars:** 11,139 | **Forks:** 1,074

---

## 1. Project Initialization & Context Gathering

### Configuration Loading Flow

**Entry Point:** `cmd/root.go`
- Loads config via `config.Load(cwd, debug)`
- Supports both interactive mode and non-interactive prompt mode
- Sets up LSP clients and initializes the Coder Agent

**Configuration Priority:**
```
1. Environment variables (OPENCODE_* prefixed)
2. Global config: ~/.opencode.json
3. XDG_CONFIG_HOME/opencode/.opencode.json  
4. .opencode.json (local project directory) - MERGES with global
```

**Key Configuration Fields:**
- `data.directory` - where application state lives (default: `.opencode`)
- `debug` - enable debug mode
- `contextPaths` - list of project instruction files to include
- `providers` - LLM provider API keys and config
- `agents` - defines which model each agent type uses
- `mcpServers` - Model Control Protocol server definitions
- `lsp` - Language Server Protocol configurations
- `shell` - shell path and args
- `tui.theme` - terminal theme selection

(Source: `internal/config/config.go`, lines 95-183)

---

## 2. Project Context Files (Their Equivalent of CLAUDE.md)

### Default Context Paths

OpenCode looks for **project-specific instructions** in these locations (in order):

```go
var defaultContextPaths = []string{
	".github/copilot-instructions.md",  // GitHub Copilot format
	".cursorrules",                      // Cursor IDE format
	".cursor/rules/",                    // Cursor directory format
	"CLAUDE.md",                         // Anthropic standard
	"CLAUDE.local.md",                   // Local override
	"opencode.md",                       // Project-specific
	"opencode.local.md",                 // Local override
	"OpenCode.md",                       // Variant
	"OpenCode.local.md",                 // Local override
	"OPENCODE.md",                       // Variant
	"OPENCODE.local.md",                 // Local override
}
```

**Retrieval Mechanism:**

1. **On Agent Initialization:**
   - Context files are read via `getContextFromPaths()` in `internal/llm/prompt/prompt.go`
   - Results are **cached with `sync.Once`** (evaluated once per session)
   - Only used for `AgentCoder` and `AgentTask` agents

2. **Processing:**
   - **Parallel file reads** for all context paths
   - **Case-insensitive deduplication** to avoid duplicate content
   - Directory paths (ending with `/`) are **walked recursively**
   - Single files are read individually
   - Each file prepended with `# From:{filepath}` metadata

3. **Injection into System Prompt:**
   ```
   System Prompt
   + Environment Info
   + Project-Specific Context (if exists)
   ```

(Source: `internal/llm/prompt/prompt.go`, lines 39-105)

---

## 3. File Reading Implementation

### View Tool (Core File Reader)

**Tool Name:** `view`  
**File:** `internal/llm/tools/view.go`

**Parameters:**
```json
{
  "file_path": "string (required)",
  "offset": "integer (optional, 0-based line number)",
  "limit": "integer (optional, defaults to 2000)"
}
```

**Capabilities:**
- **Max file size:** 250KB
- **Default line limit:** 2000 lines
- **Max line length:** 2000 chars (truncated + "...")
- **Features:**
  - Line number prefixes (`NNNNNN|content`)
  - Offset-based reading for large files
  - File not found → suggests similar filenames
  - Image file detection (JPG, PNG, GIF, SVG, WebP)
  - LSP diagnostic output (linting, type errors)

**File Reading Implementation:**
```go
func readTextFile(filePath string, offset, limit int) (string, int, error) {
    // Uses bufio.Scanner for memory-efficient line reading
    // Handles offset by skipping first N lines
    // Returns (content, totalLineCount, error)
}
```

(Source: `internal/llm/tools/view.go`, lines 108-156)

---

## 4. File Discovery & Glob Patterns

### Glob Tool

**Tool Name:** `glob`  
**File:** `internal/llm/tools/glob.go`

**Parameters:**
```json
{
  "pattern": "string (required)",
  "path": "string (optional, defaults to cwd)"
}
```

**Features:**
- **Backend:** Ripgrep (rg) if available, falls back to doublestar
- **Glob syntax:** Standard Go glob + `**` for recursive
- **Result limit:** 100 files (newest first)
- **Hidden file skipping:** Enabled (dot files ignored)
- **Sorting:** By modification time (newest first)

**Example patterns:**
```
*.js              → All JS in current dir
**/*.ts           → All TS recursively
src/**/*.tsx      → TS in src/
*.{html,css}      → Multiple extensions
```

(Source: `internal/llm/tools/glob.go`, lines 87-162)

### Directory Listing Tool

**Tool Name:** `ls`  
**File:** `internal/llm/tools/ls.go`

**Features:**
- Tree-structured output with recursion
- 1000 file limit (before truncation)
- Automatically skips:
  - Hidden files/dirs (starting with `.`)
  - Common ignore: `__pycache__`, `node_modules`, `vendor`, `dist`, `build`, etc.
- Supports custom ignore patterns

---

## 5. Text Search Tool

**Tool Name:** `grep`  
**File:** `internal/llm/tools/grep.go`

**Capabilities:**
- Full-text search across files
- Case sensitivity option
- Context lines (before/after)
- Multiple search patterns
- Respects gitignore
- Uses ripgrep when available

---

## 6. Prompt Template Architecture

### System Prompt Generation

**File:** `internal/llm/prompt/`

**Multi-Agent System:**

1. **CoderPrompt** (main agent)
   - Anthropic base: Long, detailed system prompt
   - OpenAI base: Different tone/style
   - Includes environment info (git status, platform, CWD)
   - Includes LSP information availability
   - **Project context appended** if context files exist

2. **TitlePrompt** (generates session title)
   - Minimal prompt (80 token limit)
   - Just summarizes the conversation starter

3. **TaskPrompt** (for task analysis)
   - Similar to coder but different constraints

4. **SummarizerPrompt** (auto-compacting conversations)
   - Summarizes long sessions before context window limit

### Base System Prompts

**Anthropic Version:**
```markdown
You are OpenCode, an interactive CLI tool that helps users with software engineering tasks...

# Memory
OpenCode.md serves as a persistent memory file for:
- Build/test/lint commands
- Code style preferences  
- Codebase organization notes

# Tone and style
- Concise, direct, to the point
- Explain non-trivial bash commands
- Minimize output tokens (< 4 lines unless asked)
- No preamble/postamble
```

**OpenAI Version:**
```markdown
You are operating as and within the OpenCode CLI...
- Stream responses and emit function calls
- Work inside a sandboxed, git-backed workspace
- Only terminate your turn when problem is solved
```

(Source: `internal/llm/prompt/coder.go`, lines 14-156)

### Environment Info Injection

Every prompt includes:
```
Working directory: /path/to/project
Is directory a git repo: Yes/No
Platform: linux/darwin/windows
Today's date: 2/27/2026
<project>
  [Output from `ls .` tool]
</project>
```

This is **generated fresh per request** via the `ls` tool.

---

## 7. Tool Framework

### Base Tool Interface

**File:** `internal/llm/tools/tools.go`

```go
type BaseTool interface {
    Info() ToolInfo                    // Metadata: name, description, params
    Run(ctx context.Context, params ToolCall) (ToolResponse, error)
}

type ToolResponse struct {
    Type     toolResponseType  // "text" | "image"
    Content  string            // Tool output
    Metadata string            // JSON metadata (files count, truncated flag, etc.)
    IsError  bool              // Error flag
}
```

### Built-in Tools

| Tool | Purpose | File |
|------|---------|------|
| `view` | Read file contents | `tools/view.go` |
| `glob` | Find files by pattern | `tools/glob.go` |
| `ls` | List directories | `tools/ls.go` |
| `grep` | Search file contents | `tools/grep.go` |
| `bash` | Execute shell commands | `tools/bash.go` |
| `edit` | Apply code patches/edits | `tools/edit.go` |
| `write` | Create new files | `tools/write.go` |
| `fetch` | Download from URLs | `tools/fetch.go` |
| `patch` | Git-style patching | `tools/patch.go` |
| `sourcegraph` | Code search integration | `tools/sourcegraph.go` |
| `diagnostics` | LSP diagnostic aggregation | `tools/diagnostics.go` |

(Source: `internal/llm/tools/`)

---

## 8. Agent Execution Model

**File:** `internal/llm/agent/agent.go`

### Agent Service Interface

```go
type Service interface {
    Run(ctx context.Context, sessionID string, content string, 
        attachments ...message.Attachment) (<-chan AgentEvent, error)
    Cancel(sessionID string)
    IsSessionBusy(sessionID string) bool
    IsBusy() bool
    Update(agentName config.AgentName, modelID models.ModelID) (models.Model, error)
    Summarize(ctx context.Context, sessionID string) error
}
```

### Execution Flow

1. **Session Creation:** Each conversation → new `session` record
2. **Message Entry:** User input → `message` table
3. **Agent Processing:**
   - LLM provider sends system prompt + history + tools
   - Model emits tool calls (function_calls)
   - Each tool executes with sandboxed context
   - Results fed back to model
   - Repeat until model stops emitting calls
4. **Session Finalization:**
   - All messages persisted
   - Auto-title generation (via TitleAgent)
   - Auto-compacting if > 95% context window (via SummarizerAgent)

### Multi-Provider Support

**Supported Providers:**
- GitHub Copilot (GPT-4o)
- Anthropic Claude (Claude 4 Sonnet / 3.7 Sonnet)
- OpenAI (GPT-4-Turbo, GPT-4o, GPT-4.1)
- Google Gemini (Gemini 2.5, 2.5 Flash)
- Groq (QWEN QWQ)
- Azure OpenAI
- AWS Bedrock
- Google Cloud VertexAI
- OpenRouter
- XAI Grok

**Provider Priority (for model selection):**
1. Copilot (if GitHub token available)
2. Anthropic
3. OpenAI
4. Gemini
5. Groq
6. OpenRouter
7. AWS Bedrock
8. Azure
9. VertexAI

(Source: `internal/config/config.go`, lines 252-380)

---

## 9. File Utility Helpers

**File:** `internal/fileutil/fileutil.go`

**Key Utilities:**

```go
func SkipHidden(path string) bool
    // Skips: dot files, node_modules, vendor, dist, build, target, 
    // .git, .idea, .vscode, __pycache__, bin, obj, coverage, etc.

func GlobWithDoublestar(pattern, searchPath string, limit int) ([]string, bool, error)
    // File matching via doublestar v4
    // Returns (files, truncated, error)

func GetRgCmd(globPattern string) *exec.Cmd
    // Returns ripgrep command if available
    // Falls back to doublestar if rg not found
```

**Dependency Chain:**
- Prefers `ripgrep (rg)` for performance
- Falls back to `doublestar` library (Go stdlib glob alternative)
- Both support `**` recursive patterns

---

## 10. Configuration Schema

**Supported via JSON Schema:** `cmd/schema/main.go`

**Key Configuration Options:**

```json
{
  "data": {
    "directory": ".opencode"  // SQLite DB location
  },
  "contextPaths": [           // Custom context file paths
    "CLAUDE.md",
    "opencode.md"
  ],
  "agents": {
    "coder": {
      "model": "claude-3-5-sonnet",
      "maxTokens": 5000,
      "reasoningEffort": "medium"  // OpenAI/Anthropic only
    }
  },
  "providers": {
    "anthropic": {
      "apiKey": "sk-...",
      "disabled": false
    }
  },
  "mcpServers": {
    "custom": {
      "command": "node /path/to/server.js",
      "type": "stdio",  // stdio | sse
      "args": ["--flag"]
    }
  },
  "lsp": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "disabled": false
    }
  },
  "tui": {
    "theme": "opencode"  // or catppuccin, dracula, gruvbox, etc.
  },
  "shell": {
    "path": "/bin/bash",
    "args": ["-l"]
  },
  "autoCompact": true        // Auto-summarize when near context limit
}
```

---

## 11. Key Design Decisions

### 1. **Sync.Once for Context Loading**
- Context files read once per session
- Cached in module-level variable
- Avoids repeated filesystem I/O

### 2. **Parallel Tool Execution**
- Context paths processed in goroutines
- Results collected with `sync.Mutex` to prevent duplicates
- Case-insensitive deduplication

### 3. **Case-Insensitive Deduplication**
- Multiple context file locations (CLAUDE.md, claude.md, Claude.md)
- Tracked in `processedFiles map[string]bool` with lowercase keys

### 4. **Ripgrep Fallback Strategy**
- Prefers ripgrep for performance (respects gitignore)
- Falls back to doublestar if rg not found
- Graceful degradation

### 5. **LSP Integration**
- Language servers run as separate processes
- Diagnostic output attached to file view results
- Optional (can be disabled per language)

### 6. **Persistent SQLite Database**
- All sessions, messages, and history stored
- Enables session resumption
- Auto-compacting mechanism summarizes old sessions

### 7. **Permission System**
- Tool execution requires user approval (interactive mode)
- Non-interactive mode auto-approves
- Used for file operations, URL fetching, etc.

---

## 12. How Pi Could Adopt This Pattern

### For Pi:

1. **Config Loading Strategy:**
   - Follow OpenCode's multi-location search (home, XDG, project-local)
   - Support both `.pirc` and `.pi.json` formats
   - Merge project-local with global config

2. **Context File Pattern:**
   - Expand search to include: `PI.md`, `PI.local.md`, `.pirc-context`
   - Same parallel + deduplication approach
   - Inject into system prompt at known marker

3. **Tool Framework:**
   - Adopt OpenCode's `BaseTool` interface pattern
   - Implement context propagation via `tools.SessionIDContextKey`
   - Support both sync and async tools

4. **File Operations:**
   - Use ripgrep + doublestar strategy
   - Implement view tool with offset/limit
   - Add LSP integration for language-specific features

5. **Agent Orchestration:**
   - Multi-agent pattern (coder, summarizer, task analyzer)
   - Provider abstraction layer
   - Auto-compacting for long conversations

---

## Sources

- [OpenCode GitHub Repository](https://github.com/opencode-ai/opencode) — archived but complete
- `internal/config/config.go` — configuration loading (lines 95-383)
- `internal/llm/prompt/prompt.go` — context gathering (lines 39-105)
- `internal/llm/prompt/coder.go` — system prompt templates (lines 14-156)
- `internal/llm/tools/view.go` — file reading tool (250KB max, 2000 line default)
- `internal/llm/tools/glob.go` — file discovery (ripgrep + doublestar)
- `internal/llm/agent/agent.go` — agent execution model
- `internal/fileutil/fileutil.go` — file utilities and skipping logic
- `cmd/root.go` — CLI entry point and initialization
- `cmd/schema/main.go` — JSON schema definition

---

## Appendix: Example Context Flow

1. User runs: `opencode` in `/project`
2. Config loads from: `~/.opencode.json` + `/project/.opencode.json`
3. Coder Agent initializes:
   - Reads context paths: `CLAUDE.md`, `opencode.md`, `.cursor/rules/`, etc.
   - Caches result via `sync.Once`
4. User enters prompt: "Fix the auth bug"
5. System prompt = BasePrompt + EnvironmentInfo + ProjectContext
6. LLM responds with tool calls:
   - `glob` → find files matching pattern
   - `view` → read specific file
   - `grep` → search for "auth" in codebase
   - `edit` → apply code changes
   - `bash` → run tests
7. Agent continues until problem solved
8. Session saved to SQLite
9. If conversation grows > 95% context, auto-compacting triggered

---

**Research completed:** 2025-02-27  
**Researcher:** Claude Code  
**Archive status:** Project archived Sep 2025, moved to Crush (charmbracelet)
