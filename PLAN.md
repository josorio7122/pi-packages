# Pi-Packages Improvement Plan (Round 2)

> **Status: PENDING** — 18 tasks across 5 waves. Fresh evaluation post-Round 1.

## Evaluation Summary

| Dimension | Grade | Key Findings |
|-----------|-------|-------------|
| Anthropic Patterns | **A-** | Good tool descriptions w/ examples, parallel dispatch, retry logic. Gaps: index.ts God Function (337 lines), no orchestrator planning visibility, no response format control |
| TypeScript Safety | **B+** | Zero `any`, discriminated unions for DisplayItem. Gaps: 10 non-null assertions in index.ts, `as` casts in rendering, no Result type for error paths |
| DRY | **B+** | common.ts extracted for exa-search. Gaps: timer pattern 3×, instance counter 3×, exa-search still has 5× identical try/catch/output blocks |
| Dead Code | **A** | Only 2 unused exports (AgentPreset, ModelProfile interfaces) + 2 tested-but-uncalled functions (getPhaseDir, listFeatures) |
| Test Coverage | **A** | 173 unit tests, error/stagger/lock retry coverage. Gaps: no exa-search tests, no type-level tests |
| Module Design | **A-** | Type exports at bottom of index.ts. Gaps: `export *` would be cleaner via barrel, rendering.ts mixes types + UI + data extraction |
| Performance | **A-** | Stagger + retry, concurrent limits. Gap: timer intervals allocate closures per-agent |

---

## Anthropic Patterns Evaluation (48-point checklist)

### ✅ Passing (32/48)

- **COMPOSABILITY**: Clean pattern — prompt chaining, orchestrator-workers, parallelization all visible
- **MULTI_AGENT_FOR_PARALLELIZATION**: Parallel mode spawns concurrent agents with stagger
- **ORCHESTRATOR_WORKER_PATTERN**: Clear delegation — preset defines role, task defines scope
- **TOOL_PARALLELIZATION**: mapWithConcurrencyLimit enables concurrent tool execution
- **SEPARATION_OF_CONCERNS**: Each preset has distinct tools (scout: read-only, executor: read+write+bash)
- **RETRY_LOGIC_WITH_BACKOFF**: Lock file retry with exponential backoff (500ms → 1s → 2s)
- **TOOL_DESCRIPTIONS_EXPLICIT**: Comprehensive descriptions with examples for single/parallel/chain
- **PARAMETER_CLARITY**: Parameters well-named (preset, task, cwd, model, thinking)
- **HELPFUL_ERROR_MESSAGES**: extractErrorMessage + error details in chain output
- **TOKEN_EFFICIENT_DEFAULTS**: MAX_CONCURRENT=4, truncated previews, concise rendering

### ⚠️ Partial (10/48)

| Pattern | Issue | Fix |
|---------|-------|-----|
| **CONTEXT_WINDOW_DISTRIBUTION** | Chain mode passes full output as `{previous}` — no summarization for long outputs | Truncate/summarize `{previous}` if over token threshold |
| **STATEFUL_RESUMPTION** | `.crew/state.md` exists but no checkpoint within a dispatch | Add per-step state for chain mode |
| **OBSERVABILITY_FOR_DEBUGGING** | stderr captured but no structured logging of agent decisions | Add debug mode with structured trace output |
| **TASK_DESCRIPTION_SPECIFICITY** | Depends entirely on LLM writing good task descriptions | Add task template validation / minimum length check |
| **RESPONSE_FORMAT_ENUM** | No concise vs detailed response control | Add `response_format` parameter |
| **LEAD_AGENT_PLANNING** | No visible planning step before dispatch | N/A — orchestrator is the host LLM |
| **AGENT_PROMPT_ENGINEERING_ITERATION** | No automated prompt optimization | Out of scope for now |
| **STOP_CONDITION_EXPLICIT** | No max iteration/token budget per agent | Add `maxTurns` parameter |
| **TOOL_ERGONOMICS_MATCH_AGENT_COGNITION** | Good but could expose `response_format` | See above |
| **POKA_YOKE_TOOL_DESIGN** | `cwd` accepts relative paths (error-prone) | Resolve to absolute in tool handler |

### ❌ Missing (6/48)

