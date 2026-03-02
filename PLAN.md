# Pi-Crew Phase Enforcement Redesign

> **Status: PENDING** — Major architectural change. Phases move from skills to extension code with mechanical enforcement.

## Problem Statement

The crew workflow doesn't work. The `.crew/` folder never gets populated. Phases are "skills" — passive markdown injected into the prompt, hoping the LLM follows instructions. The LLM ignores them.

**What should happen:**
1. LLM starts a feature → `.crew/state.md` created
2. Each phase dispatches agents → output auto-saved to `.crew/phases/<feature>/`
3. Phase can't advance until handoff file exists
4. Every agent's output is captured to `.crew/`

**What actually happens:**
1. LLM writes `PLAN.md` at root, ignoring `.crew/` entirely
2. No handoff files are ever created
3. No phase gating — LLM skips phases freely
4. Agent output vanishes into the tool result

## Root Cause

Skills are the wrong abstraction for workflow enforcement. A skill is a markdown document. It can't:
- Write files mechanically
- Block tool calls
- Gate phase transitions
- Capture dispatch results

The enforcement patterns that work (tilldone.ts `tool_call` gate, agent-team.ts `setActiveTools`, GSD state externalization) are all **extension code**, not skills.

## Design: Phases as Extension Logic

### Architecture Change

**Before:** `skills/crew-{phase}/SKILL.md` → read at runtime → injected into prompt → LLM ignores it

**After:** `extensions/pi-crew/phases.ts` → phase content as constants → extension auto-captures dispatch results → extension writes handoff files → extension gates phase transitions

### .crew/ Folder Structure (Auto-Managed by Extension)

```
.crew/
├── config.json                         # Profile + overrides (existing)
├── state.md                            # Workflow state (existing, but extension manages transitions)
└── phases/
    └── <feature>/
        ├── explore.md                  # Auto-captured from scout dispatch results
        ├── design.md                   # Auto-captured from architect dispatch results
        ├── plan.md                     # Host LLM writes this (plan phase output)
        ├── build/
        │   ├── task-01.md              # Host LLM writes these (task files)
        │   └── summary.md             # Auto-captured or host LLM writes
        ├── review.md                   # Auto-captured from reviewer dispatch results
        └── summary.md                  # Host LLM writes (ship phase)
```

### Enforcement Mechanisms

1. **Auto-capture dispatch results** — After `dispatch_crew` returns, write agent output to `.crew/phases/<feature>/<phase>.md`
2. **Phase gate** — Block `dispatch_crew` if trying to dispatch for a phase that requires a prior phase's handoff file
3. **State auto-management** — Extension writes/updates `.crew/state.md` phase transitions, not the LLM
4. **`tool_call` gate** (tilldone pattern) — When workflow is active, block write/edit tools in non-build phases (explore/design are dispatch-only)

---

## Plan: 7 Waves, 19 Tasks

### Wave 1 — Create Phase Content Module (Replace Skills)

**Task 1.1: Create `phases.ts` with phase content as constants**
- New file: `extensions/pi-crew/phases.ts`
- Move all 6 SKILL.md contents into exported constants: `PHASE_EXPLORE`, `PHASE_DESIGN`, `PHASE_PLAN`, `PHASE_BUILD`, `PHASE_REVIEW`, `PHASE_SHIP`
- Export `getPhaseContent(phase: string): string | null`
- Export `VALID_PHASES` constant array
- Export `PhaseId` type: `"explore" | "design" | "plan" | "build" | "review" | "ship"`
- Tests: write `__tests__/phases.test.ts` — test every phase returns content, invalid phase returns null, content matches expected keywords
- Effort: Small

**Task 1.2: Wire `phases.ts` into prompt system**
- Update `prompt.ts`: `buildActivePrompt()` and `buildCrewPrompt()` — remove `skillContent` parameter, call `getPhaseContent()` internally
- Update `index.ts`: remove `readPhaseSkill` import, remove call in `before_agent_start`, pass only `presetDocs` and `state` to `buildCrewPrompt()`
- Update tests: `prompt.test.ts` — remove `skillContent` parameter from test calls, verify phase content is resolved internally
- Update tests: `workflow-lifecycle.test.ts` — remove `readPhaseSkill` import and call
- Effort: Small

**Task 1.3: Remove `readPhaseSkill()` from `state.ts`**
- Delete the function (lines 194-208)
- Remove export
- Delete 4 tests in `state.test.ts` (lines 375-401)
- Effort: Tiny

