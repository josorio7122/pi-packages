# pi-packages

A collection of [pi](https://github.com/mariozechner/pi) extensions — packages that extend the pi AI coding agent with memory, codebase search, and other capabilities.

---

## Packages

| Package | Version | Description |
|---|---|---|
| [`@josorio/pi-memory`](./packages/pi-memory) | 0.1.0 | Persistent conversation memory via LanceDB + OpenAI embeddings |
| [`@josorio/pi-index`](./packages/pi-index) | 0.1.0 | Semantic codebase search via hybrid vector + BM25 indexing |

---

## Getting Started

### Install a package

```bash
# From your pi config directory (e.g. ~/.pi)
pnpm add @josorio/pi-memory
pnpm add @josorio/pi-index
```

### Add to pi config

```json
{
  "extensions": [
    "@josorio/pi-memory",
    "@josorio/pi-index"
  ]
}
```

---

## Development

This is a [pnpm](https://pnpm.io) workspace + [Turborepo](https://turbo.build) monorepo.

```bash
# Install all dependencies
pnpm install

# Run all tests
pnpm turbo test

# Build all packages
pnpm turbo build

# Run tests for a specific package
pnpm --filter @josorio/pi-memory exec vitest run
pnpm --filter @josorio/pi-index exec vitest run
```

---

## Requirements

- Node.js 20+
- pnpm 9+
- OpenAI API key

---

## License

MIT
