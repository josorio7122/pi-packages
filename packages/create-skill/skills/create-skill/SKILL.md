---
name: create-skill
description: Expert at creating pi skills. Use when the user wants to create, scaffold, or design a new pi skill — including SKILL.md frontmatter, directory structure, helper scripts, references, and templates. Follows the Agent Skills specification (agentskills.io) and the user's AGENTS.md standards.
metadata:
  author: josorio7122
  version: "3.0"
---

# Create Skill

Create skills that follow the Agent Skills specification and work with pi's skill discovery system.

## Step 0: Ensure the Spec is Available

The Agent Skills repo lives inside this skill at `references/agentskills/`. Clone it if missing, then always pull main before creating anything.

```bash
SKILL_DIR="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"
REFS_DIR="references/agentskills"

# Clone if not present
if [ ! -d "$REFS_DIR" ]; then
  git clone https://github.com/agentskills/agentskills.git "$REFS_DIR"
fi

# Always pull latest main
cd "$REFS_DIR" && git checkout main && git pull && cd -
```

The agent must run these commands (resolved to absolute paths) from the skill directory before proceeding.

## Step 1: Read the Spec

Read these two files from the local clone before creating any skill:

- **Specification:** `references/agentskills/docs/specification.mdx`
- **Script guide:** `references/agentskills/docs/skill-creation/using-scripts.mdx`

These are the authoritative sources. The summary below is for quick reference only — always defer to the spec files when in doubt.

## Spec Quick Reference

### Directory Structure

```
skill-name/
├── SKILL.md          # Required: frontmatter + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation loaded on-demand
└── assets/           # Optional: templates, static resources
```

### SKILL.md Format

Must start with YAML frontmatter followed by Markdown body:

```markdown
---
name: skill-name
description: What this skill does and when to use it.
---

# Skill Title

Instructions the agent follows when this skill is activated.
```

### Frontmatter Fields

| Field           | Required | Constraints                                                                                                                        |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | Yes      | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. Must match parent directory name. |
| `description`   | Yes      | Max 1024 chars. Non-empty. Describes what the skill does AND when to use it.                                                       |
| `license`       | No       | License name or reference to bundled file.                                                                                         |
| `compatibility` | No       | Max 500 chars. Environment requirements.                                                                                           |
| `metadata`      | No       | Arbitrary key-value string mapping.                                                                                                |
| `allowed-tools` | No       | Space-delimited list of pre-approved tools. (Experimental)                                                                         |

**Only these six fields are allowed.** The `skills-ref` validator rejects unknown frontmatter fields.

### Name Rules

- 1–64 characters
- Lowercase Unicode alphanumeric + hyphens only
- No leading/trailing hyphens, no consecutive hyphens (`--`)
- Must match the parent directory name exactly
- Skills are verbs/actions (e.g. `create-skill`, `brave-search`, `code-review`), not nouns/roles

### Description Rules

The description determines whether the agent loads the skill. It is the single most important field.

**Good** — says what AND when:

```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
```

**Bad** — vague, no trigger:

```yaml
description: Helps with PDFs.
```

### Progressive Disclosure

1. **Metadata** (~50–100 tokens per skill): Name and description loaded at startup for all skills
2. **Instructions** (< 5000 tokens recommended): Full SKILL.md body loaded when skill activates
3. **Resources** (as needed): Files in `scripts/`, `references/`, `assets/` loaded only when required

**Keep SKILL.md under 500 lines.** Move detailed reference material to separate files. Keep file references one level deep.

## How Pi Discovers Skills

| Location                               | Scope                          |
| -------------------------------------- | ------------------------------ |
| `~/.pi/agent/skills/`                  | Global (all projects)          |
| `~/.agents/skills/`                    | Global (Agent Skills standard) |
| `.pi/skills/`                          | Project-local                  |
| `.agents/skills/` in cwd and ancestors | Project-local (standard)       |
| Pi packages `skills/` directory        | Shared via npm/git             |

At startup, pi extracts names and descriptions into the system prompt as XML. When a task matches, the agent uses `read` to load the full SKILL.md. Users can also invoke with `/skill:name`.

## Using Scripts in Skills

Read the full guide before creating script-based skills:

```
references/agentskills/docs/skill-creation/using-scripts.mdx
```

Key points:

- **One-off commands** — if an existing package does the job, reference it directly (e.g. `uvx ruff@0.8.0 check .`), no `scripts/` needed
- **Self-contained scripts** — prefer inline dependency declarations (PEP 723 for Python, npm: specifiers for Deno) so no separate install step is needed
- **No interactive prompts** — agents run non-interactively
- **`--help` output** — primary way agents learn the script interface
- **Structured output** — JSON/CSV to stdout, diagnostics to stderr
- **Idempotency** — agents may retry commands
- **Meaningful exit codes** — distinct codes for different failure types
- **Predictable output size** — default to summaries, support `--offset` for pagination