| Pattern | Impact | Effort |
|---------|--------|--------|
| **RESPONSE_FORMAT_ADAPTATION** | Medium — all output is raw text | Low |
| **MULTI_AGENT_EMERGENT_BEHAVIORS** | Low — no eval for redundancy between agents | High |
| **HELD_OUT_TEST_SET** | Low — no eval framework yet | High |
| **LLM_JUDGE_RUBRIC** | Low — no automated quality scoring | High |
| **RAINBOW_DEPLOYMENT** | N/A — local tool, not a service | N/A |
| **TOOL_TESTING_AGENT** | Low — manual testing only | Medium |

---

## TypeScript Best Practices Evaluation

| Category | Score | Details |
|----------|-------|---------|
| **Type Safety** | 7/10 | Discriminated unions for DisplayItem ✅, branded types not needed, `satisfies` not used but acceptable. 10 non-null assertions in index.ts (post-validation but fragile). No `any`. |
| **Error Handling** | 5/10 | No Result type — functions return `null` or throw. catch blocks use `unknown` properly. Silent parse failures in NDJSON/JSON. extractErrorMessage is good but ad-hoc. |
| **Module Design** | 7/10 | Type exports at bottom of index.ts. No barrel file. rendering.ts is 360 lines mixing types, data extraction, and UI rendering — should split. |
| **API Design** | 8/10 | Options object pattern (DispatchCrewParams). Good discriminated mode detection. Builder pattern not needed here. |
| **Testing** | 7/10 | 173 unit tests, good coverage. No type-level tests. No exa-search script tests. |
| **Performance** | 8/10 | Lazy temp file creation, stagger, retry. Timer closures per-agent are fine. No WeakRef needed. |
| **Anti-Patterns** | 8/10 | Zero `any`, zero enums, minimal casts. 10 `!` assertions and some `as` casts remain. |

---

## Dead Code Inventory

| Item | File:Line | Status | Action |
|------|-----------|--------|--------|
| `AgentPreset` interface | presets.ts:10 | Exported, never imported | Remove `export` or use in type exports |
| `ModelProfile` interface | profiles.ts:5 | Exported, never imported | Remove `export` or use in type exports |
| `getPhaseDir()` | state.ts:58 | Exported, tested, never called | Keep for SDK — document as public API |
| `listFeatures()` | state.ts:66 | Exported, tested, never called | Keep for SDK — document as public API |

---

## DRY Violations

### High Priority

| Pattern | Locations | Fix |
|---------|-----------|-----|
| Timer interval setup/cleanup | index.ts:302, 419, 565 (3×) | Extract `createAgentTimer()` helper |
| Instance counter (preset numbering) | index.ts:273, rendering.ts:324 (2×) | Already in `buildAgentStates` — remove duplicate in rendering |
| exa-search try/catch/output | All 5 scripts (5×) | Extract `executeAndPrint()` wrapper in common.ts |
| exa-search `new Exa()` | All 5 scripts (5×) | Extract `createClient()` in common.ts |

### Medium Priority

| Pattern | Locations | Fix |
|---------|-----------|-----|
| exa-search option parsing `JSON.parse(args[N])` | All 5 scripts | Already in `parseArgs()` — verify all use it |
| TaskItem/ChainItem schema duplication | index.ts:66-88 | Both are identical — extract `AgentTaskSchema` |

---

## Plan: 18 Tasks, 5 Waves

### Wave 1 — God Function Decomposition (index.ts) [HIGH IMPACT]

The 337-line `execute` function is the #1 code quality issue. It handles single/parallel/chain modes inline with timer logic, state mutation, and error formatting interleaved.

**Task 1.1: Extract single mode handler**
- File: `index.ts`
- Extract lines ~243-326 into `executeSingleMode(params, resolveOne, buildAgentStates, emitUpdate, config, signal, ctx)`
- Return `ToolResult`
- Effort: Medium

**Task 1.2: Extract parallel mode handler**
- File: `index.ts`
- Extract lines ~329-364 into `executeParallelMode(params, resolveOne, buildAgentStates, emitUpdate, config, signal, ctx)`
- Return `ToolResult`
- Effort: Medium

**Task 1.3: Extract chain mode handler**
- File: `index.ts`
- Extract lines ~367-488 into `executeChainMode(params, resolveOne, buildAgentStates, emitUpdate, config, signal, ctx)`
- Return `ToolResult`
- Effort: Medium

**Task 1.4: Extract timer helper**
- File: `index.ts` or new `helpers.ts`
- Extract the `setInterval(() => { agents[i].elapsedMs = ...; emitUpdate(...) }, 1000)` pattern into `startAgentTimer(agent, emitUpdate, mode)` returning cleanup function
- Used in: single (1×), parallel (1×), chain (1×)
- Effort: Small

