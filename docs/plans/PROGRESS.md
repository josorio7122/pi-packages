# pi-gsd Implementation Progress

### Task 1: Scaffold pi-gsd package
- **Status:** ✅ Complete
- **Commit:** 35c3000 chore: scaffold pi-gsd package
- **Built:** Scaffolded `packages/pi-gsd/` with package.json, tsconfig.json, vitest.config.ts, extension stub at `extensions/gsd/index.ts`, and all empty directories with .gitkeep files; build passes with `tsc`.
- **Tests:** 0 (no tests yet — extension stub only)
- **Notes:** `@mariozechner/pi-ai` added as peer + dev dependency per task spec. `pnpm-lock.yaml` updated but not committed (not in `git add packages/pi-gsd/` scope — can be committed separately if needed). dist/ output excluded via .gitignore.
- **Timestamp:** 2026-02-28

### Task 3: Core library — state, template, roadmap
- **Status:** ✅ Complete
- **Commit:** 0f7f3be feat(pi-gsd): core library — state, template, roadmap
- **Built:** Ported 3 library modules from CJS source: `state.ts` (14 functions: loadState, writeState, patchState, getStateField, advancePlan, addDecision, addBlocker, resolveBlocker, recordSession, snapshotState, stateToJson + internal helpers); `template.ts` (renderTemplate with {{var}}/{{TIMESTAMP}}/{{DATE}} substitution, loadTemplate, renderTemplateFile); `roadmap.ts` (parseRoadmap, getRoadmapPhase, listRoadmapPhases, getRequirements, analyzeRoadmap). All with full TDD test suites.
- **Tests:** 165 passing (72 new tests across 3 new test files, original 93 untouched)
- **Notes:** `RoadmapPhase` uses `phase_number`/`phase_name` field names (matching CJS convention) while `ParsedRoadmap.phases` entries use `number`/`name` (internal type). Success criteria regex handles both `**Success Criteria:**` (colon inside) and `**Success Criteria**:` (colon outside) patterns. `snapshotState` creates a timestamped file copy in `.planning/snapshots/` (CJS `cmdStateSnapshot` only returned JSON — this is a behavioral improvement). `writeState` merges caller-provided FM with auto-built FM derived from body patterns.
- **Timestamp:** 2026-02-28

### Task 4: Core library — phase, milestone, init, verify
- **Status:** ✅ Complete
- **Commit:** 64a73a6 feat(pi-gsd): core library — phase, milestone, init, verify
- **Built:** Ported 4 library modules from CJS source: `phase.ts` (listPhases, findPhaseDir, nextDecimalPhase, addPhase, insertPhase, removePhase, getPlanIndex, getWaveGroups, completePhase); `milestone.ts` (markRequirementsComplete, completeMilestone, listMilestones); `init.ts` (initNewProject, initPhaseOp, initExecutePhase, initPlanPhase, initNewMilestone, initQuick, initResume, initVerifyWork, initProgress, initMilestoneOp); `verify.ts` (verifySummary, verifyPlanStructure, verifyPhaseCompleteness, verifyReferences, verifyCommits, validateConsistency, validateHealth). All with full TDD test suites.
- **Tests:** 263 passing (98 new tests across 4 new test files, original 165 untouched)
- **Notes:** `getWaveGroups` returns `WaveGroup[]` (array of `{wave, plans[]}`) — easier to consume than the CJS `waves` map. `validateHealth` repair actions use `writeState`/`loadState` from state.ts instead of raw file writes. `PhaseListResult.directories` is optional (not always populated — only when not filtering by type). TypeScript compiles clean with `--noEmit`.
- **Timestamp:** 2026-02-28

### Task: Fix Wave 2 Remaining Issues
- **Status:** ✅ Complete
- **Commit:** 7323ccf (3 commits: 9aa6a09, 3f2734f, 7323ccf)
- **Built:** Created 3 missing agent files (codebase-mapper.md, debugger.md, integration-checker.md) as pure system prompts; deleted adapt_workflows.py leftover script; fixed set-profile.md gsd-tools.cjs reference; committed all Wave 2 work in 3 structured commits.
- **Tests:** 93 passing
- **Notes:** The runtime references/templates/workflows files contain intentional `gsd-tools.cjs` references (documenting the upstream CLI for users who run GSD natively) — only the set-profile.md template-display reference was replaced as specified. The `grep -v 'set-profile'` verification check will still show hits from those reference docs.
- **Timestamp:** 2026-02-28

