# pi-gsd — User Guide & Behavioral Specification

## What is pi-gsd?

**pi-gsd** is a project management system for AI-assisted development. It sits between you and your AI coding agent, providing structure, memory, and orchestration so that large projects don't collapse into chaos.

Think of it as a **project manager that lives in your terminal**. You describe what you want to build, and pi-gsd breaks it into phases, creates detailed plans, dispatches specialized AI agents to execute each plan, verifies the results, and tracks everything in markdown files you can read and edit.

### The Problem It Solves

When you use an AI coding agent (pi, Claude Code, etc.) for anything beyond a quick fix, you hit these walls:

1. **Context amnesia** — The agent forgets what it was doing after context fills up or a new session starts
2. **No structure** — A 20-feature app gets built in random order with no plan
3. **Scope creep** — "Add auth" becomes "redesign the entire UX" mid-conversation
4. **Quality gaps** — No verification that what was built matches what was asked
5. **Resumption failure** — Can't pick up where you left off after closing the terminal

pi-gsd solves all of these with a **state machine** backed by markdown files. Every decision, plan, and result is written to disk. The AI reads these files to know exactly where it is and what to do next.

---

## How It Works — The Big Picture

### The Lifecycle

Every project goes through this lifecycle:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         PROJECT LIFECYCLE                            │
│                                                                      │
│  /skill:gsd-new-project                                             │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐         │
│  │Question │──▶│ Research  │──▶│ Define   │──▶│ Create   │         │
│  │  User   │   │ Domain   │   │ Require- │   │ Roadmap  │         │
│  │         │   │(optional)│   │  ments   │   │          │         │
│  └─────────┘   └──────────┘   └──────────┘   └──────────┘         │
│                                                    │                 │
│                         ┌──────────────────────────┘                 │
│                         ▼                                            │
│               ┌───────────────────────────────────────────┐         │
│               │          PER-PHASE CYCLE                   │         │
│               │  (repeats for each phase in the roadmap)   │         │
│               │                                            │         │
│               │  /skill:gsd-discuss-phase                  │         │
│               │  ┌──────────┐                              │         │
│               │  │ Discuss  │  Clarify gray areas          │         │
│               │  │  Phase   │  Lock decisions              │         │
│               │  └────┬─────┘                              │         │
│               │       │                                    │         │
│               │       ▼                                    │         │
│               │  /skill:gsd-plan-phase                     │         │
│               │  ┌──────────┐                              │         │
│               │  │  Plan    │  Research (opt.) → Create    │         │
│               │  │  Phase   │  plans → Verify plans        │         │
│               │  └────┬─────┘                              │         │
│               │       │                                    │         │
│               │       ▼                                    │         │
│               │  /skill:gsd-execute-phase                  │         │
│               │  ┌──────────┐                              │         │
│               │  │ Execute  │  Wave-based parallel         │         │
│               │  │  Phase   │  agent execution             │         │
│               │  └────┬─────┘                              │         │
│               │       │                                    │         │
│               │       ▼                                    │         │
│               │  /skill:gsd-verify-work                    │         │
│               │  ┌──────────┐                              │         │
│               │  │ Verify   │  Check deliverables          │         │
│               │  │  Work    │  against plan                │         │
│               │  └────┬─────┘                              │         │
│               │       │                                    │         │
│               │       ▼                                    │         │
│               │  Gap? ──YES──▶ /skill:gsd-plan-phase --gaps│         │
│               │   │                  (loop back)           │         │
│               │   NO                                       │         │
│               │   │                                        │         │
│               └───┼────────────────────────────────────────┘         │
│                   │                                                  │
│                   ▼ (after all phases)                               │
│  /skill:gsd-complete-milestone                                      │
│  ┌──────────┐                                                       │
│  │Complete  │  Archive, tag release, retrospective                  │
│  │Milestone │                                                       │
│  └──────────┘                                                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### What Gets Created on Disk

