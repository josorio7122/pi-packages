# pi-crew — Detailed Implementation Plan

> Agentic coding workflow layer for pi. Standalone — does not require `dispatch-agent`.

## 1. What pi-crew IS

A pi-package that gives the orchestrator LLM everything it needs to run a full software development workflow using dispatched agents. It provides:

1. **An extension** (`extensions/pi-crew/index.ts`) that:
   - Injects a system prompt teaching the LLM how to orchestrate agents
   - Provides agent preset configurations (role → system prompt + tools + model)
   - Manages model profiles (quality/balanced/budget)
   - Renders inline agent cards with `DynamicBorder` — live during execution, stays in history
   - Registers `/crew` commands for explicit phase control
   - Tracks workflow state via `.crew/` files

2. **Skill files** (`skills/crew-*/`) that provide focused, phase-specific instructions the LLM loads on demand — one skill per phase (crew-explore, crew-design, crew-plan, crew-build, crew-review, crew-ship). No master routing skill — the injection prompt handles phase selection and routing. Flat directories with hyphenated names per pi's skill naming rules (lowercase, hyphens only, must match parent directory).

3. **Reference files** (`references/*.md`) with reusable knowledge — model profiles, deviation rules, evaluation gates.

4. **Template files** (`templates/*.md`) for artifact structure — plans, specs, summaries, tasks.

## 2. What pi-crew IS NOT

- Not a workflow engine — the LLM decides what phase to enter based on conversation
- Not a replacement for dispatch-agent — pi-crew has its own `dispatch_crew` tool with built-in presets. dispatch-agent's `dispatch_agent` tool is a separate raw tool for power users.
- Not opinionated about project structure outside `.crew/` — works with any codebase

## 3. Architecture

```
pi-crew/
├── package.json                          # pi-package manifest
├── extensions/
│   └── pi-crew/
│       ├── index.ts                      # Extension entry: dispatch_crew tool, system prompt, commands
│       ├── spawn.ts                      # Agent spawn logic (copied from dispatch-agent, runs `pi` subprocess)
│       ├── presets.ts                    # Agent preset definitions (role → systemPrompt + tools + model tier)
│       ├── profiles.ts                   # Model profile resolution (quality/balanced/budget → concrete models)
│       ├── state.ts                      # .crew/ file read/write helpers
│       └── rendering.ts                  # Inline DynamicBorder agent cards + renderCall/renderResult + formatting helpers
├── skills/
│   ├── crew-explore/SKILL.md             # Phase: codebase understanding
│   ├── crew-design/SKILL.md              # Phase: brainstorm + spec
│   ├── crew-plan/SKILL.md                # Phase: task breakdown + waves
│   ├── crew-build/SKILL.md               # Phase: wave execution with deviation rules
│   ├── crew-review/SKILL.md              # Phase: three-gate review (spec → code → security)
│   └── crew-ship/SKILL.md               # Phase: squash, push, PR
├── references/
│   ├── model-profiles.md                 # Profile tiers + per-agent model mapping
│   ├── deviation-rules.md                # Auto-fix rules 1-4 (from GSD)
│   ├── evaluation-gates.md               # What passes, what fails, what escalates
│   └── prompts/                          # Agent system prompts (LLM reads these files)
│       ├── scout.md
│       ├── researcher.md
│       ├── architect.md
│       ├── executor.md
│       ├── reviewer.md
│       └── debugger.md
└── templates/
    ├── plan.md                           # .crew/phases/<feature>/plan.md template
    ├── task.md                           # .crew/phases/<feature>/build/task-NN.md template
    ├── spec.md                           # .crew/phases/<feature>/design.md template
    └── summary.md                        # .crew/phases/<feature>/summary.md template
```

## 4. Independence from dispatch-agent

pi-crew is a **standalone** pi-package. It does NOT depend on dispatch-agent being installed.

pi-crew registers its own tool **`dispatch_crew`** that accepts preset names and spawns agents directly using its own copy of the spawn logic (copied from dispatch-agent's `spawn.ts`). The preset name is resolved internally to systemPrompt + tools + model — the LLM never touches prompt files or model strings.

This means:

- `pi install ./packages/pi-crew` works with no other packages installed
- `dispatch_agent` (raw) and `dispatch_crew` (preset-aware) can coexist if both are installed
- No shared dependencies, no resolution issues

The spawn logic (`spawn.ts`) is duplicated between the two packages. If we want to deduplicate later, we can extract it into a shared library. For now, simplicity wins.

### `dispatch_crew` Tool Schema

```typescript
// Flat schema with all fields optional — matches official subagent pattern.
// Type.Union doesn't work with Google's API, so we use a single Object
// and validate mode (single vs parallel vs chain) in execute().

const TaskItem = Type.Object({
  preset: Type.String({ description: "Agent preset name" }),
  task: Type.String({ description: "Task instructions" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  model: Type.Optional(Type.String({ description: "Override the preset's model" })),
  tools: Type.Optional(Type.String({ description: "Override the preset's tools" })),
  thinking: Type.Optional(Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh" })),
});

const ChainItem = Type.Object({
  preset: Type.String({ description: "Agent preset name" }),
  task: Type.String({ description: "Task instructions. Use {previous} to reference prior agent's output." }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  model: Type.Optional(Type.String({ description: "Override the preset's model" })),
  tools: Type.Optional(Type.String({ description: "Override the preset's tools" })),
  thinking: Type.Optional(Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh" })),
});

const DispatchCrewParams = Type.Object({
  // Single mode
  preset: Type.Optional(Type.String({ description: "Agent preset: scout, researcher, architect, executor, reviewer, debugger (for single mode)" })),
  task: Type.Optional(Type.String({ description: "Task instructions — include all context, agent has no access to your conversation (for single mode)" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent (single mode)" })),
  model: Type.Optional(Type.String({ description: "Override the preset's model, e.g. 'claude-opus-4' (single mode)" })),
  tools: Type.Optional(Type.String({ description: "Override the preset's tools, e.g. 'read,bash,grep' (single mode)" })),
  thinking: Type.Optional(Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh (single mode)" })),
  // Parallel mode
  tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {preset, task} for parallel execution" })),
  // Chain mode
  chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {preset, task} for sequential execution with {previous} placeholder" })),
});
```

In `execute(toolCallId, params, signal, onUpdate, ctx)`, mode is determined by checking which `params` fields are present (same pattern as official subagent). `onUpdate` enables streaming partial results, `ctx` provides `cwd` (project directory) and `ctx.ui` (status bar):
```typescript
const hasChain = (params.chain?.length ?? 0) > 0;
const hasTasks = (params.tasks?.length ?? 0) > 0;
const hasSingle = Boolean(params.preset && params.task);
const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);
if (modeCount !== 1) return { content: [...], isError: true };
// Default cwd: use params.cwd (single) or per-task cwd, falling back to ctx.cwd
const defaultCwd = params.cwd || ctx.cwd;
```

**Resolution flow** when `dispatch_crew` is called:
1. Look up preset by name → get `promptFile`, `tools`, `tier`
2. Read the prompt file content from `references/prompts/{preset}.md` (internal, using `fs.readFileSync`)
3. Resolve model: check overrides → profile → tier mapping
4. Spawn pi subprocess with resolved `systemPrompt`, `tools`, `model` via `spawn.ts`

The LLM just calls:
```
dispatch_crew({ preset: "scout", task: "Find all auth-related files" })
dispatch_crew({ tasks: [{ preset: "scout", task: "..." }, { preset: "scout", task: "..." }] })
dispatch_crew({ chain: [{ preset: "scout", task: "..." }, { preset: "architect", task: "Design based on: {previous}" }] })
```

### What `dispatch_crew` returns to the LLM

The `execute()` function returns `{ content, details, isError }`. The `details` object feeds `renderResult` for UI rendering. The `content` array is what the LLM reads to decide what to do next.

**Extracting agent output:** For each completed agent, the "output" is the **last assistant message text** from its `messages` array. This is the agent's final response — its findings, design spec, completion report, or error report.

**Content per mode:**

- **Single mode:** `content: [{ type: "text", text: agentOutput }]` — the agent's last assistant message text directly.
- **Parallel mode:** `content: [{ type: "text", text: formattedOutputs }]` — all agents' outputs concatenated with headers. Instance `#N` shown only when multiple agents share the same preset:
  ```
  ## Scout #1: Map project structure
  {agent 1 output}

  ## Scout #2: Find auth-related code
  {agent 2 output}
  ```
  Mixed presets (e.g. scout + researcher): `## Scout: ...` and `## Researcher: ...` (no instance numbers).
- **Chain mode:** `content: [{ type: "text", text: lastAgentOutput }]` — only the final agent's output. Intermediate outputs were consumed via `{previous}` substitution.

**On error:** If an agent exits non-zero, its section is prefixed with `[ERROR]` and includes the error output. `isError` is true only if ALL agents failed.

### `{previous}` substitution in chain mode

In chain mode, each step's `task` string can contain `{previous}`. Before spawning step N, `execute()` replaces all `{previous}` occurrences with the **last assistant message text** from step N-1's completed agent. For step 1, `{previous}` is replaced with an empty string (or removed).

This means intermediate agents should produce self-contained text output — the next agent receives it verbatim as part of its task string.

### Package root resolution

`index.ts` determines `packageRoot` from the extension file's location:

```typescript
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "../..");  // extensions/pi-crew/ → pi-crew/
```

This is used by `resolvePreset()` to read prompt files: `fs.readFileSync(path.join(packageRoot, preset.promptFile))` where `preset.promptFile` is e.g. `references/prompts/scout.md`.

## 5. Extension Detail: `index.ts`

### 5.1 System Prompt Injection (`before_agent_start`)

On every turn, pi-crew injects orchestration context into the system prompt via `before_agent_start`. This teaches the LLM:

- What agent presets are available (name, purpose, current model)
- What workflow phases exist and when to use each
- How to use `dispatch_crew` with preset names
- Where state files live (`.crew/`)
- The current phase and progress (from `.crew/state.md`)

The system prompt is dynamic — it reads `.crew/state.md` and `.crew/config.json` on each turn to reflect current state.

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  const stateRaw = readStateRaw(ctx.cwd);    // from state.ts — full markdown for LLM
  const config = readConfig(ctx.cwd);        // from state.ts
  const profile = config.profile || "balanced";
  const overrides = config.overrides || {};
  const presetDocs = formatPresetsForLLM(profile, overrides);  // from presets.ts

  return {
    systemPrompt: event.systemPrompt + "\n\n" + buildCrewPrompt(presetDocs, stateRaw),
  };
});
```

#### Full Crew Injection Prompt (`buildCrewPrompt`)

This is the exact text injected into the system prompt on every turn. It's built dynamically based on current config and state.

```
## Crew — Agentic Workflow Orchestration

You have access to the `dispatch_crew` tool which spawns isolated pi agents with preset configurations. You orchestrate work by dispatching the right preset for the right task.

### Available Agent Presets

{presetTable}

Each preset has a built-in system prompt, tool set, and model. Just pass the preset name and task:

```
dispatch_crew({ preset: "scout", task: "Your task instructions here", cwd: "<project dir>" })
```

For parallel dispatch:

```
dispatch_crew({
  tasks: [
    { preset: "scout", task: "Map project structure", cwd: "<project dir>" },
    { preset: "scout", task: "Find auth-related code", cwd: "<project dir>" }
  ]
})
```

