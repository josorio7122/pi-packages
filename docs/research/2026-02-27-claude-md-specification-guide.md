# Research: CLAUDE.md Specification and Best Practices

**Date:** February 27, 2026  
**Scope:** Official guidance, comparisons, syntax, examples, and community patterns for CLAUDE.md  
**Sources:** Anthropic official docs, blog posts, community repositories, and developer guides

---

## Executive Summary

`CLAUDE.md` is Anthropic's official persistent context system for Claude Code, enabling developers to provide project-specific guidance to the AI coding assistant. Unlike single-file context approaches, CLAUDE.md supports a hierarchical, multi-level system with optional modular rule files, YAML frontmatter, and automatic memory management. It is the primary recommended approach for configuring Claude Code behavior and context, with clear precedence rules and directory-specific scoping.

---

## 1. Official Guidance: What to Put in CLAUDE.md

### Purpose

CLAUDE.md solves a fundamental problem: **without context, Claude has to infer information about your project from code itself.** With a well-crafted CLAUDE.md, you can:

- **Improve accuracy** — Better context leads to better suggestions
- **Reduce explanations** — Stop repeating architectural decisions, testing requirements, and team conventions
- **Enable scalability** — Complex module relationships and domain-specific patterns surface automatically
- **Persist knowledge** — Team conventions are documented once, used everywhere