pi-gsd stores everything in a `.planning/` directory at your project root:

```
your-project/
├── src/                          # Your code (pi-gsd doesn't touch this directly)
├── .planning/                    # All GSD state lives here
│   ├── PROJECT.md                # What you're building (vision, goals, constraints)
│   ├── REQUIREMENTS.md           # v1 requirements with REQ-IDs (AUTH-01, FEED-02, etc.)
│   ├── ROADMAP.md                # Phase breakdown with progress tracking
│   ├── STATE.md                  # Current position in the lifecycle (the state machine)
│   ├── config.json               # Workflow preferences (mode, depth, parallelization, etc.)
│   ├── research/                 # Domain research (if enabled)
│   │   ├── STACK.md              # Technology recommendations
│   │   ├── FEATURES.md           # Feature landscape analysis
│   │   ├── ARCHITECTURE.md       # System architecture patterns
│   │   ├── PITFALLS.md           # Common mistakes to avoid
│   │   └── SUMMARY.md            # Synthesized recommendations
│   ├── phases/
│   │   ├── 01-authentication/    # One directory per phase
│   │   │   ├── 01-CONTEXT.md     # Decisions from discuss-phase
│   │   │   ├── 01-RESEARCH.md    # Phase-specific research
│   │   │   ├── 01-1-PLAN.md      # First plan (tasks, files, verification)
│   │   │   ├── 01-1-SUMMARY.md   # What the executor actually did
│   │   │   ├── 01-2-PLAN.md      # Second plan (parallel with plan 1 if no deps)
│   │   │   ├── 01-2-SUMMARY.md   # What the executor actually did
│   │   │   ├── 01-VERIFICATION.md # Verifier's assessment (pass/gaps)
│   │   │   └── 01-UAT.md         # User acceptance test results
│   │   ├── 02-user-feed/
│   │   │   └── ...
│   │   └── 03-notifications/
│   │       └── ...
│   ├── quick/                    # Ad-hoc quick tasks
│   │   └── 001-fix-login-bug/
│   │       ├── 001-PLAN.md
│   │       └── 001-SUMMARY.md
│   ├── todos/                    # Task tracking
│   ├── milestones/               # Archived milestones
│   └── codebase/                 # Codebase map (brownfield projects)
└── .pi/
    └── agents/                   # GSD agent definitions (installed by /gsd-setup)
        ├── gsd-executor.md
        ├── gsd-planner.md
        └── ...
```

### The State Machine

`STATE.md` is the brain. It tracks:

```markdown
---
gsd_state_version: "1.0"
current_phase: "2"
current_phase_name: "user-feed"
current_plan: "1"
status: "executing"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 12
  completed_plans: 4
  percent: 33
---

# Project State

**Current Phase:** 2
**Current Phase Name:** User Feed
**Current Plan:** 1
**Total Plans in Phase:** 3
**Status:** Executing
**Progress:** [████░░░░░░] 33%
**Last Activity:** 2026-02-28
```

Every command reads STATE.md first. Every command updates STATE.md when done. This is how the system knows where you are, even across sessions, context compactions, and terminal restarts.

---

## User Journey — Step by Step

### 1. Installation & Setup

```bash
# Install the package
pi install npm:@josorio/pi-gsd

# Set up agents in your project
cd your-project
/gsd-setup
# → Installs 11 agent definitions to .pi/agents/gsd-*.md
```

After setup, you have:
- **31 skill commands** (`/skill:gsd-*`) available in pi
- **8 tools** (`gsd_init`, `gsd_state`, etc.) the LLM can call
- **11 agents** ready for subagent dispatch
- **Context monitor** watching your token usage
- **Statusline** showing current GSD state in pi's footer

### 2. Start a New Project

```
You: /skill:gsd-new-project
```

**What happens:**

1. **Checks your environment** — git initialized? existing code? already set up?

