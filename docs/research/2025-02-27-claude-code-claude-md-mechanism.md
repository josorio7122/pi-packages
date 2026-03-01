# Research: Claude Code and CLAUDE.md Mechanism

**Date:** 2025-02-27  
**Researcher:** Claude Code Agent  
**Topic:** Claude Code source code, CLAUDE.md loading mechanism, file discovery logic, and configuration

---

## Answer

Claude Code is Anthropic's agentic coding tool that automatically loads **CLAUDE.md files into its system prompt** at the start of every session. The mechanism uses a **hierarchical directory walk** (upward to the filesystem root) to discover and load CLAUDE.md files, with optional lazy-loading for subdirectory files. The file can be initialized via the `/init` command, which auto-generates project-specific context based on codebase analysis.

---

## Key Findings

### 1. **Claude Code Repository**

- **Official GitHub:** [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)
- **Released:** February 22, 2025
- **Status:** Research preview / early production release
- **Repository description:** Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows through natural language commands.
- **Related repos:**
  - `anthropics/claude-code-action` — GitHub Actions integration
  - `anthropics/claude-code-base-action` — Base actions mirror
  - Official docs: [code.claude.com](https://code.claude.com) and [docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code)

(Source: [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code), [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))

---

### 2. **How CLAUDE.md Is Loaded Into Context**

**Direct Injection into System Prompt:**

CLAUDE.md files are **automatically injected into Claude's system prompt** at the start of every session. According to the official Anthropic docs:

> "CLAUDE.md is a Markdown configuration memory file that Claude Code automatically loads at the start of each session to inject into its system prompt."

**System Reminder Wrapper:**

Claude Code wraps CLAUDE.md content with a standardized system reminder:

```
<system-reminder>
 IMPORTANT: this context may or may not be relevant to your tasks.
 [CLAUDE.md content injected here]
</system-reminder>
```

This reminder flags that the injected context is advisory, not prescriptive, allowing Claude to ignore irrelevant sections.

**Load Timing:**

- CLAUDE.md is loaded **at startup** (when you run `claude` or start a session)
- The system prompt is built with CLAUDE.md already embedded
- Auto-memory (separate from CLAUDE.md) also loads at startup, but limited to the first 200 lines

(Source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory), [humanlayer.dev/blog/writing-a-good-claude-md](https://www.humanlayer.dev/blog/writing-a-good-claude-md))

---

### 3. **File Discovery Logic: Directory Walk Algorithm**

**Two-Phase Loading Mechanism:**

Claude Code uses a **dual-phase directory discovery** system:

#### **Phase 1: Ancestor Walk (Upward to Root) — Loaded at Startup**

When you start Claude Code in a directory, it walks **upward** from your current working directory toward the filesystem root and loads all CLAUDE.md files it finds:

```
Current directory: /home/user/projects/myapp/src
Walk path:
  ✓ /home/user/projects/myapp/src/CLAUDE.md          (if exists)
  ✓ /home/user/projects/myapp/CLAUDE.md              (if exists) ← PROJECT ROOT
  ✓ /home/user/projects/CLAUDE.md                    (if exists)
  ✓ /home/user/CLAUDE.md                             (if exists) ← User-level
  ✓ /CLAUDE.md                                        (if exists) ← System root
```

All ancestor CLAUDE.md files are loaded **in full at launch** and included in the system prompt.

#### **Phase 2: Child Directory Files — Lazy Loaded On Demand**

CLAUDE.md files in **subdirectories below your current working directory** are **NOT loaded at startup**. They are loaded **only when Claude reads or writes files in those directories**.

```
Current directory: /home/user/projects/myapp
Child CLAUDE.md (lazy-loaded when accessed):
  ✗ /home/user/projects/myapp/src/CLAUDE.md         (loaded when reading src/)
  ✗ /home/user/projects/myapp/tests/CLAUDE.md       (loaded when reading tests/)
  ✗ /home/user/projects/myapp/api/CLAUDE.md         (loaded when reading api/)
```

**Design Rationale:** This two-phase approach optimizes for monorepos and large projects—ancestor files provide global context, while child files provide specialized context only when needed, preserving token budget.

(Source: [github.com/shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice/blob/main/reports/claude-md-for-larger-mono-repos.md), [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory), [dev-blog/CLAUDE.md-lookup-patterns](https://blog.devgenius.io/claude-md-lookup-patterns-explained-a-bookmarkable-guide-6893f329013b))

---

### 4. **CLI Commands: `/init` and Initialization**

**The `/init` Command:**

```bash
claude
/init
```

- Analyzes your project structure, detected tech stack, and key files
- Auto-generates a **starter CLAUDE.md** with:
  - Tech stack summary (frameworks, languages, build tools)
  - Key commands (build, test, lint, format)
  - Directory structure overview
  - Detected development workflows
- The generated file becomes your project's persistent memory across sessions
- Available as a **slash command** within an active Claude Code session (not a CLI flag)

**Command Availability:**

According to the official CLI reference, slash commands like `/init` are executed within Claude Code sessions. The full CLI command reference includes:

```bash
claude                                  # Start interactive session
claude "query"                          # Start session with initial prompt
claude auth login                       # Sign in to Anthropic account
claude -p --append-system-prompt-file ./prompts/style-rules.txt "Review this PR"  # Append external prompts
```

The `--append-system-prompt` and `--append-system-prompt-file` flags allow runtime system prompt modification at the CLI level.

(Source: [code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference), [developertoolkit.ai/claude-code/quick-start/project-initialization](https://developertoolkit.ai/en/claude-code/quick-start/project-initialization), [builder.io/blog/claude-md-guide](https://www.builder.io/blog/claude-md-guide))

---

### 5. **Difference Between CLAUDE.md and Other Config Files**

#### **CLAUDE.md vs. .claude/settings.json**

| Aspect | CLAUDE.md | .claude/settings.json |
|--------|-----------|----------------------|
| **Purpose** | Persistent instructions/context for Claude | Structured configuration for Claude Code tool behavior |
| **Format** | Markdown text (human-readable) | JSON (machine-readable) |
| **Content** | Architecture notes, coding rules, conventions, commands, project context | Permissions, tool configuration, MCP servers, hooks, plugin settings |
| **Scope** | Instructions (what Claude should do) | Configuration (what tools Claude can use) |
| **Loaded every session?** | Yes, injected into system prompt | Yes, but controls tool behavior, not context |
| **Audience** | Primarily Claude Code agent | Claude Code runtime and tools |
| **Example content** | "This is a Next.js app. Use `npm run dev` to start. Follow BEM for CSS class names." | `{ "permissions": { "bash": "allow" }, "tools": {...}}` |

#### **CLAUDE.md vs. AGENTS.md**

Both serve similar purposes but target different AI coding environments:

- **CLAUDE.md:** Anthropic's convention, specific to Claude Code
- **AGENTS.md:** Newer universal standard (collaborative effort: OpenAI, Google, Cursor, Anthropic)
  - Emerging as the cross-platform standard for all AI coding agents
  - CLAUDE.md is Anthropic's specific implementation
  - Both are fundamentally the same in purpose—persistent agent instructions

**Complementary file hierarchy:**
```
README.md          → Documentation for humans
AGENTS.md          → Universal agent brief (emerging standard)
CLAUDE.md          → Claude Code specific instructions (Anthropic convention)
.claude/           → Configuration directory (settings, rules, hooks)
  ├── settings.json     (tool behavior & permissions)
  ├── rules/            (modular .md files for specific directories)
  ├── agents/           (subagent definitions)
  └── CLAUDE.md         (alternative to root CLAUDE.md, same purpose)
```

(Source: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings), [unmarkdown.com/blog/how-to-use-claude-md-files](https://unmarkdown.com/blog/how-to-use-claude-md-files), [medium.com/data-science-collective/.../AGENTS.md](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9), [blog.saurav.io/ai-coding-stack-explained](https://blog.saurav.io/ai-coding-stack-explained))

---

## Configuration Directory Structure

The **.claude directory** serves as Claude Code's configuration hub:

```
.claude/
├── CLAUDE.md              # Alternative to root CLAUDE.md (same purpose)
├── settings.json          # Permissions, tool config, hooks, plugins
├── settings.local.json    # Local overrides (typically .gitignored)
├── rules/                 # Modular instruction files
│   ├── code-style.md      # Code formatting rules (with glob patterns)
│   ├── testing.md         # Test requirements and patterns
│   ├── api-guidelines.md  # API conventions
│   └── design-system.md   # UI/design guidelines
├── agents/                # Subagent definitions
│   └── <agent-name>.md
└── .mcp.json              # MCP (Model Context Protocol) server config
```

**Hierarchy Scope Precedence (Highest to Lowest):**

1. **Managed policy** (system-wide, managed by IT/DevOps)
   - macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`
   - Linux/WSL: `/etc/claude-code/CLAUDE.md`
   - Windows: `C:\Program Files\ClaudeCode\CLAUDE.md`

2. **User-level** (`~/.claude/CLAUDE.md` or `~/.claude/settings.json`)
   - Applies to all projects

3. **Project-level** (`./.claude/settings.json` or `./CLAUDE.md`)
   - Applies to one repository

4. **Local overrides** (`./.claude/settings.local.json`)
   - Personal settings, typically `.gitignored`
   - Not shared with team

(Source: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings), [claudefa.st/blog/guide/settings-reference](https://claudefa.st/blog/guide/settings-reference), [claudefa.st/blog/guide/mechanics/rules-directory](https://claudefa.st/blog/guide/mechanics/rules-directory))

---

## Recommended Approach

### For Projects Using Claude Code:

1. **Create a project-level CLAUDE.md** at the repository root:
   ```bash
   # Option A: Generate automatically
   claude
   /init
   
   # Option B: Write manually
   cat > CLAUDE.md << 'EOF'
   # Project: MyApp
   
   ## Tech Stack
   - Next.js 16, TypeScript, Tailwind CSS 4
   
   ## Key Commands
   - `npm run dev` — Start dev server on port 3000
   - `npm run test` — Run test suite
   - `npm run lint` — Run ESLint
   
   ## Directory Structure
   - `/src` — Source code
   - `/tests` — Test files
   
   ## Coding Conventions
   - Follow BEM for CSS class names
   - Use hooks-based React components
   - Add tests for new features
   EOF
   ```

2. **Use .claude/settings.json** for tool permissions and configuration:
   ```json
   {
     "permissions": {
       "bash": "allow",
       "file-write": "allow",
       "git": "allow"
     },
     "plugins": ["eslint", "prettier"]
   }
   ```

3. **For large monorepos**, use `.claude/rules/` to organize domain-specific instructions:
   ```
   .claude/rules/
   ├── backend.md    # backend/**/* rules
   ├── frontend.md   # frontend/**/* rules
   └── infra.md      # infra/**/* rules
   ```

4. **Keep CLAUDE.md minimal:**
   - Start with `/init` output
   - Remove redundant information
   - Point to external documentation for detailed guides
   - Update after significant architecture changes

---

## CLI Commands Reference

```bash
# Start interactive session
claude

# Start session with query
claude "explain the authentication flow"

# Authentication
claude auth login --email user@example.com --sso

# System prompt appending (runtime override)
claude -p --append-system-prompt "Prefer async/await over callbacks" "Review this code"
claude -p --append-system-prompt-file ./style-rules.txt "Review this PR"

# Within a session (slash commands)
/init                              # Generate CLAUDE.md
/commands                          # List available slash commands
/add-dir ../path/to/other/dir     # Add additional working directories
/hooks                             # Show configured hooks
```

---

## Sources

1. **Official GitHub Repository**
   - [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code) — Source code and README

2. **Official Anthropic Documentation**
   - [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) — CLAUDE.md loading and memory management
   - [code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference) — Complete CLI command reference
   - [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) — Configuration and settings hierarchy
   - [docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code) — All Claude Code documentation

3. **Community Guides & Best Practices**
   - [github.com/shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) — CLAUDE.md discovery patterns in monorepos
   - [claudefa.st/blog/guide/settings-reference](https://claudefa.st/blog/guide/settings-reference) — Complete settings configuration guide
   - [unmarkdown.com/blog/how-to-use-claude-md-files](https://unmarkdown.com/blog/how-to-use-claude-md-files) — Comprehensive CLAUDE.md guide
   - [humanlayer.dev/blog/writing-a-good-claude-md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — Best practices for writing effective CLAUDE.md

4. **Technical Deep Dives**
   - [blog.saurav.io/ai-coding-stack-explained](https://blog.saurav.io/ai-coding-stack-explained) — CLAUDE.md, Subagents, MCP & Skills explanation
   - [medium.com/data-science-collective/.../AGENTS.md](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9) — CLAUDE.md vs AGENTS.md differences
   - [blakecrosley.com/guide/claude-code](https://blakecrosley.com/guide/claude-code) — Definitive technical reference (31,946 words)

---

## Summary

Claude Code loads CLAUDE.md files through a **hierarchical directory walk** that discovers ancestor files at startup (loaded in full) and lazy-loads descendant files on demand. The `/init` command auto-generates a starter CLAUDE.md based on codebase analysis. CLAUDE.md is fundamentally different from `.claude/settings.json`—the former provides context and instructions (injected into the system prompt), while the latter controls tool permissions and behavior. The mechanism is part of Anthropic's official implementation, with comprehensive documentation available in the public GitHub repository and official docs.

