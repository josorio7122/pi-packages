# Pi-Packages Improvement Plan

> **Status: COMPLETE** — All 14 tasks across 4 waves implemented. See git log for commits.

Comprehensive evaluation against Anthropic engineering standards, TypeScript best practices, and code quality benchmarks.

## Evaluation Summary

| Dimension | Grade | Key Findings |
|-----------|-------|-------------|
| Anthropic Agent Patterns | B+ | Tool descriptions need examples/clarity; chain error recovery loses context |
| TypeScript Type Safety | B | Optional fields where discriminated unions needed; `Record<string, unknown>` |
| DRY | C+ | 3x error extraction in pi-crew, 5x error handler in exa-search, options builder duplication |
| Test Coverage | A | 188 tests, 10 suites; comprehensive coverage including negative paths, abort, concurrent failure |
| Module Architecture | A | Clean separation, no circular deps, single responsibility |
| Documentation | A- | Excellent README; some JSDoc gaps on public API |

---

## Phase 1 — Foundation (DRY + Tool Design)

### Task 1.1: Extract error message helper
- **Priority:** High | **Effort:** S | **Category:** DRY
- **Package:** pi-crew
- **File:** `extensions/pi-crew/index.ts` (lines 317, 434, 525)
- **What:** Extract `e instanceof Error ? e.message : String(e)` to `extractErrorMessage(e: unknown): string`
- **Why:** Identical pattern repeated 3× in single/parallel/chain error handlers

### Task 1.2: exa-search common.ts expansion
- **Priority:** High | **Effort:** S | **Category:** DRY
- **Package:** exa-search
- **Files:** `scripts/lib/common.ts`, all 5 script files
- **What:** Add 3 exports:
  - `handleError(err: unknown): never` — replaces 5× identical try/catch
  - `filterOptions(opts, keys)` — replaces 4× options filtering loop
  - `buildContentsOptions(opts)` — replaces 2× contents builder in search/find-similar
- **Why:** 5 scripts share identical error handling; 4 share options loop; 2 share 9-line block

