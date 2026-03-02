# pi-packages

A collection of [pi](https://github.com/mariozechner/pi) packages — agentic coding workflows, web search, and CLI skills.

One install gives you a `dispatch_crew` tool for multi-agent orchestration, 10 skills for exploration through shipping, and integrations with GitHub, GitLab, and the Exa search API.

## Quick Start

```bash
pi install git:github.com/josorio7122/pi-packages
```

Verify:

```bash
pi list
# → git:github.com/josorio7122/pi-packages
```

You now have the `dispatch_crew` tool and all 10 skills available in every pi session.

## What's Included

### Extension

| Extension                      | Tool            | Description                                                       |
| ------------------------------ | --------------- | ----------------------------------------------------------------- |
| [pi-crew](./packages/pi-crew/) | `dispatch_crew` | Dispatch specialized AI agents through structured workflow phases |

### Skills

| Skill          | Package                                  | Description                                                                    |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `exa-search`   | [exa-search](./packages/exa-search/)     | Semantic web search, content extraction, and AI answers via Exa API            |
| `gh`           | [gh](./packages/gh/)                     | GitHub CLI — pull requests, issues, releases, Actions, API                     |
| `glab`         | [glab](./packages/glab/)                 | GitLab CLI — merge requests, issues, CI/CD, stacked diffs, API                 |
| `create-skill` | [create-skill](./packages/create-skill/) | Expert system for creating pi skills following the Agent Skills spec           |

## Packages

### [pi-crew](./packages/pi-crew/)

The centerpiece. Registers a `dispatch_crew` tool that spawns isolated pi agents with preset configurations — scout, researcher, architect, executor, reviewer, debugger — each with tuned system prompts, tool access, and model selection. Six workflow phases (explore → design → plan → build → review → ship) are enforced mechanically by the extension with auto-capture, phase gates, and state management. See the [pi-crew README](./packages/pi-crew/README.md) for full documentation.

### [exa-search](./packages/exa-search/)

Semantic web search via the [Exa API](https://exa.ai). Five scripts wrap the exa-js SDK: `search`, `answer`, `contents`, `find-similar`, and `research`. Requires an `EXA_API_KEY` environment variable. See the [exa-search README](./packages/exa-search/README.md).

### [gh](./packages/gh/)

Comprehensive reference skill for the [GitHub CLI](https://cli.github.com/). Covers pull requests, issues, releases, Actions workflows, repository management, and raw API calls. See the [gh README](./packages/gh/README.md).

### [glab](./packages/glab/)

Comprehensive reference skill for the [GitLab CLI](https://gitlab.com/gitlab-org/cli). Covers merge requests, issues, CI/CD pipelines, variables, schedules, tokens, stacked diffs, releases, and raw API/GraphQL calls. See the [glab README](./packages/glab/README.md).

### [create-skill](./packages/create-skill/)

Expert skill for creating new pi skills. Guides the agent through the [Agent Skills spec](https://agentskills.io) — frontmatter validation, directory structure, naming rules, and a step-by-step creation workflow. See the [create-skill README](./packages/create-skill/README.md).

## Development

This is a [pnpm](https://pnpm.io) workspace + [Turborepo](https://turbo.build) monorepo.

```bash
# Clone and install
git clone https://github.com/josorio7122/pi-packages.git
cd pi-packages
pnpm install

# Build all packages
pnpm turbo build

# Lint
pnpm run lint

# Format
pnpm run format
```

### Local development with pi

Install from a local path instead of GitHub:

```bash
pi install ./path/to/pi-packages
```

Changes to skills and extensions take effect on the next pi session.

## Requirements

- Node.js 20+
- pnpm 9+
- [pi](https://github.com/mariozechner/pi)
- `EXA_API_KEY` for exa-search
- `gh` CLI for gh skill
- `glab` CLI for glab skill

## License

MIT
