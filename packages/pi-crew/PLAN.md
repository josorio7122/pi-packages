# Plan: Pi-Crew Workflow Enforcement

## Problem

Pi-crew's workflow phases (explore → design → plan → build → review → ship) don't execute.
The LLM sees the phase vocabulary in the system prompt, mentions "waves" and "parallel work,"
but only dispatches a single scout and stops. Three root causes:

1. **Skills never loaded** — LLM is told to `/skill:crew-explore` but doesn't. Pi's own docs say "models don't always do this."
2. **System prompt gives escape hatch** — "Phase selection is YOUR judgment" lets the LLM rationalize skipping everything.
3. **No follow-through enforcement** — Nothing stops the LLM from finishing after one dispatch.

## Solution

Three enforcement layers:

1. **State-driven skill injection** — Extension reads `state.md`, reads current phase's SKILL.md from disk, injects it into system prompt via `before_agent_start`. LLM never needs to load skills manually.
2. **Workflow commitment** — `state.md` gets a `workflow` field declaring which phases this feature will go through. Once committed, the extension tracks progress.
3. **Agent-end nudge** — `agent_end` hook checks if workflow is incomplete. If so, sends `pi.sendMessage()` with `triggerTurn: true` to force the LLM to continue.

## Architecture

### Idle Mode (no `state.md`)

System prompt includes:
- Presets table (models, tools, purpose)
- Dispatch syntax (single/parallel/chain)
- Brief guidance on when to start a workflow vs. dispatch directly
- No skill content injected

### Active Mode (`state.md` exists with workflow)

System prompt includes:
- Progress bar: `explore ✓ → design ✓ → **plan** → build → review → ship`
- Enforcement: "You MUST complete this workflow. Follow the phase instructions below."
- FULL content of current phase's SKILL.md (read from disk by extension)
- No escape hatches

### Agent-End Nudge

After each agent turn:
- Read `state.md` → check if workflow is complete (current phase = last in workflow)
- If incomplete → `pi.sendMessage({ content: "Continue workflow...", display: true }, { triggerTurn: true, deliverAs: "followUp" })`
- Guard: `nudgedThisCycle` flag, reset on user input via `user_message` event

---

## Tasks

### Wave 1: State Layer (pure functions + filesystem)

**Task 1: Add `workflow` field to state parsing**

File: `extensions/pi-crew/state.ts`

- Add `workflow: string[] | null` to `CrewState` interface
- Update `parseFrontmatter()` to parse `workflow: explore,design,plan,build,review,ship` → string array
- Add helper: `isWorkflowComplete(state: CrewState): boolean` — true when `phase` equals last item in `workflow`
- Add helper: `getWorkflowProgress(state: CrewState): string` — returns `explore ✓ → design ✓ → **plan** → build → review → ship`
- Export `parseFrontmatter` (already done)

Tests (write FIRST — TDD):
```
state.test.ts additions:
- parseFrontmatter with workflow field → string array
- parseFrontmatter without workflow field → null
- parseFrontmatter with single-phase workflow → ["build"]
- isWorkflowComplete: phase matches last workflow item → true
- isWorkflowComplete: phase is mid-workflow → false
- isWorkflowComplete: no workflow field → true (no enforcement)
- getWorkflowProgress: renders progress string with ✓ and bold markers
- getWorkflowProgress: all phases done
- getWorkflowProgress: no workflow → empty string
```

**Task 2: Add skill content reader**

File: `extensions/pi-crew/state.ts` (or new file `extensions/pi-crew/skills.ts`)