## Validation

### Validate with skills-ref CLI

The validator is part of the cloned repo:

```bash
cd references/agentskills/skills-ref
uv sync   # one-time setup
uv run skills-ref validate /path/to/my-skill
```

Exit code 0 = valid. Exit code 1 = errors printed to stderr.

### Read Properties (JSON)

```bash
uv run skills-ref read-properties /path/to/my-skill
```

### Generate Prompt XML

```bash
uv run skills-ref to-prompt /path/to/skill-a /path/to/skill-b
```

### Test in Pi

```bash
pi --no-session "/skill:my-skill"
```

Pi shows startup warnings for spec violations and loads the full SKILL.md content.

## Creation Workflow

### 1. Pull Latest Spec

```bash
cd references/agentskills && git pull
```

### 2. Read the Spec

```
read references/agentskills/docs/specification.mdx
read references/agentskills/docs/skill-creation/using-scripts.mdx
```

### 3. Clarify Intent

- What does the skill do? (one sentence)
- When should the agent load it? (trigger conditions for the description)
- Does it need scripts, references, or templates?
- Global (`~/.pi/agent/skills/`) or project-local (`.pi/skills/`)?

### 4. Choose Structure

**Instructions only:**

```
my-skill/
└── SKILL.md
```

**With references (detail on-demand):**

```
my-skill/
├── SKILL.md
└── references/
    └── detailed-guide.md
```

**With scripts:**

```
my-skill/
├── SKILL.md
└── scripts/
    └── process.py    # Self-contained with inline deps
```

**With scripts that need npm deps (standalone skill):**

```
my-skill/
├── SKILL.md
├── package.json      # pnpm init, then pnpm add <dep>
└── scripts/
    └── search.js
```

**With scripts that need npm deps (inside a pi package):**

```
packages/my-package/
├── package.json      # Single package.json — pi manifest + deps live here
└── skills/
    └── my-skill/
        ├── SKILL.md
        └── scripts/
            └── search.js
```

> **One `package.json` per package — never two.** When a skill lives inside a pi package (`packages/<name>/skills/<skill>/`), the package root `package.json` owns both the `pi` manifest and the npm dependencies. Node resolves imports up the directory tree, so scripts inside `skills/<skill>/scripts/` will find deps installed at the package root. Never create a second `package.json` inside the skill directory.

### 5. Write SKILL.md

Use the template below. Keep the body under 500 lines. Move detail into `references/`.

### 6. Validate

```bash
cd references/agentskills/skills-ref
uv run skills-ref validate /path/to/my-skill
```

Fix any errors before delivering.

### 7. Verify in Pi

```bash
pi --no-session "/skill:name"
```

Confirm no warnings at startup and the skill content loads correctly.

## SKILL.md Template

```markdown
---
name: <name>
description: <What it does AND when to use it. Max 1024 chars. Be specific — this determines auto-loading.>
metadata:
  author: josorio7122
  version: "1.0"
---

# <Title>

<One paragraph: what this skill does and why it exists.>

## Prerequisites

<What must be installed/configured. Include verification commands.>

\`\`\`bash
<tool> --version
\`\`\`

## Usage

<Step-by-step instructions the agent follows.>

### <Primary Action>

\`\`\`bash
<command>
\`\`\`

## Rules

<Constraints the agent must follow. Include relevant AGENTS.md standards for this domain.>

## Reference

<On-demand docs for deeper detail.>

See [detailed guide](references/guide.md) for advanced usage.
```

### Optional Fields to Add When Needed

```yaml
# Only if the skill has environment requirements
compatibility: "Requires Node.js 18+ and glab CLI installed"

# Only if distributing
license: MIT

# Only if the skill needs pre-approved tools (experimental)
allowed-tools: Bash(git:*) Read
```

## AGENTS.md Standards to Embed

When the skill touches these domains, include the relevant rules from the user's workflow:

- **Code changes:** TDD first, run tests before commit, `type: description` commit format
- **New packages:** Never hand-write `package.json` (`pnpm init`) or `pyproject.toml` (`uv init`). Use `npm pkg set` to modify fields, `pnpm add` for deps. One `package.json` per package — never a second one inside the skill directory
- **Python:** Use `uv` exclusively, always venv, prefer `uv run`
- **Git/branching:** Worktrees for feature work, `feature/` `fix/` `refactor/` naming
- **Subagents:** Full task text (never point to files), always pass `cwd`
- **Doc lookup:** Check current docs before relying on training data
