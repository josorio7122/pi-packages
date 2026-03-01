# Research: Claude Code /init Command Technical Implementation

## Executive Summary

Claude Code's `/init` command is **NOT a pure LLM call**, but rather a **hybrid approach** combining:
1. **Structured file gathering** using built-in tools (BatchTool + GlobTool)
2. **Information analysis** via Claude's models
3. **Template-guided code generation** using a pre-defined prompt

The process is automated context gathering followed by a single LLM call with the collected information.

---

## Answer

### The /init Command Process (Step by Step)

When you run `/init`, Claude Code performs the following sequence:

#### Phase 1: Context Gathering (Tool-Based)
The command uses two internal tools to efficiently gather project information:
- **BatchTool**: Orchestrates parallel information gathering
- **GlobTool**: Performs file pattern matching to locate relevant files

Files actively searched for:
- `package.json` / `requirements.txt` / `pyproject.toml` (dependencies & scripts)
- `README.md` (project overview & documentation)
- `.env.example` (environment variables)
- `tsconfig.json` / `pyproject.toml` / build configuration files
- `.cursor/rules/` (Cursor IDE rules, if present)
- `.github/copilot-instructions.md` (GitHub Copilot rules, if present)
- `.cursorrules` (Cursor project rules)
- Test configuration files (`jest.config`, `pytest.ini`, etc.)
- Linting configuration (`.eslintrc`, `ruff.toml`, etc.)
- Architecture documentation (in `docs/` directories)
- Common command files (Makefile, scripts/)

#### Phase 2: Prompt Execution (LLM-Based)
The collected information is passed to Claude via a **pre-defined structured prompt**. The reverse-engineered prompt is:

```
Please analyze this codebase and create a CLAUDE.md file, which will be given to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. 
   Include the necessary commands to develop in this codebase, such as how to run a single test.
2. High-level code architecture and structure so that future instances can be productive more quickly. 
   Focus on the "big picture" architecture that requires reading multiple files to understand.

Usage notes:
- If there's already a CLAUDE.md, suggest improvements to it.
- When you make the initial CLAUDE.md, do not repeat yourself and do not include obvious instructions 
  like "Provide helpful error messages to users", "Write unit tests for all new utilities", 
  "Never include sensitive information (API keys, tokens) in code or commits"
- Avoid listing every component or file structure that can be easily discovered
- Don't include generic development practices
- If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules 
  (in .github/copilot-instructions.md), make sure to include the important parts.
- If there is a README.md, make sure to include the important parts.
- Do not make up information such as "Common Development Tasks", "Tips for Development", 
  "Support and Documentation" unless this is expressly included in other files that you read.
- Be sure to prefix the file with the following text: [standard preamble]
```

#### Phase 3: CLAUDE.md Generation (Output)
Claude generates a markdown file that typically includes:
- **Project Overview** - High-level description of what the project does
- **Technology Stack** - Languages, frameworks, databases, libraries
- **Project Structure** - Key directories and their purposes
- **Available Scripts** - Common commands (build, test, lint, run, etc.)
- **Environment Variables** - Required .env variables from .env.example
- **Dependencies** - Key packages and their versions
- **Git Workflow** - Branching strategy and commit conventions
- **Architecture** - High-level system design extracted from multiple files
- **Code Style** - Conventions identified in the codebase

---

## Key Findings