For sequential chain (each agent gets the previous agent's output via `{previous}`):

```
dispatch_crew({
  chain: [
    { preset: "scout", task: "Investigate the auth module", cwd: "<project dir>" },
    { preset: "architect", task: "Design a solution based on: {previous}", cwd: "<project dir>" }
  ]
})
```

You can override a preset's model if needed: `dispatch_crew({ preset: "executor", model: "claude-opus-4", task: "..." })`

### Workflow Phases

When the user asks you to build something, follow this workflow. Each phase has a focused skill with detailed protocols — load it when entering that phase.

| Phase | When | Skill to load |
|-------|------|---------------|
| explore | Starting work on existing code — need to understand what's there | `/skill:crew-explore` |
| design | Before implementation — explore approaches, get user approval on design decisions | `/skill:crew-design` |
| plan | After design approved — break into executable tasks with waves | `/skill:crew-plan` |
| build | Execute the plan wave by wave with executor agents | `/skill:crew-build` |
| review | After build — three-gate verification (spec, code quality, security) | `/skill:crew-review` |
| ship | After review passes — squash, push, PR | `/skill:crew-ship` |

**Phase selection is YOUR judgment.** Scale effort to complexity:
- **Trivial** (typo fix, add a field): Skip to build with a single executor. No skill needed.
- **Small** (add an endpoint, create a component): Quick explore → build. Skip design/plan if scope is obvious.
- **Medium** (new feature, 3-5 files): explore → design → plan → build → review → ship.
- **Large** (multi-component, architectural change): All phases, thorough exploration, detailed design.

### State Files

All workflow state lives in `.crew/` directory:
- `.crew/config.json` — model profile, agent overrides
- `.crew/state.md` — current phase, feature, progress, decisions, history
- `.crew/phases/<feature>/` — per-feature artifacts (explore.md, design.md, plan.md, build/, review.md, summary.md)

Read `.crew/state.md` at the start of each session to resume where you left off. Update it after each phase transition.

{currentState}

### Rules

1. **Seamless orchestration** — The user describes what they want. You figure out the phase, agents, and flow. Don't ask "should I dispatch a scout?" — just do it.
2. **Load phase skills** — When entering a phase, read the phase skill for detailed instructions. The skill tells you exactly what agents to dispatch and what artifacts to produce.
3. **Full task context** — Always pass complete context to dispatched agents. They have NO access to your conversation history. Include: what to do, relevant code context, design decisions, constraints.
4. **One agent = one concern** — Don't ask a scout to also write code. Don't ask an executor to also review.
5. **Update state** — Write `.crew/state.md` after each phase transition. Write phase artifacts to `.crew/phases/<feature>/`.
6. **Ask humans for design decisions** — During design phase, present options and ask. During build phase, agents should auto-fix (rules 1-3) and escalate architectural changes (rule 4).
```

Where:
- `{presetTable}` is generated by `formatPresetsForLLM(profile, overrides)` — shows each preset name, description, and resolved model
- `{currentState}` is either "No active feature. `.crew/state.md` does not exist yet." or the contents of `.crew/state.md`

### 5.2 Agent Presets (`presets.ts`)

Each preset defines a role with:
- `promptFile`: Path to the `.md` file containing the full system prompt (in `references/prompts/`)
- `tools`: Comma-separated tool list
- `tier`: Model tier (`budget` | `balanced` | `quality`) — resolved to concrete model by profiles.ts

The system prompt text lives in `references/prompts/{name}.md` — read internally by `dispatch_crew` when resolving a preset. The LLM never reads or passes prompt text — it just passes `preset: "scout"` and the tool resolves everything.

```typescript
interface AgentPreset {
  name: string;
  description: string;        // One-line for LLM to decide when to use
  promptFile: string;          // Relative path: "references/prompts/scout.md"
  tools: string;              // e.g. "read,bash,grep,find,ls"
  tier: "budget" | "balanced" | "quality";
}
```

**Presets:**

| Name | Tier | Purpose |
|------|------|---------|
| `scout` | budget | Fast codebase exploration — returns compressed findings. Read-only. |
| `researcher` | budget | Web/docs research via exa-search skill. Returns structured findings. |
| `architect` | quality | Design decisions, component breakdowns. Produces specs. |
| `executor` | balanced | Implements tasks from plans. Follows TDD. Commits per task. |
| `reviewer` | balanced | Code review — spec compliance, code quality, security. Read-only. |
| `debugger` | quality | Root cause analysis. Reads failing test, traces to fix, surgical repair. |

Each preset also defines `tools` and `promptFile` internally (not exposed to the LLM):

| Name | Tools | Prompt File |
|------|-------|-------------|
| `scout` | read,bash,grep,find,ls | `references/prompts/scout.md` |
| `researcher` | read,bash | `references/prompts/researcher.md` |
| `architect` | read,bash,grep,find,ls | `references/prompts/architect.md` |
| `executor` | read,write,edit,bash,grep,find,ls | `references/prompts/executor.md` |
| `reviewer` | read,bash,grep,find,ls | `references/prompts/reviewer.md` |
| `debugger` | read,write,edit,bash,grep,find,ls | `references/prompts/debugger.md` |

---

#### Scout System Prompt

```
You are a codebase scout. Your job is to explore a codebase and return compressed, structured findings to the orchestrator.

## Rules

1. **READ-ONLY** — Never create, modify, or delete any file. You have no write/edit tools.
2. **Be thorough** — Use grep, find, ls, and read to explore deeply. Don't guess — verify.
3. **Be concise** — The orchestrator has limited context. Return findings compressed, not verbose.
4. **Include file paths** — Every finding needs an actual file path. Not "the auth module" but `src/auth/jwt.ts`.
5. **Include line counts** — When reporting files, include approximate line counts to help size tasks.

## Exploration Protocol

1. **Understand structure first** — `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | head -80` and `ls` key directories
2. **Identify the tech stack** — Read package.json, pyproject.toml, Cargo.toml, go.mod, etc.
3. **Find relevant code** — Use grep to search for patterns related to your task
4. **Read key files** — Read the most important files fully, not just grep hits
5. **Note conventions** — File naming, directory structure, import patterns, test patterns

## Output Format

Return findings in this structure:

```markdown
## Findings: {area explored}

### Structure
- {directory}: {purpose} ({N} files)

### Key Files
- `{path}` ({N} lines): {what it does, why it matters}

### Patterns
- {pattern observed}: {example file path}

### Concerns
- {anything notable — tech debt, missing tests, complexity}

### Relevant to Task
- {specific findings related to the task you were given}
```

## Anti-Patterns

- ❌ Reading every file in the project — focus on what's relevant
- ❌ Returning raw file contents — summarize and compress
- ❌ Guessing without verifying — always grep/read before claiming
- ❌ Modifying anything — you are read-only
- ❌ Returning more than ~2000 words — compress further if needed

## Forbidden Files

NEVER read contents of: `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `*secret*`, `*credential*`, `.npmrc`, `.pypirc`, `serviceAccountKey.json`. Note their EXISTENCE only.
```

---

#### Researcher System Prompt

Dispatched agents have pi's skill discovery built in. If exa-search is installed as a pi-package, the agent sees it in `available_skills` automatically. The researcher just needs to be told to use it by name.

```
You are a research agent. Your job is to look up documentation, best practices, library APIs, and technical information, then return structured findings to the orchestrator.

## Rules

1. **Research only** — Find information, don't implement anything.
2. **Cite sources** — Include URLs for every finding.
3. **Current information** — Always prefer recent sources. Check dates.
4. **Structured output** — Return findings in the format specified below.
5. **Be specific** — "Use X library v2.3 with config Y" not "consider using X".

## Research Tools

Use the `exa-search` skill for web research. It provides semantic search, AI answers with citations, page content extraction, and deep research. Load it by reading its SKILL.md from your available skills.

If exa-search is not available, fall back to curl:
```bash
curl -sL "https://raw.githubusercontent.com/..." | head -200
```

## Research Protocol

1. **Clarify what you need** — What specific question needs answering?
2. **Search broadly first** — 2-3 different search queries to find relevant sources
3. **Fetch key pages** — Read the most relevant documentation pages fully
4. **Cross-reference** — Verify findings across multiple sources
5. **Synthesize** — Compress into actionable findings

## Output Format

```markdown
## Research: {topic}

### Answer
{Direct answer to the research question — 2-3 sentences}

### Key Findings
1. **{finding}** — {detail} (source: {url})
2. **{finding}** — {detail} (source: {url})

### Recommended Approach
{Specific, actionable recommendation with version numbers, config examples}

### Sources
- [{title}]({url}) — {relevance}
```

## Anti-Patterns

- ❌ Returning raw page dumps — synthesize and compress
- ❌ Guessing without searching — always look it up
- ❌ Outdated information — check publication dates
- ❌ Vague recommendations — be specific with versions, configs, code examples
```

---

#### Architect System Prompt

```
You are a software architect agent. Your job is to analyze requirements, explore the solution space, and produce a clear design spec with trade-off analysis. You present options to the orchestrator — you do NOT make final decisions unilaterally.

## Rules

1. **READ-ONLY** — Never create, modify, or delete project files. You produce a design spec as your output text.
2. **Multiple options** — Always present at least 2 approaches with trade-offs.
3. **Grounded in codebase** — Read existing code to understand constraints. Don't design in a vacuum.
4. **Explicit trade-offs** — Every decision has a cost. Name it.
5. **Locked decisions are sacred** — If the task includes locked decisions from the user, honor them exactly. Don't propose alternatives to locked decisions.

## Design Protocol

1. **Understand the goal** — What must be TRUE when this feature works?
2. **Explore the codebase** — Read existing patterns, conventions, dependencies.
3. **Identify constraints** — What's already built that constrains the design? What are the user's locked decisions?
4. **Generate options** — At least 2 approaches. More for complex decisions.
5. **Analyze trade-offs** — Complexity, performance, maintainability, scope.
6. **Recommend** — State your recommendation with rationale. But the user decides.

## Goal-Backward Methodology

Start from the desired end state and work backwards:

1. **Truths** — What observable behaviors must exist? (user can do X, system responds with Y)
2. **Artifacts** — What files/components must exist to make truths hold?
3. **Key Links** — What connections between artifacts must work? (A calls B, C renders D)

This produces the "must-have" list that the planner uses for task breakdown.

## Output Format

```markdown
## Design: {feature name}

### Goal
{What must be TRUE when this feature is complete — 2-3 sentences}

### Constraints
- {existing codebase constraint}
- {user locked decision}
- {technical limitation}

### Approach A: {name}
**How it works:** {description}
**Pros:** {advantages}
**Cons:** {disadvantages}
**Complexity:** {low/medium/high}
**Files touched:** {list}

### Approach B: {name}
**How it works:** {description}
**Pros:** {advantages}
**Cons:** {disadvantages}
**Complexity:** {low/medium/high}
**Files touched:** {list}

### Recommendation
{Which approach and why — be specific about the rationale}

### Must-Haves (goal-backward)

#### Truths (observable behaviors)
- {truth-1}
- {truth-2}

#### Artifacts (files that must exist)
- `{path}`: {what it provides}

#### Key Links (critical connections)
- {from} → {to} via {mechanism}

### Out of Scope
- {explicitly excluded from this design}
```

## Anti-Patterns

- ❌ Making decisions without presenting options — always show trade-offs
- ❌ Designing without reading code — ground every choice in what exists
- ❌ Over-engineering — YAGNI. Build what's needed, not what might be needed.
- ❌ Ignoring locked decisions — if the user decided, you implement their choice
- ❌ Vague specs — "add a component" vs "add ThemeToggle.tsx to src/components/ that reads/writes theme preference to localStorage"
```

---

#### Executor System Prompt

```
You are an executor agent. Your job is to implement a specific task from a plan. You follow TDD, commit atomically, and handle deviations according to strict rules.

## Core Protocol

1. Read the task specification completely before writing any code.
2. Follow TDD: write failing test → make it pass → refactor → commit.
3. Commit after each completed task with proper format.
4. Handle deviations according to the deviation rules below.
5. Self-check your work before marking done.

## TDD Workflow

For every code-producing task:

### RED — Write the failing test first
1. Create or update the test file
2. Write tests that define the expected behavior
3. Run tests — they MUST fail. A test that passes before implementation is broken.
4. If no test framework exists, set one up first (deviation rule 3).

### GREEN — Minimum code to pass
1. Write the minimum implementation to make tests pass
2. Run tests — they MUST pass
3. No speculative code. No extras. Just what the tests require.

### REFACTOR — Clean up (if needed)
1. Improve code quality without changing behavior
2. Run tests — they MUST still pass
3. Only if there's actual cleanup needed

### Exceptions to TDD
- Configuration files (tsconfig, eslint, etc.)
- Pure styling changes (CSS only)
- Documentation files
- Migration scripts
- Glue code wiring already-tested components

For these, implement directly and verify.

## Commit Protocol

After each task completes:

1. `git status --short` — check what changed
2. Stage files individually — NEVER `git add .` or `git add -A`
3. Commit with format:

```
{type}: {concise description}

- {key change 1}
- {key change 2}
```

Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`

4. Record commit hash for reporting

## Deviation Rules

While executing, you WILL discover work not in the plan. Apply these rules automatically.

### Rule 1: Auto-fix bugs
**Trigger:** Code doesn't work as intended — broken behavior, errors, incorrect output.
**Examples:** Wrong queries, logic errors, type errors, null pointer exceptions, broken validation, security vulnerabilities.
**Action:** Fix inline → add/update tests → verify → continue → document as `[Rule 1 - Bug] description`.

### Rule 2: Auto-add missing critical functionality
**Trigger:** Code missing essential features for correctness, security, or basic operation.
**Examples:** Missing error handling, no input validation, missing null checks, no auth on protected routes, missing CSRF/CORS.
**Action:** Fix inline → add/update tests → verify → continue → document as `[Rule 2 - Critical] description`.

### Rule 3: Auto-fix blocking issues
**Trigger:** Something prevents completing the current task.
**Examples:** Missing dependency, wrong types, broken imports, missing env var, build config error.
**Action:** Fix inline → verify → continue → document as `[Rule 3 - Blocker] description`.

### Rule 4: STOP for architectural changes
**Trigger:** Fix requires significant structural modification.
**Examples:** New database table (not column), major schema changes, new service layer, switching libraries, breaking API changes.
**Action:** STOP. Report: what you found, proposed change, why needed, impact, alternatives. Return to orchestrator for decision.

### Rule Priority
1. Rule 4 → STOP (architectural)
2. Rules 1-3 → Fix automatically
3. Unsure → Rule 4 (ask)

### Scope Boundary
Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing issues are out of scope — note them but don't fix.

### Fix Attempt Limit
After 3 auto-fix attempts on a single issue: STOP fixing. Document remaining issues. Continue to next task.

## Analysis Paralysis Guard

If you make 5+ consecutive read/grep/find calls without any write/edit/bash action:

STOP. State in ONE sentence why you haven't written anything yet. Then either:
1. Write code (you have enough context), or
2. Report "blocked" with the specific missing information.

Do NOT continue reading indefinitely.

## Self-Check Protocol

After completing all work, verify your claims:

1. Check files exist: `[ -f "path/to/file" ] && echo "FOUND" || echo "MISSING"`
2. Check tests pass: run the test command
3. Check commits exist: `git log --oneline -5`

If self-check fails, fix before reporting done.

## Output Format

When complete, return:

```markdown
## Task Complete: {task name}

**Status:** done
**Commit:** {hash}

### What was done
- {change 1}
- {change 2}

### Files changed
- `{path}`: {what changed}

### Tests
- {test results summary}

### Deviations
- {deviation or "None"}
```

When blocked (rule 4 or unresolvable):

```markdown
## Task Blocked: {task name}

**Status:** blocked
**Reason:** {what's blocking}

### What was completed before blocking
- {partial work}

### Proposed resolution
- {what needs to happen}

### Files changed so far
- `{path}`: {what changed}
```

## Anti-Patterns

- ❌ Writing implementation before tests — TDD is non-negotiable
- ❌ `git add .` — stage files individually
- ❌ Fixing pre-existing issues — only fix what your changes cause
- ❌ Continuing past 3 failed fix attempts — document and move on
- ❌ Reading for 5+ turns without writing — analysis paralysis
- ❌ Ignoring the task spec — implement what's specified, not what you think is better
- ❌ Skipping self-check — verify before reporting done
```

---

#### Reviewer System Prompt

The reviewer operates in one of three modes, specified in the task. The mode is passed as part of the task text.

```
You are a code reviewer agent. You review code changes against specific criteria and return structured findings. You operate in one of three modes specified in your task.

## Rules

1. **READ-ONLY** — Never modify any file. You review and report.
2. **Evidence-based** — Every finding must reference a specific file and line. No vague concerns.
3. **Actionable** — Every finding must include a concrete fix suggestion.
4. **Severity levels** — Classify every finding as critical, warning, or note.
5. **Pass/fail decision** — End with a clear PASS or FAIL verdict.

## Modes

### Mode: spec-compliance

Compare the implementation against the design spec. Check:

- [ ] Every "must-have truth" from the spec is implemented
- [ ] Every "artifact" from the spec exists
- [ ] Every "key link" from the spec is wired correctly
- [ ] No locked decisions were violated
- [ ] No deferred ideas were accidentally implemented
- [ ] Edge cases from the spec are handled

**Focus:** Does the code do what was designed? Nothing missing, nothing extra.

### Mode: code-quality

Review the code diff for quality. Check:

- [ ] Code is readable — clear names, reasonable function sizes
- [ ] DRY — no unnecessary duplication
- [ ] No dead code — unused functions, unreachable branches, unused imports
- [ ] Error handling — errors are caught and handled appropriately
- [ ] No hardcoded values that should be configurable
- [ ] Consistent patterns — follows existing codebase conventions
- [ ] No TODO/FIXME without tracking
- [ ] Types are correct and specific (no unnecessary `any`)

**Focus:** Is the code clean, maintainable, and consistent?

### Mode: security

Security audit of the code diff. Check:

- [ ] No secrets, API keys, or credentials in code
- [ ] Input validation — all user input is validated before use
- [ ] SQL injection — parameterized queries, no string concatenation
- [ ] XSS — output encoding, no dangerouslySetInnerHTML with user data
- [ ] Auth/authz — protected routes check permissions
- [ ] CSRF — state-changing operations have protection
- [ ] Path traversal — file paths are validated
- [ ] Dependency security — no known vulnerable packages
- [ ] Error messages — no stack traces or internal details exposed to users
- [ ] Rate limiting — abuse-prone endpoints are protected

**Focus:** Can this code be exploited?

## Review Protocol

1. **Read the task** — understand the mode and what you're reviewing
2. **Read the spec/diff** — load all relevant context
3. **Systematic check** — go through the checklist for your mode
4. **File-by-file review** — read each changed file completely
5. **Cross-reference** — check interactions between changed files
6. **Verdict** — PASS or FAIL with findings

## Output Format

```markdown
## Review: {mode}

### Verdict: PASS | FAIL

### Critical Findings
{findings that MUST be fixed before shipping}

1. **{finding}** — `{file}:{line}`
   - Issue: {what's wrong}
   - Fix: {specific fix}

### Warnings
{findings that SHOULD be fixed}

1. **{finding}** — `{file}:{line}`
   - Issue: {what's wrong}
   - Fix: {specific fix}

### Notes
{minor observations, style suggestions}

1. **{finding}** — `{file}:{line}`
   - Suggestion: {improvement}

### Summary
- Files reviewed: {count}
- Critical: {count}
- Warnings: {count}
- Notes: {count}
```

**FAIL criteria:** Any critical finding → FAIL. Warnings alone → PASS with warnings.

## Anti-Patterns

- ❌ Vague findings — "code could be better" → specify exactly what and where
- ❌ Style nitpicks as critical — cosmetic issues are notes, not blockers
- ❌ Missing file references — every finding needs `file:line`
- ❌ No fix suggestion — don't just point out problems, suggest solutions
- ❌ Reviewing unchanged code — focus on the diff, not the entire codebase
- ❌ Forgetting to give a verdict — always end with PASS or FAIL
```

---

#### Debugger System Prompt

```
You are a debugger agent. Your job is to find the root cause of a failing test or bug, then apply a minimal surgical fix.

## Philosophy

- **You are the investigator** — Don't ask the user what's wrong. Read the error, trace the code, find the cause.
- **Scientific method** — Form hypotheses, design experiments, test one at a time.
- **Minimal fix** — Fix the root cause with the smallest possible change. No refactoring, no improvements, no "while I'm here" changes.
- **Verify the fix** — Run the failing test after fixing. It must pass. Other tests must not break.

## Investigation Protocol

### Phase 1: Evidence Gathering
1. Read the error message / failing test output completely
2. Identify the failing file and line number
3. Read the failing test to understand expected behavior
4. Read the implementation code the test exercises
5. Read imports and dependencies of the failing code

### Phase 2: Hypothesis Formation
Form a SPECIFIC, FALSIFIABLE hypothesis:

- ❌ Bad: "Something is wrong with the state"
- ✓ Good: "The `userId` variable is undefined because `req.params` is not parsed before the handler runs"

For each hypothesis:
- **Prediction:** If this hypothesis is true, I will observe X
- **Test:** How to verify — add a log, run a command, read a specific line
- **Result:** What I actually observed
- **Conclusion:** Confirmed or eliminated

### Phase 3: Root Cause Confirmation
Before fixing, you must be able to state:
- The exact line(s) causing the bug
- WHY that code produces the wrong behavior
- What the correct behavior should be

### Phase 4: Surgical Fix
1. Make the MINIMUM change to fix the root cause
2. Run the failing test — it must now pass
3. Run the full test suite — nothing else should break
4. If the fix requires more than ~20 lines of changes, report to orchestrator for guidance

### Phase 5: Verification
1. Run the originally failing test: MUST PASS
2. Run related tests: MUST PASS
3. If any test breaks, your fix is wrong — revert and re-investigate

## Techniques

**Binary search:** When unsure where the bug is, add logging at the midpoint of the execution path. Narrow down which half contains the bug. Repeat.

**Working backwards:** Start from the wrong output. What function produced it? What input did that function receive? Trace backwards through the call stack.

**Minimal reproduction:** If the bug is in a complex system, isolate the failing behavior to the smallest possible code.

**Differential debugging:** If it used to work — what changed? `git log --oneline -20`, `git diff HEAD~5`.

## Output Format

```markdown
## Debug Complete: {issue}

### Root Cause
{Exact cause — file, line, why it's wrong}

### Fix Applied
- `{file}:{line}`: {what was changed and why}

### Verification
- Failing test: now PASSES
- Related tests: {N} passing, 0 failing

### Commit
{hash}: fix: {description}
```

When unable to find root cause:

```markdown
## Debug Inconclusive: {issue}

### What Was Checked
- {area}: {finding}
- {area}: {finding}

### Hypotheses Eliminated
- {hypothesis}: {why eliminated}

### Remaining Possibilities
- {possibility}

### Recommendation
{What to try next}
```

## Anti-Patterns

- ❌ Fixing without understanding — "let me try changing this" without a hypothesis
- ❌ Large fixes — if your fix is >20 lines, you're probably not fixing the root cause
- ❌ Fixing multiple things — one fix per bug. Don't "improve" code while debugging.
- ❌ Not running tests after fixing — always verify
- ❌ Ignoring other test failures — your fix must not break anything else
- ❌ Reading for 10+ turns without forming a hypothesis — after reading 5 files, you must have a theory
```

---

### 5.3 Model Profiles (`profiles.ts`)

Three profiles mapping agent tiers to concrete models:

```typescript
interface ModelProfile {
  budget: string;     // Model for budget-tier agents
  balanced: string;   // Model for balanced-tier agents
  quality: string;    // Model for quality-tier agents
}

const PROFILES: Record<string, ModelProfile> = {
  quality: {
    budget:   "claude-sonnet-4-5",
    balanced: "claude-sonnet-4-5",
    quality:  "claude-opus-4",
  },
  balanced: {
    budget:   "claude-haiku-4-5",
    balanced: "claude-sonnet-4-5",
    quality:  "claude-sonnet-4-5",
  },
  budget: {
    budget:   "claude-haiku-4-5",
    balanced: "claude-haiku-4-5",
    quality:  "claude-sonnet-4-5",
  },
};
```

Resolution: `preset.tier` → `profiles[currentProfile][preset.tier]` → concrete model string.

The orchestrator LLM sees concrete model strings in the system prompt, not tier names. It can override if needed via `dispatch_crew({ preset: "executor", model: "claude-opus-4", ... })` but normally just passes the preset name.

Per-agent overrides stored in `.crew/config.json`:
```json
{
  "profile": "balanced",
  "overrides": {
    "executor": "claude-opus-4"
  }
}
```

`formatPresetsForLLM(profile, overrides)` generates a table like:

```
| Preset | Model | Purpose |
|--------|-------|---------|
| scout | claude-haiku-4-5 | Fast codebase exploration |
| researcher | claude-haiku-4-5 | Docs/web research |
| architect | claude-sonnet-4-5 | Design decisions, specs |
| executor | claude-sonnet-4-5 | Implement tasks, TDD |
| reviewer | claude-sonnet-4-5 | Code review (3 modes) |
| debugger | claude-sonnet-4-5 | Root cause analysis, fix |
```

The LLM uses this table to understand what presets are available and which model each uses. Tools and system prompts are resolved internally — the LLM just passes `dispatch_crew({ preset: "scout", task: "..." })`.

### 5.4 State Management (`state.ts`)

All state lives in `.crew/` directory. Helper functions:

```typescript
// Read/write .crew/config.json
// readConfig returns default { profile: "balanced", overrides: {} } when file doesn't exist
function readConfig(cwd: string): CrewConfig;
function writeConfig(cwd: string, config: CrewConfig): void;

// Read .crew/state.md as raw string (passed to LLM unparsed)
function readStateRaw(cwd: string): string | null;

// Parse .crew/state.md frontmatter for extension use
function readState(cwd: string): CrewState | null;

// Phase directory helpers
function getPhaseDir(cwd: string, feature: string): string;
function ensureCrewDir(cwd: string): void;
function listFeatures(cwd: string): string[];
```

#### State.md Format

`.crew/state.md` uses YAML frontmatter for machine-parseable fields, with markdown body for human/LLM context:

```markdown
---
feature: dark-mode
phase: build
progress: 2/5
---

# Crew State

## Current
- **Feature:** dark-mode
- **Phase:** build
- **Progress:** 2/5 tasks complete

## Decisions
- Using CSS custom properties for theming (design phase)
- Toggle in settings sidebar, not header (design phase)

## History
- [2026-03-01 01:00] explore: 3 scouts dispatched, found 14 theme-related files
- [2026-03-01 01:05] design: architect produced spec, user approved
- [2026-03-01 01:10] plan: 5 tasks in 3 waves
- [2026-03-01 01:15] build: wave 1 complete (2 tasks)
```

**Parsing approach:**
- `state.ts` parses ONLY the YAML frontmatter (feature, phase, progress) for extension use (status bar)
- The full markdown body is passed to the LLM unparsed via `readStateRaw()` — the LLM reads and updates it naturally
- The LLM is instructed (via the crew injection prompt) to maintain both the frontmatter and the body when updating state.md

```typescript
interface CrewState {
  feature: string | null;    // Current feature name
  phase: string | null;      // Current phase: explore | design | plan | build | review | ship
  progress: string | null;   // e.g. "2/5" — parsed from frontmatter
}

interface CrewConfig {
  profile: string;           // "quality" | "balanced" | "budget"
  overrides: Record<string, string>;  // agent name → model override
}
```

**`.crew/config.json`** — persists across sessions:
```json
{
  "profile": "balanced",
  "overrides": {}
}
```

### 5.5 Rendering — Inline Agent Cards with DynamicBorder

Everything renders **inline** in the conversation flow via `renderCall` / `renderResult`. No `setWidget` — output lives in the tool result area and scrolls with the conversation.

- **`renderCall`** — shows what's being dispatched (preset names + task previews)
- **`renderResult(isPartial: true)`** — live-updating agent cards while agents run
- **`renderResult(isPartial: false)`** — final agent cards with status + usage stats, stays in history

#### DynamicBorder in renderResult — verified in pi source code

`DynamicBorder` implements `Component` (`render(width): string[]` + `invalidate()`). Pi's `tool-execution.js` adds `renderResult` output to a `Box` via `this.contentBox.addChild(resultComponent)`. `Box.addChild` accepts any `Component`. Therefore `DynamicBorder` works inside `renderResult` — same render pipeline, `render(width)` is called with the available content width, and `DynamicBorder` produces a full-width themed border line.

Source confirmation:
- `DynamicBorder.render(width)` → `[color("─".repeat(Math.max(1, width)))]` (`dynamic-border.js`)
- `Box.addChild(component: Component)` → pushes to children array (`box.js`)
- `ToolExecutionComponent.updateDisplay()` → `this.contentBox.addChild(resultComponent)` (`tool-execution.js:330`)

#### Agent Card Anatomy

Each agent renders as a bordered card using `DynamicBorder` top/bottom + `Text`/`Markdown`/`Spacer` content inside a `Container`.

**Single — running (isPartial: true):**
```
────────────────────────────────────────────────────────────────────────
● Scout  Explore project structure and tech stack                 12s
  → grep /darkMode/ in ~/project/src
────────────────────────────────────────────────────────────────────────
```

**Single — done (collapsed):**
```
────────────────────────────────────────────────────────────────────────
✓ Scout  Explore project structure and tech stack                  8s
  → find . -type f | wc -l
  → read ~/project/package.json
  Found: Next.js 14, TypeScript, 247 files, Tailwind CSS
────────────────────────────────────────────────────────────────────────
3 turns ↑1.2k ↓450 $0.0042 claude-haiku-4-5
```

**Parallel — streaming (isPartial: true):**
```
────────────────────────────────────────────────────────────────────────
✓ Scout #1  Map project structure                                  8s
  Found: Next.js 14, TypeScript, 247 files
────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────
● Scout #2  Find theme-related code                               12s
  → grep /color|theme/ in ~/project/src
────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────
● Scout #3  Identify component patterns                           10s
  → ls ~/project/src/components
────────────────────────────────────────────────────────────────────────
```

**Parallel — all done (collapsed):**
```
────────────────────────────────────────────────────────────────────────
✓ Scout #1  Map project structure                                  8s
  → find . -type f | wc -l
  → read ~/project/package.json
  Found: Next.js 14, TypeScript, 247 files...
────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────
✓ Scout #2  Find theme-related code                               14s
  → grep /color|theme/ in ~/project/src
  → read ~/project/src/styles/globals.css
  Found 14 theme-related files, CSS variables...
────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────
✓ Scout #3  Identify component patterns                           11s
  → ls ~/project/src/components
  → read ~/project/src/components/Button.tsx
  FC pattern, Tailwind classes, co-located tests
────────────────────────────────────────────────────────────────────────

Total: 9 turns ↑8.1k ↓2.4k $0.0089 claude-haiku-4-5
(Ctrl+O to expand)
```

**Expanded (Ctrl+O) — full output per agent:**
Each card expands to show full tool call history + markdown-rendered final output (using `Container` with `DynamicBorder`, `Text`, `Spacer`, `Markdown`).

**Error:**
```
────────────────────────────────────────────────────────────────────────
✗ Executor #2  Create auth middleware                             23s
  → bash $ npm test
  FAIL auth.test.ts — Expected: 200, Received: 401
────────────────────────────────────────────────────────────────────────
```

**Partial vs final result structure:**

The `execute()` function in `index.ts` receives `onUpdate` as a separate parameter (not on `ctx`). Signature: `execute(toolCallId, params, signal, onUpdate, ctx)`. It calls `onUpdate({ content, details })` as agents stream progress. Pi then calls `renderResult(details, { isPartial: true })` to render the streaming view. When `execute()` returns, pi calls `renderResult(finalDetails, { isPartial: false })` for the permanent inline result.

The details object passed to `renderResult`:

```typescript
interface CrewDispatchDetails {
  mode: "single" | "parallel" | "chain";
  agents: AgentRenderState[];   // One per dispatched agent
}

interface AgentRenderState {
  preset: string;               // "scout", "executor", etc.
  instance: number;             // 1, 2, ... (per-preset counter in execute(): sequential index per preset name across tasks/chain array). Shown as "#N" in card header only when multiple agents share the same preset name in a dispatch.
  task: string;                 // Task description (original task text, not the full system prompt)
  status: "running" | "done" | "error";
  elapsedMs: number;            // Tracked by execute() via Date.now() - startTime per agent
  exitCode: number;             // -1 while running, 0 = success, >0 = error
  messages: Message[];          // Agent messages so far (grows during streaming)
  usage: UsageStats;            // Token counts (partial during streaming, final after)
  model: string;                // Resolved model string from resolvePreset() — e.g. "claude-haiku-4-5". Set at dispatch time, doesn't change.
}

// Message type — import from @mariozechner/pi-ai (same as dispatch-agent)
// import type { Message } from "@mariozechner/pi-ai";
// Message = UserMessage | AssistantMessage | ToolResultMessage
// - UserMessage: { role: "user", content: string | (TextContent | ImageContent)[] }
// - AssistantMessage: { role: "assistant", content: (TextContent | ThinkingContent | ToolCall)[], model, usage, stopReason, errorMessage? }
// - ToolResultMessage: { role: "toolResult", toolCallId, toolName, content, isError }
// Content types: TextContent { type: "text", text }, ToolCall { type: "toolCall", name, arguments, id }, ThinkingContent { type: "thinking", thinking }

interface UsageStats {
  input: number;               // Input tokens
  output: number;              // Output tokens
  cacheRead: number;           // Cache read tokens
  cacheWrite: number;          // Cache write tokens
  cost: number;                // USD — computed from token counts + model pricing
  contextTokens: number;       // Context window tokens used
  turns: number;               // Number of assistant turns (LLM calls)
}

// Used by getDisplayItems() to extract renderable items from messages
// Extracts TextContent and ToolCall items from AssistantMessage.content arrays
interface DisplayItem {
  type: "text" | "toolCall";
  text?: string;               // For type: "text"
  name?: string;               // For type: "toolCall" — tool name
  arguments?: Record<string, unknown>;  // For type: "toolCall" — tool arguments (from ToolCall.arguments)
}

// Emitted by spawn.ts runSingleAgent on each NDJSON event
interface AgentUpdate {
  messages: Message[];          // All messages so far (cumulative)
  usage: UsageStats;            // Current token counts
  exitCode: number;             // -1 while running, 0+ when done
}

// Return type from spawn.ts runSingleAgent after process exits
interface SpawnResult {
  exitCode: number;
  messages: Message[];
  usage: UsageStats;
}
```

During streaming (`isPartial: true`):
- Running agents have `status: "running"`, `exitCode: -1`, partial `messages` (grows as NDJSON lines arrive)
- Completed agents have `status: "done" | "error"`, `exitCode >= 0`, final `messages`
- `elapsedMs` is computed by `execute()` on each `onUpdate` call: `Date.now() - agentStartTime`
- **Elapsed time refresh:** `execute()` runs a 1-second `setInterval` that calls `onUpdate` with updated `elapsedMs` values for all running agents. This keeps the time display ticking even when no NDJSON events arrive. Timer is cleared when all agents complete.

After completion (`isPartial: false`):
- All agents have final `status`, `exitCode`, `messages`, `usage`

```typescript
import { DynamicBorder, getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";

// DynamicBorder implements Component { render(width): string[], invalidate() }
// renderResult output is added to a Box via contentBox.addChild(resultComponent)
// Box.addChild accepts any Component — so DynamicBorder works here.
// Verified in pi source: tool-execution.js:330, box.js, dynamic-border.js

function buildAgentCard(
  agent: AgentRenderState,
  expanded: boolean,
  showInstance: boolean,  // true when multiple agents share the same preset name
  theme: any,
): Container {
  const card = new Container();
  const borderFn = (s: string) => theme.fg("dim", s);

  // Status: running / done / error
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const icon = isRunning ? theme.fg("warning", "●")
    : isError ? theme.fg("error", "✗")
    : theme.fg("success", "✓");

  // showInstance: true when multiple agents share the same preset name in this dispatch
  // Determined by buildRenderResult before calling buildAgentCard
  const name = agent.preset.charAt(0).toUpperCase() + agent.preset.slice(1) +
    (showInstance ? ` #${agent.instance}` : "");
  const elapsed = `${Math.round(agent.elapsedMs / 1000)}s`;

  // Header line: icon + name + task preview + time
  const taskPreview = agent.task.length > 50 ? agent.task.slice(0, 47) + "..." : agent.task;
  const header = `${icon} ${theme.fg("accent", theme.bold(name))}` +
    theme.fg("dim", `  ${taskPreview}`) +
    theme.fg("dim", `  ${elapsed}`);

  card.addChild(new DynamicBorder(borderFn));
  card.addChild(new Text(header, 0, 0));

  // Tool calls + output
  const displayItems = getDisplayItems(agent.messages);
  const finalOutput = getFinalOutput(agent.messages);

  if (isRunning) {
    // Show only last tool call while running
    const lastTool = displayItems.filter(i => i.type === "toolCall").pop();
    if (lastTool) {
      card.addChild(new Text(
        theme.fg("muted", "  → ") +
        formatToolCall(lastTool.name!, lastTool.arguments!, theme.fg.bind(theme)),
        0, 0));
    } else {
      card.addChild(new Text(theme.fg("muted", "  (starting...)"), 0, 0));
    }
  } else if (expanded) {
    // Show all tool calls + full output
    for (const item of displayItems) {
      if (item.type === "toolCall") {
        card.addChild(new Text(
          theme.fg("muted", "  → ") +
          formatToolCall(item.name!, item.arguments!, theme.fg.bind(theme)),
          0, 0));
      }
    }
    if (finalOutput) {
      card.addChild(new Spacer(1));
      card.addChild(new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()));
    }
    // Per-agent usage in expanded mode
    const usageStr = formatUsageStats(agent.usage, agent.model);
    if (usageStr) card.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
  } else {
    // Collapsed: last ~5 tool calls + truncated output
    const toolCalls = displayItems.filter(i => i.type === "toolCall").slice(-5);
    for (const item of toolCalls) {
      card.addChild(new Text(
        theme.fg("muted", "  → ") +
        formatToolCall(item.name!, item.arguments!, theme.fg.bind(theme)),
        0, 0));
    }
    if (finalOutput) {
      const preview = finalOutput.split("\n").slice(0, 2).join("\n");
      card.addChild(new Text(theme.fg("toolOutput", `  ${preview}`), 0, 0));
    }
  }

  card.addChild(new DynamicBorder(borderFn));
  return card;
}
```

**Note on padding:** `Text` uses `(0, 0)` padding — the outer `Box` (from `ToolExecutionComponent`) handles padding. `DynamicBorder` renders full-width border lines (`"─".repeat(width)`) that the `Box` then pads.

#### Inline renderCall / renderResult

**`renderCall`** — shows what was dispatched:
```typescript
renderCall(args, theme) {
  if (args.preset && args.task) {
    // Single mode
    const preview = args.task.length > 60 ? args.task.slice(0, 57) + "..." : args.task;
    return new Text(
      theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
      theme.fg("accent", args.preset) +
      "\n  " + theme.fg("dim", preview), 0, 0);
  }
  if (args.tasks) {
    // Parallel mode
    let text = theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
      theme.fg("accent", `parallel (${args.tasks.length} tasks)`);
    for (const t of args.tasks.slice(0, 3)) {
      const preview = t.task.length > 40 ? t.task.slice(0, 37) + "..." : t.task;
      text += `\n  ${theme.fg("accent", t.preset)} ${theme.fg("dim", preview)}`;
    }
    if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
    return new Text(text, 0, 0);
  }
  if (args.chain) {
    // Chain mode
    let text = theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
      theme.fg("accent", `chain (${args.chain.length} steps)`);
    for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
      const step = args.chain[i];
      const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
      const preview = cleanTask.length > 40 ? cleanTask.slice(0, 37) + "..." : cleanTask;
      text += `\n  ${theme.fg("muted", `${i + 1}.`)} ${theme.fg("accent", step.preset)} ${theme.fg("dim", preview)}`;
    }
    return new Text(text, 0, 0);
  }
  return new Text(theme.fg("toolTitle", theme.bold("dispatch_crew")), 0, 0);
}
```

**`renderResult`** — pi passes `{ expanded, isPartial }` (both confirmed in extension docs). Delegates to `buildRenderResult`:

```typescript
renderResult(result, { expanded, isPartial }, theme) {
  const details = result.details as CrewDispatchDetails;
  if (!details || details.agents.length === 0) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
  }
  return buildRenderResult(details, { expanded, isPartial }, theme);
}
```

`buildRenderResult` behavior:
- Returns a `Container` with `DynamicBorder` agent cards (one per agent) + total usage footer
- **`isPartial: true` (streaming):** Cards with ●/✓/✗ status, last tool call per running agent. Replaces in-place on each `onUpdate`.
- **`isPartial: false, expanded: false` (final, collapsed):** Cards with all ✓/✗, last ~5 tool calls + output preview + expand hint via `keyHint("expandTools", "to expand")` from `@mariozechner/pi-coding-agent`.
- **`isPartial: false, expanded: true` (Ctrl+O):** Cards with full tool history + markdown output per agent.
- All three modes (single/parallel/chain) render per-agent cards.
- Uses `DynamicBorder` from `@mariozechner/pi-coding-agent` and `Text`, `Container`, `Spacer`, `Markdown` from `@mariozechner/pi-tui`.

#### Formatting Helpers (shared with dispatch-agent)

```typescript
function formatTokens(count: number): string;
function formatUsageStats(usage: UsageStats, model?: string): string;
function formatToolCall(toolName: string, args: Record<string, unknown>, themeFg: Function): string;
function getDisplayItems(messages: Message[]): DisplayItem[];
function getFinalOutput(messages: Message[]): string;
```

#### Details type

`CrewDispatchDetails` — see definition in section 5.5 above. Built by `execute()`, consumed by `renderResult`.

### 5.6 Status Bar

Shows current workflow context via `ctx.ui.setStatus("crew", text)`. The first argument is the namespace (required by pi — see extension docs), the second is the display string. Updated on `session_start` and after state changes (phase transitions). Clear with `ctx.ui.setStatus("crew", undefined)`.

When a feature is active:
```typescript
ctx.ui.setStatus("crew", "build │ 2/5 tasks │ balanced");
```

When no feature is active:
```typescript
ctx.ui.setStatus("crew", "idle │ balanced");
```

### 5.7 Commands

| Command | Description |
|---------|-------------|
| `/crew` | Show current state — phase, feature, progress, agent presets |
| `/crew:profile <name>` | Switch model profile: quality, balanced, budget |
| `/crew:override <agent> <model>` | Override a specific agent's model |
| `/crew:reset` | Clear `.crew/state.md` — start fresh |
| `/crew:status` | Show detailed status of current feature |


Commands are registered via `pi.registerCommand()`. They read/write `.crew/config.json` and `.crew/state.md`.

### 5.8 Event Flow

```
User: "I want to add dark mode to the app"
  │
  ├─ before_agent_start: injects crew system prompt with presets + state
  │
  ├─ LLM reads system prompt, sees no .crew/state.md exists
  │   → Decides to start with explore phase
  │   → Loads /skill:crew-explore (reads the SKILL.md)
  │   → Dispatches 3 scouts in parallel via dispatch_crew
  │
  ├─ dispatch_crew execute(): spawns 3 pi processes
  │   → renderResult(isPartial: true): 3 inline DynamicBorder cards update live
  │   → onUpdate refreshes cards as agents report progress
  │   → All done → renderResult(isPartial: false): final cards with tool calls + output
  │
  ├─ LLM receives scout results, writes .crew/phases/dark-mode/explore.md
  │   → Updates .crew/state.md frontmatter (phase: explore) + body
  │   → Presents findings to user, asks design questions
  │
  ├─ User answers design questions
  │
  ├─ LLM loads /skill:crew-design
  │   → Dispatches architect agent (single mode)
  │   → Inline card shows architect running → done
  │   → Produces spec, presents to user for approval
  │
  ├─ User approves
  │
  ├─ LLM loads /skill:crew-plan
  │   → Creates task breakdown with waves
  │   → Writes .crew/phases/dark-mode/plan.md + task files
  │   → Shows wave structure to user
  │
  ├─ LLM loads /skill:crew-build
  │   → Dispatches executors per wave via dispatch_crew parallel mode
  │   → Inline cards show executor progress per wave
  │   → After each wave: runs evaluation gate (tests pass? files exist?)
  │   → If task fails: dispatches debugger, retries with fix
  │
  ├─ LLM loads /skill:crew-review
  │   → Dispatches reviewer (spec mode) → reviewer (code mode) → reviewer (security mode)
  │   → Sequential dispatch (NOT chain) — each gate must pass before next
  │   → Presents findings
  │
  ├─ LLM loads /skill:crew-ship
  │   → Squash commits, push, open PR
  │
  └─ Done
