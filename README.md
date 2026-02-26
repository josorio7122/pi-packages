# pi-packages

Extensions and skills for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent), published as a single installable git package.

## Packages

| Package | Description |
| --- | --- |
| [`@josorio/pi-memory`](./packages/pi-memory) | Persistent cross-session memory via LanceDB vector storage |

## Install

Install directly from GitHub into pi:

```sh
pi install git:github.com/josorio7122/pi-packages
```

This clones the repo, installs dependencies, and loads all extensions and skills automatically on every pi session.

To try it without installing permanently:

```sh
pi -e git:github.com/josorio7122/pi-packages
```

## Local Development

```sh
# Install all dependencies
pnpm install

# Run all tests
pnpm test

# Type-check all packages
pnpm lint
```

Run commands scoped to a single package:

```sh
pnpm --filter @josorio/pi-memory test
pnpm --filter @josorio/pi-memory lint
```

## Repository Structure

```
pi-packages/
├── packages/
│   └── pi-memory/              # Persistent memory extension
│       ├── extensions/memory/  # pi extension source files
│       ├── skills/memory-guide/ # SKILL.md for the memory-guide skill
│       └── README.md
├── turbo.json
└── package.json
```

## Adding a Package

```sh
cd packages && mkdir my-package && cd my-package
pnpm init
```

Follow the [pi packages documentation](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/packages.md) for the correct `package.json` shape. Then add the new package's extension and skill paths to the `pi` key in the root `package.json`.

## Tech Stack

| Tool | Version | Purpose |
| --- | --- | --- |
| [Turborepo](https://turbo.build) | 2.8.11 | Monorepo task runner and caching |
| [TypeScript](https://typescriptlang.org) | 5.9.3 | Static typing across all packages |
| [Vitest](https://vitest.dev) | 4.0.18 | Unit testing with ESM support |
| [LanceDB](https://lancedb.com) | 0.26.2 | Embedded vector database (pi-memory) |
| [OpenAI SDK](https://github.com/openai/openai-node) | 6.25.0 | Embeddings via `text-embedding-3-*` (pi-memory) |
