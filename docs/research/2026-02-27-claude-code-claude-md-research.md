# Research: Claude Code CLAUDE.md File Management

**Date:** February 27, 2026  
**Status:** Complete  
**Sources:** Official Anthropic documentation, Claude Code GitHub repository, npm package

---

## 1. What is CLAUDE.md? Purpose and Function

**Definition:**  
CLAUDE.md is a persistent Markdown configuration file used by Claude Code to store project-specific instructions, conventions, context, and preferences that persist across sessions. It's automatically read at the start of each Claude Code session and loaded into the system prompt.

**Primary Purposes:**
- Provide persistent instructions that carry over between sessions
- Store project-specific conventions and coding standards
- Maintain architectural patterns and design decisions
- Document frequently used commands (build, test, lint, deploy)
- Enable consistent behavior across the entire team working on a project
- Reduce repetitive explanations by establishing baseline context

**Key Benefit:**  
Allows Claude to understand the project's structure, conventions, and rules without needing to re-explain them in every session. This improves accuracy, consistency, and reduces token usage by avoiding repeated context setup.

*Source: [Manage Claude's memory - Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)*

---

## 2. How Claude Code Detects, Reads, and Creates CLAUDE.md Files

### Detection and Reading

**Automatic Discovery:**
- Claude Code automatically discovers and reads CLAUDE.md files at the start of each session
- Files are loaded **recursively** starting in the current working directory (cwd)
- Claude Code recurses **up** the directory tree to (but not including) the root directory `/`
- This allows hierarchical memory: memories in parent directories are inherited by subdirectories

**Nested File Discovery:**
- Claude Code also discovers CLAUDE.md files nested in **subtrees** under the current working directory
- Unlike parent directory files (loaded at launch), subtree files are only included when Claude reads files in those subtrees
- This prevents unnecessary loading of unrelated project memories

**File Reading Command:**
```bash
/memory
```
This slash command allows direct editing of any memory file in your system editor and shows which memory files are currently loaded.

### Creation and Initialization

**Automatic Bootstrap:**
```bash
/init
```
This slash command generates an initial CLAUDE.md tailored to your project. The command:
- Analyzes your project structure and technologies
- Detects frameworks, languages, and build tools
- Creates a starter CLAUDE.md with:
  - Project overview and tech stack
  - Detected technologies and frameworks
  - Directory structure overview
  - Key commands (build, test, lint, format)
  - Common workflows specific to your stack

**Quick Memory Addition:**
Users can quickly add memories using the `#` shortcut:
```bash
# Always use descriptive variable names
```
This prompts users to select which memory file to store the instruction in.

**Triggers for Creation:**
- User runs `/init` in a session (explicit)
- User runs `claude` in a project directory for the first time
- User adds a memory with the `#` shortcut (creates/updates file as needed)
- User edits a CLAUDE.md file directly in their editor

*Source: [Manage Claude's memory - Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)*

---

## 3. Hierarchy of CLAUDE.md Files (Multi-Level)

Claude Code implements a **four-level hierarchical memory system** with conflict resolution (higher levels take precedence):

### Memory Hierarchy (Top to Bottom)

| Level | Location | Scope | Purpose | Precedence |
|-------|----------|-------|---------|-----------|
| **1. Enterprise Policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br>Linux: `/etc/claude-code/CLAUDE.md`<br>Windows: `C:\\ProgramData\\ClaudeCode\\CLAUDE.md` | Organization-wide | Company coding standards, security policies, compliance requirements | Highest |
| **2. Project Memory** | `./CLAUDE.md` (root) or `./.claude/CLAUDE.md` | Team/project scope | Team-shared instructions, architecture, project-specific workflows | — |
| **3. User Memory** | `~/.claude/CLAUDE.md` | User-wide (all projects) | Personal preferences, personal tooling shortcuts, style guidelines | — |
| **4. Project Memory (Local)** | `./CLAUDE.local.md` | Project-specific (user only) | Personal project-specific preferences (DEPRECATED - use imports instead) | Lowest |

### Resolution Rules
- **Higher levels override lower levels**: Enterprise policy > Project > User > Local
- **All levels load together**: Files higher in the hierarchy are loaded first, providing a foundation
- **Recursive parent directory loading**: When in a subdirectory, Claude reads CLAUDE.md files in all parent directories up to the root

### Subdirectory Memories
- CLAUDE.md files can exist in subdirectories
- Parent CLAUDE.md files apply to entire subtrees
- Allows per-directory specialization (e.g., `frontend/CLAUDE.md`, `backend/CLAUDE.md`)

*Source: [Manage Claude's memory - Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)*

---

## 4. What Triggers Claude Code to Create or Update CLAUDE.md

### Explicit Triggers (User-Initiated)

1. **`/init` command**
   - Most common trigger for initial creation
   - Generates a tailored CLAUDE.md based on project analysis
   - Can be run at any time to regenerate or update

2. **`/memory` slash command**
   - Opens memory files in the system editor
   - Users can create or edit memory files directly
   - Triggers file creation if it doesn't exist

3. **`#` shortcut**
   - User starts input with `#` followed by a memory instruction
   - Prompts user to select which memory file to store it in
   - Creates file if it doesn't exist

4. **Direct file editing**
   - Users can create or edit CLAUDE.md files directly in their editor
   - Claude Code automatically detects and loads changes on next session

### Implicit Triggers (System-Initiated)

1. **Session start in a new project**
   - Claude Code prompts users to set up memory on first run in a project
   - Recommended but not automatic

2. **Repository initialization**
   - When users first clone a repository and run Claude Code
   - Git worktree operations may trigger memory updates

### No Automatic Update Conditions
- Claude Code does **not** automatically update CLAUDE.md during operations
- Changes are only created/updated through explicit user action or the `/init` command
- This prevents accidental modifications to team-shared configurations

*Source: [Manage Claude's memory - Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)*

---

## 5. Content Structure and Best Practices

### Recommended Structure

**Basic CLAUDE.md typically contains 5 core sections:**

```markdown
# Project Overview
[One paragraph summary of the project, tech stack, and purpose]

# Tech Stack
- Language: TypeScript v5.x
- Framework: Next.js v14.x
- Database: PostgreSQL
- Build tool: pnpm, Turbo

# Common Commands
- `pnpm install` - Install dependencies
- `pnpm run dev` - Start development server
- `pnpm run test` - Run unit tests
- `pnpm run lint` - Check code style
- `pnpm run build` - Build for production

# Directory Structure
- `/src` - Source code
- `/public` - Static assets
- `/tests` - Test files
- `/docs` - Documentation

# Coding Standards
- Use 2-space indentation
- Use descriptive variable names
- Follow ESLint configuration
- Run tests before committing
```

### Content Categories

**✅ GOOD for CLAUDE.md:**
- Tech stack and versions (language, frameworks, databases, build tools)
- Build, test, lint, and format commands
- Critical project paths and directory structure
- Coding standards and style preferences
- Project architecture and design patterns
- Common workflows and procedures
- Frequently used external tools or services
- Team conventions and naming conventions
- Git workflow preferences (commit messages, branch naming, PR process)

**❌ NOT for CLAUDE.md:**
- Sensitive information (credentials, API keys, passwords)
- Large code examples (use imports instead)
- Frequently changing information (use `/memory` command to update)
- Single-file-specific rules (use `.claude/rules/` folder instead)
- Binary files or non-text content

### Structure Best Practices

1. **Be Specific**: "Use 2-space indentation" is better than "Format code properly"
2. **Use Markdown Structure**: Organize with headings, lists, and code blocks for clarity
3. **Keep it Concise**: Project CLAUDE.md should be < 150 lines; User CLAUDE.md < 50 lines
4. **Review Periodically**: Update as your project evolves
5. **Use Imports for Modularity**: Reference external files using `@path/to/file` syntax

### CLAUDE.md Imports Feature

**Import Syntax:**
```markdown
# Project Overview
See @README for detailed overview

# Additional Instructions
@docs/git-instructions.md
@docs/coding-standards.md

# Personal Preferences
@~/.claude/my-project-instructions.md
```

**Import Rules:**
- Uses `@path/to/import` syntax
- Both relative and absolute paths allowed
- Imports in home directory useful for team members with individual instructions
- Recursive imports supported with max depth of 5 hops
- Imports not evaluated inside markdown code spans/blocks
- Replaces deprecated `CLAUDE.local.md` for cross-worktree compatibility

### Context Window Considerations

- CLAUDE.md is loaded into the context window at the start of each session
- Content is preserved even as conversation history compacts
- View current memory loading with `/memory` command
- View context window status with `/context` command

*Sources: [Manage Claude's memory - Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory), [How Claude Code works - Code Claude Docs](https://code.claude.com/docs/en/how-claude-code-works)*

---

## Key Takeaways

1. **CLAUDE.md is persistent context** - It persists between sessions and provides stable project knowledge
2. **Hierarchical by design** - Supports enterprise-wide, team, project, and user-level memories
3. **Automatically discovered** - Claude Code recursively finds CLAUDE.md files in parent and sibling directories
4. **Easily initialized** - `/init` command bootstraps tailored memories based on project analysis
5. **Modular and extendable** - Supports imports, subdirectory rules, and hierarchical specialization
6. **Team-friendly** - Project-level CLAUDE.md checked into git enables consistent team behavior
7. **Fast to add** - `#` shortcut and `/memory` command allow rapid memory additions

---

## Official Resources

- **Anthropic Memory Management Docs**: https://docs.anthropic.com/en/docs/claude-code/memory
- **Claude Code How It Works**: https://code.claude.com/docs/en/how-claude-code-works
- **Claude Code Overview**: https://code.claude.com/docs/en/overview
- **Claude Code GitHub Repository**: https://github.com/anthropics/claude-code
- **Claude Code npm Package**: https://www.npmjs.com/package/@anthropic-ai/claude-code
