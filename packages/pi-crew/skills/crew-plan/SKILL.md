---
name: crew-plan
description: Planning phase — break the approved design into executable tasks with dependency analysis, wave structure, and verification criteria.
---

# Plan Phase

Break the approved design into tasks that executor agents can implement independently.

## When to Use

- After design is approved
- When you need to coordinate multiple implementation tasks
- Before dispatching any executors

## Protocol

### 1. Load Context

Read:

- `.crew/phases/<feature>/design.md` — locked decisions, must-haves
- `.crew/phases/<feature>/explore.md` — codebase context

### 2. Task Breakdown

Break the design into tasks. Each task must be:

- **Independently executable** — An executor can complete it without needing output from another running task
- **Specifically scoped** — Exact files, exact changes, exact verification
- **Right-sized** — 15-60 minutes of agent execution time. If shorter, combine. If longer, split.
- **2-3 tasks per wave maximum** — Keeps agent context budget at ~50%

#### Task Structure

Each task needs:

- **Name** — Action-oriented: "Create auth middleware" not "Authentication"
- **Files** — Exact paths to create/modify
- **Action** — Specific implementation instructions. Enough detail that the executor doesn't need to make design decisions.
- **Verify** — A command to prove completion (test command, curl, file check)
- **Done criteria** — What must be true for the task to be complete

#### Specificity Test

Could a different agent implement this task without asking clarifying questions? If not, add more detail.

- ✗ "Add authentication" → too vague
- ✓ "Create POST /api/auth/login accepting {email, password}, validate with bcrypt against users table, return JWT in httpOnly cookie with 15-min expiry using jose library"

### 3. Dependency Analysis

For each task, identify:

- **Needs:** What must exist before this task can run?
- **Creates:** What does this task produce?

Build a dependency graph and assign waves:

```
Wave 1: Independent tasks (no dependencies)
  Task A: Create user model
  Task B: Create product model

Wave 2: Depends on Wave 1
  Task C: Create user API (needs Task A)
  Task D: Create product API (needs Task B)

Wave 3: Depends on Wave 2
  Task E: Create dashboard (needs C + D)
```

**Prefer vertical slices over horizontal layers:**

- ✓ "User feature (model + API + UI)" — self-contained, can run parallel with other features
- ✗ "All models, then all APIs, then all UI" — forces sequential execution

### 4. Goal-Backward Verification

Before finalizing the plan, verify completeness using the must-haves from the design:

For each **truth** (observable behavior): Is there a task that implements it?
For each **artifact** (file): Is there a task that creates it?
For each **key link** (connection): Is there a task that wires it?

If anything is missing, add a task.

### 5. Write Plan

Write `.crew/phases/<feature>/plan.md`:

```markdown
# Plan: {feature-name}

## Waves

### Wave 1 (parallel)

| Task | Name   | Files   | Depends On |
| ---- | ------ | ------- | ---------- |
| 01   | {name} | {files} | none       |
| 02   | {name} | {files} | none       |

### Wave 2 (parallel)

| Task | Name   | Files   | Depends On |
| ---- | ------ | ------- | ---------- |
| 03   | {name} | {files} | 01         |

## Must-Haves Traceability

| Must-Have    | Type     | Task |
| ------------ | -------- | ---- |
| {truth-1}    | truth    | 01   |
| {artifact-1} | artifact | 02   |
| {link-1}     | key-link | 03   |
```

Write individual task files to `.crew/phases/<feature>/build/task-NN.md` using the task template.

### 6. Present to User

Show the wave structure and ask for approval. Highlight:

- Total task count and estimated waves
- Any dependencies or potential bottlenecks
- File overlap between tasks (if any — should be avoided)

### 7. Update State

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

Before moving to build:

- [ ] User approved the plan
- [ ] Every task has: name, files, action, verify, done criteria
- [ ] Every must-have from the design maps to at least one task
- [ ] Wave structure is valid (no circular dependencies)
- [ ] No file overlap between tasks in the same wave
- [ ] Task files written to `.crew/phases/<feature>/build/`

## Next Phase

Advance `phase` in `.crew/state.md` to the next phase in your workflow. The system will automatically load the next phase's instructions.
