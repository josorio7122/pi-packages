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

## How It Works

Pi-crew adds a `dispatch_crew` tool with 6 workflow phases and mechanical enforcement. The tool spawns isolated pi subprocesses with preset configurations. The extension manages `.crew/state.md` and automatically:

- **Injects phase instructions** into the system prompt based on the active phase
- **Auto-captures dispatch results** to `.crew/phases/<feature>/<phase>.md`
- **Gates phase transitions** — can't advance without handoff files from the previous phase
- **Auto-advances phases** after successful dispatch and handoff capture
- **Nudges on agent_end** — forces the LLM to continue when workflow is incomplete

### The Workflow

```
explore → design → plan → build → review → ship
```

| Phase       | What happens                                                                         |
| ----------- | ------------------------------------------------------------------------------------ |
| **Explore** | Scouts map codebase structure, tech stack, patterns, conventions                     |
| **Design**  | Discuss approaches with user, dispatch architect for complex designs, lock decisions |
| **Plan**    | Break design into task waves with dependencies and verification criteria             |
| **Build**   | Execute tasks wave-by-wave with executors; retry failures with debuggers             |
| **Review**  | Three-gate verification: spec compliance → code quality → security                   |
| **Ship**    | Squash commits, push branch, open PR/MR with generated description                   |

Each phase restricts which agent presets can be dispatched:

| Phase       | Allowed Presets              | Auto-Advance |
| ----------- | ---------------------------- | ------------ |
| **Explore** | scout, researcher            | ✓            |
| **Design**  | architect, researcher, scout | ✓            |
| **Plan**    | scout, researcher            | ✓            |
| **Build**   | executor, debugger, scout    | ✗            |
| **Review**  | reviewer, scout              | ✗            |
| **Ship**    | scout, researcher            | ✓            |

**Not every task needs every phase.** Choose a workflow when starting:

| Scope    | Workflow                              | When                                  |
| -------- | ------------------------------------- | ------------------------------------- |
| Full     | explore,design,plan,build,review,ship | New features, architectural changes   |
| Standard | explore,plan,build,review,ship        | Clear scope, no design debate needed  |
| Quick    | explore,build,ship                    | Small feature, obvious implementation |
| Minimal  | build,ship                            | Bug fix, config change, documentation |

For simple tasks, dispatch agents directly without a workflow.

### Mechanical Enforcement

Pi-crew doesn't rely on the LLM following instructions. Enforcement is in extension code:

1. **Universal dispatch log** — Every `dispatch_crew` result is written to `.crew/dispatches/<timestamp>-<preset>.md`, regardless of workflow state. `.crew/` is the universal record of all agent work.
2. **Auto-capture** — When a workflow is active, dispatch output is also written to `.crew/phases/<feature>/<phase>.md`.
3. **Smart auto-advance** — Simple phases (explore, design, plan, ship) auto-advance after the first successful dispatch. Complex phases (build, review) write the handoff but do NOT auto-advance — the orchestrator completes them manually.
4. **Phase-preset validation** — Each phase restricts which presets can be dispatched (e.g., only scout/researcher during explore, only executor/debugger/scout during build). Invalid presets are blocked with a descriptive error.
5. **Phase gate** — Before dispatching, the extension checks that the previous phase's handoff file exists. Missing handoffs block advancement.
6. **Workflow gate** — Multi-agent implementation work (parallel with executors, chains with architects) requires `.crew/state.md` before dispatch is allowed.
7. **Agent-end nudge** — After each LLM turn, if the workflow is incomplete, the extension sends a `triggerTurn` message forcing the LLM to continue.

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

```
dispatch_crew({
  preset: "scout",
  task: "Map the authentication module — files, patterns, dependencies",
  cwd: "/path/to/project"
})
```

### Parallel

```
dispatch_crew({
  tasks: [
    { preset: "scout", task: "Map the API layer", cwd: "/path/to/project" },
    { preset: "scout", task: "Map the database schema", cwd: "/path/to/project" },
    { preset: "researcher", task: "Find best practices for JWT refresh tokens" }
  ]
})
```

