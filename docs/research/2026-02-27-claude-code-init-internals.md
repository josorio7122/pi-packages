# Research: Claude Code /init Command Internals

**Date:** February 27, 2026  
**Topic:** How Claude Code's `/init` command works internally  
**Status:** Complete — 8 sources analyzed

---

## Executive Summary

The `/init` command in Claude Code is **LLM-powered, not template-based**. When users run `/init`, Claude Code:

1. **Gathers context** about the codebase (structure, git metadata, lockfiles, existing instructions)
2. **Sends a structured prompt** to an LLM that instructs it to analyze the codebase
3. **Uses Claude Haiku** (or other models) with specific system prompts to generate or improve a `CLAUDE.md` file
4. **Returns the generated file** to the user for refinement

The `/init` command is essentially a **prompt-based workflow** that delegates the analysis and documentation generation to Claude itself, making it an LLM call, not a heuristic-based template system.

---

## Answer to Key Questions

### 1. **Is `/init` LLM-based or template-based?**

**Answer: LLM-based**

The `/init` command uses Claude itself (an LLM call) to generate the `CLAUDE.md` file. It's not a pre-built template system. According to Kaushik Gopal's reverse-engineering, the `/init` command is "just a strong prompt that writes (or improves) an instructions file."

**Source:** [Build your own /init command like Claude Code](https://kau.sh/blog/build-ai-init-command/) by Kaushik Gopal, October 2025

---

### 2. **What is the actual prompt sent for /init?**

The `/init` prompt that Claude Code sends to the LLM is:

```
Please analyze this codebase and create a CLAUDE.md file, which will be 
given to future instances of Claude Code to operate in this repository.

What to add:

1. Commands that will be commonly used, such as how to build, lint, and 
   run tests. Include the necessary commands to develop in this codebase, 
   such as how to run a single test.

2. High-level code architecture and structure so that future instances can 
   be productive more quickly. Focus on the "big picture" architecture that 
   requires reading multiple files to understand.

Usage notes:

- If there's already a CLAUDE.md, suggest improvements to it.
- When you make the initial CLAUDE.md, do not repeat yourself and do not 
  include obvious instructions like "Provide helpful error messages to 
  users", "Write unit tests for all new utilities", "Never include 
  sensitive information (API keys, tokens) in code or commits"
- Avoid listing every component or file structure that can be easily discovered
- Don't include generic development practices
- If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot 
  rules (in .github/copilot-instructions.md), make sure to include the 
  important parts.
- If there is a README.md, make sure to include the important parts.
- Do not make up information such as "Common Development Tasks", "Tips for 
  Development", "Support and Documentation" unless this is expressly included 
  in other files that you read.
- Be sure to prefix the file with the following text: [preamble]
```

**Sources:** 
- [Build your own /init command like Claude Code](https://kau.sh/blog/build-ai-init-command/) — Kaushik Gopal, October 2025
- [Initialize CLAUDE.md Tool System Prompt](https://blog.mansoor.app/references/prompts/init-claude/) — Mansoor Anis, August 2025

---

### 3. **What information is gathered and passed to the LLM?**

Before sending the prompt, Claude Code gathers context about your project:

#### **Pre-analysis Gathering Phase:**

1. **Lockfile Detection** — `package.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `Gemfile`, `pyproject.toml`, etc.
2. **Git Metadata** — Repository state, recent commits, branch info, git config
3. **Directory Structure** — File tree (without reading file contents at this stage)
4. **Tooling Verification** — Checks for installed tools (git, npm, node, python, docker, etc.)
5. **Ignore Rules** — `.gitignore`, `.git/info/exclude`, `.gitignore_global`
6. **Configuration Files** — `.editorconfig`, package manifests, tsconfig.json, eslint configs, etc.
7. **Existing Instructions** — Any existing `CLAUDE.md`, `README.md`, `.cursor/rules/`, `.github/copilot-instructions.md`

#### **Information Passed to LLM:**

The LLM receives:
- **System Prompt** — Instructions on how to create the CLAUDE.md file
- **Gathered Project Context** — The codebase metadata listed above
- **File Tool Access** — The LLM can use Read, Glob, and Grep tools to examine specific files as needed
- **Git History Access** — Recent commits, branch structure

**Source:** [How Claude Code Works Under the Hood](https://lukagiorgadze.com/posts/how-claude-code-works-under-the-hood/) by Luka Giorgadze, December 2025

---

### 4. **Which LLM model is used for /init?**

According to Luka Giorgadze's reverse engineering, Claude Code uses **Claude Haiku** for the warmup and initialization phase:

```json
{
  "model": "claude-haiku-4-5-20251001",
  ...
}
```

This is efficient because Haiku is:
- **Fast** — Lower latency for initial analysis
- **Cost-effective** — Haiku is Anthropic's most economical model
- **Capable enough** — Sufficient for codebase analysis and documentation generation
- **Leverages prefix caching** — Heavy reuse of cached system context reduces costs further

**Source:** [How Claude Code Works Under the Hood](https://lukagiorgadze.com/posts/how-claude-code-works-under-the-hood/) by Luka Giorgadze, December 2025

---

### 5. **Is there official Anthropic documentation?**

Yes. Anthropic's official documentation for `/init` is minimal but confirms it's LLM-powered:

From [Best Practices for Claude Code](https://docs.anthropic.com/en/docs/claude-code/best-practices):

> "Run `/init` to generate a starter CLAUDE.md file based on your current project structure, then refine over time. The `/init` command analyzes your codebase to detect build systems, test frameworks, and code patterns, giving you a solid foundation to refine."

From [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference):

> `/init` — Run initialization hooks and start interactive mode

The official docs recommend using `/init` as a starting point but emphasize refinement: "Deleting is easier than creating from scratch. The generated file often includes obvious things you don't need spelled out, or filler that doesn't add value."

**Sources:**
- [Best Practices for Claude Code](https://docs.anthropic.com/en/docs/claude-code/best-practices) — Official Anthropic docs
- [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference) — Official Anthropic docs

---

### 6. **Community Reverse-Engineering Analysis**

Several engineers have reverse-engineered Claude Code's `/init` behavior:

#### **Kir Shatrov's Network Analysis**

Using mitmproxy to intercept requests, Shatrov captured how Claude Code initializes:

```bash
$ brew install mitmproxy
$ mitmweb --mode reverse:https://api.anthropic.com --listen-port 8000
$ ANTHROPIC_BASE_URL=http://localhost:8000/ claude
```

Key findings:
- Claude Code makes multiple LLM calls before you type anything
- First call analyzes if the input is a new conversation topic
- Second call handles the main task (in this case, analyzing the codebase)
- Each call includes cached system context to reduce costs

**Source:** [Reverse engineering Claude Code](https://kirshatrov.com/posts/claude-code-internals) by Kir Shatrov, April 2025

#### **Luka Giorgadze's Detailed Breakdown**

Giorgadze used LiteLLM and Proxyman to monitor network requests and found:

1. **Warmup Phase** — Claude Code sends initialization requests with cached context
2. **Context Gathering** — File system scanning and git metadata collection
3. **Model Selection** — Uses Claude Haiku for efficiency
4. **Prefix Caching** — Reuses cached system prompts across multiple calls
5. **Tool Access** — LLM can use Bash, Read, Glob, Grep tools during execution

**Source:** [How Claude Code Works Under the Hood](https://lukagiorgadze.com/posts/how-claude-code-works-under-the-hood/) by Luka Giorgadze, December 2025

---

## Key Findings

### ✅ Confirmed Facts

| Finding | Evidence |
|---------|----------|
| `/init` uses LLM calls, not templates | Reverse-engineered prompt visible in multiple sources |
| Claude Haiku is used for initialization | Network traffic capture shows `claude-haiku-4-5-20251001` |
| Prompt is optimized and specific | Multiple engineers documented the exact prompt text |
| Codebase context is gathered first | File system scanning precedes the LLM call |
| Official Anthropic docs exist | docs.anthropic.com/en/docs/claude-code/best-practices |
| `/init` is meant as a starting point | Official docs recommend refinement after generation |

### 🔍 How It Works (End-to-End)

```
1. User runs: /init
   ↓
2. Claude Code gathers context:
   - Scans directory structure
   - Reads lockfiles, git metadata
   - Detects tech stack
   - Reads existing README.md, .cursor/rules, etc.
   ↓
3. Claude Code constructs LLM request:
   - System prompt: "Analyze this codebase and create CLAUDE.md"
   - Context: All gathered metadata
   - Tools: Read, Glob, Grep, Bash (for deeper analysis if needed)
   ↓
4. LLM (Claude Haiku) processes:
   - Reads key files if needed
   - Analyzes architecture
   - Identifies commands, patterns, conventions
   - Generates CLAUDE.md content
   ↓
5. Claude Code displays result:
   - Returns generated CLAUDE.md
   - User reviews and refines
   - Commits to repository
```

---

## Recommended Approach

### When `/init` Works Best

- **Greenfield projects** — New repos with no existing documentation
- **Legacy codebases** — Quickly bootstrap documentation for unfamiliar code
- **Team onboarding** — Generate shared context for new team members
- **Monorepos** — Create per-module CLAUDE.md files

### When to Refine `/init` Output

According to Anthropic and community consensus:

1. **Remove obvious information** — Things Claude can infer from file structure
2. **Shorten the file** — Keep under 150 lines for better adherence
3. **Emphasize critical rules** — Use BOLD or IMPORTANT for critical constraints
4. **Add project-specific gotchas** — Edge cases and non-obvious behaviors
5. **Link to external docs** — Don't duplicate long documentation

### Best Practice: Post-/init Refinement

From [How to Write a Good CLAUDE.md File](https://www.builder.io/blog/claude-md-guide) by Vishwas Gopinath:

> "The fastest way to start is the `/init` command. Run it in your project directory and Claude generates a starter CLAUDE.md based on your project structure. Some people recommend writing it from scratch, but I use `/init` as a starting point and delete what I don't need. Deleting is easier than creating from scratch."

---

## Interesting Technical Details

### 1. **Prompt Caching for Efficiency**

Claude Code uses Anthropic's prompt caching feature to reuse cached system context across multiple LLM calls. This keeps `/init` fast and cheap.

**Source:** [How Claude Code Works Under the Hood](https://lukagiorgadze.com/posts/how-claude-code-works-under-the-hood/) by Luka Giorgadze

### 2. **Multi-Stage Pipeline**

`/init` is part of Claude Code's larger multi-stage pipeline:

- **Stage 1: Topic Detection** — Is this a new conversation?
- **Stage 2: Context Gathering** — What files are needed?
- **Stage 3: Analysis** — What does the codebase do?
- **Stage 4: Generation** — Create CLAUDE.md
- **Stage 5: Refinement** — Let user edit and improve

**Source:** [Reverse engineering Claude Code](https://kirshatrov.com/posts/claude-code-internals) by Kir Shatrov

### 3. **Not a Shell Command**

Unlike typical CLI tools, `/init` is not a shell script or binary. It's a **prompt-based command** that:
- Gets interpreted by Claude Code's parser
- Triggers an LLM workflow
- Returns the result to the user

This is why it can understand nuanced instructions and make intelligent decisions about what to include/exclude.

**Source:** [Build your own /init command like Claude Code](https://kau.sh/blog/build-ai-init-command/) by Kaushik Gopal

---

## Sources

### Official Anthropic Documentation
1. **[Best Practices for Claude Code](https://docs.anthropic.com/en/docs/claude-code/best-practices)** — Official guidance on `/init` and CLAUDE.md
2. **[CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)** — Official command reference
3. **[How Claude Code Works](https://code.claude.com/docs/en/how-claude-code-works)** — Product documentation

### Reverse-Engineering & Deep Dives
4. **[Reverse engineering Claude Code](https://kirshatrov.com/posts/claude-code-internals)** by Kir Shatrov (April 2025) — Network traffic capture using mitmproxy
5. **[How Claude Code Works Under the Hood](https://lukagiorgadze.com/posts/how-claude-code-works-under-the-hood/)** by Luka Giorgadze (December 2025) — Detailed analysis with LiteLLM and Proxyman
6. **[Build your own /init command like Claude Code](https://kau.sh/blog/build-ai-init-command/)** by Kaushik Gopal (October 2025) — Reverse-engineered prompt and implementation guide

### Community Best Practices
7. **[How to Write a Good CLAUDE.md File](https://www.builder.io/blog/claude-md-guide)** by Vishwas Gopinath (builder.io) — Practical guidance on refining `/init` output
8. **[Initialize CLAUDE.md Tool System Prompt](https://blog.mansoor.app/references/prompts/init-claude/)** by Mansoor Anis (August 2025) — Documented prompt text
9. **[Creating the Perfect CLAUDE.md for Claude Code](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/)** by Ivan Kahl (January 2026) — Step-by-step walkthrough

---

## Conclusion

Claude Code's `/init` command is a **well-engineered LLM-powered workflow** that:

1. ✅ **Uses Claude itself** (via LLM API calls) to generate documentation
2. ✅ **Gathers rich context** before making the LLM call
3. ✅ **Is optimized for cost and speed** using Claude Haiku and prompt caching
4. ✅ **Is intentionally simple** — the magic is in the prompt, not the code
5. ✅ **Integrates with the broader Claude Code pipeline** — part of a multi-stage initialization system

The "secret sauce" isn't complex — it's a **strong, well-crafted prompt** that tells Claude what to analyze and what to generate. This reflects Anthropic's philosophy of keeping Claude Code "intentionally low-level and non-opinionated," delegating intelligence to the LLM rather than embedding logic in the tool itself.

---

**Document generated:** February 27, 2026  
**Last updated:** February 27, 2026
