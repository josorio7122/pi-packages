---
name: gsd-new-project
description: Initialize a new GSD project — creates .planning/ directory, config, roadmap, and state. Use when starting a brand new project with structured planning.
---

# GSD: New Project

## Prerequisites

- No `.planning/` directory should exist yet in the current working directory
- If `.planning/` already exists, warn the user and stop — use `gsd-new-milestone` or `gsd-resume-project` instead

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
- **roadmapper** — generates the project roadmap and phase structure
- **project-researcher** — researches the codebase and project context

## Workflow

Read and follow the workflow instructions at:
`$GSD_RUNTIME_PATH/workflows/new-project.md`

Use the `read` tool to load the workflow file, then follow its instructions step by step.
