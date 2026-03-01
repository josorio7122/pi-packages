# glab

GitLab CLI skill for [pi](https://github.com/mariozechner/pi). Comprehensive command reference for [glab](https://gitlab.com/gitlab-org/cli) — merge requests, issues, CI/CD pipelines, variables, schedules, tokens, stacked diffs, releases, and raw API calls.

## Prerequisites

- `glab` CLI installed
- Authenticated: `glab auth login`

## What It Covers

| Domain | Key Commands |
|--------|-------------|
| Merge Requests | create, list, view, checkout, approve, merge, rebase, comments, notes |
| Issues | create, list, view, board, edit, close, reopen, subscribe |
| CI/CD Pipelines | status, list, run, view (TUI), delete, variables, schedules, lint |
| CI/CD Variables | list, get, set, update, delete, export |
| Repository | view, clone, fork, create, search, members, transfer, mirror, archive |
| Releases | create, upload, download, edit, delete |
| Tokens | list, create, revoke, rotate |
| Stacked Diffs | create, save, amend, sync, first/prev/next/last, move, reorder |
| API | REST and GraphQL with placeholder substitution, auto-pagination, ndjson streaming |

## Usage

The skill activates automatically when you ask pi to work with GitLab:

```
Create a merge request from this branch
```

```
Check the pipeline status
```

```
List CI/CD variables for this project
```

## Full Reference

See the [SKILL.md](./skills/glab/SKILL.md) for the complete command reference, configuration scopes, and workflow patterns.

## License

MIT