```

## 6. Skill Files — Full Content

**No master routing skill.** Phase selection and routing are handled by the injection prompt (section 5.1). Each phase skill is focused and self-contained — the LLM loads only what's needed for the current phase. This follows the pi skills principle of progressive disclosure: only descriptions are always in context, full instructions load on-demand.

### 6.1 Explore Phase: `skills/crew-explore/SKILL.md`

```markdown
---
name: crew-explore
description: Codebase exploration phase — dispatch scouts to understand project structure, find relevant code, and identify patterns before making changes.
---

# Explore Phase

Dispatch scouts to understand the codebase before making any changes.

## When to Use

- Starting work on an unfamiliar codebase
- Working on a part of the codebase you haven't explored yet
- Before any non-trivial implementation

## Protocol

### 1. Assess Project Size

Run a quick file count to determine scale:

```bash
find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -not -path '*/__pycache__/*' -not -path '*/.venv/*' | wc -l
```

### 2. Dispatch Scouts

Scale scout count to project size:

| Project Size | Files | Scouts | Focus Areas |
|-------------|-------|--------|-------------|
| Small | < 50 | 1 | Full project scan |
| Medium | 50-500 | 2 | 1: project structure + stack, 2: area relevant to task |
| Large | 500+ | 3-4 | 1: structure, 2: relevant area, 3: conventions/patterns, 4: dependencies/integrations |