### Wave 2 — Auto-Capture Dispatch Results to .crew/

**Task 2.1: Create `handoff.ts` — handoff file writer**
- New file: `extensions/pi-crew/handoff.ts`
- Export `writeHandoff(cwd: string, feature: string, phase: string, content: string): void` — writes `.crew/phases/<feature>/<phase>.md`
- Export `readHandoff(cwd: string, feature: string, phase: string): string | null` — reads handoff file
- Export `handoffExists(cwd: string, feature: string, phase: string): boolean` — checks if handoff exists
- Export `writeTaskFile(cwd: string, feature: string, taskId: string, content: string): void` — writes `.crew/phases/<feature>/build/task-<id>.md`
- Creates directories recursively
- Tests: `__tests__/handoff.test.ts` — write/read/exists in temp dirs, missing file returns null, directory creation
- Effort: Medium

**Task 2.2: Auto-capture in `dispatch_crew` return path**
- In `index.ts`: after `executeSingleMode()`, `executeParallelMode()`, `executeChainMode()` return, check if workflow is active
- If active: call `writeHandoff(ctx.cwd, state.feature, state.phase, agentOutput)` to persist the dispatch result
- For parallel mode: concatenate all agent outputs with headers
- For chain mode: use final agent's output
- Tests: integration tests verifying handoff files are written after dispatch
- Effort: Medium

### Wave 3 — Phase Gate (Block Advancement Without Handoff)

**Task 3.1: Add phase dependency map**
- In `phases.ts`: export `PHASE_DEPENDENCIES` — which phases require which prior handoff files
  ```typescript
  const PHASE_DEPENDENCIES: Record<PhaseId, PhaseId[]> = {
    explore: [],           // No deps — first phase
    design: ["explore"],   // Needs explore.md
    plan: ["design"],      // Needs design.md (or explore.md if workflow skips design)
    build: ["plan"],       // Needs plan.md
    review: ["build"],     // Needs build/summary.md
    ship: ["review"],      // Needs review.md
  };
  ```
- Handle workflow shortcuts: if workflow is `["explore", "build", "ship"]`, then `build` only requires `explore`, not `design` or `plan`
- Export `getRequiredHandoffs(phase: PhaseId, workflow: PhaseId[]): PhaseId[]` — returns only deps that are in the workflow
- Tests: dependency resolution for all workflow shortcuts
- Effort: Small

**Task 3.2: Gate phase transitions in enforcement**
- Update `enforcement.ts`: add `shouldBlockForMissingHandoff(cwd, state): { blocked: boolean; missing: string[] }`
- Check if current phase's dependencies have handoff files via `handoffExists()`
- Wire into `dispatch_crew` execute — before dispatching, check handoff gate
- Return descriptive error: "Phase 'build' requires handoff from 'plan'. Write `.crew/phases/<feature>/plan.md` first."
- Tests: gate blocks when handoff missing, allows when present, handles workflow shortcuts
- Effort: Medium

### Wave 4 — State Auto-Management

**Task 4.1: Auto-advance phase in state.md**
- In `handoff.ts` or new `workflow.ts`: export `advancePhase(cwd: string): void`
- After handoff file is written, check if current phase is complete
- If complete: update `state.md` to next phase in workflow
- Export `writeState(cwd: string, state: CrewState): void` — write state.md with YAML frontmatter
- Currently NO `writeState()` exists — state.md is only written by the LLM. This is a key gap.
- Tests: phase advancement, state.md content after advance
- Effort: Medium

**Task 4.2: Auto-create state.md on first gated dispatch**
- When `dispatch_crew` is called and no `state.md` exists, but the task description suggests a feature:
  - DON'T auto-create (can't infer feature name)
  - BUT: return a clearer error with exact instructions
- When `state.md` exists but has no `feature` field: return error
- Tests: error messages for missing/malformed state.md
- Effort: Small

### Wave 5 — Cleanup Dead Code

**Task 5.1: Delete `skills/` directory**
- Remove all 6 SKILL.md files and their directories
- Remove `"skills": ["./skills"]` from `package.json`
- Effort: Tiny

**Task 5.2: Delete `templates/` directory**
- Templates (`plan.md`, `spec.md`, `summary.md`, `task.md`) are not read by any code
- They were reference docs for the LLM — now phase logic is in extension code
- If any template content is needed, it moves into `phases.ts` as constants
- Verify with: `grep -rn 'templates/' . --include='*.ts'` — should be zero results
- Effort: Tiny

