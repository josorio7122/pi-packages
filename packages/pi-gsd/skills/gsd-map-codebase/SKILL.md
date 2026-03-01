---
name: gsd-map-codebase
description: Map an existing codebase structure, dependencies, and patterns for brownfield projects.
---

# GSD: Map Codebase

## Prerequisites

- A project directory with existing source code
- `.planning/` directory must exist (or will be initialized)

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

Key agents used: `codebase-mapper`

## Workflow

Read and follow: `$GSD_RUNTIME_PATH/workflows/map-codebase.md`