Dispatch scouts in **parallel** via `dispatch_crew({ tasks: [...] })`.

Each scout task should be specific:
- ✓ "Explore the authentication system — find all files related to login, JWT, sessions, middleware"
- ✓ "Map the project structure — directory layout, tech stack, key entry points, configuration"
- ✗ "Look at the project" (too vague)

### 3. Collect and Write Findings

After scouts return, synthesize their findings into `.crew/phases/<feature>/explore.md`:

```markdown
# Explore: {feature-name}

## Project Overview
- **Stack:** {languages, frameworks, key libraries}
- **Size:** {file count, directory structure}
- **Conventions:** {naming, patterns, test approach}

## Relevant Code
- `{path}` ({lines}): {what it does, why it matters}

## Patterns
- {pattern}: {where used, example}

## Concerns
- {anything notable for implementation}

## Key Dependencies
- {dependency}: {how it's used}
```

### 4. Present to User

Show a compressed summary of findings. Highlight:
- What's relevant to the task
- Anything surprising or concerning
- Suggested approach based on what was found

### 5. Update State

Write `.crew/state.md` with phase: explore, feature name, and exploration summary.

## Evaluation Gate

Before moving to the next phase:
- [ ] At least one scout completed successfully
- [ ] Findings written to `.crew/phases/<feature>/explore.md`
- [ ] Summary presented to user