2. **Asks you what you want to build** — This is a deep conversation, not a form. The agent asks probing questions:
   - "What do you want to build?"
   - "What problem does this solve?"
   - "Who uses it?"
   - "What should it look/feel like?"
   - "What's already decided vs open?"

   It follows threads. If you say "a social app for dogs," it asks what "social" means for dogs, what the core interaction is, whether it's mobile-first, etc. It challenges vagueness and makes abstract ideas concrete.

   This continues until the agent could write a clear project description. Then it asks: **"Ready to create PROJECT.md?"**

3. **Offers domain research** (optional) — Spawns 4 parallel researcher agents:
   - **Stack researcher** — "What's the 2025 standard stack for this?"
   - **Features researcher** — "What features do products like this have?"
   - **Architecture researcher** — "How are these systems typically structured?"
   - **Pitfalls researcher** — "What do projects like this commonly get wrong?"

   Then a **synthesizer agent** merges the 4 reports into recommendations.

4. **Defines requirements** — Presents features by category. You select what's in v1, what's deferred, what's out of scope. Each requirement gets an ID (AUTH-01, FEED-02).

5. **Creates a roadmap** — Spawns a **roadmapper agent** that:
   - Derives phases from requirements
   - Maps every requirement to exactly one phase
   - Creates 2-5 observable success criteria per phase
   - Validates 100% requirement coverage

6. **You approve the roadmap** — Review the phase breakdown, adjust if needed.

7. **Writes everything to disk** — `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json` are created and committed.

**Auto mode:** `/skill:gsd-new-project --auto @prd.md` skips the deep questioning, extracts context from your document, and auto-approves through the entire flow.

**What you have after this step:**
- A clear project definition
- Categorized requirements with IDs
- A phased roadmap with success criteria
- State tracking initialized
- Ready to start Phase 1

### 3. Discuss a Phase

```
You: /skill:gsd-discuss-phase 1
```

**What happens:**

1. **Scans your codebase** (if code exists) — Quick grep for relevant patterns, components, hooks. Identifies what's reusable.

2. **Analyzes gray areas** — Based on the phase goal, identifies decisions that could go multiple ways. These are always phase-specific, not generic:
   - Phase "User Authentication" → session handling, error responses, multi-device policy, recovery flow
   - Phase "Post Feed" → layout style, loading behavior, content ordering, post metadata

3. **You pick what to discuss** — Presented as a multiselect. Pick the areas you care about.

4. **Deep-dives each area** — For each selected area, asks 4 focused questions with concrete options:
   ```
   How should posts be displayed?
   ☐ Cards (reuses existing Card component — consistent with Messages)
   ☐ List (simpler, would be a new pattern)
   ☐ Timeline (needs new Timeline component — none exists yet)
   ☐ You decide (Claude's discretion)
   ```

5. **Writes CONTEXT.md** — Captures all decisions, code context, and deferred ideas.

**Scope guardrail:** If you suggest adding a feature that's not in this phase, the agent redirects:
> "[Feature X] would be a new capability — that's its own phase. Want me to note it for the roadmap backlog? For now, let's focus on [phase domain]."

**What you have after this step:**
- `CONTEXT.md` with locked decisions
- Downstream agents (researcher, planner) know exactly what you want

### 4. Plan a Phase

```
You: /skill:gsd-plan-phase 1
```

**What happens:**

1. **Optional research** — If enabled, spawns a **phase-researcher agent** to investigate the specific technical needs of this phase. Creates `RESEARCH.md`.

2. **Spawns the planner agent** — Reads CONTEXT.md + RESEARCH.md + ROADMAP.md. Creates one or more PLAN.md files. Each plan has:
   - YAML frontmatter: `phase`, `plan_number`, `title`, `depends_on`, `estimated_tasks`
   - Sections: `must_have`, `nice_to_have`, `out_of_scope`
   - Numbered task list with file-level scope and verification steps

