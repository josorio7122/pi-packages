# pi-packages

A Turborepo monorepo containing packages for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@josorio/pi-memory`](./packages/pi-memory) | 0.1.0 | Persistent cross-session memory via LanceDB vector storage |

## Requirements

- **Node.js** ≥ 22 (Node 24 recommended — matches active LTS)
- **pnpm** ≥ 9
- **pi coding agent** installed globally

## Getting Started

```sh
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Type-check all packages
pnpm lint
```

## Workspace Commands

```sh
# Run a command for a specific package
pnpm --filter @josorio/pi-memory test
pnpm --filter @josorio/pi-memory lint

# Watch mode (tests)
pnpm --filter @josorio/pi-memory test:watch
```

## `@josorio/pi-memory`

Persistent long-term memory for pi agents. Stores and retrieves conversation context across sessions using [LanceDB](https://lancedb.com) and OpenAI embeddings.

**Features:**
- Three LLM tools: `memory_recall`, `memory_store`, `memory_forget`
- Auto-injection of relevant memories at conversation start
- Auto-capture of important user statements at conversation end
- Prompt injection guard — adversarial inputs never surface poisoned memories
- GDPR-compliant deletion by ID or semantic query

**Install into pi:**

```sh
pi package add @josorio/pi-memory
```

**Required env var:**

```sh
export OPENAI_API_KEY=sk-...
```

See [`packages/pi-memory/README.md`](./packages/pi-memory/README.md) for full documentation.

## Repository Structure

```
pi-packages/
├── packages/
│   └── pi-memory/          # @josorio/pi-memory package
│       ├── extensions/
│       │   └── memory/     # pi extension entry point + source files
│       ├── skills/
│       │   └── memory-guide/  # SKILL.md for the memory-guide skill
│       └── README.md
├── turbo.json
└── package.json
```

## Adding a New Package

```sh
cd packages
mkdir my-package && cd my-package
pnpm init
```

Follow the pi [packages documentation](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/packages.md) for the correct `package.json` shape (`pi.extensions`, `pi.skills` fields).

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| [Turborepo](https://turbo.build) | 2.8.11 | Monorepo task runner and caching |
| [TypeScript](https://typescriptlang.org) | 5.9.3 | Static typing across all packages |
| [Vitest](https://vitest.dev) | 4.0.18 | Fast unit testing with ESM support |
| [LanceDB](https://lancedb.com) | 0.26.2 | Embedded vector database |
| [OpenAI SDK](https://github.com/openai/openai-node) | 6.25.0 | Embeddings via `text-embedding-3-*` |
