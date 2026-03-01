---
name: crew-ship
description: Ship phase — squash commits, push branch, open PR/MR with generated description.
---

# Ship Phase

Ship the completed, reviewed feature.

## When to Use

- After review phase passes
- When the user says "ship it"

## Protocol

### 1. Verify Readiness

Check:
- [ ] `.crew/phases/<feature>/review.md` exists and shows PASS
- [ ] Tests pass: run the project's test suite
- [ ] No uncommitted changes: `git status`

### 2. Show Commit Summary

```bash
git log --oneline main..HEAD  # or master..HEAD
```

Present the commits to the user. Ask preference:
- **Squash** — single clean commit (default)
- **Keep** — preserve atomic commits

### 3. Squash (if chosen)

```bash
git rebase -i main  # squash all into one commit
```

Commit message generated from design + build summary:
```
feat: {feature name}

{One-paragraph description from design.md goal}

- {key change 1 from build summary}
- {key change 2}
- {key change 3}
```

### 4. Push

```bash
git push origin HEAD
```

### 5. Open PR/MR

Generate PR description from `.crew/` artifacts:

```markdown
## What

{From design.md goal}

## Why

{From design.md rationale}

## Changes

{From build summary — files changed, key decisions}

## Testing

{From build summary — test results}

## Review Notes

{From review.md — any warnings or accepted deviations}
```

Use the appropriate CLI:
- GitHub: `gh pr create --title "..." --body "..."`
- GitLab: `glab mr create --title "..." --description "..."`

### 6. Write Feature Summary

Write `.crew/phases/<feature>/summary.md`:

```markdown
# Feature Summary: {feature-name}

## What was built
{One paragraph}

## Commits
| Hash | Message | Files |
|------|---------|-------|
| {hash} | {message} | {count} |

## Decisions Made
- {decision}: {rationale}

## Deviations from Plan
- {deviation}: {what happened, why}

## Stats
- **Agents dispatched:** {count}
- **Total cost:** ${amount}
- **PR/MR:** {url}
```

### 7. Update State

Update `.crew/state.md` — set `phase` to the last phase in your workflow (this phase) to mark the workflow as complete.

```yaml
---
feature: {feature-name}
phase: ship
workflow: {keep the same workflow from before}
---
```

The workflow is now complete.

## Evaluation Gate

- [ ] Branch pushed
- [ ] PR/MR opened
- [ ] Summary written

## Done

Feature is shipped! The user can continue with a new feature or close the session.