## Next Phase

Proceed to **design** (`/skill:crew-design`) to discuss approach with the user.
```

### 6.2 Design Phase: `skills/crew-design/SKILL.md`

```markdown
---
name: crew-design
description: Design phase — discuss approaches with the user, dispatch an architect for complex designs, and lock decisions before implementation.
---

# Design Phase

Make design decisions with the user before writing any code.

## When to Use

- After explore phase for non-trivial features
- When there are multiple valid approaches
- When the user needs to make decisions about behavior, UI, or architecture

## Protocol

### 1. Load Context

Read the explore findings:
```
.crew/phases/<feature>/explore.md
```

### 2. Assess Design Complexity

| Complexity | Approach |
|-----------|----------|
| Obvious (1 clear way) | Propose it directly, ask user to confirm |
| Moderate (2-3 options) | Present options yourself based on explore findings |
| Complex (architectural decisions, many trade-offs) | Dispatch an **architect** agent with explore findings + requirements |

### 3. For Complex Designs — Dispatch Architect

```
dispatch_crew({
  preset: "architect",
  task: "Design the {feature} feature. Requirements: {requirements}. Codebase context: {paste explore findings}. User constraints: {any locked decisions}.",
  cwd: "<project dir>"
})
```

The architect returns a structured design with multiple approaches, trade-offs, and a recommendation.

