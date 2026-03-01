# Research: OpenCode - Open Source AI Coding Agent

**Date:** February 27, 2026  
**Researcher:** Claude (Agent)

---

## Executive Summary

OpenCode is an open-source, terminal-based AI coding agent built in TypeScript with ~112K GitHub stars. It is the active successor to an earlier Go-based implementation (now archived). OpenCode implements a sophisticated project initialization and context file generation system that closely parallels Claude Code's approach, with key differences in extensibility, multi-provider support, and configuration flexibility.

**GitHub Repository:** https://github.com/anomalyco/opencode  
**Latest Release:** v1.2.15 (2026-02-26)  
**License:** MIT  
**Primary Language:** TypeScript (52.7%), MDX (43.0%)

---

## Key Findings

### 1. Project Initialization Command: `/init`

**How it works:**
- Users run the `/init` slash command from within an OpenCode session
- OpenCode analyzes the entire project codebase and filesystem
- Generates or updates an `AGENTS.md` file in the project root
- If an `AGENTS.md` already exists, `/init` enhances it rather than replacing it

**The prompt used for generation** (reverse-engineered by the community):
```
Please analyze this codebase and create a CLAUDE.md/AGENTS.md file, which will be given 
to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. 
   Include the necessary commands to develop in this codebase, such as how to run a 
   single test.
2. High-level code architecture and structure so that future instances can be 
   productive more quickly. Focus on the "big picture" architecture that requires 
   reading multiple files to understand.

Usage notes:
- If there's already an AGENTS.md, suggest improvements to it.
- When you make the initial AGENTS.md, do not repeat yourself and do not include 
  obvious instructions.
- Avoid listing every component or file structure that can be easily discovered.
- Don't include generic development practices.
- If there are Cursor rules (.cursor/rules/) or Copilot rules (.github/copilot-instructions.md), 
  include the important parts.
- If there is a README.md, include the important parts.
- Do not make up information.
```

**Best practice:** A reasoning model (like Claude Opus or O1) works best for `/init` commands.