- Add function: `readPhaseSkill(packageRoot: string, phase: string): string | null`
  - Maps phase name to skill file: `skills/crew-${phase}/SKILL.md`
  - Reads file content, returns null if not found
  - Strips YAML frontmatter (return only the body — the LLM doesn't need the metadata)

Tests (write FIRST):
```
- readPhaseSkill with valid phase + real package root → returns skill content (no frontmatter)
- readPhaseSkill with unknown phase → null
- readPhaseSkill strips frontmatter correctly
```

### Wave 2: System Prompt Rewrite

**Task 3: Rewrite `buildCrewPrompt()` — split into idle/active modes**

File: `extensions/pi-crew/index.ts`

Extract prompt builders into testable functions (new file or same file):

- `buildIdlePrompt(presetDocs: string): string` — presets table + dispatch syntax + workflow start guidance
- `buildActivePrompt(presetDocs: string, state: CrewState, skillContent: string): string` — enforcement header + progress bar + full skill content
- `buildCrewPrompt(presetDocs: string, state: CrewState | null, skillContent: string | null): string` — routes to idle or active

Idle prompt content:
```markdown
## Crew — Agentic Workflow Orchestration

You have access to `dispatch_crew` which spawns specialized agents.

### Available Agent Presets
{presetDocs}

### Dispatch Syntax
{single/parallel/chain examples}

### When to Use a Workflow

Start a structured workflow when the task involves:
- 3+ files to create or modify
- New features or architectural changes
- The user explicitly asks for a structured approach

To start a workflow, write `.crew/state.md`:
\`\`\`yaml
---
feature: {feature-name}
phase: explore
workflow: explore,design,plan,build,review,ship
---
\`\`\`

For simpler tasks (bug fix, config change, documentation), dispatch agents directly without a workflow.

### Workflow Shortcuts

Not every task needs all 6 phases. Choose the right subset:

| Scope | Workflow | When |
|-------|----------|------|
| Full | explore,design,plan,build,review,ship | New features, architectural changes |
| Standard | explore,plan,build,review,ship | Clear scope, no design debate needed |
| Quick | explore,build,ship | Small feature, obvious implementation |
| Minimal | build,ship | Bug fix, config change, documentation |
```

Active prompt content:
```markdown
## ⚠️ ACTIVE WORKFLOW: "{feature}"

{progressBar}

You MUST complete this workflow. Do NOT start unrelated work.
Do NOT skip phases. Follow the instructions below for the current phase.

### Current Phase: {phase}

{full SKILL.md content for this phase}
```

Tests (write FIRST):
```
- buildIdlePrompt includes presets table
- buildIdlePrompt includes workflow start guidance
- buildIdlePrompt includes dispatch syntax
- buildIdlePrompt does NOT include enforcement language
- buildActivePrompt includes enforcement header with feature name
- buildActivePrompt includes progress bar
- buildActivePrompt includes full skill content
- buildActivePrompt includes "MUST complete" language
- buildCrewPrompt routes to idle when state is null
- buildCrewPrompt routes to active when state has workflow
- buildCrewPrompt routes to idle when state has no workflow field (backwards compat)
```

**Task 4: Update `before_agent_start` hook**

File: `extensions/pi-crew/index.ts`

- Read `state.md` → parse state
- If state has workflow → read current phase skill from disk → build active prompt
- If no state or no workflow → build idle prompt
- Inject into system prompt

No separate tests — this is the wiring between tested functions. Verified by integration tests.

### Wave 3: Enforcement Hooks

**Task 5: Add `agent_end` nudge**

File: `extensions/pi-crew/index.ts`

- Track `nudgedThisCycle: boolean` (module-level variable)
- On `user_message` event → reset `nudgedThisCycle = false`
- On `agent_end` event:
  - Read `state.md` → parse state
  - If no state or no workflow → return (no enforcement)
  - If `isWorkflowComplete(state)` → return (done)
  - If `nudgedThisCycle` → return (already nudged)
  - Set `nudgedThisCycle = true`
  - Build nudge message: current phase, what's next, instruction to continue
  - `pi.sendMessage({ customType: "crew-nudge", content: nudgeText, display: true }, { triggerTurn: true, deliverAs: "followUp" })`

Nudge message format:
```
⚠️ Workflow in progress: "{feature}" — phase: {phase}
{progressBar}
Continue with the current phase. The instructions are in your system prompt.
```

Tests (write FIRST):
```
- buildNudgeMessage includes feature name
- buildNudgeMessage includes progress bar
- buildNudgeMessage includes "Continue" instruction
```

Note: The actual `pi.sendMessage()` call can't be unit tested (framework API). 
But extracting `buildNudgeMessage()` as a pure function lets us test the content.

**Task 6: Add `user_message` event to reset nudge guard**

File: `extensions/pi-crew/index.ts`

```typescript
pi.on("user_message", async () => {
  nudgedThisCycle = false;
});
```

No separate test — trivial wiring. Verified by integration tests.

### Wave 4: Skill Updates

**Task 7: Update all 6 skill files with `workflow` field in state instructions**

Files: `skills/crew-{explore,design,plan,build,review,ship}/SKILL.md`

Each skill's "Update State" section currently says:
```
Write `.crew/state.md` with phase: explore, feature name, and exploration summary.
```

Update to:
```
Update `.crew/state.md` — advance `phase` to the next phase in your workflow:

\`\`\`yaml
---
feature: {feature-name}
phase: {next-phase}
workflow: {keep the same workflow from before}
---
\`\`\`
```

The explore skill is special — it's the first phase, so it also needs to say:
```
If `.crew/state.md` doesn't exist yet, create it with your chosen workflow.
```

No code tests — these are documentation changes. Verified by integration tests.

### Wave 5: Integration Tests

**Task 8: End-to-end workflow enforcement tests**

File: `extensions/pi-crew/__tests__/workflow.test.ts`

These tests verify the full enforcement pipeline by spawning real `pi` subprocesses
with the pi-crew extension installed.

```
Test 1: Idle mode — no state.md
  - Spawn pi with a simple task: "Reply with the word IDLE if you see dispatch_crew in your tools"
  - Verify: output contains "IDLE" (tool is available)
  - Verify: no .crew/ directory created

Test 2: Active mode — state.md exists with workflow  
  - Create .crew/state.md with: feature: test, phase: explore, workflow: explore,build,ship
  - Spawn pi with: "What phase are you currently in? Reply with just the phase name."
  - Verify: output contains "explore"
  - Verify: system prompt included explore skill content (agent knows the protocol)

Test 3: Workflow commitment creates state
  - Spawn pi with: "Start a workflow for 'test-feature'. Write .crew/state.md with workflow: build,ship and phase: build. Then reply DONE."
  - Verify: .crew/state.md was created
  - Verify: state.md contains workflow field
  - Verify: state.md contains feature field

Test 4: Phase skill content is injected
  - Create .crew/state.md with phase: explore, workflow: explore,build
  - Spawn pi with: "What does the explore protocol say about scout count for large projects (500+ files)? Reply with just the number."
  - Verify: output contains "3-4" (from explore SKILL.md which was injected)

Test 5: Agent-end nudge forces continuation
  - Create .crew/state.md with phase: build, workflow: build,ship
  - Spawn pi with: "Just say hello"
  - Verify: agent received nudge (look for "Workflow in progress" in output or session)
  - Note: This is the hardest to test — may need to verify via .crew/state.md changes
```

These tests are slow (spawn real pi) and tagged for separate execution.

### Wave 6: Cleanup

**Task 9: Remove dead code and update docs**

- Remove `/skill:crew-*` references from `buildCrewPrompt()` (skills are now auto-injected)
- Update pi-crew README to document:
  - Workflow commitment mechanism
  - How enforcement works
  - The `workflow` field in state.md
- Remove the old phase selection table ("Phase selection is YOUR judgment")

---

## Dependency Graph

```
Wave 1: [Task 1] ──┬── [Task 2]
                    │
Wave 2: ────────────┴── [Task 3] ── [Task 4]
                                       │
Wave 3: ────────────────────────── [Task 5] ── [Task 6]
                                       │
Wave 4: ────────────────────────── [Task 7] (parallel with Wave 3)
                                       │
Wave 5: ────────────────────────── [Task 8] (after all above)
                                       │
Wave 6: ────────────────────────── [Task 9]
```

Tasks 1-2 are independent (Wave 1 parallel).
Task 3 depends on 1-2.
Task 4 depends on 3.
Tasks 5-6 depend on 4.
Task 7 is independent (can parallel with Wave 3).
Task 8 depends on everything.
Task 9 depends on 8.

## TDD Sequence

For each task:
1. Write failing tests FIRST
2. Run tests → confirm RED
3. Implement minimum code to pass
4. Run tests → confirm GREEN
5. Commit: test + implementation together

## Estimated Test Count

| Task | New Tests | Type |
|------|-----------|------|
| 1 | ~12 | Unit (pure functions) |
| 2 | ~4 | Unit + FS |
| 3 | ~12 | Unit (pure functions) |
| 5 | ~4 | Unit (pure functions) |
| 8 | ~5 | Integration (real pi subprocess) |
| **Total** | **~37** | |

Combined with existing 126 tests → **~163 tests total**.

## Files Changed

| File | Change |
|------|--------|
| `extensions/pi-crew/state.ts` | Add `workflow` to CrewState, `isWorkflowComplete()`, `getWorkflowProgress()` |
| `extensions/pi-crew/index.ts` | Rewrite `buildCrewPrompt()`, `before_agent_start`, add `agent_end` nudge, add `user_message` reset |
| `extensions/pi-crew/__tests__/state.test.ts` | Add workflow parsing tests |
| `extensions/pi-crew/__tests__/prompt.test.ts` | New file: idle/active prompt tests |
| `extensions/pi-crew/__tests__/workflow.test.ts` | New file: integration tests |
| `skills/crew-explore/SKILL.md` | Update state instructions with workflow field |
| `skills/crew-design/SKILL.md` | Update state instructions with workflow field |
| `skills/crew-plan/SKILL.md` | Update state instructions with workflow field |
| `skills/crew-build/SKILL.md` | Update state instructions with workflow field |
| `skills/crew-review/SKILL.md` | Update state instructions with workflow field |
| `skills/crew-ship/SKILL.md` | Update state instructions with workflow field |
| `packages/pi-crew/README.md` | Document workflow enforcement |
