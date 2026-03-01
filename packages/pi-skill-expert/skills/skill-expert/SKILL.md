---
name: skill-expert
description: Expert at creating pi skills. Use when the user wants to create, scaffold, or design a new pi skill — including SKILL.md frontmatter, directory structure, helper scripts, references, and templates. Follows the Agent Skills specification (agentskills.io) and the user's AGENTS.md standards.
metadata:
  author: josorio7122
  version: "2.0"
---

# Pi Skill Expert

Create skills that follow the [Agent Skills specification](https://agentskills.io/specification) and work with pi's skill discovery system.

## Specification Reference

The canonical spec lives at [agentskills.io/specification](https://agentskills.io/specification). Read it before creating any skill. Key points summarized below.

### Directory Structure

A skill is a directory containing at minimum a `SKILL.md` file:

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

Per the specification:

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. Must match parent directory name. |
| `description` | Yes | Max 1024 chars. Non-empty. Describes what the skill does AND when to use it. |
| `license` | No | License name or reference to bundled file. |
| `compatibility` | No | Max 500 chars. Environment requirements. |
| `metadata` | No | Arbitrary key-value string mapping. |
| `allowed-tools` | No | Space-delimited list of pre-approved tools. (Experimental) |

**Only these six fields are allowed.** The `skills-ref` validator rejects unknown frontmatter fields.

### Name Rules

- 1–64 characters
- Lowercase Unicode alphanumeric + hyphens only
- No leading/trailing hyphens
- No consecutive hyphens (`--`)
- Must match the parent directory name exactly

### Description Rules

The description determines whether the agent loads the skill. It is the single most important field.

**Good** — says what it does AND when to use it:
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

**Bad** — vague, no trigger condition:
```yaml
description: Helps with PDFs.
```

### Progressive Disclosure

This is a core design principle from the spec:

1. **Metadata** (~50–100 tokens per skill): Name and description loaded at startup for all skills
2. **Instructions** (< 5000 tokens recommended): Full SKILL.md body loaded when skill activates
3. **Resources** (as needed): Files in `scripts/`, `references/`, `assets/` loaded only when required

**Keep SKILL.md under 500 lines.** Move detailed reference material to separate files.

### File References

Use relative paths from the skill directory root:

```markdown
See [the reference guide](references/REFERENCE.md) for details.

Run the extraction script:
```bash
bash scripts/validate.sh "$INPUT_FILE"
```

Keep file references one level deep from `SKILL.md`. Avoid deeply nested reference chains.

## How Pi Discovers Skills

Pi scans these locations (from pi docs at `docs/skills.md`):

| Location | Scope |
|----------|-------|
| `~/.pi/agent/skills/` | Global (all projects) |
| `~/.agents/skills/` | Global (Agent Skills standard) |
| `.pi/skills/` | Project-local |
| `.agents/skills/` in cwd and ancestors | Project-local (standard) |
| Pi packages `skills/` directory | Shared via npm/git |

Discovery rules:
- Direct `.md` files in the skills directory root
- Recursive `SKILL.md` files under subdirectories

At startup, pi extracts names and descriptions and injects them into the system prompt as XML:

```xml
<available_skills>
  <skill>
    <name>my-skill</name>
    <description>What it does and when to use it.</description>
    <location>/path/to/my-skill/SKILL.md</location>
  </skill>
</available_skills>
```

When a task matches, the agent uses `read` to load the full SKILL.md. Users can also invoke directly with `/skill:name`.

## Using Scripts in Skills

Read the full guide at [agentskills.io — Using Scripts](https://agentskills.io/skill-creation/using-scripts) before creating script-based skills.

Key points:

### One-off Commands vs Bundled Scripts

If an existing package does what you need, reference it directly — no `scripts/` directory needed:

```bash
uvx ruff@0.8.0 check .
npx eslint@9 --fix .
```

Move complex commands into `scripts/` when they grow beyond a few flags.

### Self-Contained Scripts (Inline Dependencies)

Prefer scripts that declare their own dependencies inline — no separate install step:

**Python (PEP 723 + uv):**
```python
# /// script
# dependencies = ["beautifulsoup4"]
# ///
from bs4 import BeautifulSoup
# ...
```
Run with: `uv run scripts/extract.py`

**Deno (npm: specifiers):**
```typescript
import * as cheerio from "npm:cheerio@1.0.0";
// ...
```
Run with: `deno run scripts/extract.ts`

### Script Design for Agentic Use

- **No interactive prompts** — agents run in non-interactive shells
- **Document usage with `--help`** — primary way agents learn the interface
- **Write helpful error messages** — say what went wrong, what was expected, what to try
- **Use structured output** — JSON/CSV over free-form text; data to stdout, diagnostics to stderr
- **Idempotency** — agents may retry commands
- **Meaningful exit codes** — distinct codes for different failure types
- **Predictable output size** — default to summaries, support `--offset` for pagination

## Validation with skills-ref CLI

The official reference library provides a Python CLI for validating skills.

### Setup (one-time)

Clone the reference library and install:

```bash
git clone https://github.com/agentskills/agentskills.git
cd agentskills/skills-ref
uv sync
```

### Validate a Skill

```bash
cd agentskills/skills-ref
uv run skills-ref validate /path/to/my-skill
```

Exit code 0 = valid. Exit code 1 = errors found, printed to stderr.

The validator checks:
- SKILL.md exists
- Frontmatter is valid YAML
- `name` and `description` are present and non-empty
- Name matches directory, follows character/length rules
- No unknown frontmatter fields
- Description and compatibility within character limits

### Read Properties (JSON output)

```bash
uv run skills-ref read-properties /path/to/my-skill
```

### Generate Prompt XML

```bash
uv run skills-ref to-prompt /path/to/skill-a /path/to/skill-b
```

### Test in Pi

Also verify the skill loads in pi:

```bash
pi --no-session "/skill:my-skill"
```

Pi shows startup warnings for spec violations and loads the full SKILL.md content.

## Creation Workflow

When asked to create a skill:

### 1. Clarify Intent

- What does the skill do? (one sentence)
- When should the agent load it? (trigger conditions for the description)
- Does it need scripts, references, or templates?
- Global (`~/.pi/agent/skills/`) or project-local (`.pi/skills/`)?

### 2. Choose Structure

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

**With scripts that need npm deps:**
```
my-skill/
├── SKILL.md
├── scripts/
│   └── search.js
└── package.json
```

### 3. Write SKILL.md

Use the template in this skill. Keep the body under 500 lines. Move detail into `references/`.

### 4. Validate

```bash
cd /Users/josorio/Code/agents.md/agentskills/skills-ref
uv run skills-ref validate /path/to/my-skill
```

Fix any errors before delivering.

### 5. Verify in Pi

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
- **New packages:** Never hand-write `package.json` (`pnpm init`) or `pyproject.toml` (`uv init`)
- **Python:** Use `uv` exclusively, always venv, prefer `uv run`
- **Git/branching:** Worktrees for feature work, `feature/` `fix/` `refactor/` naming
- **Subagents:** Full task text (never point to files), always pass `cwd`
- **Doc lookup:** Check current docs before relying on training data
