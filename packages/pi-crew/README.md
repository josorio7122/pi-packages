# pi-crew

Agentic coding workflow for [pi](https://github.com/mariozechner/pi). Transforms pi into a **coordinator** that dispatches specialized agents — scout, researcher, architect, executor, reviewer, debugger — and tracks all work through `.crew/`.

## Quick Start

```bash
pi install git:github.com/josorio7122/pi-packages
```

Then in any pi session, pi automatically becomes a coordinator. It reads, thinks, and dispatches — it never writes code directly.

## How It Works

Pi-crew makes pi an orchestrator with **3 modes**:

### Mode 1 — Just Answer
Non-codebase questions → answer directly. No dispatch needed.

### Mode 2 — Understand
Codebase questions or research → dispatch scouts/researchers → synthesize results → write findings to `.crew/findings/<topic>.md`.

### Mode 3 — Implement
Code changes → full workflow through `.crew/phases/`:

```
explore → design → build → review → ship
```

| Phase       | What happens                                                                         | Allowed Presets              |
| ----------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| **Explore** | Scouts map codebase structure, patterns, conventions                                 | scout, researcher            |
| **Design**  | Discuss approaches with user, dispatch architect for complex designs, lock decisions | architect, researcher, scout |
| **Plan**    | Break design into task waves with dependencies and verification criteria             | scout, researcher            |
| **Build**   | Execute tasks wave-by-wave with executors; retry failures with debuggers             | executor, debugger, scout    |
| **Review**  | Verification: spec compliance → code quality → security                              | reviewer, scout              |
| **Ship**    | Push branch, open PR/MR with generated description                                   | scout, researcher            |

**Not every task needs every phase.** Choose a workflow when starting:

| Scope    | Workflow                              | When                                  |
| -------- | ------------------------------------- | ------------------------------------- |
| Full     | explore,design,plan,build,review,ship | New features, architectural changes   |
| Standard | explore,plan,build,review,ship        | Clear scope, no design debate needed  |
| Quick    | explore,build,ship                    | Small feature, obvious implementation |
| Minimal  | build,ship                            | Bug fix, config change, documentation |

### Mechanical Enforcement

Pi-crew enforces coordinator behavior mechanically, not through advisory prompts:

1. **`tool_call` hook** — `write` and `edit` are **blocked** outside `.crew/`. The orchestrator can only write to `.crew/` (its workspace). All code changes must go through `dispatch_crew` with executor agents.
2. **Phase-preset validation** — Each phase restricts which presets can be dispatched. Invalid presets are blocked with a descriptive error.
3. **Phase gate** — The extension checks that the previous phase's handoff file exists before allowing advancement.
4. **Universal dispatch log** — Every `dispatch_crew` result is written to `.crew/dispatches/`, regardless of workflow state.
5. **Auto-capture** — When a workflow is active, dispatch output is also written to `.crew/phases/<feature>/<phase>.md`.
6. **Nudge on agent_end** — If the workflow is incomplete, the extension sends a `triggerTurn` message forcing the LLM to continue.

### `.crew/` — The Workspace

`.crew/` is the universal handoff mechanism. Everything flows through it:

```
.crew/
├── config.json              # Profile, agent overrides
├── state.md                 # Active workflow: feature, phase, progress log
├── dispatches/              # Audit log — every dispatch ever (auto-written)
│   ├── 2026-03-01T...-scout.md
│   └── 2026-03-01T...-executor.md
├── findings/                # Mode 2 research — reusable across workflows
│   ├── payment-system.md
│   └── caching-options.md
└── phases/                  # Mode 3 workflow handoffs (auto-captured)
    └── <feature>/
        ├── explore.md
        ├── design.md
        ├── build.md
        └── review.md
```

**`state.md`** uses YAML frontmatter for machine state and a markdown body for progress:

```yaml
---
feature: add-subscriptions
phase: build
workflow: explore,design,build,review,ship
---

## Progress
- explore ✅ → .crew/phases/add-subscriptions/explore.md
- design ✅ → .crew/phases/add-subscriptions/design.md
- build 🔄 wave 2 of 3
```

The orchestrator reads `state.md` at the start of each turn. Before dispatching, it checks `.crew/findings/` and `.crew/phases/` for prior context — research isn't repeated, handoffs aren't lost.

## Agent Presets

| Preset       | Model Tier | Tools                                   | Purpose                                          |
| ------------ | ---------- | --------------------------------------- | ------------------------------------------------ |
| `scout`      | budget     | read, bash, grep, find, ls              | Fast codebase exploration — compressed findings  |
| `researcher` | budget     | read, bash                              | Web/docs research via exa-search skill           |
| `architect`  | quality    | read, bash, grep, find, ls              | Design decisions, component breakdowns, specs    |
| `executor`   | balanced   | read, write, edit, bash, grep, find, ls | Implements tasks. Follows TDD. Commits per task  |
| `reviewer`   | balanced   | read, bash, grep, find, ls              | Code review — spec compliance, quality, security |
| `debugger`   | quality    | read, write, edit, bash, grep, find, ls | Root cause analysis, surgical repair             |

## Dispatch Modes

### Single

```
dispatch_crew({ preset: "scout", task: "Map the authentication module", cwd: "/project" })
```

### Parallel

```
dispatch_crew({
  tasks: [
    { preset: "scout", task: "Map the API layer", cwd: "/project" },
    { preset: "scout", task: "Map the database schema", cwd: "/project" }
  ]
})
```

### Chain

```
dispatch_crew({
  chain: [
    { preset: "scout", task: "Investigate the payment module", cwd: "/project" },
    { preset: "architect", task: "Design a refactor based on: {previous}", cwd: "/project" }
  ]
})
```

## Model Profiles

| Profile                | Budget Tier       | Balanced Tier     | Quality Tier      |
| ---------------------- | ----------------- | ----------------- | ----------------- |
| **quality**            | claude-sonnet-4-6 | claude-sonnet-4-6 | claude-opus-4-6   |
| **balanced** (default) | claude-haiku-4-5  | claude-sonnet-4-6 | claude-sonnet-4-6 |
| **budget**             | claude-haiku-4-5  | claude-haiku-4-5  | claude-sonnet-4-6 |

## Commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `/crew`                           | Show current crew status (feature, phase, profile)     |
| `/crew:profile <name>`            | Switch model profile (`quality`, `balanced`, `budget`) |
| `/crew:override <preset> <model>` | Override a specific agent's model                      |
| `/crew:reset`                     | Clear `.crew/state.md` — start fresh                   |
| `/crew:status`                    | Show detailed status of current feature                |

## Package Structure

```
pi-crew/
├── extensions/pi-crew/
│   ├── index.ts          # Tool registration, tool_call hook, commands, auto-capture
│   ├── tool-blocking.ts  # Write/edit blocking logic (pure function)
│   ├── phases.ts         # Phase metadata (allowed presets, auto-advance)
│   ├── handoff.ts        # .crew/ file I/O (handoffs, findings, dispatch logs)
│   ├── enforcement.ts    # Phase gate + preset validation
│   ├── presets.ts        # Agent preset definitions
│   ├── profiles.ts       # Model profile resolution
│   ├── prompt.ts         # Coordinator system prompt (3 modes, ~150 tokens)
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

## License

MIT