### Wave 2 — Type Safety Improvements [MEDIUM IMPACT]

**Task 2.1: Eliminate non-null assertions in index.ts**
- Replace all 10 `params.preset!`, `params.tasks!`, `params.chain!` with proper narrowing
- Pattern: destructure after mode check — `const { preset, task } = params as Required<Pick<..., 'preset' | 'task'>>`
- Or better: pass narrowed params to mode handlers from Task 1.1-1.3
- Effort: Small

**Task 2.2: Schema deduplication — TaskItem and ChainItem**
- `TaskItem` and `ChainItem` are identical schemas (preset, task, cwd, model, tools, thinking)
- Extract `AgentTaskSchema` and reuse for both
- Effort: Small

**Task 2.3: Extract rendering types to separate file**
- `rendering.ts` (360 lines) mixes: type definitions (lines 28-39), data extraction (lines 112-156), UI rendering (lines 176-316), render call builder (318-350)
- Split into: `types.ts` (types only), keep `rendering.ts` for UI
- Effort: Small

### Wave 3 — exa-search DRY Cleanup [MEDIUM IMPACT]

**Task 3.1: Add `createClient()` to common.ts**
- Extract `new Exa()` instantiation used identically in all 5 scripts
- Effort: Small

**Task 3.2: Add `executeAndPrint()` to common.ts**
- Extract the pattern: `try { const result = await apiCall(); console.log(JSON.stringify(result, null, 2)); } catch (err) { handleError(err); }`
- Used in: search.ts, find-similar.ts, contents.ts, answer.ts (non-streaming)
- Effort: Small

**Task 3.3: Add `requireArg()` to common.ts**
- Extract: `if (!value) { console.error("Error: <name> required"); process.exit(1); } return value`
- Used 5× in research.ts
- Effort: Small

### Wave 4 — Dead Code & Robustness [LOW IMPACT]

**Task 4.1: Remove unused `export` from internal-only types**
- `AgentPreset` (presets.ts:10) — remove `export` keyword, keep interface
- `ModelProfile` (profiles.ts:5) — remove `export` keyword, keep interface
- Effort: Tiny

**Task 4.2: Document SDK-intended functions**
- `getPhaseDir()` and `listFeatures()` — add JSDoc `@public` tag and note in README as SDK utilities
- Effort: Tiny

**Task 4.3: Resolve `cwd` to absolute path in tool handler**
- In `execute()`, resolve relative `cwd` to absolute before passing to `runSingleAgent`
- Prevents "file not found" errors when agent runs in wrong directory
- Effort: Small

**Task 4.4: Add `maxTurns` parameter to dispatch_crew**
- New optional parameter: `maxTurns?: number` — passed to pi subprocess as `--max-turns N`
- Prevents runaway agents from burning tokens indefinitely
- Verify pi CLI supports `--max-turns` flag first
- Effort: Small

### Wave 5 — Testing Gaps [MEDIUM IMPACT]

**Task 5.1: Extract magic numbers to named constants in rendering.ts**
- Replace: `50` → `TASK_PREVIEW_LENGTH`, `60` → `TOOL_DETAIL_LENGTH`, `47` → `PATH_TRUNCATE_LENGTH`, etc.
- Effort: Small

**Task 5.2: Add exa-search script tests**
- Test `common.ts` functions: `filterOptions`, `buildContentsOptions`, `handleError`, `parseArgs`
- Mock `process.exit` and `console.error` for `handleError`/`showHelp`
- Effort: Medium

---

## Execution Order & Dependencies

```
Wave 1 (God Function) ─→ Wave 2 (Type Safety) ─→ Wave 5 (Testing)
                                                     ↑
Wave 3 (exa-search DRY) ─────────────────────────────┘
Wave 4 (Dead Code) ── independent, can run anytime
```

Wave 1 must come first because Wave 2 (non-null assertion removal) depends on the mode handlers being extracted.

## Estimated Effort

| Wave | Tasks | Effort | Lines Changed |
|------|-------|--------|---------------|
| 1 — God Function | 4 | 2-3 hours | ~200 lines refactored |
| 2 — Type Safety | 3 | 1 hour | ~50 lines |
| 3 — exa-search | 3 | 1 hour | ~40 lines |
| 4 — Dead Code | 4 | 30 min | ~20 lines |
| 5 — Testing | 2 | 1-2 hours | ~100 lines new tests |
| **Total** | **18** | **~6-7 hours** | **~410 lines** |