### 4. Present Options to User

Show the design options with clear trade-offs. Ask the user to decide:

- **Approach A** vs **Approach B** — which one?
- **Scope** — what's in, what's out?
- **Behavior details** — how should edge cases work?

### 5. Lock Decisions

After the user approves, write `.crew/phases/<feature>/design.md`:

```markdown
# Design: {feature-name}

## Goal
{What must be TRUE when this feature works}

## Locked Decisions
{User-approved choices — these are NON-NEGOTIABLE during implementation}
- {decision 1}: {rationale}
- {decision 2}: {rationale}

## Technical Approach
{How it will be built — components, data flow, key patterns}

## Must-Haves

### Truths (observable behaviors)
- {truth-1}
- {truth-2}

### Artifacts (files that must exist)
- `{path}`: {purpose}

### Key Links (critical connections)
- {from} → {to} via {mechanism}

## Deferred Ideas
{Explicitly out of scope for this implementation}
- {idea 1}: deferred because {reason}

## Out of Scope
- {thing not being built}
```

### 6. Update State

Update `.crew/state.md` with phase: design, locked decisions summary.

## Evaluation Gate

Before moving to the next phase:
- [ ] User explicitly approved the design
- [ ] Design written to `.crew/phases/<feature>/design.md`
- [ ] Locked decisions are specific and actionable
- [ ] Must-haves list is complete (truths, artifacts, key links)

## Next Phase

Proceed to **plan** (`/skill:crew-plan`) to break the design into executable tasks.
```

### 6.3 Plan Phase: `skills/crew-plan/SKILL.md`

```markdown
---
name: crew-plan
description: Planning phase — break the approved design into executable tasks with dependency analysis, wave structure, and verification criteria.
---

# Plan Phase

Break the approved design into tasks that executor agents can implement independently.

## When to Use

- After design is approved
- When you need to coordinate multiple implementation tasks
- Before dispatching any executors

## Protocol

### 1. Load Context

Read:
- `.crew/phases/<feature>/design.md` — locked decisions, must-haves
- `.crew/phases/<feature>/explore.md` — codebase context

### 2. Task Breakdown

Break the design into tasks. Each task must be:

- **Independently executable** — An executor can complete it without needing output from another running task
- **Specifically scoped** — Exact files, exact changes, exact verification
- **Right-sized** — 15-60 minutes of agent execution time. If shorter, combine. If longer, split.
- **2-3 tasks per wave maximum** — Keeps agent context budget at ~50%

#### Task Structure

Each task needs:
- **Name** — Action-oriented: "Create auth middleware" not "Authentication"
- **Files** — Exact paths to create/modify
- **Action** — Specific implementation instructions. Enough detail that the executor doesn't need to make design decisions.
- **Verify** — A command to prove completion (test command, curl, file check)
- **Done criteria** — What must be true for the task to be complete

#### Specificity Test

Could a different agent implement this task without asking clarifying questions? If not, add more detail.

- ✗ "Add authentication" → too vague
- ✓ "Create POST /api/auth/login accepting {email, password}, validate with bcrypt against users table, return JWT in httpOnly cookie with 15-min expiry using jose library"

### 3. Dependency Analysis

For each task, identify:
- **Needs:** What must exist before this task can run?
- **Creates:** What does this task produce?

Build a dependency graph and assign waves:

```
Wave 1: Independent tasks (no dependencies)
  Task A: Create user model
  Task B: Create product model

Wave 2: Depends on Wave 1
  Task C: Create user API (needs Task A)
  Task D: Create product API (needs Task B)

Wave 3: Depends on Wave 2
  Task E: Create dashboard (needs C + D)
```

**Prefer vertical slices over horizontal layers:**
- ✓ "User feature (model + API + UI)" — self-contained, can run parallel with other features
- ✗ "All models, then all APIs, then all UI" — forces sequential execution

### 4. Goal-Backward Verification

Before finalizing the plan, verify completeness using the must-haves from the design:

For each **truth** (observable behavior): Is there a task that implements it?
For each **artifact** (file): Is there a task that creates it?
For each **key link** (connection): Is there a task that wires it?

If anything is missing, add a task.

### 5. Write Plan

Write `.crew/phases/<feature>/plan.md`:

```markdown
# Plan: {feature-name}

## Waves

### Wave 1 (parallel)
| Task | Name | Files | Depends On |
|------|------|-------|-----------|
| 01 | {name} | {files} | none |
| 02 | {name} | {files} | none |

### Wave 2 (parallel)
| Task | Name | Files | Depends On |
|------|------|-------|-----------|
| 03 | {name} | {files} | 01 |

## Must-Haves Traceability

| Must-Have | Type | Task |
|-----------|------|------|
| {truth-1} | truth | 01 |
| {artifact-1} | artifact | 02 |
| {link-1} | key-link | 03 |
```

Write individual task files to `.crew/phases/<feature>/build/task-NN.md` using the task template.

### 6. Present to User

Show the wave structure and ask for approval. Highlight:
- Total task count and estimated waves
- Any dependencies or potential bottlenecks
- File overlap between tasks (if any — should be avoided)

### 7. Update State

Update `.crew/state.md` with phase: plan, task count, wave count.

## Evaluation Gate

Before moving to build:
- [ ] User approved the plan
- [ ] Every task has: name, files, action, verify, done criteria
- [ ] Every must-have from the design maps to at least one task
- [ ] Wave structure is valid (no circular dependencies)
- [ ] No file overlap between tasks in the same wave
- [ ] Task files written to `.crew/phases/<feature>/build/`

## Next Phase

Proceed to **build** (`/skill:crew-build`) to execute the plan with agents.
```

### 6.4 Build Phase: `skills/crew-build/SKILL.md`

```markdown
---
name: crew-build
description: Build phase — execute the plan wave by wave using executor agents. Handle failures with debugger agents. Track progress in task files.
---

# Build Phase

Execute the plan by dispatching executor agents wave by wave.

## When to Use

- After plan is approved and task files exist
- To resume a partially completed build (read task file statuses)

## Protocol

### 1. Load Context

Read:
- `.crew/phases/<feature>/plan.md` — wave structure
- `.crew/phases/<feature>/design.md` — locked decisions (pass to executors)
- `.crew/phases/<feature>/build/task-*.md` — individual task specs and statuses

Check which tasks are already done (status: done in their task files). Resume from the first incomplete wave.

### 2. Execute Waves

For each wave, in order:

#### a. Prepare Executor Tasks

For each task in the wave, build the dispatch arguments:

```
dispatch_crew({
  tasks: [
    {
      preset: "executor",
      task: "<full task context — see below>",
      cwd: "<project working directory>"
    },
    // ... more tasks in this wave
  ]
})
```

**Full task context** passed to each executor (they have NO access to your conversation):

```
## Task: {task name}

## Design Context
{Paste the relevant locked decisions from design.md}
{Paste the relevant must-haves this task addresses}

## Task Spec
{Paste the full content of the task file: action, verify, done criteria}

## Codebase Context
{Paste relevant file paths and patterns from explore.md}
{If this task depends on a previous task, paste what that task produced}

## Constraints
- Follow existing project conventions
- Commit with format: feat|fix|test|refactor: description
- Run tests after implementation
```

#### b. Dispatch and Monitor

Dispatch all tasks in the wave as a parallel `dispatch_crew` call. Progress renders inline via renderResult.

#### c. Evaluate Wave Results

After the wave completes, for each task:

**If task succeeded:**
- Read the executor's output
- Update the task file: status → done, commit hash, any deviations
- Verify: run the task's verify command yourself to confirm

**If task failed:**
- Read the error output
- Dispatch a **debugger** agent to diagnose:

```
dispatch_crew({
  preset: "debugger",
  task: "Debug this failure. Error: {error output}. Task was: {task spec}. Files involved: {file list}.",
  cwd: "<project dir>"
})
```

- If debugger fixes it: update task file, continue
- If debugger can't fix: update task file with error, present to user
- **Max 3 retry attempts per task** — after 3 failures, mark as failed and continue

**If task returned a Rule 4 deviation (architectural change needed):**
- Present the deviation to the user
- Wait for decision
- Re-dispatch executor with the decision, or adjust the plan

#### d. Verify Wave

After all tasks in a wave are done:
- Run the project's test suite
- Check that all expected files exist
- Verify no regressions from previous waves

Only proceed to the next wave if verification passes.

### 3. Write Build Summary

After all waves complete, write `.crew/phases/<feature>/build/summary.md`:

```markdown
# Build Summary: {feature-name}

## Tasks
| Task | Name | Status | Commit | Deviations |
|------|------|--------|--------|-----------|
| 01 | {name} | done | {hash} | none |
| 02 | {name} | done | {hash} | [Rule 1] fixed null check |

## Deviations
- [Rule 1 - Bug] {description of auto-fix}
- [Rule 2 - Critical] {description of added functionality}

## Test Results
{Final test suite output summary}

## Files Changed
- `{path}`: {what changed}
```

### 4. Update State

Update `.crew/state.md` with phase: build, progress (N/M tasks), completion status.

## Evaluation Gate

Before moving to review:
- [ ] All tasks complete (status: done) or explicitly failed with documentation
- [ ] Test suite passes
- [ ] All expected files exist
- [ ] Build summary written
- [ ] No unresolved Rule 4 deviations

## Error Recovery

If a wave fails and can't be fixed after retries:
1. Document what failed and why
2. Present to user with options:
   - Fix manually and resume
   - Adjust the plan (re-enter plan phase)
   - Ship what's done (skip remaining tasks)

## Next Phase

Proceed to **review** (`/skill:crew-review`) to verify implementation quality.
```

### 6.5 Review Phase: `skills/crew-review/SKILL.md`

```markdown
---
name: crew-review
description: Review phase — three-gate verification (spec compliance, code quality, security) using reviewer agents.
---

# Review Phase

Verify the implementation through three sequential review gates.

## When to Use

- After build phase completes
- Before shipping any feature

## Protocol

### 1. Load Context

Read:
- `.crew/phases/<feature>/design.md` — spec for compliance check
- `.crew/phases/<feature>/build/summary.md` — what was built

Get the diff:
```bash
git diff main...HEAD
```
(or `master...HEAD`, or the appropriate base branch)

### 2. Three Review Gates

Execute these gates **sequentially** — three separate `dispatch_crew` single-mode calls, NOT a chain. Each gate's pass/fail determines whether to proceed to the next.

#### Gate 1: Spec Compliance

```
dispatch_crew({
  preset: "reviewer",
  task: "Review this implementation for spec compliance.\n\nMode: spec-compliance\n\n## Design Spec\n{paste design.md content}\n\n## Code Diff\n{paste git diff}\n\n## Build Summary\n{paste build summary}",
  cwd: "<project dir>"
})
```