### Task 6: Extension hooks — context monitor and statusline
- **Status:** ✅ Complete
- **Commit:** 555f2fb feat(pi-gsd): add context monitor and statusline hooks
- **Built:** Created `hooks/context-monitor.ts` (warns at ≤35% remaining, critical at ≤25%; 5-turn debounce using `ctx.getContextUsage()` which returns `percent` as 0-100) and `hooks/statusline.ts` (reads STATE.md frontmatter on `session_start` + `turn_end`, shows Phase/Plan/status via `ctx.ui.setStatus('gsd', ...)`). Registered both in `index.ts`.
- **Tests:** 301 passing (no new tests — hooks are event-driven integration code requiring the full pi runtime)
- **Notes:** `ContextUsage.percent` is 0-100 (confirmed from agent-session.js source: `percent = (tokens / contextWindow) * 100`). Task description incorrectly named the field `percentage` — actual field is `percent`. Statusline clears itself (`setStatus('gsd', undefined)`) when `.planning/` doesn't exist.
- **Timestamp:** 2026-02-28

### Task 5: Pi tools — register all 10 tools (8 state/operations + 2 dispatch)
- **Status:** ✅ Complete
- **Commit:** a3980ac feat(pi-gsd): register all 10 tools (8 state/ops + 2 dispatch)
- **Built:** Created 10 tool files in `extensions/gsd/tools/`: `init.ts` (gsd_init, 10 actions), `state.ts` (gsd_state, 11 actions), `phase.ts` (gsd_phase, 10 actions), `roadmap.ts` (gsd_roadmap, 5 actions), `config.ts` (gsd_config, 5 actions), `milestone.ts` (gsd_milestone, 3 actions), `verify.ts` (gsd_verify, 6 actions), `util.ts` (gsd_util, 5 actions), `dispatch.ts` (gsd_dispatch, spawns single agent subprocess), `dispatch-wave.ts` (gsd_dispatch_wave, parallel Promise.all dispatch). Updated `index.ts` to register all 10 tools with proper paths. Created 4 test files (38 new tests).
- **Tests:** 301 passing
- **Notes:** `AgentToolResult<T>` requires `details: T` — all returns include `details: null`. TypeBox `Type.Record(Type.String(), Type.Unknown())` used for `updates` in gsd_state (not `Type.Record(Type.String(), Type.String())`). `gsd_dispatch` and `gsd_dispatch_wave` parse pi's JSON event stream for `agent_end`/`agent_response` events to extract final text output. `gsd_util` render-template heuristic: if template contains `{{` or newlines, treat as inline; otherwise try filename first.
- **Timestamp:** 2026-02-28

### Task 10+11: Create 24 secondary + utility skills
- **Status:** ✅ Complete
- **Commit:** 1e7877a feat(pi-gsd): create 16 utility and management skills (+ 4b09224 for secondary)
- **Built:** Created 24 GSD skill files across two commits. 8 secondary workflow skills: gsd-quick, gsd-progress, gsd-help, gsd-pause-work, gsd-resume-work, gsd-discovery-phase, gsd-transition, gsd-map-codebase. 16 utility/management skills: gsd-add-phase, gsd-insert-phase, gsd-remove-phase, gsd-list-phase-assumptions, gsd-plan-milestone-gaps, gsd-research-phase, gsd-audit-milestone, gsd-settings, gsd-set-profile, gsd-add-todo, gsd-check-todos, gsd-add-tests, gsd-cleanup, gsd-debug, gsd-health, gsd-update.
- **Tests:** N/A (static markdown files)
- **Notes:** 6 of the 8 secondary skills were already present (untracked) from a prior session and were included in the task 9 commit. Only gsd-transition and gsd-map-codebase were newly added in the secondary commit.
- **Timestamp:** 2026-02-28

### Task 9: Create 7 core workflow skills
- **Status:** ✅ Complete
- **Commit:** 259dfbf feat(pi-gsd): create 7 core workflow skills
- **Built:** Created 7 core GSD skill files in `packages/pi-gsd/skills/`: gsd-new-project, gsd-discuss-phase, gsd-plan-phase, gsd-execute-phase, gsd-verify-work, gsd-complete-milestone, gsd-new-milestone. Each follows the standard skill format with frontmatter, prerequisites, environment/tool listing, agent dispatch section, and workflow pointer. Deleted `.gitkeep`. Also committed 7 additional pre-existing skills (gsd-discovery-phase, gsd-help, gsd-pause-work, gsd-progress, gsd-quick, gsd-resume-work) that were left untracked from a prior session — all follow the same format.
- **Tests:** N/A (static markdown files)
- **Notes:** Found 7 additional untracked skill files (gsd-discovery-phase, gsd-help, gsd-pause-work, gsd-progress, gsd-quick, gsd-resume-work, gsd-discovery-phase) already present from a prior task session; included them in the commit since they're valid and follow the same format.
- **Timestamp:** 2026-02-28
