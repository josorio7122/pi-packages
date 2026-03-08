# Phase Reference Guide

Detailed artifact templates, examples, diagnostic questions, and failure modes for each SDD phase.
Load this file at the start of a phase when you need the full detail.

---

## Phase 1 — Specify

### Artifact Template

```markdown
## Goal
One paragraph. What must be true when this feature is done — from the user's perspective.
No implementation language. No file names.

## Behaviors
- **<BehaviorName>:** Observable outcome. Subject + verb + measurable result.
  Example: "A registered user who submits a valid payment form receives a confirmation email within 30 seconds."
- **<BehaviorName>:** ...

## Contracts
Data shapes at system boundaries (API request/response bodies, event payloads, database records written).
Use plain English or a simple field list — no code types, no class names.

Example:
- Payment intent payload: { amount_cents: integer, currency: string, idempotency_key: string }
- Confirmation event: { user_id, order_id, amount_charged, timestamp }

## Constraints
Existing system properties this work must preserve.
- Performance: no regression to existing response times
- Data: no migration to existing tables required
- Auth: existing session model unchanged
- Greenfield note: if no prior code exists, state "Greenfield — no prior implementation"

## Error Cases
- **<ErrorName>:** Trigger condition → expected system response (not implementation detail).
  Example: "Duplicate idempotency key → return the original result without re-charging."
- **<ErrorName>:** ...

## Out of Scope
Explicit list of things this work does NOT do. Prevents scope creep.
- Example: "Refunds are out of scope for this iteration."

## Open Questions
Unresolved decisions that could change the spec. Numbered for tracking.
1. Should partial payment failures roll back the entire order or save partial state?
```

### What Good Looks Like

A good spec:
- Describes behaviors in terms of user-observable outcomes, not internal mechanics.
- Has a Contracts section that a developer could implement to without reading any other code.
- Has an Out of Scope section with at least one item.
- Would still be valid if the implementation language changed entirely.

A bad spec:
- Contains class names, function signatures, or file paths.
- Describes the implementation sequence ("first we query the DB, then we call the service").
- Conflates behaviors with error cases (keeps them in separate sections).
- Has an empty Open Questions section on a complex feature.

### Diagnostic Questions (ask yourself during Phase 1)

1. Does every behavior describe a user-observable outcome, not an internal step?
2. Could a developer implement each contract without reading the codebase?
3. Is there at least one error case for each boundary crossing in Contracts?
4. Is everything in Out of Scope that was explicitly discussed but excluded?
5. Have I read the relevant existing code before writing the spec?

### Common Failure Modes

- **HOW-spec:** Spec describes implementation steps instead of behaviors → rewrite to observable outcomes.
- **Premature naming:** File names, class names, or function names appear in the spec → remove them.
- **Missing error cases:** Only the happy path is specified → add failure branches for each contract boundary.
- **Scope creep:** The spec silently grows beyond the original request → cut to Out of Scope, or stop and ask.

---

## Phase 2 — Plan

### Artifact Template

```markdown
## Components Affected
List of system components (not files or classes) that change.
Example: "Payment processing layer, order confirmation flow, email dispatch service"

## Sequence of Changes
Ordered list. Each entry: what changes and why it must happen before the next.

1. <Component or concern>: <what changes and why it must happen first>
2. <Component or concern>: <what changes and dependency on step 1>
3. ...

## Risk Areas
Where implementation is likely to be hard, uncertain, or prone to error.
- Example: "Idempotency enforcement — the contract requires exact-once semantics across retries."
- Example: "Email dispatch timing — the 30-second SLA may require async processing."

## Dependencies Map
What depends on what. Use behavior names from the spec, not implementation names.

- <BehaviorName> depends on: <other behavior or external service>
- <BehaviorName> is independent: can be implemented in any order relative to others
```

### What Good Looks Like

A good plan:
- References spec behavior names (e.g., "PaymentConfirmation behavior") instead of restating them.
- Has a Sequence of Changes where each step's "why it must come first" is explicit.
- Surfaces at least one Risk Area — plans with no risks are plans that haven't been read carefully.
- Does not name a single file, class, or function.

A bad plan:
- Says "edit `payments/views.py`" or "add a `confirm_order()` method" — those are implementation details.
- Has a sequence that could be reordered without consequence (not a real dependency).
- Restates spec behaviors word-for-word instead of referencing them.

### Diagnostic Questions (ask yourself during Phase 2)

1. Does every sequence step reference a spec behavior or a dependency, not an implementation detail?
2. Is every item in Components Affected justified by a spec behavior?
3. Does the Dependencies Map cover all behaviors that interact with external systems?
4. Have I named every real risk, or am I being optimistic?

### Common Failure Modes

