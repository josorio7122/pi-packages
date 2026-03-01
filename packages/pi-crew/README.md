# pi-crew

Agentic coding workflow for [pi](https://github.com/mariozechner/pi). Dispatch specialized agents — scout, researcher, architect, executor, reviewer, debugger — through structured phases from exploration to shipping.

## Quick Start

```bash
pi install git:github.com/josorio7122/pi-packages
```

Then in any pi session:

```
Use dispatch_crew to dispatch a scout that maps the project structure.
```

Or use the phase skills directly:

```
Explore the codebase, then design a solution for adding user authentication.
```

Pi loads the crew skills automatically when the task matches — no manual `/skill:` commands needed.

## How It Works

Pi-crew adds a `dispatch_crew` tool and 6 phase skills. The tool spawns isolated pi subprocesses with preset configurations. The extension reads `.crew/state.md` and automatically injects the current phase's skill instructions into the system prompt — the LLM never needs to load skills manually.

### The Workflow

```
explore → design → plan → build → review → ship
```

| Phase       | Skill          | What happens                                                                         |
| ----------- | -------------- | ------------------------------------------------------------------------------------ |
| **Explore** | `crew-explore` | Scouts map codebase structure, tech stack, patterns, conventions                     |
| **Design**  | `crew-design`  | Discuss approaches with user, dispatch architect for complex designs, lock decisions |
| **Plan**    | `crew-plan`    | Break design into task waves with dependencies and verification criteria             |
| **Build**   | `crew-build`   | Execute tasks wave-by-wave with executors; retry failures with debuggers             |
| **Review**  | `crew-review`  | Three-gate verification: spec compliance → code quality → security                   |
| **Ship**    | `crew-ship`    | Squash commits, push branch, open PR/MR with generated description                   |

**Not every task needs every phase.** Choose a workflow when starting:

| Scope    | Workflow                              | When                                  |
| -------- | ------------------------------------- | ------------------------------------- |
| Full     | explore,design,plan,build,review,ship | New features, architectural changes   |
| Standard | explore,plan,build,review,ship        | Clear scope, no design debate needed  |
| Quick    | explore,build,ship                    | Small feature, obvious implementation |
| Minimal  | build,ship                            | Bug fix, config change, documentation |

For simple tasks, dispatch agents directly without a workflow.

### Workflow Enforcement

Once a workflow starts, pi-crew enforces completion through three mechanisms:

1. **State-driven skill injection** — The extension reads `.crew/state.md`, loads the current phase's SKILL.md from disk, and injects it into every system prompt. The LLM always has the right instructions.
2. **Workflow commitment** — `state.md` includes a `workflow` field declaring which phases this feature will go through. Once committed, the plan is locked.
3. **Agent-end nudge** — After each LLM turn, if the workflow is incomplete, the extension sends a `triggerTurn` message forcing the LLM to continue. It can't stop until the workflow reaches the last phase.

## Agent Presets

| Preset       | Model Tier | Tools                                   | Purpose                                          |
| ------------ | ---------- | --------------------------------------- | ------------------------------------------------ |
| `scout`      | budget     | read, bash, grep, find, ls              | Fast codebase exploration — compressed findings  |
| `researcher` | budget     | read, bash, grep, find, ls              | Web/docs research via exa-search skill           |
| `architect`  | quality    | read, bash, grep, find, ls              | Design decisions, component breakdowns, specs    |
| `executor`   | balanced   | read, write, edit, bash, grep, find, ls | Implements tasks. Follows TDD. Commits per task  |
| `reviewer`   | balanced   | read, bash, grep, find, ls              | Code review — spec compliance, quality, security |
| `debugger`   | balanced   | read, write, edit, bash, grep, find, ls | Root cause analysis, surgical repair             |

Each preset has a dedicated system prompt, scoped tool access, and model tier. Agents are spawned with `--no-extensions` to prevent recursive dispatch while preserving skill access.

## Dispatch Modes

### Single

Dispatch one agent:

```
dispatch_crew({
  preset: "scout",
  task: "Map the authentication module — files, patterns, dependencies",
  cwd: "/path/to/project"
})
```

### Parallel

Dispatch multiple agents concurrently:

```
dispatch_crew({
  tasks: [
    { preset: "scout", task: "Map the API layer", cwd: "/path/to/project" },
    { preset: "scout", task: "Map the database schema", cwd: "/path/to/project" },
    { preset: "researcher", task: "Find best practices for JWT refresh tokens" }
  ]
})
```

Concurrency is limited by `DISPATCH_CREW_MAX_CONCURRENT` (default: 4, max: 8).

### Chain

Dispatch agents sequentially — each gets the previous agent's output via `{previous}`:

```
dispatch_crew({
  chain: [
    { preset: "scout", task: "Investigate the payment module", cwd: "/path/to/project" },
    { preset: "architect", task: "Design a refactor based on: {previous}", cwd: "/path/to/project" }
  ]
})
```

### Overrides

Override model or thinking level per-dispatch:

```
dispatch_crew({
  preset: "executor",
  model: "claude-opus-4",
  thinking: "high",
  task: "Implement the complex migration logic"
})
```

## Model Profiles

Profiles map agent tiers to concrete models. Switch profiles to trade cost for capability.

| Profile                | Budget Tier       | Balanced Tier     | Quality Tier      |
| ---------------------- | ----------------- | ----------------- | ----------------- |
| **quality**            | claude-sonnet-4-5 | claude-sonnet-4-5 | claude-opus-4     |
| **balanced** (default) | claude-haiku-4-5  | claude-sonnet-4-5 | claude-sonnet-4-5 |
| **budget**             | claude-haiku-4-5  | claude-haiku-4-5  | claude-sonnet-4-5 |

Change profile:

```
/crew:profile quality
```

Override a specific agent's model:

```
/crew:override executor claude-opus-4
```

Reset all overrides:

```
/crew:reset
```

## State Management

Pi-crew stores workflow state in a `.crew/` directory at the project root. This directory is **not gitignored** — it's project context for your team.

```
.crew/
├── config.json              # Profile, agent overrides
├── state.md                 # Current phase, feature, progress
└── phases/
    └── <feature>/
        ├── explore.md       # Scout findings
        ├── design.md        # Locked decisions, must-haves
        ├── plan.md          # Task waves with dependencies
        ├── build/
        │   ├── task-01.md   # Individual task spec + status
        │   ├── task-02.md
        │   └── summary.md   # What was built, deviations
        ├── review.md        # Three-gate results
        └── summary.md       # Final feature summary
```

`state.md` uses YAML frontmatter with a `workflow` field that commits to a phase plan:

```yaml
---
feature: user-authentication
phase: build
workflow: explore,design,plan,build,review,ship
progress: 3/7
---
```

The `workflow` field is set once when the workflow starts and never changes. The `phase` field advances as each phase completes. The extension reads this file on every turn and injects the current phase's skill content into the system prompt.

## Commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `/crew`                           | Show current crew status (feature, phase, profile)     |
| `/crew:profile <name>`            | Switch model profile (`quality`, `balanced`, `budget`) |
| `/crew:override <preset> <model>` | Override a specific agent's model                      |
| `/crew:reset`                     | Reset all overrides to profile defaults                |
| `/crew:status`                    | Show detailed status of current feature                |

## Configuration

### Environment Variables

| Variable                       | Default | Description                                     |
| ------------------------------ | ------- | ----------------------------------------------- |
| `DISPATCH_CREW_MAX_CONCURRENT` | `4`     | Max concurrent agents in parallel mode (max: 8) |

### `.crew/config.json`

```json
{
  "profile": "balanced",
  "overrides": {
    "executor": "claude-opus-4"
  }
}
```

## Package Structure

```
pi-crew/
├── extensions/
│   └── pi-crew/
│       ├── index.ts          # Tool registration, commands, system prompt injection
│       ├── presets.ts         # Agent preset definitions
│       ├── profiles.ts       # Model profile resolution
│       ├── spawn.ts          # Pi subprocess spawning + NDJSON parsing
│       ├── state.ts          # .crew/ directory management
│       └── rendering.ts      # Inline agent cards (DynamicBorder)
├── skills/
│   ├── crew-explore/SKILL.md
│   ├── crew-design/SKILL.md
│   ├── crew-plan/SKILL.md
│   ├── crew-build/SKILL.md
│   ├── crew-review/SKILL.md
│   └── crew-ship/SKILL.md
├── references/
│   ├── model-profiles.md     # Profile → tier → model mapping
│   ├── deviation-rules.md    # Auto-fix rules for executors
│   ├── evaluation-gates.md   # Phase gate checklists
│   └── prompts/              # System prompts for each agent preset
│       ├── scout.md
│       ├── researcher.md
│       ├── architect.md
│       ├── executor.md
│       ├── reviewer.md
│       └── debugger.md
└── templates/
    ├── plan.md               # Plan artifact template
    ├── task.md               # Task artifact template
    ├── spec.md               # Design spec template
    └── summary.md            # Feature summary template
```

## Limitations

- **No streaming**: Agent output is collected and returned at completion, not streamed token-by-token.
- **No cross-agent memory**: Agents in parallel mode don't share context. Use chain mode when agents need prior output.
- **Subprocess overhead**: Each agent spawns a `pi` subprocess. Fast tasks (< 5s) may feel slower than inline execution.
- **No automatic phase progression**: The orchestrator decides phases per-session. It won't auto-resume a half-finished build across sessions — load `.crew/state.md` to resume.
- **Model availability**: Profiles reference Anthropic models. Other providers require manual overrides.

## License

MIT