**Source:** [Claude.com blog - Using CLAUDE.MD files](https://www.claude.com/blog/using-claude-md-files), Anthropic official docs, November 2025

### Official Anthropic Definition

From the official Claude Code documentation:

> "The `CLAUDE.md` file is the primary way to provide Claude Code with context about your project. When you start a Claude Code session, it automatically reads and understands your CLAUDE.md to improve accuracy and relevance of its suggestions."

**Source:** [Anthropic - Claude Code overview](https://docs.anthropic.com/claude-code)

### Recommended Sections

A typical CLAUDE.md includes these core sections:

1. **Project Overview** — Concise, informative description of what the project does
2. **Tech Stack** — List versions for accuracy (Node.js, Python, React, Next.js, etc.)
3. **Architecture & Patterns** — Key architectural decisions, module relationships
4. **Coding Conventions** — Style guide, naming conventions, file organization
5. **Testing Requirements** — How to write tests, test frameworks, coverage expectations
6. **Common Pitfalls** — Anti-patterns to avoid, known gotchas
7. **Development Workflow** — How to run the project, debugging, local development setup
8. **Domain-Specific Knowledge** — Business logic, industry-specific patterns, regulatory compliance

**Source:** [Claude Insider - CLAUDE.md Guide](https://www.claudeinsider.com/docs/configuration/claude-md), [Claude Directory - Complete Guide to CLAUDE.md](https://www.claudedirectory.org/blog/claude-md-guide)

### Best Practices for Content

- **Keep it concise but informative** — Typical effective CLAUDE.md files are 100-150 lines (project root)
- **Be specific** — Include version numbers, exact command formats, real code examples
- **Document real problems** — The most effective CLAUDE.md files solve actual pain points
- **Update regularly** — Keep in sync with your codebase, team standards, and architectural changes
- **Include examples** — Show actual code patterns, not just descriptions
- **Commit to git** — CLAUDE.md is part of your team's shared knowledge

**Source:** [SFEIR Institute - CLAUDE.md Memory System Deep Dive](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/deep-dive/)

---

## 2. CLAUDE.md Hierarchy and Precedence

CLAUDE.md supports **three levels** of configuration with clear precedence rules:

### Three-Level Hierarchy

| Level | Location | Scope | Shared | Priority |
|-------|----------|-------|--------|----------|
| **Local** (highest) | `.claude/CLAUDE.local.md` | Your machine only | No (gitignored) | 1 |
| **Project** | `CLAUDE.md` or `.claude/CLAUDE.md` | Current project | Yes (committed) | 2 |
| **User/Global** | `~/.claude/CLAUDE.md` | All projects | Personal | 3 |

**Precedence Rule:** More specific scopes override general ones. **Directory-specific > Project root > Global**

### In Monorepos

In a monorepo, Claude Code merges configuration from multiple levels:

```
my-monorepo/
├── CLAUDE.md                 # Root-level (applies to all packages)
├── packages/
│  └── web-app/
│     └── CLAUDE.md           # Package-specific (overrides root for this package)
└── packages/api/
   └── CLAUDE.md              # Merged with root context
```

Claude automatically merges both levels of configuration when working in subdirectories.

**Source:** [SFEIR Institute - Tips](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/tips/), [Claude Insider - Configuration](https://www.claudeinsider.com/docs/configuration), [Buildcamp - Ultimate Guide](https://www.buildcamp.io/guides/the-ultimate-guide-to-claudemd)

---

## 3. Modular Rules: The `.claude/rules/` Directory

### Monolithic vs. Modular

**Problem with monolithic CLAUDE.md:** A single 300+ line file becomes:
- Hard to maintain
- Impossible to selectively apply rules
- Creates high contextual noise (Claude loads ALL rules even if only 10% are relevant)
- Difficult to reuse across projects

**Solution: `.claude/rules/` directory** — Modular, conditional, targeted instruction files

### Structure

Instead of one large file, organize instructions by technical domain:

```
your-project/
├── CLAUDE.md                              # Main overview (50-100 lines)
├── .claude/
│  ├── CLAUDE.md                          # Project-level config
│  ├── rules/
│  │  ├── code-style.md                   # Formatting, linting, conventions
│  │  ├── testing.md                      # Test patterns, coverage
│  │  ├── api-validation.md               # API-specific rules
│  │  ├── database-queries.md             # SQL/ORM patterns
│  │  └── security.md                     # Security best practices
│  └── settings.json                      # Tool permissions, config
└── package.json
```

Each `.md` file in `.claude/rules/` is **conditionally loaded** based on file patterns.

### YAML Frontmatter for Path-Specific Rules

Rules activate only for certain file patterns using YAML frontmatter with the `paths` field:

```markdown
---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# TypeScript Code Style

Follow these conventions for all TypeScript files:

- Use strict mode
- Prefer interfaces over types for public APIs
- All public functions must have JSDoc comments
```

**Field Options:**
- `paths` — Glob patterns (e.g., `src/**/*.ts`, `tests/**/*.spec.ts`)
- `globs` — Alternative glob syntax (note: some documentation is inconsistent here)

**Key Limitation (Known Issue):** [GitHub Issue #17204](https://github.com/anthropics/claude-code/issues/17204) — The documented `paths:` format with YAML list syntax doesn't work reliably in all configurations. The undocumented `globs:` format works more reliably. Consider using simple glob strings rather than YAML lists.

### Performance Impact

Modular rules reduce contextual noise and improve application rates:

| Configuration | Lines per file | Application rate | Maintenance |
|---|---|---|---|
| Monolithic CLAUDE.md | 300+ | 65% | Difficult |
| Modular rules | 50 per file | 96% | High |
| Mixed (CLAUDE.md + rules/) | 100 + 5×30 | 95% | High |

**Result:** Modular rules in `.claude/rules/` reduce contextual noise by **40-45%** compared to a single 300-line CLAUDE.md.

**Source:** [SFEIR Institute - Deep Dive](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/deep-dive/), [SFEIR - Tips](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/tips/), [claudefa.st - Rules Directory Guide](https://claudefa.st/blog/guide/mechanics/rules-directory)

---

## 4. CLAUDE.md vs. Similar Files: Comparison

### CLAUDE.md vs. AGENTS.md

| Feature | CLAUDE.md | AGENTS.md |
|---------|-----------|-----------|
| **Scope** | Claude Code only | Universal (60,000+ projects use it) |
| **Focus** | Modular, hierarchical memory + conditional rules | Persistent, universal agent context |
| **Hierarchy** | 3 levels (local, project, global) | Single, cross-tool standard |
| **Modularity** | `.claude/rules/` for conditional loading | Directory-based `.agents/` system |
| **Adoption** | Claude Code ecosystem | Cross-tool standard (OpenAI, Google, etc.) |
| **Best For** | Claude Code users | Teams using multiple AI tools |

**Key Difference:** CLAUDE.md is **specific to Claude Code** with advanced features like auto-memory and conditional rule scoping. AGENTS.md is a **universal standard** used by many AI tools and teams.

**Source:** [Serenities AI - CURSORRULES vs AGENTS.md vs CLAUDE.md](https://serenitiesai.com/articles/cursorrules-vs-agents-md-vs-claude-md-comparison), [blog.saurav.io - AI Coding Stack](https://blog.saurav.io/ai-coding-stack-explained)

### CLAUDE.md vs. CURSORRULES (.cursorrules)

| Feature | CLAUDE.md | CURSORRULES |
|---------|-----------|-------------|
| **Tool** | Claude Code | Cursor IDE |
| **Format** | Markdown with optional YAML frontmatter | Single file or `.cursor/rules/` directory |
| **Hierarchy** | 3 levels (local, project, global) | Project-level only |
| **Modularity** | `.claude/rules/` with conditional paths | `.cursor/rules/` files with activation modes |
| **Syntax** | Standard Markdown + YAML | Markdown with frontmatter |
| **Auto-Memory** | Yes (MEMORY.md auto-generated) | No |
| **Scope Target** | File paths via `paths:` glob | Various activation patterns |

**Key Difference:** CLAUDE.md is designed for persistent memory and multi-level hierarchy. CURSORRULES is more flexible for Cursor IDE users but doesn't have Claude's auto-memory system.

**Source:** [Serenities AI comparison](https://serenitiesai.com/articles/cursorrules-vs-agents-md-vs-claude-md-comparison)

### CLAUDE.md vs. .github/copilot-instructions.md

| Feature | CLAUDE.md | .github/copilot-instructions.md |
|---------|-----------|--------------------------------|
| **Tool** | Claude Code | GitHub Copilot |
| **Location** | Root, .claude/, or ~/.claude/ | .github/ folder |
| **Format** | Markdown with YAML frontmatter | Markdown |
| **Multiple Rules** | Yes (.claude/rules/) | No (single file) |
| **Hierarchy** | 3 levels | Project-level only |
| **Context Persistence** | Full (sessions, auto-memory) | Limited (chat context) |
| **Modularity** | Modular, conditional paths | Monolithic |
| **Advanced Features** | Auto-memory, skills, precedence | Basic instructions only |

**Key Difference:** Copilot instructions are simpler, single-file, and chat-focused. CLAUDE.md is multi-level, modular, and persistent across sessions.

### Interoperability Pattern

Many teams use symlinks to maintain consistency across tools:

```bash
# Symlink approach for multi-tool consistency
ln -sfn AGENTS.md .github/copilot-instructions.md
ln -sfn AGENTS.md CLAUDE.md
ln -sfn AGENTS.md .cursorrules
```

This way, you maintain one source of truth (AGENTS.md) and link it to multiple AI tools.

**Source:** [Medium - Complete Guide to AI Agent Memory Files](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9), [Zenn - AI Agent Symlink Setup](https://zenn.dev/kesin11/articles/20251210_ai_agent_symlink?locale=en)

---

## 5. YAML Frontmatter and Special Syntax

### CLAUDE.md Frontmatter (Optional)

CLAUDE.md itself does **not require frontmatter** at the document level. It's plain Markdown. However, individual rule files in `.claude/rules/` use YAML frontmatter for configuration.

### `.claude/rules/` Frontmatter Format

Rule files use YAML frontmatter to specify conditional activation:

```yaml
---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript Specific Rules

...markdown content...
```

**Available Frontmatter Fields:**

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `paths` | List of globs | Target specific files | `paths: ["src/**/*.ts", "tests/**/*.spec.ts"]` |
| `globs` | Single glob string | Alternative to paths (more reliable) | `globs: "src/**/*.ts"` |
| `description` | String | Rule description | `description: "TypeScript code style guide"` |

**Known Issues with Frontmatter:**

1. **YAML List Syntax Problem** ([Issue #17204](https://github.com/anthropics/claude-code/issues/17204)) — The documented YAML list format for `paths:` doesn't work reliably:
   ```yaml
   # ❌ May not work
   paths:
     - "src/**/*.ts"
     - "src/**/*.tsx"
   ```

2. **Globs field workaround** — Use simple glob strings instead:
   ```yaml
   # ✅ Works reliably
   globs: "src/**/*.ts"
   ```

3. **Quoting paths** — Always quote glob patterns in YAML to ensure they're treated as strings

### Settings Configuration

Additional configuration exists in `.claude/settings.json`:

```json
{
  "auto_memory_enabled": true,
  "auto_memory_update_frequency": "daily",
  "rules_directory_enabled": true,
  "context_window_optimization": true
}
```

**Source:** [Anthropic - Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings), [GitHub Issues #16038, #17204, #13905](https://github.com/anthropics/claude-code/issues), [claudefa.st - Rules Directory](https://claudefa.st/blog/guide/mechanics/rules-directory)

---

## 6. Community Examples and Patterns

### Official Examples

1. **Awesome Claude Code** — [github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
   - Curated collection of CLAUDE.md files, slash-commands, and best practices
   - Highlights: CLAUDE.md best practices section

2. **Claude Code Official Examples** — [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)
   - `complete-agent-examples.md` — Shows best practices from CLAUDE.md

3. **Skills Documentation** — [github.com/anthropics/claude-code/plugins/plugin-dev/skills](https://github.com/anthropics/claude-code)
   - Skill development examples with CLAUDE.md references
   - Demonstrates skill usage patterns in project CLAUDE.md

### Community Templates

1. **CLAUDE.md Starter Kit** — [github.com/abhishekray07/claude-md-templates](https://github.com/abhishekray07/claude-md-templates)
   - Templates for different project types:
     - Global (personal preferences)
     - Next.js/React/TypeScript
     - Python/Django
   - No setup required, just copy templates

2. **Awesome Agentic Patterns** — [github.com/nibzard/awesome-agentic-patterns](https://github.com/nibzard/awesome-agentic-patterns)
   - Real-world CLAUDE.md examples
   - Agentic pattern libraries

3. **Claude Flow Wiki** — [github.com/ruvnet/claude-flow](https://github.com/ruvnet/claude-flow)
   - CLAUDE.md templates for different project types:
     - Learning projects
     - Web development
     - Data science
     - Enterprise applications
   - Specialized templates with preset conventions

4. **Claude Code Starter** — [github.com/Redemptions7/claude-code-starter](https://github.com/Redemptions7/claude-code-starter)
   - Beginner-friendly meta-documentation framework
   - Includes CLAUDE.md, CONSISTENCY_AUDIT.md, CHANGELOG.md

5. **Claude Visual Style Guide** — [github.com/jcmrs/claude-visual-style-guide](https://github.com/jcmrs/claude-visual-style-guide)
   - Real project example with custom CLAUDE.md

### Real Project Examples

- **HumanLayer** — Production CLAUDE.md files referenced in community guides
- **josix/awesome-claude-md** — Curated collection of real CLAUDE.md files from open-source projects
- Various web development, API, database, and security-focused projects

**Source:** [GitHub search for CLAUDE.md examples](https://github.com), [CLAUDE.md Starter Kit](https://github.com/abhishekray07/claude-md-templates), [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow)

---

## 7. Anthropic Blog Posts and Recent Announcements

### Official Announcements

1. **"Using CLAUDE.MD files: Customizing Claude Code for your codebase"**
   - **Published:** November 25, 2025
   - **Source:** [claude.com/blog/using-claude-md-files](https://www.claude.com/blog/using-claude-md-files)
   - **Coverage:** Practical guide for structuring CLAUDE.md, best practices, real-world use cases
   - **Key Message:** CLAUDE.md solves the context scaling problem as codebases grow

2. **Claude Code Overview & Documentation**
   - **Published:** Official Anthropic docs (ongoing)
   - **Source:** [docs.anthropic.com/claude-code](https://docs.anthropic.com/claude-code)
   - **Coverage:** Official settings, configuration, memory management

3. **Introducing Claude 4**
   - **Published:** May 22, 2025
   - **Source:** [anthropic.com/news/claude-4](https://www.anthropic.com/news/claude-4)
   - **Coverage:** Claude Code mentioned as a key tool for AI-assisted development

### Community Blog Coverage

1. **SFEIR Institute - CLAUDE.md Memory System**
   - **Published:** February 2026
   - **Coverage:** 
     - Deep Dive: Comprehensive analysis of CLAUDE.md structure and effectiveness
     - Tips: Practical optimization strategies
     - Optimization Guide: Performance tuning, modular rules benefits
   - **Key Finding:** Modular rules reduce contextual noise by 40-45%

2. **Claude Directory - Complete Guide to CLAUDE.md**
   - **Published:** February 10, 2026
   - **Coverage:** Structure, best practices, real-world examples for every tech stack

3. **Claude Insider - CLAUDE.md Guide**
   - **Published:** January 1, 2025 (updated)
   - **Coverage:** Configuration options, best practices, advanced patterns

4. **Unmarkdown - How to Use CLAUDE.md Files**
   - **Published:** February 24, 2026
   - **Coverage:** When you need something more than CLAUDE.md, alternative approaches

5. **Buildcamp - The Ultimate Guide to CLAUDE.md in 2026**
   - **Published:** February 12, 2026
   - **Coverage:** Comprehensive hierarchy rules, precedence, file locations

6. **claudefa.st - Claude Code Rules Directory**
   - **Published:** February 11, 2026
   - **Coverage:** Modular rules alternatives, migration from monolithic files

7. **Medium - From Asking Claude to Code to Teaching Claude Our Patterns**
   - **Author:** Massimiliano Aroffo
   - **Coverage:** Modular, reusable skills architecture with auto-invocation

---

## 8. Key Recommendations

### Starting Point

If you're new to CLAUDE.md, follow this progression:

1. **Start Simple** (Day 1)
   ```
   Create CLAUDE.md in project root with 5-7 sections
   Lines: 100-150
   Sections: Overview, Tech Stack, Architecture, Conventions, Testing, Pitfalls
   ```

2. **Add Directory Structure** (Week 1-2)
   ```
   Create .claude/ directory
   Move settings to .claude/settings.json
   Move CLAUDE.md to .claude/CLAUDE.md (or keep at root, both work)
   ```

3. **Modularize** (When monolithic file grows > 200 lines)
   ```
   Create .claude/rules/ directory
   Split by technical domain (code-style, testing, api, database, security)
   Use YAML frontmatter with paths: field for targeted rules
   Keep project root CLAUDE.md < 150 lines for overview
   ```

4. **Optimize** (Ongoing)
   ```
   Monitor contextual noise (excessive rules for few files = bad signal)
   Keep rules updated with team standards
   Review effectiveness quarterly
   ```

### File Location Conventions

| Purpose | Location | Committed | When to Use |
|---------|----------|-----------|------------|
| Project conventions | `./CLAUDE.md` | Yes | Always (simplest) |
| Project + organized | `./.claude/CLAUDE.md` | Yes | For complex projects |
| Personal defaults | `~/.claude/CLAUDE.md` | No | Global preferences |
| Local overrides | `./.claude/CLAUDE.local.md` | No | Machine-specific |
| Modular rules | `./.claude/rules/*.md` | Yes | When CLAUDE.md > 200 lines |
| Settings | `./.claude/settings.json` | Yes | Tool permissions |

### What NOT to Include

- **Secrets or credentials** — Use environment variables, `.env.local`
- **Personal preferences** — Use `~/.claude/CLAUDE.md` instead
- **IDE-specific settings** — Use `.vscode/settings.json`, `.idea/` configs
- **Redundant docs** — Link to existing docs, don't duplicate
- **Cursor-specific fields** — Avoid `alwaysApply`, other Cursor IDE features

**Source:** [Claude Code Official Docs](https://docs.anthropic.com/claude-code), [SFEIR Institute guidelines](https://institute.sfeir.com/)

---

## 9. Comparison Matrix: Configuration File Options

| Feature | CLAUDE.md | AGENTS.md | .cursorrules | .github/copilot-instructions.md |
|---------|-----------|-----------|--------------|----------------------------------|
| **Tool** | Claude Code | Universal | Cursor | GitHub Copilot |
| **Format** | Markdown + YAML | Markdown | Markdown + YAML | Markdown |
| **Hierarchy Levels** | 3 (local, project, global) | 1 | 1-2 | 1 |
| **Modular Rules** | Yes (.claude/rules/) | Yes (.agents/) | Yes (.cursor/rules/) | No |
| **Auto-Memory** | Yes (MEMORY.md) | No | No | No |
| **Path-Specific Rules** | Yes (YAML paths:) | Limited | Yes | No |
| **Multi-Tool Support** | Claude Code only | Cross-tool | Cursor only | Copilot only |
| **Adoption** | 2025-2026 growth | 60,000+ projects | Cursor users | Copilot users |
| **Best For** | Claude Code teams | Cross-tool teams | Cursor power users | Copilot users |

---

## Sources

### Official Anthropic Documentation
- [Claude Code overview](https://docs.anthropic.com/claude-code)
- [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Manage Claude's memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude.com blog - Using CLAUDE.MD files](https://www.claude.com/blog/using-claude-md-files) (Nov 25, 2025)

### Community Guides
- [Claude Insider - CLAUDE.md Guide](https://www.claudeinsider.com/docs/configuration/claude-md)
- [Claude Directory - Complete Guide](https://www.claudedirectory.org/blog/claude-md-guide)
- [SFEIR Institute - CLAUDE.md Memory System](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/)
- [Buildcamp - Ultimate Guide](https://www.buildcamp.io/guides/the-ultimate-guide-to-claudemd)
- [claudefa.st - Rules Directory Guide](https://claudefa.st/blog/guide/mechanics/rules-directory)

### Comparison Resources
- [Serenities AI - CURSORRULES vs AGENTS.md vs CLAUDE.md](https://serenitiesai.com/articles/cursorrules-vs-agents-md-vs-claude-md-comparison)
- [blog.saurav.io - AI Coding Stack](https://blog.saurav.io/ai-coding-stack-explained)
- [Medium - Complete Guide to AI Agent Memory Files](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9)

### Code Examples & Templates
- [github.com/abhishekray07/claude-md-templates](https://github.com/abhishekray07/claude-md-templates)
- [github.com/ruvnet/claude-flow](https://github.com/ruvnet/claude-flow)
- [github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)

### Known Issues
- [GitHub Issue #17204 - .claude/rules/ frontmatter format incorrect](https://github.com/anthropics/claude-code/issues/17204)
- [GitHub Issue #16038 - DOCS paths frontmatter syntax incorrect](https://github.com/anthropics/claude-code/issues/16038)
- [GitHub Issue #13905 - BUG Invalid YAML syntax in frontmatter](https://github.com/anthropics/claude-code/issues/13905)

---

## Additional Resources

### Quick Start Templates
- **CLAUDE.md Starter Kit:** `https://github.com/abhishekray07/claude-md-templates` — Copy templates for global and project-level
- **Skillshare Examples:** Multiple template repositories provide starter files
- **RuleBox:** `https://www.rulebox.ai` — Web-based CLAUDE.md builder

### Training & Tutorials
- SFEIR Institute full training path (Deep Dive → Tips → Optimization)
- Claude Flow Wiki with project-type templates
- Community repositories with real examples

### Tools & Helpers
- Claude Code built-in settings at `.claude/settings.json`
- Memory system auto-generates `MEMORY.md` for persistent sessions
- Skills system integrates with CLAUDE.md for modular guidance

---

**Research compiled:** February 27, 2026  
**Status:** Complete, ready for implementation guidance