- **Implementation leakage:** File names, function names, or code snippets appear in the plan → remove them.
- **Missing sequence:** All changes listed as parallel when some clearly depend on others → re-order.
- **No risks:** Risk Areas is empty → re-read the spec, especially error cases and contracts.
- **Scope expansion:** Plan covers more than the spec → stop and ask whether to update the spec first.

---

## Phase 3 — Tasks

### Artifact Template

```markdown
## Task 1: <Verb phrase — imperative, specific>
- **Spec behavior satisfied:** <BehaviorName from spec>
- **Acceptance condition:** <Observable outcome that proves this task is done — no implementation detail>
- **Depends on:** none

## Task 2: <Verb phrase>
- **Spec behavior satisfied:** <BehaviorName>
- **Acceptance condition:** <Observable outcome>
- **Depends on:** Task 1

## Task 3: <Verb phrase>
- **Spec behavior satisfied:** <BehaviorName>
- **Acceptance condition:** <Observable outcome>
- **Depends on:** Tasks 1, 2
```

### What Good Looks Like

A good task:
- Has a verb-phrase title that is specific enough to know when it's done ("Add idempotency key validation to payment intake" not "Handle idempotency").
- Has an acceptance condition that is observable without reading code ("Submitting the same idempotency key twice returns the original response body and HTTP 200").
- References exactly one spec behavior (if a task satisfies multiple behaviors, split it).

A bad task:
- Has a vague title ("Implement payment stuff").
- Has an acceptance condition that describes internal state ("The `IdempotencyStore` returns the cached result") — that is not observable from outside.
- Depends on a task with a higher number (dependency inversion — re-order).

### Diagnostic Questions (ask yourself during Phase 3)

1. Is every task independently completable before the next begins?
2. Does every acceptance condition describe an outcome observable without reading implementation?
3. Is every spec behavior covered by at least one task?
4. Are there any tasks with no spec behavior reference? (If so, is that work actually in scope?)

### Common Failure Modes

- **Mega-task:** One task covers multiple spec behaviors → split it.
- **Un-orderable list:** Tasks are listed but dependencies make the order ambiguous → re-sequence.
- **Missing acceptance condition:** Task has a behavior reference but no observable outcome → add one.
- **Orphaned task:** A task references no spec behavior → either it's out of scope (remove it) or the spec is missing a behavior (update the spec first).

---

## Phase 4 — Implement & Verify

### TDD Sequence (per task)

```
1. Write the failing test
   - Run it → confirm it FAILS
   - A test that passes before implementation is a broken test — do not proceed

2. Write the minimum implementation
   - Only what the test requires
   - No speculative code, no extras

3. Run the tests → confirm they PASS

4. Refactor if needed → run tests again

5. Commit:
   git status --short
   git add <file1> <file2>   # never git add . or git add -A
   git commit -m "type: description"
   
6. Mark the task done in the task list
   State: "Task N complete — <BehaviorName> behavior now satisfied"
```

### TDD Exceptions

TDD is non-negotiable in Phase 4. The only valid exceptions:

| Situation | Requirement before skipping |
|---|---|
| Pure configuration file (tsconfig, eslint, Docker) | Document explicitly: "No test written — pure config, behavior verified by [tool/command]" |
| Pure styling change (CSS only) | Document explicitly: "No test written — CSS only, verified by visual inspection" |
| Migration script | Document explicitly: "No test written — migration, verified by running against test DB" |
| Glue/wiring code connecting already-tested components | Document explicitly: "No test written — wiring only, covered by integration tests in Task N" |

Never skip TDD without one of the above justifications written in the commit message or task note.

### Spec Contradiction Protocol

If implementation reveals that the spec is wrong or incomplete:

1. **Stop immediately.** Do not write code that silently papers over the gap.
2. State the contradiction explicitly:
   > "Implementation reveals: [spec behavior X] cannot be satisfied because [specific technical reason]. The spec assumes [Y] but the system requires [Z]."
3. Offer two options to the user:
   - Update the spec to reflect the new understanding (go back to Phase 1 for the affected behavior).
   - Constrain the implementation to what the spec actually allows (narrow scope).
4. Do not proceed until the user chooses.

### Diagnostic Questions (ask yourself during Phase 4)

1. Did I see this test fail before I wrote any implementation? (If not, the test is broken.)
2. Does this commit contain exactly one task's worth of change?
3. Have I run the linter/formatter on changed files before committing?
4. Does the implementation satisfy the acceptance condition, or only make the test pass? (These should be the same — if they're not, the test is wrong.)
5. Did I name any files or write any code that the spec explicitly excluded from scope?

### Common Failure Modes

- **Green-before-red:** Test passes before implementation → test is not actually testing anything. Delete it and write a real one.
- **Over-implementation:** Code solves problems not in the task list → remove or defer to a future task.
- **Silent spec drift:** Implementation quietly changes a contract or behavior from the spec → stop and surface it.
- **Mega-commit:** Multiple tasks bundled in one commit → split into one commit per task.