### Task 1.3: Improve dispatch_crew tool description
- **Priority:** Critical | **Effort:** S | **Category:** tool-design
- **Package:** pi-crew
- **File:** `extensions/pi-crew/index.ts` (line 164)
- **What:** Expand description with:
  - Isolation model explanation (agents can't see conversation)
  - Mode descriptions with concurrency limit (8)
  - `{previous}` mechanism for chains
  - **Examples** for each mode (single, parallel, chain)
  - Full-context requirement emphasis
- **Why:** Anthropic: "Tool descriptions are crucial — agents read them like API docs" and "Include examples in tool descriptions"

---

## Phase 2 — Type Safety

### Task 2.1: DisplayItem discriminated union
- **Priority:** Critical | **Effort:** S | **Category:** type-safety
- **Package:** pi-crew
- **File:** `extensions/pi-crew/rendering.ts` (line 44)
- **Current:**
  ```typescript
  interface DisplayItem {
    type: "text" | "toolCall";
    text?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  }
  ```
- **Change to:**
  ```typescript
  type DisplayItem =
    | { type: "text"; text: string }
    | { type: "toolCall"; name: string; arguments: Record<string, unknown> };
  ```
- **Why:** Optional fields allow illegal states (text DisplayItem with no `text` field)

### Task 2.2: SpawnResult discriminated union
- **Priority:** Critical | **Effort:** M | **Category:** type-safety
- **Package:** pi-crew
- **File:** `extensions/pi-crew/spawn.ts` (line 32)
- **What:** Discriminate success vs error states:
  ```typescript
  export type SpawnResult = SpawnResultBase & (
    | { exitCode: 0; stopReason?: "stop" | "maxTurns" }
    | { exitCode: number; stopReason: "error" | "aborted"; errorMessage: string }
  );
  ```
- **Why:** `errorMessage` and `stopReason` are always set on error but typed as optional
- **Dependencies:** Update consumers in index.ts (3 mode handlers)

---

## Phase 3 — Robustness

### Task 3.1: Chain mode preserve prior step results on error
- **Priority:** High | **Effort:** M | **Category:** architecture
- **Package:** pi-crew
- **File:** `extensions/pi-crew/index.ts` (line 515)
- **What:** When chain step fails, include summary of completed steps in error output
- **Why:** Anthropic: "Error handling should preserve context for recovery"

### Task 3.2: Negative tool call tests
- **Priority:** High | **Effort:** M | **Category:** testing
- **Package:** pi-crew
- **Files:** New tests in `__tests__/`
- **What:** Test invalid preset names, mode conflicts, missing params, empty arrays
- **Why:** Verify error messages guide recovery (Anthropic pattern)

### Task 3.3: Abort/timeout tests
- **Priority:** High | **Effort:** M | **Category:** testing
- **Package:** pi-crew
- **File:** `__tests__/spawn.test.ts`
- **What:** Test AbortSignal cancellation of running agents
- **Why:** Abort logic exists but never tested

### Task 3.4: Concurrent failure tests
- **Priority:** High | **Effort:** M | **Category:** testing
- **Package:** pi-crew
- **File:** `__tests__/integration.test.ts`
- **What:** Test parallel mode when some agents fail (partial failure handling)
- **Why:** `allFailed` logic in index.ts untested

---

## Phase 4 — Polish

### Task 4.1: JSDoc for public API functions
- **Priority:** Medium | **Effort:** M | **Category:** docs
- **Package:** pi-crew
- **Files:** presets.ts, profiles.ts, spawn.ts, state.ts
- **What:** Add JSDoc to all exported functions. Key targets:
  - `mapWithConcurrencyLimit` — explain order preservation, clamping, rejection
  - `resolvePreset` — explain why it reads prompts from disk
  - `getPreset`, `resolveModel`, `isValidProfile`

### Task 4.2: Document MAX_CONCURRENT
- **Priority:** Medium | **Effort:** S | **Category:** docs
- **Package:** pi-crew
- **File:** `extensions/pi-crew/index.ts` (line 36)
- **What:** JSDoc explaining why 8 is the ceiling (empirical testing on M-series Macs)

### Task 4.3: Callback naming consistency
- **Priority:** Medium | **Effort:** S | **Category:** architecture
- **Package:** pi-crew
- **Files:** spawn.ts, index.ts
- **What:** Standardize on `OnAgentUpdate` / `onUpdate` pattern

### Task 4.4: Type exports for extension consumers
- **Priority:** Medium | **Effort:** S | **Category:** architecture
- **Package:** pi-crew
- **File:** `extensions/pi-crew/index.ts`
- **What:** Export types from spawn, presets, state, rendering for downstream use

---

## What's Already Excellent (No Action Needed)

- ✅ Module architecture — clean separation, no circular deps
- ✅ Error handling — consistent, defensive, proper cleanup
- ✅ Workflow enforcement — state-driven injection is innovative
- ✅ Preset system — clear role separation, appropriate model tiers
- ✅ Rendering system — DynamicBorder, progressive disclosure
- ✅ Zero dead code
- ✅ README documentation — comprehensive and well-structured
- ✅ Test foundation — 188 tests across 10 suites

---

## Implementation Waves

| Wave | Tasks | Effort | Focus |
|------|-------|--------|-------|
| 1 | 1.1, 1.2, 1.3 | 3×S | DRY cleanup + tool descriptions |
| 2 | 2.1, 2.2 | S+M | Type safety |
| 3 | 3.1, 3.2, 3.3, 3.4 | 4×M | Robustness + test gaps |
| 4 | 4.1, 4.2, 4.3, 4.4 | M+3×S | Documentation + polish |

---

## Key Anthropic Pattern Gaps

| Principle | Current State | Gap | Fix |
|-----------|--------------|-----|-----|
| Tool descriptions are API docs | Brief, no examples | Missing examples, isolation model, concurrency limit | Task 1.3 |
| Error messages guide recovery | Good but chain loses context | Prior step results lost on chain failure | Task 3.1 |
| Include examples in descriptions | None | LLMs learn from examples faster than prose | Task 1.3 |
| Let agents self-correct | Already good | Tool errors returned to LLM, not swallowed | ✅ |
| Scale effort to complexity | Workflow shortcuts exist | Good coverage | ✅ |
| Transparent abstractions | Prompts visible in skills | No hidden magic | ✅ |

## Key TS Pattern Gaps

| Pattern | Current State | Gap | Fix |
|---------|--------------|-----|-----|
| Discriminated unions | Optional fields | DisplayItem, SpawnResult | Tasks 2.1, 2.2 |
| JSDoc on exports | Partial | Key functions undocumented | Task 4.1 |
| Type exports | None | Downstream can't use types | Task 4.4 |
| Error extraction | Inline | Repeated 3× | Task 1.1 |
