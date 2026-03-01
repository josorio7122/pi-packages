---
name: gsd-complete-milestone
description: Complete and archive a milestone. Archives phases, creates retrospective, prepares for next milestone.
---

# GSD: Complete Milestone

## Prerequisites

- `.planning/` directory must exist in the current working directory
- All phases in the current milestone must be complete
- Verification must have passed for all phases

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

## Workflow

Read and follow the workflow instructions at:
`$GSD_RUNTIME_PATH/workflows/complete-milestone.md`

Use the `read` tool to load the workflow file, then follow its instructions step by step.
