---
name: gsd-execute-phase
description: Execute all plans in a phase using wave-based parallel execution. Spawns executor agents per plan, handles checkpoints and verification.
---

# GSD: Execute Phase

## Prerequisites

- `.planning/` directory must exist in the current working directory
- Plans must exist for the target phase (run `gsd-plan-phase` first if they don't)
- A phase must be specified by the user

## Environment

The GSD extension provides these tools:
- **State/Ops:** `gsd_init`, `gsd_state`, `gsd_phase`, `gsd_roadmap`, `gsd_config`, `gsd_milestone`, `gsd_verify`, `gsd_util`
- **Dispatch:** `gsd_dispatch`, `gsd_dispatch_wave`

Runtime path: Available via `$GSD_RUNTIME_PATH` env var (set by extension on load)

## Agent Dispatch

When this workflow requires spawning agents:
- **Single agent:** `gsd_dispatch(agent: "executor", task: "<prompt>")`
- **Parallel agents:** `gsd_dispatch_wave(dispatches: [{ agent: "executor", task: "...", label: "..." }, ...])`
- Model is resolved automatically from the project's config profile
- Provide ALL context in the task prompt — agents run in isolated processes with no access to GSD tools

Key agents used by this workflow:
- **executor** — implements individual plans
- **verifier** — scores deliverables against plan requirements
- **integration-checker** — validates cross-plan integration and consistency

## Workflow

Read and follow the workflow instructions at:
`$GSD_RUNTIME_PATH/workflows/execute-phase.md`

Use the `read` tool to load the workflow file, then follow its instructions step by step.