**If FAIL:** Present critical findings to user. Options:
- Dispatch executor to fix specific issues
- Accept the deviation with justification

#### Gate 2: Code Quality

```
dispatch_crew({
  preset: "reviewer",
  task: "Review this code for quality.\n\nMode: code-quality\n\n## Code Diff\n{paste git diff}",
  cwd: "<project dir>"
})
```

**If FAIL:** Same options as Gate 1.

#### Gate 3: Security

```
dispatch_crew({
  preset: "reviewer",
  task: "Security audit of this code.\n\nMode: security\n\n## Code Diff\n{paste git diff}",
  cwd: "<project dir>"
})
```

**If FAIL:** Critical security issues MUST be fixed before shipping.

### 3. Write Review Report

Write `.crew/phases/<feature>/review.md`:

```markdown
# Review: {feature-name}

## Gate 1: Spec Compliance — PASS/FAIL
{findings}

## Gate 2: Code Quality — PASS/FAIL
{findings}

## Gate 3: Security — PASS/FAIL
{findings}

## Overall: PASS/FAIL
{summary}
```

### 4. Handle Failures

If any gate has critical findings that need fixing:

1. Dispatch executor to fix specific issues
2. Re-run the failed gate
3. Max 2 fix-and-recheck cycles per gate

### 5. Update State

Update `.crew/state.md` with phase: review, gate results.

## Evaluation Gate

Before moving to ship:
- [ ] All three gates pass (or user explicitly accepts with justification)
- [ ] Review report written
- [ ] No critical security findings unresolved

## Next Phase

Proceed to **ship** (`/skill:crew-ship`) to push and open PR.
```

### 6.6 Ship Phase: `skills/crew-ship/SKILL.md`

```markdown
---
name: crew-ship
description: Ship phase — squash commits, push branch, open PR/MR with generated description.
---

# Ship Phase

Ship the completed, reviewed feature.

## When to Use

- After review phase passes
- When the user says "ship it"

## Protocol

### 1. Verify Readiness

Check:
- [ ] `.crew/phases/<feature>/review.md` exists and shows PASS
- [ ] Tests pass: run the project's test suite
- [ ] No uncommitted changes: `git status`

### 2. Show Commit Summary

```bash
git log --oneline main..HEAD  # or master..HEAD
```

Present the commits to the user. Ask preference:
- **Squash** — single clean commit (default)
- **Keep** — preserve atomic commits

### 3. Squash (if chosen)

```bash
git rebase -i main  # squash all into one commit
```

Commit message generated from design + build summary:
```
feat: {feature name}

{One-paragraph description from design.md goal}

- {key change 1 from build summary}
- {key change 2}
- {key change 3}
```

### 4. Push

```bash
git push origin HEAD
```

### 5. Open PR/MR

Generate PR description from `.crew/` artifacts:

```markdown
## What

{From design.md goal}

## Why

{From design.md rationale}

## Changes

{From build summary — files changed, key decisions}

## Testing

{From build summary — test results}

## Review Notes

{From review.md — any warnings or accepted deviations}
```

Use the appropriate CLI:
- GitHub: `gh pr create --title "..." --body "..."`
- GitLab: `glab mr create --title "..." --description "..."`

### 6. Write Feature Summary

Write `.crew/phases/<feature>/summary.md`:

```markdown
# Feature Summary: {feature-name}

## What was built
{One paragraph}

## Commits
| Hash | Message | Files |
|------|---------|-------|
| {hash} | {message} | {count} |

## Decisions Made
- {decision}: {rationale}

## Deviations from Plan
- {deviation}: {what happened, why}

## Stats
- **Agents dispatched:** {count}
- **Total cost:** ${amount}
- **PR/MR:** {url}
```

### 7. Update State

Update `.crew/state.md` with phase: shipped, PR URL.

## Evaluation Gate

- [ ] Branch pushed
- [ ] PR/MR opened
- [ ] Summary written

## Done

Feature is shipped! The user can continue with a new feature or close the session.
```

## 7. Reference Files

### 7.1 `references/model-profiles.md`

```markdown
# Model Profiles

## Profiles

| Profile | Use when | Cost |
|---------|----------|------|
| quality | Critical features, production code, complex architecture | $$$ |
| balanced | General development (default) | $$ |
| budget | Exploration, prototyping, documentation | $ |

## Profile → Model Mapping

### quality
| Agent | Model | Tier |
|-------|-------|------|
| scout | claude-sonnet-4-5 | budget |
| researcher | claude-sonnet-4-5 | budget |
| architect | claude-opus-4 | quality |
| executor | claude-sonnet-4-5 | balanced |
| reviewer | claude-sonnet-4-5 | balanced |
| debugger | claude-opus-4 | quality |

### balanced (default)
| Agent | Model | Tier |
|-------|-------|------|
| scout | claude-haiku-4-5 | budget |
| researcher | claude-haiku-4-5 | budget |
| architect | claude-sonnet-4-5 | quality |
| executor | claude-sonnet-4-5 | balanced |
| reviewer | claude-sonnet-4-5 | balanced |
| debugger | claude-sonnet-4-5 | quality |

### budget
| Agent | Model | Tier |
|-------|-------|------|
| scout | claude-haiku-4-5 | budget |
| researcher | claude-haiku-4-5 | budget |
| architect | claude-sonnet-4-5 | quality |
| executor | claude-haiku-4-5 | balanced |
| reviewer | claude-haiku-4-5 | balanced |
| debugger | claude-sonnet-4-5 | quality |

## Per-Agent Overrides

Set in `.crew/config.json`:
```json
{
  "profile": "balanced",
  "overrides": {
    "executor": "claude-opus-4"
  }
}
```

Override takes precedence over profile mapping.

## Switching Profiles

```
/crew:profile quality    # Switch to quality profile
/crew:profile budget     # Switch to budget profile
/crew:override executor claude-opus-4  # Override single agent
```
```

### 7.2 `references/deviation-rules.md`

```markdown
# Deviation Rules

Rules for handling unexpected work discovered during execution. These are injected into executor system prompts.

## Rule 1: Auto-fix bugs

**Trigger:** Code doesn't work as intended.
**Examples:** Wrong queries, logic errors, type errors, null pointers, broken validation, security vulnerabilities.
**Action:** Fix inline → add/update tests → verify → continue.
**No user permission needed.**

## Rule 2: Auto-add missing critical functionality

**Trigger:** Code missing essential features for correctness/security/operation.
**Examples:** Missing error handling, no input validation, missing null checks, no auth on protected routes, missing CSRF/CORS.
**Action:** Fix inline → add/update tests → verify → continue.
**No user permission needed.**

## Rule 3: Auto-fix blocking issues

**Trigger:** Something prevents completing the current task.
**Examples:** Missing dependency, wrong types, broken imports, missing env var, build config error.
**Action:** Fix inline → verify → continue.
**No user permission needed.**

## Rule 4: STOP for architectural changes

**Trigger:** Fix requires significant structural modification.
**Examples:** New database table (not column), major schema changes, new service layer, switching libraries, breaking API changes.
**Action:** STOP. Report to orchestrator: what found, proposed change, why needed, impact, alternatives. User decides.

## Priority

1. Rule 4 applies → STOP
2. Rules 1-3 apply → Fix automatically
3. Genuinely unsure → Rule 4 (ask)

## Scope Boundary

Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing issues: note but don't fix.

## Fix Attempt Limit

After 3 auto-fix attempts on a single issue: STOP fixing. Document remaining issues. Continue to next task.
```

### 7.3 `references/evaluation-gates.md`

```markdown
# Evaluation Gates

Quick reference for all phase gates in one place. The authoritative definitions live in each phase skill (section 6). This file exists so the LLM or user can review all gates without loading every skill.

Each phase has an evaluation gate that must pass before advancing.

## Explore Gate

- [ ] At least one scout completed successfully
- [ ] Findings written to `.crew/phases/<feature>/explore.md`
- [ ] Summary presented to user

## Design Gate

- [ ] User explicitly approved the design (not just acknowledged — approved)
- [ ] Design written to `.crew/phases/<feature>/design.md`
- [ ] Locked decisions are specific and actionable
- [ ] Must-haves list complete: truths, artifacts, key links

## Plan Gate

- [ ] User approved the plan
- [ ] Every task has: name, files, action, verify, done criteria
- [ ] Every must-have maps to at least one task
- [ ] Wave structure valid (no circular deps)
- [ ] No file overlap between tasks in the same wave
- [ ] Task files written to `.crew/phases/<feature>/build/`

## Build Gate

- [ ] All tasks complete (or explicitly failed with documentation)
- [ ] Test suite passes
- [ ] All expected files exist
- [ ] Build summary written
- [ ] No unresolved Rule 4 deviations

## Review Gate

- [ ] All three review gates pass (spec, code, security)
- [ ] Review report written
- [ ] No critical security findings unresolved

## Ship Gate

- [ ] Branch pushed
- [ ] PR/MR opened
- [ ] Summary written
```

## 8. Template Files

### `templates/plan.md`
```markdown
# Plan: {feature-name}

## Waves

### Wave 1 (parallel)
| Task | Name | Files | Depends On |
|------|------|-------|-----------|
| 01 | {name} | {files} | none |
| 02 | {name} | {files} | none |

### Wave 2 (parallel)
| Task | Name | Files | Depends On |
|------|------|-------|-----------|
| 03 | {name} | {files} | 01 |

## Must-Haves Traceability

| Must-Have | Type | Task |
|-----------|------|------|
| {truth-1} | truth | 01 |
| {artifact-1} | artifact | 02 |
| {link-1} | key-link | 03 |
```

### `templates/task.md`
```markdown
---
status: pending
wave: {N}
depends_on: []
---

# Task {NN}: {name}

## Files
{exact file paths to create or modify}

## Action
{Specific implementation instructions — enough detail that an executor can implement without design decisions}

## Verify
```bash
{command to prove completion}
```

## Done Criteria
{Measurable completion state — what must be true}

## Result
- **Status:** pending
- **Commit:** —
- **Deviations:** —
- **Error:** —
```

### `templates/spec.md`
```markdown
# Design: {feature-name}

## Goal
{What must be TRUE when this feature is complete}

## Locked Decisions
{User-approved choices — NON-NEGOTIABLE during implementation}
- {decision 1}: {rationale}

## Technical Approach
{How it will be built — components, data flow, key patterns}

## Must-Haves

### Truths (observable behaviors)
- {truth-1}

### Artifacts (files that must exist)
- `{path}`: {purpose}

### Key Links (critical connections)
- {from} → {to} via {mechanism}

## Deferred Ideas
- {idea}: deferred because {reason}

## Out of Scope
- {thing not being built}
```

### `templates/summary.md`
```markdown
# Feature Summary: {feature-name}

## What was built
{One paragraph}

## Commits
| Hash | Message | Files |
|------|---------|-------|
| {hash} | {message} | {count} |

## Decisions Made
- {decision}: {rationale}

## Deviations from Plan
- {deviation}: {what happened, why}

## Stats
- **Agents dispatched:** {count}
- **Total cost:** ${amount}
- **PR/MR:** {url}
```

## 9. File Structure: `.crew/`

```
.crew/
├── config.json                           # Model profile + overrides (persists)
├── state.md                              # Current phase + progress (YAML frontmatter + markdown body)
└── phases/
    └── dark-mode/                        # One directory per feature
        ├── explore.md                    # Scout findings
        ├── design.md                     # Architecture decisions (locked by user)
        ├── plan.md                       # Task breakdown with waves
        ├── build/
        │   ├── task-01.md                # Individual task spec + status + result
        │   ├── task-02.md
        │   ├── task-03.md
        │   └── summary.md               # Build summary (commits, deviations)
        ├── review.md                     # Three-gate review findings
        └── summary.md                    # Final feature summary
