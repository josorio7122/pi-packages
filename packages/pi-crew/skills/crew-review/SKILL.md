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

Update `.crew/state.md` — advance `phase` to the next phase in your workflow.
Keep the `workflow` field unchanged.

```yaml
---
feature: { feature-name }
phase: { next phase from workflow }
workflow: { keep the same workflow from before }
---
```

## Evaluation Gate

Before moving to ship:

- [ ] All three gates pass (or user explicitly accepts with justification)
- [ ] Review report written
- [ ] No critical security findings unresolved

## Next Phase

Advance `phase` in `.crew/state.md` to the next phase in your workflow. The system will automatically load the next phase's instructions.
