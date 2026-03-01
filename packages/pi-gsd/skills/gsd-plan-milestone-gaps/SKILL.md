---
name: gsd-plan-milestone-gaps
description: Analyze gaps between planned and actual milestone coverage.
---

# GSD: Plan Milestone Gaps

## Prerequisites

- `.planning/` directory must exist
- At least one milestone must exist in the current phase

## Environment

The GSD extension provides these tools:
- **State/Ops:** `gsd_init`, `gsd_state`, `gsd_phase`, `gsd_roadmap`, `gsd_config`, `gsd_milestone`, `gsd_verify`, `gsd_util`
- **Dispatch:** `gsd_dispatch`, `gsd_dispatch_wave`

Runtime path: Available via `$GSD_RUNTIME_PATH` env var

## Agent Dispatch

When this workflow requires spawning agents:
- **Single agent:** `gsd_dispatch(agent: "...", task: "<prompt>")`
- **Parallel agents:** `gsd_dispatch_wave(dispatches: [...])`
- Model resolved automatically from config profile

## Workflow

Read and follow: `$GSD_RUNTIME_PATH/workflows/plan-milestone-gaps.md`
