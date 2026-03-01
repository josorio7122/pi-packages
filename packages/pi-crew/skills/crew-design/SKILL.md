---
name: crew-design
description: Design phase — discuss approaches with the user, dispatch an architect for complex designs, and lock decisions before implementation.
---

# Design Phase

Make design decisions with the user before writing any code.

## When to Use

- After explore phase for non-trivial features
- When there are multiple valid approaches
- When the user needs to make decisions about behavior, UI, or architecture

## Protocol

### 1. Load Context

Read the explore findings:
```
.crew/phases/<feature>/explore.md
```

### 2. Assess Design Complexity

| Complexity | Approach |
|-----------|----------|
| Obvious (1 clear way) | Propose it directly, ask user to confirm |
| Moderate (2-3 options) | Present options yourself based on explore findings |
| Complex (architectural decisions, many trade-offs) | Dispatch an **architect** agent with explore findings + requirements |

### 3. For Complex Designs — Dispatch Architect

```
dispatch_crew({
  preset: "architect",
  task: "Design the {feature} feature. Requirements: {requirements}. Codebase context: {paste explore findings}. User constraints: {any locked decisions}.",
  cwd: "<project dir>"
})
```

The architect returns a structured design with multiple approaches, trade-offs, and a recommendation.

### 4. Present Options to User

Show the design options with clear trade-offs. Ask the user to decide:

- **Approach A** vs **Approach B** — which one?
- **Scope** — what's in, what's out?
- **Behavior details** — how should edge cases work?

### 5. Lock Decisions

After the user approves, write `.crew/phases/<feature>/design.md`:

```markdown
# Design: {feature-name}

## Goal
{What must be TRUE when this feature works}

## Locked Decisions
{User-approved choices — these are NON-NEGOTIABLE during implementation}
- {decision 1}: {rationale}
- {decision 2}: {rationale}

## Technical Approach
{How it will be built — components, data flow, key patterns}

## Must-Haves

### Truths (observable behaviors)
- {truth-1}
- {truth-2}

### Artifacts (files that must exist)
- `{path}`: {purpose}

### Key Links (critical connections)
- {from} → {to} via {mechanism}

## Deferred Ideas
{Explicitly out of scope for this implementation}
- {idea 1}: deferred because {reason}

## Out of Scope
- {thing not being built}
```

### 6. Update State

Update `.crew/state.md` — advance `phase` to the next phase in your workflow.
Keep the `workflow` field unchanged.

```yaml
---
feature: {feature-name}
phase: {next phase from workflow}
workflow: {keep the same workflow from before}
---
```

## Evaluation Gate

Before moving to the next phase:
- [ ] User explicitly approved the design
- [ ] Design written to `.crew/phases/<feature>/design.md`
- [ ] Locked decisions are specific and actionable
- [ ] Must-haves list is complete (truths, artifacts, key links)

## Next Phase

Advance `phase` in `.crew/state.md` to the next phase in your workflow. The system will automatically load the next phase's instructions.