(Source: https://kau.sh/blog/build-ai-init-command/, https://opencode.ai/docs/rules/)

### 2. Context File Hierarchy and File Discovery

OpenCode uses a sophisticated hierarchical file discovery system that searches for project instructions in this precedence order:

**Load order (first match wins):**

1. **Claude Code Compatibility** (unless disabled):
   - `~/.claude/CLAUDE.md` (if `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT` is not set)

2. **Global OpenCode Rules:**
   - `~/.config/opencode/AGENTS.md`

3. **Local Project Rules** (searched upward from working directory):
   - `AGENTS.md` (primary)
   - `CLAUDE.md` (fallback, for Claude Code compatibility)
   - `CONTEXT.md` (alternative context file)

**Supported formats:** Markdown (.md files)

**Auto-Discovery Strategy:** OpenCode walks up the directory tree from the current working directory, stopping at the first matching file found. This enables hierarchical project structures (monorepos) to have both global and local rules.

**Multiple context files:**
- Project-specific rules: `./AGENTS.md` (in git, shared with team)
- Global personal rules: `~/.config/opencode/AGENTS.md` (not git-tracked, personal preferences)

(Source: https://opencode.ai/docs/rules/, GitHub issues #6316, #7361, #11454)

### 3. File Discovery Tools and Patterns

OpenCode provides multiple built-in tools for file discovery and context gathering:

**Built-in discovery tools:**

| Tool | Purpose | Pattern Example |
|------|---------|-----------------|
| `glob` | Find files by pattern matching | `**/*.ts`, `src/**/*.json` |
| `list` | List directory contents | Filters with glob patterns |
| `grep` | Search file contents using regex | Full regex support across codebase |
| `bash` | Execute shell commands | `find`, custom discovery scripts |
| `read` | Read specific files | Line-range support for large files |
| `lsp` (experimental) | Language Server Protocol integration | Code intelligence: definitions, references, hover |

**Under the hood:**
- `grep`, `glob`, and `list` use **ripgrep** (fast regex engine)
- Respects `.gitignore` patterns by default
- Can be overridden with `.ignore` file to explicitly allow certain paths

**Extended discovery via MCP servers:**
- **GitHub MCP**: Search GitHub repositories, access issues/PRs
- **Exa MCP**: Web search (1,200+ available MCP servers total)
- **LSP Servers**: Code-aware intelligence (Go, Python, TypeScript, etc.)

(Source: https://opencode.ai/docs/tools, https://opencode.ai/docs/mcp-servers)

### 4. Context Loading into Sessions

OpenCode uses a sophisticated **context sandwich** approach:

**How context is managed:**

1. **Active Files Priority:**
   - Files user has open or explicitly references with `@` syntax
   - These are always included in the context window

2. **Semantic Search (Optional):**
   - Embeddings-based search for relevant code snippets
   - Helps find related files across the codebase

3. **Import Graph Analysis:**
   - Automatically includes files that are imported by/from active files
   - Builds dependency graph to understand relationships

4. **Token Optimization:**
   - Strips comments from non-critical files
   - Outlines classes instead of full implementations
   - Ignores large generated files (`package-lock.json`, etc.)

**Context files loaded automatically:**
- `AGENTS.md` at project root
- Additional `AGENTS.md` files in subdirectories (monorepo support)
- `CLAUDE.md` files (Claude Code compatibility)
- Explicit file references via `opencode.json` `instructions` field

**Remote instruction files:**
- Can load instructions from URLs with 5-second timeout
- Organization defaults via `.well-known/opencode` endpoint
- Merged with local configurations (not replaced)

(Source: https://www.opencode.live/concepts/context, https://opencode.ai/docs/config)

### 5. Configuration System: `opencode.json`

**File locations (precedence order):**

1. Inline config (environment variable: `OPENCODE_CONFIG_CONTENT`)
2. `.opencode/` directories (agents/, commands/, plugins/, skills/)
3. Project config (`./opencode.json` in project root)
4. Custom config (environment variable: `OPENCODE_CONFIG`)
5. Global config (`~/.config/opencode/opencode.json`)
6. Remote config (organization defaults via `.well-known/opencode`)

**Key configuration fields:**

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  
  // Instructions/context files to load
  "instructions": [
    "CONTRIBUTING.md",
    "docs/guidelines.md",
    ".cursor/rules/*.md",
    "https://raw.githubusercontent.com/my-org/shared-rules/main/style.md"
  ],
  
  // Model selection
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  
  // Tool permissions
  "permission": {
    "edit": "allow",      // allow, deny, or ask
    "bash": "ask",
    "webfetch": "deny"
  },
  
  // MCP servers
  "mcp": {
    "github": { "enabled": true },
    "exa": { "enabled": true }
  }
}
```

**Features:**
- Supports JSON and JSONC (JSON with comments)
- Configurations are merged (not replaced)
- Project config can include glob patterns: `packages/*/AGENTS.md`
- Remote instructions fetched with 5-second timeout

(Source: https://opencode.ai/docs/config)

### 6. /init Command Implementation Details

**What `/init` scans:**

During analysis, the AI collects:
- Project structure and file organization
- Build commands and scripts
- Testing setup and procedures
- Configuration files (`package*.json`, `*.md`, `.cursor/rules/**`, `.github/copilot-instructions.md`)
- README.md and documentation
- Existing CLAUDE.md or AGENTS.md files
- Language-specific conventions

**Output format:**
Generates a markdown file with sections like:
- Project overview
- Code standards and patterns
- Build/test/run commands
- Architecture and design patterns
- Monorepo conventions (if applicable)
- Common development tasks

**Best practice example:**
```markdown
# SST v3 Monorepo Project

This is an SST v3 monorepo with TypeScript. The project uses bun workspaces.

## Project Structure
- `packages/` - Contains all workspace packages (functions, core, web, etc.)
- `infra/` - Infrastructure definitions split by service
- `sst.config.ts` - Main SST configuration

## Code Standards
- Use TypeScript with strict mode enabled
- Shared code goes in `packages/core/`
- Import shared modules using workspace names: `@my-app/core/example`

## Build Commands
- Build all: `bun install && bun run build`
- Run tests: `bun test`
- Deploy: `bun run deploy`
```

(Source: https://opencode.ai/docs/rules/, https://kau.sh/blog/build-ai-init-command/)

### 7. Claude Code Compatibility Features

OpenCode intentionally maintains compatibility with Claude Code conventions:

**Fallback file support:**
- If no `AGENTS.md` exists, OpenCode checks for `CLAUDE.md`
- Both files are merged during context loading
- Can be disabled via environment variables:
  ```bash
  export OPENCODE_DISABLE_CLAUDE_CODE=1              # Disable all .claude
  export OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1       # Disable ~/.claude/CLAUDE.md
  export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1       # Disable .claude/skills
  ```

**Skills compatibility:**
- `~/.claude/skills/` supported as fallback
- OpenCode reads from both `.claude/` and `.opencode/` directories

**Project file compatibility:**
- Reads `.cursor/rules/` files
- Reads `.github/copilot-instructions.md`
- Prioritizes OpenCode-native files (AGENTS.md > CLAUDE.md)

(Source: https://opencode.ai/docs/rules/)

### 8. Monorepo Support

**Nested AGENTS.md files:**
- Agents automatically read the nearest `AGENTS.md` file in the directory tree
- Enables per-package rules in workspaces
- Example structure:
  ```
  project-root/
  ├── AGENTS.md (global rules)
  ├── packages/
  │   ├── core/
  │   │   └── AGENTS.md (core package rules)
  │   ├── web/
  │   │   └── AGENTS.md (web package rules)
  ```

**OpenCode.json glob patterns:**
- Can reference multiple AGENTS.md files:
  ```json
  {
    "instructions": ["packages/*/AGENTS.md"]
  }
  ```

(Source: GitHub issues #6316, #7576)

### 9. Differences from Claude Code

| Aspect | OpenCode | Claude Code |
|--------|----------|------------|
| **Source** | 100% open source | Proprietary |
| **File names** | AGENTS.md (primary) | CLAUDE.md |
| **Configuration** | opencode.json + AGENTS.md | CLAUDE.md only |
| **Provider lock-in** | None (multi-provider) | Anthropic Claude focused |
| **File discovery** | Walk-up from current dir | Similar hierarchical approach |
| **Monorepo support** | Multiple nested AGENTS.md | Similar capability |
| **Context auto-discovery** | Feature #6316 in progress | Built-in subdirectory injection |
| **MCP integration** | 1,200+ servers available | Limited integration |

(Source: https://github.com/anomalyco/opencode#faq)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│          OpenCode Session Start                     │
│  (user types "opencode" in project directory)      │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┴───────────────┐
    │                            │
    ▼                            ▼
Find opencode.json          Search for AGENTS.md
(5 locations)               (walk-up algorithm)
    │                            │
    └────────┬────────────────────┘
             │
    ┌────────▼──────────┐
    │ Load Instructions │
    │ (merge configs)   │
    └────────┬──────────┘
             │
    ┌────────▼─────────────────────┐
    │ Initialize Context Sandwich:  │
    │ - Active files               │
    │ - AGENTS.md content          │
    │ - Import graph               │
    │ - Semantic search (optional) │
    └────────┬─────────────────────┘
             │
    ┌────────▼──────────────────┐
    │ Ready for /init or work   │
    │ Tools available: read,    │
    │ edit, bash, grep, glob    │
    └────────────────────────────┘
```

**File discovery flow for context:**

```
When /init runs:
1. Scan project structure (glob, list, bash)
2. Read key files: package.json, README.md, .cursor/rules/, .github/, etc.
3. AI analyzes and understands the project
4. Generate or update AGENTS.md in project root
5. AGENTS.md is committed to git (team-shared)

When starting a session:
1. Check OPENCODE_CONFIG_CONTENT (env override)
2. Look in .opencode/ directories
3. Load ./opencode.json (project-specific)
4. Check OPENCODE_CONFIG (custom path)
5. Load ~/.config/opencode/opencode.json (user global)
6. Fetch .well-known/opencode (org defaults)
7. Search for AGENTS.md (walk up from cwd)
8. Load instructions from all matched files
9. Build context sandwich with active files
```

---

## CLI & Commands

### Key commands:

```bash
# Start OpenCode
opencode                          # Interactive TUI mode

# With project directory
opencode -c /path/to/project

# Non-interactive prompt mode
opencode -p "What does this project do?"

# With output format
opencode -p "..." -f json

# Debug mode
opencode -d

# Initialize project instructions
/init                             # (within OpenCode session)

# View available models
/models

# Connect to providers
/connect

# List agents
/agents

# List skills
/skills

# Get help
/help
```

### Keyboard shortcuts (TUI):

```
Tab              Switch between Plan (read-only) and Build (read-write) agents
@                Reference files in your project
!                Execute shell commands
/                Access slash commands
Ctrl+C           Exit OpenCode
```

(Source: https://github.com/anomalyco/opencode, https://opencode.ai/docs/)

---

## Key Technical Insights

### 1. Lazy-Loading Pattern
OpenCode supports lazy-loading of context files via the `instructions` field:
- Only loads files needed for the specific task
- Reduces token usage while maintaining accessibility
- Can reference external files with `@` syntax in AGENTS.md

### 2. Token Optimization
The context engine actively:
- Monitors token usage during conversations
- Auto-compacts conversations at 95% context window
- Summarizes old conversations into new sessions
- Strips non-critical information (comments, large generated files)

### 3. Multi-Provider Architecture
- Completely decoupled from any single AI provider
- Supports: OpenAI, Anthropic, Google, AWS Bedrock, Groq, Azure, OpenRouter
- Configuration-driven provider selection
- Can route different tasks to different models/providers

### 4. Extensibility Layers
- Custom tools in `opencode.json`
- Custom agents in `.opencode/agents/`
- Custom skills in `.opencode/skills/`
- Custom commands in `.opencode/commands/`
- 1,200+ MCP servers available

---

## Recommended Approach

For projects adopting OpenCode or comparing to Claude Code:

1. **Initialize project context:**
   ```bash
   opencode /your/project
   /init
   # Review and commit AGENTS.md
   ```

2. **Keep AGENTS.md concise:**
   - Under 100 lines of focused guidance
   - Link to detailed files via `instructions` in opencode.json
   - Update after major architectural changes

3. **Use monorepo patterns:**
   - Global AGENTS.md at root
   - Package-specific AGENTS.md in each package
   - Shared rules via symlinks or git submodules

4. **Configure opencode.json for your team:**
   - Define shared models and providers
   - Specify required tools (permissions)
   - Include custom MCP servers
   - Version-control in git (no secrets)

5. **Leverage multi-provider setup:**
   - Use cheap models for background tasks (summarization, analysis)
   - Use premium models for main coding tasks
   - Configure `small_model` for lightweight work

---

## Sources

1. **Official OpenCode Repository**
   - https://github.com/anomalyco/opencode
   - Stars: 112,407 | Latest Release: v1.2.15 (2026-02-26)

2. **Official Documentation**
   - Rules: https://opencode.ai/docs/rules/
   - Config: https://opencode.ai/docs/config
   - Tools: https://opencode.ai/docs/tools
   - MCP Servers: https://opencode.ai/docs/mcp-servers
   - Context Management: https://www.opencode.live/concepts/context

3. **Technical Blogs & References**
   - Build your own /init: https://kau.sh/blog/build-ai-init-command/
   - How coding agents work: https://cefboud.com/posts/coding-agents-internals-opencode-deepdive
   - OpenCode tutorial: https://opencode-tutorial.com/en/docs/
   - OpenCode guide: https://opencodeguide.com/

4. **Community Projects**
   - OpenCode workspace orchestration: https://github.com/kdcokenny/opencode-workspace
   - OpenCode ELF memory system: https://github.com/mark-hingston/opencode-elf

5. **GitHub Issues (Active Discussion)**
   - Context auto-discovery (#6316)
   - Auto-inject subdirectory rules (#7361)
   - Nested AGENTS.md support (#7576)
   - Support .opencode/AGENTS.md (#11454)

---

## Files Saved

- `docs/research/2026-02-27-opencode-research.md` - This document
