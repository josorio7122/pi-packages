---
name: crew-explore
description: Codebase exploration phase — dispatch scouts to understand project structure, find relevant code, and identify patterns before making changes.
---

# Explore Phase

Dispatch scouts to understand the codebase before making any changes.

## When to Use

- Starting work on an unfamiliar codebase
- Working on a part of the codebase you haven't explored yet
- Before any non-trivial implementation

## Protocol

### 1. Assess Project Size

Run a quick file count to determine scale:

```bash
find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -not -path '*/__pycache__/*' -not -path '*/.venv/*' | wc -l
```

### 2. Dispatch Scouts

Scale scout count to project size:

| Project Size | Files  | Scouts | Focus Areas                                                                           |
| ------------ | ------ | ------ | ------------------------------------------------------------------------------------- |
| Small        | < 50   | 1      | Full project scan                                                                     |
| Medium       | 50-500 | 2      | 1: project structure + stack, 2: area relevant to task                                |
| Large        | 500+   | 3-4    | 1: structure, 2: relevant area, 3: conventions/patterns, 4: dependencies/integrations |

Dispatch scouts in **parallel** via `dispatch_crew({ tasks: [...] })`.

Each scout task should be specific:

- ✓ "Explore the authentication system — find all files related to login, JWT, sessions, middleware"
- ✓ "Map the project structure — directory layout, tech stack, key entry points, configuration"
- ✗ "Look at the project" (too vague)

### 3. Collect and Write Findings

After scouts return, synthesize their findings into `.crew/phases/<feature>/explore.md`:

```markdown
# Explore: {feature-name}

## Project Overview

- **Stack:** {languages, frameworks, key libraries}
- **Size:** {file count, directory structure}
- **Conventions:** {naming, patterns, test approach}

## Relevant Code

- `{path}` ({lines}): {what it does, why it matters}

## Patterns

- {pattern}: {where used, example}

## Concerns

- {anything notable for implementation}

## Key Dependencies

- {dependency}: {how it's used}
```

### 4. Present to User

Show a compressed summary of findings. Highlight:

- What's relevant to the task
- Anything surprising or concerning
- Suggested approach based on what was found

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

If `.crew/state.md` doesn't exist yet, create it now with your chosen workflow.

## Evaluation Gate

Before moving to the next phase:

- [ ] At least one scout completed successfully
- [ ] Findings written to `.crew/phases/<feature>/explore.md`
- [ ] Summary presented to user

## Next Phase

Advance `phase` in `.crew/state.md` to the next phase in your workflow. The system will automatically load the next phase's instructions.
