<purpose>
Research how to implement a phase. Spawns gsd-phase-researcher with phase context.

Standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

Read reference: $GSD_RUNTIME_PATH/references/model-profile-resolution.md

Resolve model for:
- `gsd-phase-researcher`

## Step 1: Normalize and Validate Phase

Read reference: $GSD_RUNTIME_PATH/references/phase-argument-parsing.md

```bash
PHASE_INFO=$(Use the gsd_roadmap tool with action: "get-phase", args: "${PHASE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/RESEARCH.md 2>/dev/null
```

If exists: Offer update/view/skip options.

## Step 3: Gather Phase Context

```bash
INIT=$(Use the gsd_init tool with action: "phase-op", args: "${PHASE}")
# Extract: phase_dir, padded_phase, phase_number, state_path, requirements_path, context_path
```

## Step 4: Spawn Researcher

```
gsd_dispatch(
  agent: "gsd-phase-researcher",
  model: "{researcher_model}",
  task: """
<objective>
Research implementation approach for Phase {phase}: {name}
</objective>

<files_to_read>
- {context_path} (USER DECISIONS from /gsd:discuss-phase)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

<additional_context>
Phase description: {description}
</additional_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>
  """
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — Display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>
