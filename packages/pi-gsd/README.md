# @josorio/pi-gsd

Get Shit Done workflow system for [pi](https://github.com/mariozechner/pi-coding-agent) — structured project planning, execution, and verification.

A port of the [Get Shit Done](https://github.com/gsd-build/get-shit-done) workflow system from Claude Code to pi.

## Installation

```bash
pi install npm:@josorio/pi-gsd
```

Or for local development:

```bash
pi install /path/to/pi-packages/packages/pi-gsd
```

## What You Get

### 10 Tools (auto-registered)

| Tool | Description |
|------|-------------|
| `gsd_init` | Project and phase initialization |
| `gsd_state` | STATE.md CRUD and progression |
| `gsd_phase` | Phase operations (add, remove, list, reorder) |
| `gsd_roadmap` | ROADMAP.md parsing and analysis |
| `gsd_config` | Configuration and model profile management |
| `gsd_milestone` | Milestone completion and archival |
| `gsd_verify` | Health checks and validation |
| `gsd_util` | Timestamps, slugs, templates, frontmatter |
| `gsd_dispatch` | Spawn a single GSD agent |
| `gsd_dispatch_wave` | Spawn multiple agents in parallel |

### 31 Skills (commands)

**Core Workflow:**
- `/skill:gsd-new-project` — Initialize a new project
- `/skill:gsd-discuss-phase` — Discuss phase requirements
- `/skill:gsd-plan-phase` — Create execution plans
- `/skill:gsd-execute-phase` — Execute plans with agents
- `/skill:gsd-verify-work` — Verify completed work
- `/skill:gsd-complete-milestone` — Archive milestone
- `/skill:gsd-new-milestone` — Start next milestone

**Fast Path:**
- `/skill:gsd-quick` — Plan + execute in one step

**Navigation:**
- `/skill:gsd-progress` — Show project status
- `/skill:gsd-help` — List all commands

**Session:**
- `/skill:gsd-pause-work` — Save state for later
- `/skill:gsd-resume-work` — Resume saved state

**And 19 more** for phase management, research, debugging, config, utilities.

### 11 Agents (bundled)

Agents run in isolated pi processes with fresh 200K context windows. Model selection is automatic based on your configured profile (quality/balanced/budget).

| Agent | Role |
|-------|------|
| `executor` | Execute plans with atomic commits |
| `planner` | Create detailed execution plans |
| `verifier` | Verify work against requirements |
| `plan-checker` | Validate plan quality |
| `roadmapper` | Create project roadmaps |
| `project-researcher` | Research for new projects |
| `phase-researcher` | Research for specific phases |
| `research-synthesizer` | Combine research findings |
| `codebase-mapper` | Map existing codebases |
| `debugger` | Systematic debugging |
| `integration-checker` | Cross-plan integration checks |

## Quick Start

1. Install the package
2. Start a new project: `/skill:gsd-new-project`
3. Follow the guided workflow

## How It Works

GSD manages your project through a `.planning/` directory:

```
.planning/
├── STATE.md           # Current phase, plan, status
├── ROADMAP.md         # Phase breakdown with requirements
├── REQUIREMENTS.md    # Project requirements
├── config.json        # Settings (profile, git, etc.)
├── phases/
│   ├── 01-setup/
│   │   ├── 01-1-PLAN.md
│   │   ├── 01-1-SUMMARY.md
│   │   └── 01-1-VERIFICATION.md
│   └── 02-core/
│       ├── 02-1-PLAN.md
│       └── ...
└── milestones/        # Archived completed milestones
```

The state machine progresses: **new-project → discuss → plan → execute → verify → complete**.

## Model Profiles

Set with `/skill:gsd-set-profile`:

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|-------------|
| **quality** | Opus | Opus | Sonnet |
| **balanced** | Opus | Sonnet | Sonnet |
| **budget** | Sonnet | Sonnet | Haiku |

## Development

```bash
pnpm --filter @josorio/pi-gsd build
pnpm --filter @josorio/pi-gsd test
pnpm --filter @josorio/pi-gsd test:watch
```

## License

MIT