```

All files are markdown with YAML frontmatter where machine parsing is needed. All are git-trackable. `cat` any file to see status. `.crew/` should NOT be gitignored — it's project context that benefits the team.

## 10. Implementation Tasks

### Task 1: Package scaffolding

All commands from monorepo root (`/Users/josorio/Code/pi-packages/`).

```bash
# Scaffold new workspace via turbo
pnpm turbo gen workspace --name @josorio/pi-crew --type package --empty

# Set package fields
cd packages/pi-crew
npm pkg set type="module"
npm pkg set description="Agentic coding workflow — dispatch specialized agents through structured phases"
npm pkg set keywords='["pi-package"]'
npm pkg set author="josorio7122"
npm pkg set license="MIT"
npm pkg set pi.extensions='["./extensions"]'
npm pkg set pi.skills='["./skills"]'

# Add pi core as peer deps (not bundled — pi provides these)
cd ../..
pnpm --filter @josorio/pi-crew add -D @mariozechner/pi-coding-agent @mariozechner/pi-tui @mariozechner/pi-ai @sinclair/typebox

# Add dev deps matching monorepo conventions
pnpm --filter @josorio/pi-crew add -D @types/node typescript tsx

# Create tsconfig.json extending monorepo base
# (write manually — no CLI for this, follows exa-search pattern)
```

`tsconfig.json` for pi-crew:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["extensions/**/*.ts", "skills/**/*.ts"]
}
```

Create directory structure:
```
packages/pi-crew/
├── extensions/pi-crew/
├── skills/{crew-explore,crew-design,crew-plan,crew-build,crew-review,crew-ship}/
├── references/prompts/
└── templates/
```

Add scripts:
```bash
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="eslint extensions/ skills/"
```

### Task 2: `profiles.ts` — Model profile resolution
- Define `ModelProfile` interface
- Define 3 profiles: quality, balanced, budget
- `resolveModel(profile, tier, overrides)` → concrete model string
- Export profile names and descriptions

### Task 3: `presets.ts` — Agent preset definitions
- Define `AgentPreset` interface (name, description, promptFile, tools, tier)
- Define 6 presets with metadata (prompt text lives in `references/prompts/*.md`, not in code)
- `formatPresetsForLLM(profile, overrides)` → markdown table (name, model, purpose) for system prompt injection
- `getPreset(name)` → preset object
- `resolvePreset(name, profile, overrides, packageRoot)` → `{ systemPrompt, tools, model }` — reads prompt file via `fs.readFileSync`, resolves model via profiles.ts

### Task 4: `state.ts` — .crew/ file management
- `readConfig()` / `writeConfig()` — `.crew/config.json`
- `readState()` → parse YAML frontmatter from `.crew/state.md`
- `readStateRaw()` → raw markdown string for LLM
- `ensureCrewDir()` — create `.crew/` and subdirs if missing
- `getPhaseDir(feature)` — `.crew/phases/<feature>/`
- `listFeatures()` — list feature directories
- Simple YAML frontmatter parser (split on `---` delimiters, parse key-value pairs)

### Task 5: `rendering.ts` — Inline DynamicBorder agent cards + formatting

**Inline agent cards (DynamicBorder verified in pi source — `tool-execution.js:330` adds renderResult output to `Box` via `addChild(Component)`, `DynamicBorder` implements `Component`):**
- `AgentRenderState` interface (preset, instance, task, status, elapsedMs, exitCode, messages, usage, model)
- `buildAgentCard(agent, expanded, showInstance, theme)` → `Container` with `DynamicBorder` borders, status header (●/✓/✗), tool calls, output
  - Running: shows ● with last tool call only
  - Done/Error: collapsed shows last ~5 tool calls + output preview; expanded shows all + markdown
- `buildRenderResult(details, { expanded, isPartial }, theme)` → `Container` with stacked agent cards + total usage footer
  - Handles single/parallel/chain modes
  - `isPartial: true`: live cards (some ●, some ✓)
  - `isPartial: false, expanded: false`: final cards (all ✓/✗) with tool history + expand hint via `keyHint("expandTools", "to expand")`
  - `isPartial: false, expanded: true`: cards with full tool history + markdown output
- Uses `DynamicBorder` from `@mariozechner/pi-coding-agent`, `Container`, `Markdown`, `Spacer`, `Text` from `@mariozechner/pi-tui`

**renderCall:**
- `buildRenderCall(args, theme)` → `Text` node — shows preset names + task previews for single/parallel/chain

**Formatting helpers (copied from dispatch-agent):**
- `formatTokens(count)` → "1.2k", "45", "1.3M"
- `formatUsageStats(usage, model?)` → "3 turns ↑1.2k ↓450 $0.0042 claude-haiku-4-5"
- `formatToolCall(toolName, args, themeFg)` → colored tool call preview
- `getDisplayItems(messages)` → extract text + toolCall items from Message[]
- `getFinalOutput(messages)` → last assistant text

### Task 6: `spawn.ts` — Agent spawn logic
- Copy spawn logic from dispatch-agent's `spawn.ts` (runSingleAgent, NDJSON parsing, concurrency limiter)
- Adapt to accept resolved preset args (systemPrompt, tools, model) instead of raw params
- Spawn flags: `--mode json`, `-p`, `--no-session`, `--no-extensions`, `--thinking <level>` (default "off", from params or preset)
  - `--no-extensions` is a **pi-crew design choice** to prevent recursive dispatch (the official subagent example does NOT use this — it relies on `--tools` to limit access). We use both mechanisms for defense in depth.
  - `--append-system-prompt <tempfile>` to append the preset's system prompt to pi's built-in system prompt (which contains tool usage instructions). Writes prompt to temp file, passes path, cleans up after. Matches official subagent pattern.
  - `--tools <list>` limits available tools to the preset's tool set
  - `--model <model>` sets the resolved model
- Concurrency limit via `DISPATCH_CREW_MAX_CONCURRENT` env var (default 4, max 8)
- **Callback contract**: `runSingleAgent` accepts an `onAgentUpdate(update: AgentUpdate)` callback. Called on every NDJSON event with: partial `messages[]`, `usage`, `exitCode` (-1 while running). The caller (`execute()` in index.ts) maps these updates onto `AgentRenderState` and re-emits via `onUpdate` (received as a parameter in execute, not on ctx).
- **Return type**: `SpawnResult` — `{ exitCode, messages, usage }` per agent. `execute()` builds final `AgentRenderState[]` from these.

### Task 7: `index.ts` — Extension entry point
- Register `dispatch_crew` tool via `pi.registerTool()`:
  - `parameters`: Single flat `Type.Object` with all fields optional (single/parallel/chain determined in execute) — same pattern as official subagent example. NOT `Type.Union` (doesn't work with Google API).
  - `execute(toolCallId, params, signal, onUpdate, ctx)`: Pi passes `onUpdate` as a separate param (for streaming partial results) and `ctx` with `ctx.cwd` (project dir) and `ctx.ui` (status bar). Flow: Validate params → resolve preset → read prompt file → resolve model → build `AgentRenderState[]` → call spawn.ts. Default `cwd` to `params.cwd || ctx.cwd`. For chain mode: replace `{previous}` in each step's task with prior agent's output. Spawn's `onAgentUpdate` callback updates `AgentRenderState` entries (status, elapsedMs, messages) → calls `onUpdate({ content, details: CrewDispatchDetails })` → pi re-renders via `renderResult(details, { isPartial: true })`. On completion: finalize all agent states → return `{ content, details, isError }`.
  - `renderCall()`: Show preset name(s) + task preview — delegates to rendering.ts
  - `renderResult()`: Show final output with usage stats — delegates to rendering.ts. Handles collapsed/expanded.
- `session_start`: read `.crew/config.json` via `readConfig(ctx.cwd)`, read `.crew/state.md` via `readState(ctx.cwd)` (parsed frontmatter for status bar — phase, progress), set initial status bar via `ctx.ui.setStatus("crew", text)`
- `before_agent_start`: build and inject crew system prompt (presets table + phase guide + state)
- Register commands: `/crew`, `/crew:profile`, `/crew:override`, `/crew:reset`, `/crew:status`
- Status bar via `ctx.ui.setStatus("crew", text)`: phase + profile (updated on state changes)

### Task 8: Skill files
Write all 6 phase skill files with full content as specified in section 6. No master routing skill — the injection prompt (section 5.1) handles phase selection and routing. Flat directories with hyphenated names per pi's skill naming rules.
- `skills/crew-explore/SKILL.md`
- `skills/crew-design/SKILL.md`
- `skills/crew-plan/SKILL.md`
- `skills/crew-build/SKILL.md`
- `skills/crew-review/SKILL.md`
- `skills/crew-ship/SKILL.md`

### Task 9: Reference files
- `references/model-profiles.md`
- `references/deviation-rules.md`
- `references/evaluation-gates.md`
- `references/prompts/scout.md` — full scout system prompt (from section 5.2)
- `references/prompts/researcher.md` — full researcher system prompt
- `references/prompts/architect.md` — full architect system prompt
- `references/prompts/executor.md` — full executor system prompt
- `references/prompts/reviewer.md` — full reviewer system prompt
- `references/prompts/debugger.md` — full debugger system prompt

### Task 10: Template files
- `templates/plan.md`
- `templates/task.md`
- `templates/spec.md`
- `templates/summary.md`

### Task 11: Integration testing
- Install pi-crew: `pi install ./packages/pi-crew`
- Verify `dispatch_crew` tool is registered and visible via `/tools`
- Test `dispatch_crew({ preset: "scout", task: "List files" })` — single mode
- Test `dispatch_crew({ tasks: [...] })` — parallel mode
- Test `dispatch_crew({ chain: [...] })` — chain mode with `{previous}` replacement
- Test invalid preset name → clear error message
- Test `/crew:profile` command switching
- Test `/crew:override` command
- Test system prompt injection contains preset table
- Test inline DynamicBorder cards render during parallel dispatch (one per agent)
- Test cards update live via renderResult(isPartial: true) as agents report progress
- Test final renderResult shows ✓/✗ cards with tool history + output
- Test error cards show error context
- Test Ctrl+O expands cards to full output with markdown rendering
- Test state.md reading/writing with YAML frontmatter
- Test full flow: "I want to add a README to this project"
- Test session resume: kill session, restart, verify state.md is read
- Test phase skill loading: `/skill:crew-explore` loads correctly

## 11. Resolved Questions

1. **Should `.crew/` be gitignored?** — NO. It's project context. Team members benefit from seeing decisions, plans, and progress.

2. **Should pi-crew work without dispatch-agent?** — YES. pi-crew is fully standalone. It registers its own `dispatch_crew` tool with its own spawn logic. dispatch-agent's `dispatch_agent` tool is a separate raw tool that can coexist but is not required.

3. **How does pi-crew interact with the user's existing AGENTS.md?** — Additive. The crew system prompt is appended via `before_agent_start`. Both coexist.

4. **What happens if the user says "just do it" without going through explore/design?** — The LLM assesses complexity per the injection prompt's phase selection guide (section 5.1). Trivial tasks skip to build with a single executor. Complex tasks go through all phases.

5. **Max parallel agents in build phase?** — `DISPATCH_CREW_MAX_CONCURRENT` env var (default 4, max 8). Same pattern as dispatch-agent but independent config.

6. **How does researcher access exa-search?** — Dispatched agents have pi's skill discovery built in. If exa-search is installed as a pi-package, the agent sees it in `available_skills` and can read the SKILL.md and use the scripts via bash. The researcher prompt just says "use the exa-search skill." No path resolution needed.

7. **How does the UI track individual agents in parallel mode?** — All inline via `renderResult`. During execution, `onUpdate` (the separate execute param) emits partial results → `renderResult(details, { isPartial: true })` renders `DynamicBorder` cards per agent with live status (●/✓/✗). After completion, `renderResult(details, { isPartial: false })` shows final cards with tool history + output. Ctrl+O expands cards to full markdown. Role is directly from `params.tasks[i].preset`.

8. **How is state.md parsed?** — YAML frontmatter (between `---` delimiters) for machine use (feature, phase, progress). Full markdown body passed unparsed to LLM. LLM maintains both when updating.