### 1. It's a **Hybrid Approach** (NOT Pure LLM)
- **Not** just a one-shot LLM call
- **Not** template-based (i.e., filling pre-written markdown sections)
- **IS** tool-orchestrated context gathering + structured LLM generation
- Source: [kau.sh blog](https://kau.sh/blog/build-ai-init-command/) and reverse-engineering documentation

### 2. Information Gathered Before LLM Call
The command actively searches for and reads:
- Package manifests (to extract dependencies & scripts)
- Configuration files (tsconfig, eslint, prettier, etc.)
- Existing rules from competing tools (Cursor, GitHub Copilot, etc.)
- README and architecture docs
- Environment file examples
- Test & lint configuration
- Common shell scripts

Source: [HyperAI article on OpenCode](https://hyper.ai/en/stories/e8d329a93a375f028818f3b3c64038e8) (open-source Claude Code alternative with same architecture)

### 3. The Prompt is Carefully Crafted
The prompt includes **explicit constraints** to avoid:
- Repeating obvious best practices
- Generating placeholder sections with made-up content
- Listing every file/component (let devs discover via code)
- Generic development practices
- Duplicating information from README

This prevents the generated CLAUDE.md from being bloated or generic.

Source: [kau.sh blog - reverse-engineered prompt](https://kau.sh/blog/build-ai-init-command/#fn:1)

### 4. Reasoning Models Work Better
The research suggests that **reasoning models** (Claude Opus with extended thinking) are optimal for this task, though Sonnet is the default.

Source: [kau.sh blog](https://kau.sh/blog/build-ai-init-command/)

### 5. Generated File Quality
- **Average size**: 2-5 KB
- **Lines of content**: 30-80 lines
- **Update strategy**: Generated once, then refined manually over time
- **Never auto-regenerated** without explicit `/init` command

Source: [SFEIR Institute reference](https://institute.sfeir.com/en/claude-code/claude-code-essential-slash-commands/command-reference/) and [Dometrain guide](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/)

---

## The Exact Technical Process

```
User Input: /init
        ↓
   Context Gathering Phase
        ↓
   ┌─────────────────────────────────┐
   │ BatchTool launches parallel:    │
   │ - GlobTool: find package.json   │
   │ - GlobTool: find .env.example   │
   │ - GlobTool: find .cursor/rules/ │
   │ - GlobTool: find README.md      │
   │ - GlobTool: find test config    │
   │ - GlobTool: find lint config    │
   │ - ReadFile: on discovered files │
   └─────────────────────────────────┘
        ↓
   Information Aggregation
        ↓
   ┌─────────────────────────────────┐
   │ Compile:                        │
   │ - Project type & structure      │
   │ - Dependencies & versions       │
   │ - Available commands            │
   │ - Architecture patterns         │
   │ - Existing rules (Cursor/GH)    │
   │ - Style conventions             │
   │ - Environment requirements      │
   └─────────────────────────────────┘
        ↓
   LLM Generation Phase
        ↓
   ┌─────────────────────────────────┐
   │ Call Claude API with:           │
   │ 1. Structured prompt (above)    │
   │ 2. Collected file contents      │
   │ 3. Project metadata             │
   │                                 │
   │ Model: Claude Sonnet (default)  │
   │ Optional: Claude Opus (better)  │
   └─────────────────────────────────┘
        ↓
   CLAUDE.md Generation
        ↓
   Write to project root/CLAUDE.md
```

---

## What Files Are Analyzed

| File Type | Purpose | Search Pattern |
|-----------|---------|---|
| `package.json` | Node.js dependencies & scripts | Fixed name |
| `requirements.txt` | Python dependencies | Fixed name |
| `pyproject.toml` | Python project config | Fixed name |
| `README.md` | Project documentation | Fixed name |
| `.env.example` | Environment variable template | Fixed name |
| `tsconfig.json` | TypeScript config | Fixed name |
| `eslint.config.*` | Linting rules | Glob pattern |
| `.eslintrc*` | Legacy linting rules | Glob pattern |
| `.prettier*` | Code formatting config | Glob pattern |
| `jest.config.*` | Test framework config | Glob pattern |
| `pytest.ini` | Python test config | Fixed name |
| `Makefile` / `scripts/` | Build & automation | Glob pattern |
| `.cursor/rules/` | Cursor IDE instructions | Directory glob |
| `.cursorrules` | Cursor project rules | Fixed name |
| `.github/copilot-instructions.md` | GitHub Copilot rules | Fixed path |
| `docs/` | Architecture documentation | Directory glob |

---

## Why This Architecture Matters

### Advantages of This Hybrid Approach

1. **Efficient Context Use** - Gathers only relevant files, doesn't read entire repo
2. **Accurate Information** - Uses actual file contents, not inference
3. **Tool Awareness** - Respects existing Cursor/Copilot rules (no duplication)
4. **Prevent Hallucination** - LLM works from facts, not guesses
5. **Modular & Extensible** - Can add new file patterns without changing prompt
6. **Deterministic Gathering** - Same files analyzed across runs
7. **Stale Documentation Prevention** - Reads .env.example, not .env (never committed)

### Why NOT Pure LLM

A pure LLM approach would:
- Require the model to read the entire repo (expensive, slow)
- Risk hallucinating dependencies and commands
- Fail to detect environment requirements
- Miss local configuration from competing tools

### Why NOT Template-Based

A template approach would:
- Generate generic, boilerplate content
- Waste token budget on "tips" and generic best practices
- Ignore project-specific architecture patterns
- Not respect existing rules from Cursor/Copilot

---

## Implementation Comparison

| Aspect | Claude Code /init |
|--------|---|
| **Architecture** | Hybrid (tool gathering + LLM) |
| **File Discovery** | BatchTool + GlobTool pattern matching |
| **Context Gathering** | Automated, parallel file collection |
| **Content Generation** | Single LLM call with structured prompt |
| **Prompt Type** | Task-specific with constraints |
| **Output** | Single markdown file (CLAUDE.md) |
| **Regeneration** | Manual (only on explicit `/init` command) |
| **Model** | Claude Sonnet (Opus optional) |
| **Token Efficiency** | Moderate (context gathering + 1 call) |

---

## Exact Prompt Used

The reverse-engineered prompt (from Kaushik Gopal's blog, Oct 2025):

```
Please analyze this codebase and create a CLAUDE.md file, which will be 
given to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. 
   Include the necessary commands to develop in this codebase, such as how to 
   run a single test.

2. High-level code architecture and structure so that future instances can be 
   productive more quickly. Focus on the "big picture" architecture that 
   requires reading multiple files to understand.

Usage notes:
- If there's already a CLAUDE.md, suggest improvements to it.
- When you make the initial CLAUDE.md, do not repeat yourself and do not 
  include obvious instructions like "Provide helpful error messages to users", 
  "Write unit tests for all new utilities", "Never include sensitive 
  information (API keys, tokens) in code or commits"
- Avoid listing every component or file structure that can be easily discovered
- Don't include generic development practices
- If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot 
  rules (in .github/copilot-instructions.md), make sure to include the 
  important parts.
- If there is a README.md, make sure to include the important parts.
- Do not make up information such as "Common Development Tasks", "Tips for 
  Development", "Support and Documentation" unless this is expressly included 
  in other files that you read.
- Be sure to prefix the file with the following text: [standard preamble]
```

---

## Sources

### Official Documentation
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) — How CLAUDE.md works
- [How Claude Code Works](https://code.claude.com/docs/en/how-claude-code-works) — Agentic architecture
- [SFEIR Institute - Essential Slash Commands](https://institute.sfeir.com/en/claude-code/claude-code-essential-slash-commands/command-reference/) — `/init` command reference
- [Developer Toolkit - Project Initialization](https://developertoolkit.ai/en/claude-code/quick-start/project-initialization) — Practical guide with examples

### Deep Dives & Reverse Engineering
- [Kaushik Gopal - Build Your Own /init Command](https://kau.sh/blog/build-ai-init-command/) — **Reverse-engineered exact prompt** (Oct 2025)
- [HyperAI - OpenCode (Open-Source Alternative)](https://hyper.ai/en/stories/e8d329a93a375f028818f3b3c64038e8) — Explains BatchTool + GlobTool architecture
- [Dometrain - Creating the Perfect CLAUDE.md](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/) — Detailed walkthrough with generated examples

### Learning Resources
- [Medium - Claude Code Real Workflows](https://medium.com/@numustafa/claude-code-real-workflows-commands-context-tools-964ff89d981a) — Practical patterns
- [Mor Dvash - Mastering Claude Code](https://medium.com/israeli-tech-radar/mastering-claude-code-a-developer-s-guide-746a68363f4e) — Architecture & workflows

---

## Conclusion

Claude Code's `/init` command is **elegantly engineered as a hybrid system**:

1. ✅ **Tool-driven discovery** ensures only relevant files are examined
2. ✅ **Structured prompt** prevents hallucination and generic output
3. ✅ **Respect for existing tools** (Cursor, Copilot) avoids duplication
4. ✅ **Constraint-based generation** produces focused, practical documentation

It is **NOT**:
- ❌ A pure black-box LLM call (has pre-processing)
- ❌ Template-based (fully generative per project)
- ❌ Automatically regenerating (manual control via `/init`)

This design enables Claude Code to produce project-specific, accurate CLAUDE.md files consistently while avoiding the pitfalls of both pure LLM and pure template approaches.

---

**Research compiled**: February 27, 2026  
**Status**: Complete with source citations