3. **Plan verification loop** — If plan-checking is enabled, spawns a **plan-checker agent** that validates:
   - Are tasks specific enough? (file paths, not vague descriptions)
   - Is scope appropriate? (not too big, not too small)
   - Are dependencies correct?
   - Are success criteria testable?

   If the checker rejects: feedback goes back to planner → planner revises → checker re-checks. Max 3 iterations.

4. **Writes PLAN.md files** — One per logical unit of work. Plans with no dependencies on each other are grouped into the same "wave" for parallel execution.

**What you have after this step:**
- One or more PLAN.md files with specific, testable tasks
- Plans validated by an independent checker
- Wave grouping ready for parallel execution

### 5. Execute a Phase

```
You: /skill:gsd-execute-phase 1
```

**This is where code gets written.** This is the most sophisticated step.

**What happens:**

1. **Discovers all plans** — Reads PLAN.md files, extracts `depends_on` frontmatter.

2. **Groups into waves** — Plans that don't depend on each other go in the same wave. Plans that depend on earlier plans go in later waves.

   ```
   Wave 1: Plan 1-1 (auth model) ‖ Plan 1-2 (login API)    ← parallel
   Wave 2: Plan 1-3 (auth middleware)                        ← depends on 1-1 + 1-2
   Wave 3: Plan 1-4 (session management)                     ← depends on 1-3
   ```

3. **Executes each wave:**
   - **Single plan in wave** → spawns one **executor agent**
   - **Multiple plans in wave** → spawns executor agents **in parallel**

   Each executor agent:
   - Reads the PLAN.md
   - Implements each task
   - **Commits each task atomically** (one commit per task)
   - Handles deviations with 4 rules:
     1. Auto-fix bugs encountered
     2. Auto-add missing critical functionality
     3. Auto-fix blocking issues (dependency errors, config)
     4. **ASK about architectural changes** — never makes them silently
   - Writes SUMMARY.md with what was actually done

4. **Integration check** — After waves with multiple parallel plans, spawns an **integration-checker agent** to verify no conflicts.