### Chain

```
dispatch_crew({
  chain: [
    { preset: "scout", task: "Investigate the payment module", cwd: "/path/to/project" },
    { preset: "architect", task: "Design a refactor based on: {previous}", cwd: "/path/to/project" }
  ]
})
```

### Overrides

```
dispatch_crew({
  preset: "executor",
  model: "claude-opus-4-6",
  thinking: "high",
  task: "Implement the complex migration logic"
})
```

## Model Profiles

| Profile                | Budget Tier       | Balanced Tier     | Quality Tier      |
| ---------------------- | ----------------- | ----------------- | ----------------- |
| **quality**            | claude-sonnet-4-6 | claude-sonnet-4-6 | claude-opus-4-6   |
| **balanced** (default) | claude-haiku-4-5  | claude-sonnet-4-6 | claude-sonnet-4-6 |
| **budget**             | claude-haiku-4-5  | claude-haiku-4-5  | claude-sonnet-4-6 |

```
/crew:profile quality
/crew:override executor claude-opus-4-6
/crew:reset
```

## State Management

Pi-crew stores workflow state in `.crew/` at the project root. This directory is **not gitignored** — it's project context for your team.

```
.crew/
├── config.json              # Profile, agent overrides
├── state.md                 # Current phase, feature, progress (auto-managed by extension)
├── dispatches/              # Universal dispatch log (all agent results, auto-written)
│   ├── 2026-03-01T...-scout.md
│   └── 2026-03-01T...-executor.md
└── phases/
    └── <feature>/
        ├── explore.md       # Auto-captured from scout dispatch
        ├── design.md        # Auto-captured from architect dispatch
        ├── plan.md          # Auto-captured or host LLM writes
        ├── build/
        │   ├── task-01.md   # Task spec + status
        │   └── summary.md   # Build summary
        ├── review.md        # Auto-captured from reviewer dispatch
        └── summary.md       # Feature summary (ship phase)
```

`state.md` uses YAML frontmatter:

```yaml
---
feature: user-authentication
phase: build
workflow: explore,design,plan,build,review,ship
progress: 3/7
---
```

The extension manages `state.md` transitions — the LLM doesn't need to update it manually.

## Commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `/crew`                           | Show current crew status (feature, phase, profile)     |
| `/crew:profile <name>`            | Switch model profile (`quality`, `balanced`, `budget`) |
| `/crew:override <preset> <model>` | Override a specific agent's model                      |
| `/crew:reset`                     | Reset all overrides to profile defaults                |
| `/crew:status`                    | Show detailed status of current feature                |

## Package Structure

```
pi-crew/
├── extensions/pi-crew/
│   ├── index.ts          # Tool registration, commands, hooks, auto-capture
│   ├── phases.ts         # Phase content constants (replaces SKILL.md files)
│   ├── handoff.ts        # Handoff file I/O (.crew/phases/ management)
│   ├── enforcement.ts    # Workflow gate + phase gate logic
│   ├── presets.ts        # Agent preset definitions
│   ├── profiles.ts       # Model profile resolution
│   ├── prompt.ts         # System prompt builders (idle/active modes)
│   ├── spawn.ts          # Pi subprocess spawning + NDJSON parsing
│   ├── state.ts          # .crew/ state management + phase advancement
│   └── rendering.ts      # Inline agent cards (DynamicBorder)
└── references/prompts/   # System prompts for each agent preset
    ├── scout.md
    ├── researcher.md
    ├── architect.md
    ├── executor.md
    ├── reviewer.md
    └── debugger.md
```

## Limitations

- **No streaming**: Agent output is collected and returned at completion, not streamed token-by-token.
- **No cross-agent memory**: Agents in parallel mode don't share context. Use chain mode when agents need prior output.
- **Subprocess overhead**: Each agent spawns a `pi` subprocess. Fast tasks (< 5s) may feel slower than inline execution.
- **Model availability**: Profiles reference Anthropic models. Other providers require manual overrides.

## License

MIT
