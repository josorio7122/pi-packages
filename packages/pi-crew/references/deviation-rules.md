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