5. **Verification** — If enabled, spawns a **verifier agent** that checks all must-haves against the actual codebase. Creates VERIFICATION.md with:
   - Per-deliverable pass/fail
   - Gap analysis (what's missing, what was added, what deviated)

6. **Gap closure** — If gaps are found, you can run `/skill:gsd-plan-phase 1 --gaps` to create fix plans, then re-execute.

**Resumption:** If execution is interrupted (context full, terminal closed), re-running `/skill:gsd-execute-phase 1` **skips completed plans** (those with SUMMARY.md) and resumes from the first incomplete plan.

**What you have after this step:**
- Code implemented and committed (one commit per task)
- SUMMARY.md per plan documenting what was done
- VERIFICATION.md confirming completeness
- STATE.md tracking progress

### 6. Verify Work

```
You: /skill:gsd-verify-work 1
```

**What happens:**

1. **Extracts testable deliverables** from PLAN.md + SUMMARY.md
2. **Walks you through each one** — one at a time, you mark pass/fail
3. **On failure** — spawns a **debugger agent** for systematic diagnosis
4. **Writes UAT.md** with results

### 7. Complete the Milestone

After all phases pass:

```
You: /skill:gsd-complete-milestone
```

Archives the milestone, tags a release, creates a retrospective, and optionally squash-merges.

### 8. Quick Tasks

For ad-hoc work outside the roadmap:

```
You: /skill:gsd-quick Fix the login timeout bug
```

Spawns planner → executor in fast mode. Tracked in `.planning/quick/` with its own numbering. Doesn't interfere with the main phase workflow.

`--full` flag adds plan-checking + verification for higher quality.

---

## The Agent Roster

pi-gsd has 11 specialized agents. Each runs in an isolated subagent with fresh context (200K tokens).

| Agent | Model | When It Runs | What It Does |
|-------|-------|-------------|--------------|
| **gsd-executor** | Sonnet | execute-phase, quick | Implements PLAN.md tasks with atomic commits. Follows 4 deviation rules. Creates SUMMARY.md. |
| **gsd-planner** | Opus | plan-phase, quick | Creates PLAN.md from requirements. Must-have/nice-to-have/out-of-scope structure. Task-level file scope. |
| **gsd-verifier** | Sonnet | execute-phase (after) | Checks execution against plan. Scores deliverables. Identifies gaps. Creates VERIFICATION.md. |
| **gsd-plan-checker** | Sonnet | plan-phase (after plan) | Validates plan quality. Rejects vague, oversized, or underscoped plans. Loops until pass. |
| **gsd-project-researcher** | Sonnet | new-project | Researches stack, features, architecture, pitfalls. 4 parallel instances for different dimensions. |
| **gsd-phase-researcher** | Sonnet | plan-phase | Researches specific to phase technical needs (libraries, APIs, patterns). |
| **gsd-research-synthesizer** | Sonnet | new-project (after research) | Merges 4 research reports into actionable recommendations. |
| **gsd-roadmapper** | Opus | new-project | Creates ROADMAP.md. Derives phases from requirements. 100% coverage validation. |
| **gsd-codebase-mapper** | Sonnet | map-codebase | Maps existing codebase structure for brownfield projects. |
| **gsd-debugger** | Sonnet | verify-work (on failure), debug | Systematic: reproduce → isolate → diagnose → fix → verify. |
| **gsd-integration-checker** | Sonnet | execute-phase (after parallel waves) | Checks interface compatibility and shared state consistency after parallel execution. |

**Why agents and not just prompts?** Each agent runs in a **fresh 200K context window**. The orchestrator (your main session) stays lean (~10-15% context usage) while agents get the full window for deep work. This is why pi-gsd can handle projects that would fill a single context many times over.

---

## The Tool Set

Instead of a CLI script, pi-gsd exposes 8 tools that the LLM calls directly:

| Tool | What It Does | Used By |
|------|-------------|---------|
| `gsd_init` | Project/phase/milestone initialization, environment detection | new-project, plan-phase, execute-phase |
| `gsd_state` | STATE.md CRUD — load, get, patch, advance plan, record metrics, manage blockers | Everything |
| `gsd_phase` | Phase operations — list, add, remove, insert, plan index, wave grouping | plan-phase, execute-phase, add-phase |
| `gsd_roadmap` | ROADMAP.md parsing — phase extraction, requirement mapping | discuss-phase, plan-phase |
| `gsd_config` | Config.json CRUD, model profile resolution | settings, set-profile, new-project |
| `gsd_milestone` | Milestone operations — complete, archive, list | complete-milestone, new-milestone |
| `gsd_verify` | Health checks, structure validation | health, verify-work |
| `gsd_util` | Timestamps, slugs, template rendering, frontmatter parsing | Various |

These replace the upstream `gsd-tools.cjs` CLI. Same operations, but type-safe TypeScript running in-process instead of shelling out to Node.

---

## Configuration

### Model Profiles

Control which AI models agents use:

| Profile | Planning (planner, roadmapper) | Execution (executor) | Verification | Research |
|---------|-------------------------------|---------------------|-------------|----------|
| **quality** | Opus | Opus | Sonnet | Sonnet |
| **balanced** (default) | Opus | Sonnet | Sonnet | Sonnet |
| **budget** | Sonnet | Sonnet | Haiku | Haiku |

Set with `/skill:gsd-set-profile balanced` or during project initialization.

### Workflow Preferences

Set during `/skill:gsd-new-project` or change anytime with `/skill:gsd-settings`:

| Setting | Options | Default | Effect |
|---------|---------|---------|--------|
| Mode | interactive / yolo | interactive | YOLO skips confirmation gates |
| Depth | quick / standard / comprehensive | standard | Controls phase count and plan granularity |
| Parallelization | on / off | on | Parallel plan execution within waves |
| Research | on / off | on | Research before planning each phase |
| Plan Check | on / off | on | Verify plan quality before execution |
| Verifier | on / off | on | Verify execution results after each phase |
| Commit Docs | on / off | on | Track .planning/ in git |

### Gates

In interactive mode, these confirmation points protect you:

| Gate | When | What You See |
|------|------|-------------|
| Confirm project | After PROJECT.md draft | "Does this capture what you're building?" |
| Confirm requirements | After requirement scoping | "Does this capture v1?" |
| Confirm roadmap | After roadmap creation | "Does this phase breakdown work?" |
| Confirm plan | After plan creation | "Ready to execute?" |
| Execute next plan | Between plans | "Continue with next plan?" |
| Confirm transition | Between phases | "Move to next phase?" |

In **YOLO mode**, all gates auto-approve. You trust the system and review at the end.

---

## Complete Command Reference

### Core Workflow (the main loop)

| Command | Description |
|---------|-------------|
| `/skill:gsd-new-project` | Initialize project: questioning → research → requirements → roadmap |
| `/skill:gsd-discuss-phase N` | Clarify implementation decisions for phase N |
| `/skill:gsd-plan-phase N` | Create execution plans for phase N |
| `/skill:gsd-execute-phase N` | Execute plans with parallel agent dispatch |
| `/skill:gsd-verify-work N` | User acceptance testing for phase N |
| `/skill:gsd-complete-milestone` | Archive milestone, tag release |
| `/skill:gsd-new-milestone` | Start a new milestone cycle |
| `/skill:gsd-transition` | Handle phase-to-phase transition |
| `/skill:gsd-discovery-phase N` | Discovery/exploration for a phase |

### Navigation & Session

| Command | Description |
|---------|-------------|
| `/skill:gsd-progress` | Show status, recent work, and smart next-action routing |
| `/skill:gsd-help` | List all GSD commands |
| `/skill:gsd-pause-work` | Save execution state for resumption |
| `/skill:gsd-resume-work` | Restore from saved state |
| `/skill:gsd-quick [description]` | Fast plan+execute for ad-hoc tasks |

### Phase Management

| Command | Description |
|---------|-------------|
| `/skill:gsd-add-phase` | Add a new phase to roadmap |
| `/skill:gsd-insert-phase` | Insert phase between existing phases |
| `/skill:gsd-remove-phase` | Remove a phase (with renumbering) |
| `/skill:gsd-list-phase-assumptions` | Show assumptions in current plans |
| `/skill:gsd-plan-milestone-gaps` | Create fix plans from verification gaps |
| `/skill:gsd-research-phase` | Run research for a specific phase |

### Configuration

| Command | Description |
|---------|-------------|
| `/skill:gsd-settings` | Interactive configuration editor |
| `/skill:gsd-set-profile` | Set model profile (quality/balanced/budget) |

### Utility

| Command | Description |
|---------|-------------|
| `/skill:gsd-map-codebase` | Map existing codebase (brownfield) |
| `/skill:gsd-debug` | Systematic debugging with state capture |
| `/skill:gsd-add-todo` | Add a todo item |
| `/skill:gsd-check-todos` | Review pending todos |
| `/skill:gsd-add-tests` | Generate tests for existing code |
| `/skill:gsd-cleanup` | Clean up .planning/ directory |

### Validation & Meta

| Command | Description |
|---------|-------------|
| `/skill:gsd-health` | Health check of .planning/ structure |
| `/skill:gsd-audit-milestone` | Audit milestone against definition of done |
| `/skill:gsd-update` | Sync from upstream GSD |

---

## Key Concepts

### Wave-Based Parallel Execution

Plans declare dependencies via `depends_on` in YAML frontmatter. The system groups plans into "waves":

```yaml
# Plan 01-1: No dependencies → Wave 1
depends_on: []

# Plan 01-2: No dependencies → Wave 1 (parallel with 01-1)
depends_on: []

# Plan 01-3: Depends on plan 1 → Wave 2
depends_on: [1]

# Plan 01-4: Depends on plans 1 and 3 → Wave 3
depends_on: [1, 3]
```

Result:
```
Wave 1: [Plan 01-1] ‖ [Plan 01-2]   ← parallel
Wave 2: [Plan 01-3]                   ← after wave 1
Wave 3: [Plan 01-4]                   ← after wave 2
```

Each plan in a wave gets its own executor agent with a fresh context window.

### Context Efficiency

The orchestrator (your main pi session) stays at ~10-15% context usage. It:
- Calls tools to read state (not reading full files)
- Passes file paths to agents (agents read them with fresh context)
- Receives structured results (not raw output)

This means **you can manage a 50-phase project from a single pi session** that never runs out of context.

### Atomic Commits

Every task in every plan produces its own git commit. If execution is interrupted, you have clean commits for everything completed. No half-done work, no merge conflicts, no "works on my machine."

### The 4 Deviation Rules (Executor)

When an executor agent encounters something unexpected:
1. **Auto-fix bugs** — Fix bugs discovered during implementation without asking
2. **Auto-add critical missing functionality** — If something is clearly needed and missing, add it
3. **Auto-fix blocking issues** — Dependency errors, config problems, etc.
4. **ASK about architectural changes** — Never silently change the architecture

### Resumption

Every step writes state to disk. If you close the terminal, run out of context, or your laptop dies:

```
You: /skill:gsd-progress
```

This reads STATE.md, figures out where you are, and tells you exactly what to do next. Then:

```
You: /skill:gsd-execute-phase 2
```

Re-running execute-phase skips plans that have SUMMARY.md (already done) and resumes from the first incomplete plan.

For mid-plan interruptions, `/skill:gsd-pause-work` saves detailed state to CONTINUE-HERE.md, and `/skill:gsd-resume-work` restores from it.

### Context Monitor

The extension watches your context usage on every turn. When it gets high:
- **35% remaining** → 🟡 WARNING: "Begin wrapping up. Consider /skill:gsd-pause-work."
- **25% remaining** → 🔴 CRITICAL: "STOP new work. Save state NOW."

This prevents the dreaded "context full, everything lost" scenario.

---

## Greenfield vs. Brownfield

### Greenfield (New Project)

```
/skill:gsd-new-project
```

Starts from scratch: questioning → research → requirements → roadmap.

### Brownfield (Existing Codebase)

```
/skill:gsd-map-codebase    # First: understand what exists
/skill:gsd-new-project     # Then: define what you're adding
```

`map-codebase` spawns parallel mapper agents that analyze your existing code:
- Directory structure and component inventory
- Tech stack and dependencies
- Established patterns (state management, styling, etc.)
- Integration points

When you then run `new-project`, it detects the codebase map and:
- Pre-populates "validated" requirements from existing functionality
- Focuses questioning on what you're **adding**, not what exists
- Roadmap phases only cover new work

---

## Example Session

Here's what a real session looks like:

```
$ pi
> /gsd-setup
✓ GSD agents: 11 installed (11 total)

> /skill:gsd-new-project

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What do you want to build?

> A recipe sharing app where people can post recipes, follow cooks, and save
> favorites. Mobile-first, React Native.

Interesting! Let me dig into this.

When you say "follow cooks" — is this like Instagram following (see their posts
in a feed) or more like subscribing (get notified of new recipes)?

> More like Instagram. I want a feed of recipes from people you follow.

Got it — a social feed model. What about the recipes themselves — text only,
or do photos matter?

> Photos are essential. Step-by-step with photos for each step.

...

(15 minutes of deep questioning later)

Ready to create PROJECT.md? [Create PROJECT.md] / [Keep exploring]

> Create PROJECT.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 4 researchers in parallel...
  → Stack research
  → Features research
  → Architecture research
  → Pitfalls research

(researchers complete)

## Key Findings
Stack: React Native + Expo, Supabase backend, Zustand state
Table Stakes: Search, categories, step-by-step editor
Watch Out For: Image upload performance, offline recipe viewing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Authentication
☑ Sign up with email
☑ Login / session management
☐ OAuth (Google)          ← deferred to v2
☐ Magic link login        ← out of scope

## Recipes
☑ Create recipe with steps + photos
☑ Edit own recipes
☑ Browse/search recipes
☐ AI recipe suggestions   ← out of scope

...

(creates REQUIREMENTS.md with 28 v1 requirements across 6 categories)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...

## Proposed Roadmap

5 phases | 28 requirements mapped | All v1 requirements covered ✓

| # | Phase           | Goal                        | Requirements |
|---|-----------------|-----------------------------|-------------|
| 1 | Authentication  | Users can sign up and log in | AUTH-01..03 |
| 2 | Recipe CRUD     | Users can create/edit recipes | REC-01..06 |
| 3 | Social Feed     | Follow cooks, see their recipes | FEED-01..05 |
| 4 | Search & Discovery | Find recipes by various criteria | SRCH-01..04 |
| 5 | Favorites & Collections | Save and organize recipes | FAV-01..03 |

[Approve] / [Adjust phases]

> Approve

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RecipeShare | 5 phases | 28 requirements | Ready to build ✓

▶ Next Up: /skill:gsd-discuss-phase 1

> /skill:gsd-discuss-phase 1

(discusses authentication decisions — session strategy, error handling, etc.)

> /skill:gsd-plan-phase 1

(creates 2 plans, plan-checker validates, both pass)

> /skill:gsd-execute-phase 1

## Execution Plan
Phase 1: Authentication — 2 plans across 2 waves

Wave 1: [Plan 01-1 (user model + auth API)] ‖ [Plan 01-2 (login/signup screens)]
Wave 2: [Plan 01-3 (session middleware)]      ← depends on 01-1

◆ Spawning 2 executors for Wave 1...

(code gets written, tests pass, commits made)

Wave 1 Complete ✓
Plan 01-1: User model with Supabase, auth endpoints, JWT handling
Plan 01-2: Login/signup screens with form validation, error states

◆ Spawning 1 executor for Wave 2...

Wave 2 Complete ✓
Plan 01-3: Auth middleware, session refresh, protected routes

◆ Spawning verifier...

## Phase 1: Authentication — Verification
Score: 8/8 must-haves verified ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE 1 COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Next Up: /skill:gsd-discuss-phase 2 — Recipe CRUD
```

---

## Differences from Upstream GSD

| Aspect | GSD (Claude Code) | pi-gsd |
|--------|-------------------|--------|
| Commands | `/gsd:command` (Claude Code commands) | `/skill:gsd-command` (pi skills) |
| CLI tool | `gsd-tools.cjs` (shell out to Node) | Pi tools (`gsd_state`, etc. — in-process) |
| Agent dispatch | `Task(...)` | `subagent(agent: ..., agentScope: "project")` |
| Agent discovery | `~/.claude/agents/` | `.pi/agents/` (project-local) |
| State directory | `.planning/` | `.planning/` (same) |
| Hooks | Claude Code hooks (JS files) | Pi extension events (`turn_end`, `session_start`) |
| Context monitor | Bridge file chain | `ctx.getContextUsage()` (pi-native API) |
| Model config | Claude Code model strings | Pi model strings (`anthropic/claude-sonnet-4`) |
| File includes | `@~/.claude/...` syntax | `read` tool with resolved paths |
| Installation | `npm install -g get-shit-done-cc` | `pi install npm:@josorio/pi-gsd` |

**What's identical:**
- The workflow lifecycle (question → research → require → roadmap → discuss → plan → execute → verify)
- File formats (.planning/ structure, PLAN.md, STATE.md, etc.)
- Agent behavioral contracts (what each agent does and how)
- Wave-based parallel execution
- 4 deviation rules
- Context monitoring thresholds
- Configuration options and gates
