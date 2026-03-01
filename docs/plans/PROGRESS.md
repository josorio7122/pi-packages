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
