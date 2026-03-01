# gh

GitHub CLI skill for [pi](https://github.com/mariozechner/pi). Comprehensive command reference for [gh](https://cli.github.com/) — pull requests, issues, releases, Actions, repository management, and raw API calls.

## Prerequisites

- `gh` CLI installed
- Authenticated: `gh auth login`

## What It Covers

| Domain        | Key Commands                                                                   |
| ------------- | ------------------------------------------------------------------------------ |
| Pull Requests | create, list, view, checkout, review, merge, edit, close, reopen, diff, checks |
| Issues        | create, list, view, edit, close, transfer, pin, delete                         |
| Repository    | view, clone, fork, create, sync, archive, deploy keys                          |
| Releases      | create, upload, list, download, edit, delete                                   |
| Actions       | workflow list/run/enable/disable, run view/watch/rerun, cache list/delete      |
| Search        | repos, issues, PRs, code, commits                                              |
| API           | REST and GraphQL with `--jq` and `--template` support                          |

## Usage

The skill activates automatically when you ask pi to work with GitHub:

```
Create a PR from this branch with the current diff as description
```

```
Check CI status on the latest PR
```

```
List all open issues labeled "bug"
```

## Full Reference

See the [SKILL.md](./skills/gh/SKILL.md) for the complete command reference, environment variables, and workflow patterns.

## License

MIT