**Task 5.3: Audit `references/` directory**
- `references/prompts/` — KEEP (read by `presets.ts` via `resolvePreset()`)
- `references/model-profiles.md` — verify if read by any code. If not, DELETE
- `references/deviation-rules.md` — verify if read by any code. If not, DELETE
- `references/evaluation-gates.md` — verify if read by any code. If not, DELETE
- Run: `grep -rn 'deviation-rules\|evaluation-gates\|model-profiles' . --include='*.ts'`
- Effort: Small

**Task 5.4: Remove unused exports and functions**
- Audit every export in `state.ts`, `prompt.ts`, `enforcement.ts` for callers
- Remove any function with zero callers outside tests
- Remove corresponding test cases
- Run: `grep -rn 'functionName' . --include='*.ts'` for each export
- Effort: Small

### Wave 6 — Update Tests

**Task 6.1: Rewrite `workflow-lifecycle.test.ts`**
- Remove all `readPhaseSkill` references
- Test the new flow: state.md → dispatch → auto-capture → handoff file written → phase advances
- Test `simulateBeforeAgentStart` uses `getPhaseContent()` internally
- Test handoff file existence gates phase transitions
- Effort: Medium

**Task 6.2: Rewrite `workflow-enforcement.test.ts`**
- Add tests for handoff gate (`shouldBlockForMissingHandoff`)
- Test: missing explore handoff blocks design phase dispatch
- Test: present explore handoff allows design phase dispatch
- Test: workflow shortcuts (quick: explore → build skips design/plan deps)
- Effort: Medium

**Task 6.3: Update `prompt.test.ts`**
- Remove `skillContent` parameter from all test calls
- Verify `buildActivePrompt` resolves phase content internally
- Verify content matches expected phase keywords
- Effort: Small

**Task 6.4: Full test suite green check**
- Run: `pnpm exec vitest run` — all tests must pass
- Run: `pnpm exec tsc --noEmit` — no type errors
- Verify test count is >= current (209) minus deleted skill tests (4) plus new tests
- Effort: Small

### Wave 7 — Documentation & Install

**Task 7.1: Update README.md**
- Remove references to skills, SKILL.md files
- Document `.crew/` folder structure (auto-managed)
- Document phase enforcement (auto-capture, handoff gate, state management)
- Document workflow shortcuts
- Effort: Small

**Task 7.2: Update package.json and reinstall**
- Verify `"skills"` field is removed
- Run: `pi install /Users/josorio/Code/pi-packages`
- Verify: `pi` loads without errors
- Effort: Tiny

**Task 7.3: Final commit**
- Single squash commit or per-wave commits
- Commit message: `refactor: replace skill-based phases with mechanical enforcement`
- Effort: Tiny

---

## Execution Order & Dependencies

```
Wave 1 (Phase Module) ─→ Wave 2 (Auto-Capture) ─→ Wave 3 (Phase Gate) ─→ Wave 4 (State Auto-Management)
                                                                                    ↓
Wave 5 (Cleanup) ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ┘
     ↓
Wave 6 (Tests) ─→ Wave 7 (Docs & Install)
```

Waves 1-4 are sequential (each builds on previous).
Wave 5 can start after Wave 4 (cleanup depends on new code being in place).
Wave 6 depends on Wave 5 (tests must reflect final code state).
Wave 7 is last (documentation reflects final state).

## Estimated Effort

| Wave | Tasks | Effort | Lines Changed |
|------|-------|--------|---------------|
| 1 — Phase Module | 3 | 1-2 hours | ~200 new, ~50 modified |
| 2 — Auto-Capture | 2 | 2 hours | ~150 new, ~30 modified |
| 3 — Phase Gate | 2 | 1-2 hours | ~100 new, ~20 modified |
| 4 — State Management | 2 | 1-2 hours | ~80 new, ~20 modified |
| 5 — Cleanup | 4 | 30 min | ~850 deleted |
| 6 — Tests | 4 | 2 hours | ~200 modified |
| 7 — Docs | 3 | 30 min | ~50 modified |
| **Total** | **19** | **~9-11 hours** | **~530 new, ~1020 deleted/modified** |

## Risk Mitigation

- **Tests first**: Every new module gets tests before wiring in
- **Incremental commits**: Each wave is independently committable
- **No behavior change for simple dispatches**: Single agent dispatch without workflow is unaffected
- **Backward compatible**: Existing `.crew/state.md` format unchanged
- **Rollback**: Git history preserves skills if needed
