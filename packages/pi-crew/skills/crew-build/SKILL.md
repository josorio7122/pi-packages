---
name: crew-build
description: Build phase — execute the plan wave by wave using executor agents. Handle failures with debugger agents. Track progress in task files.
---

# Build Phase

Execute the plan by dispatching executor agents wave by wave.

## When to Use

- After plan is approved and task files exist
- To resume a partially completed build (read task file statuses)

## Protocol

### 1. Load Context

Read:
- `.crew/phases/<feature>/plan.md` — wave structure
- `.crew/phases/<feature>/design.md` — locked decisions (pass to executors)
- `.crew/phases/<feature>/build/task-*.md` — individual task specs and statuses

Check which tasks are already done (status: done in their task files). Resume from the first incomplete wave.

### 2. Execute Waves

For each wave, in order:

#### a. Prepare Executor Tasks

For each task in the wave, build the dispatch arguments:

```
dispatch_crew({
  tasks: [
    {
      preset: "executor",
      task: "<full task context — see below>",
      cwd: "<project working directory>"
    },
    // ... more tasks in this wave
  ]
})
```

**Full task context** passed to each executor (they have NO access to your conversation):

```
## Task: {task name}

## Design Context
{Paste the relevant locked decisions from design.md}
{Paste the relevant must-haves this task addresses}

## Task Spec
{Paste the full content of the task file: action, verify, done criteria}

## Codebase Context
{Paste relevant file paths and patterns from explore.md}
{If this task depends on a previous task, paste what that task produced}

## Constraints
- Follow existing project conventions
- Commit with format: feat|fix|test|refactor: description
- Run tests after implementation
```

#### b. Dispatch and Monitor

Dispatch all tasks in the wave as a parallel `dispatch_crew` call. Progress renders inline via renderResult.

#### c. Evaluate Wave Results

After the wave completes, for each task:

**If task succeeded:**
- Read the executor's output
- Update the task file: status → done, commit hash, any deviations
- Verify: run the task's verify command yourself to confirm

**If task failed:**
- Read the error output
- Dispatch a **debugger** agent to diagnose:

```
dispatch_crew({
  preset: "debugger",
  task: "Debug this failure. Error: {error output}. Task was: {task spec}. Files involved: {file list}.",
  cwd: "<project dir>"
})
```

- If debugger fixes it: update task file, continue
- If debugger can't fix: update task file with error, present to user
- **Max 3 retry attempts per task** — after 3 failures, mark as failed and continue

**If task returned a Rule 4 deviation (architectural change needed):**
- Present the deviation to the user
- Wait for decision
- Re-dispatch executor with the decision, or adjust the plan

#### d. Verify Wave

After all tasks in a wave are done:
- Run the project's test suite
- Check that all expected files exist
- Verify no regressions from previous waves

Only proceed to the next wave if verification passes.

### 3. Write Build Summary

After all waves complete, write `.crew/phases/<feature>/build/summary.md`:

```markdown
# Build Summary: {feature-name}

## Tasks
| Task | Name | Status | Commit | Deviations |
|------|------|--------|--------|-----------|
| 01 | {name} | done | {hash} | none |
| 02 | {name} | done | {hash} | [Rule 1] fixed null check |

## Deviations
- [Rule 1 - Bug] {description of auto-fix}
- [Rule 2 - Critical] {description of added functionality}

## Test Results
{Final test suite output summary}

## Files Changed
- `{path}`: {what changed}
```

### 4. Update State

Update `.crew/state.md` with phase: build, progress (N/M tasks), completion status.

## Evaluation Gate

Before moving to review:
- [ ] All tasks complete (status: done) or explicitly failed with documentation
- [ ] Test suite passes
- [ ] All expected files exist
- [ ] Build summary written
- [ ] No unresolved Rule 4 deviations

## Error Recovery

If a wave fails and can't be fixed after retries:
1. Document what failed and why
2. Present to user with options:
   - Fix manually and resume
   - Adjust the plan (re-enter plan phase)
   - Ship what's done (skip remaining tasks)

## Next Phase

Proceed to **review** (`/skill:crew-review`) to verify implementation quality.
