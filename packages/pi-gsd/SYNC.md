# Syncing from Upstream GSD

This package is a port of [Get Shit Done](https://github.com/gsd-build/get-shit-done).
When upstream changes, follow this process to sync.

## What Gets Synced

| Component | Sync Method |
|-----------|------------|
| Templates (`runtime/templates/`) | Verbatim copy |
| References (`runtime/references/`) | Verbatim copy |
| Workflows (`runtime/workflows/`) | Copy + adapt (see below) |
| Agents (`agents/`) | Manual rebuild (behavioral contracts only) |
| Library (`extensions/gsd/lib/`) | Manual port (CJS → TypeScript ESM) |

## Steps

### 1. Check upstream changes

```bash
cd /path/to/get-shit-done
git log --oneline -20
```

### 2. Copy templates and references (verbatim)

```bash
cp -r /path/to/get-shit-done/get-shit-done/templates/* packages/pi-gsd/runtime/templates/
cp -r /path/to/get-shit-done/get-shit-done/references/* packages/pi-gsd/runtime/references/
```

### 3. Copy and adapt workflows

```bash
cp -r /path/to/get-shit-done/get-shit-done/workflows/* packages/pi-gsd/runtime/workflows/
```

Then apply replacements in every workflow file:

| Find | Replace |
|------|---------|
| `@~/.claude/get-shit-done/workflows/` | Read: `$GSD_RUNTIME_PATH/workflows/` |
| `@~/.claude/get-shit-done/templates/` | Read: `$GSD_RUNTIME_PATH/templates/` |
| `@~/.claude/get-shit-done/references/` | Read: `$GSD_RUNTIME_PATH/references/` |
| `gsd-tools.cjs <cmd> <sub>` | `gsd_{cmd}` tool with action: `"{sub}"` |
| `@~/.claude/agents/gsd-X.md` | _(remove — agent loaded by gsd_dispatch)_ |
| `Task(...)` | `gsd_dispatch(agent: "...", task: "...")` |

### 4. Update agents (manual)

Read the upstream agent, extract behavioral changes, update the pi-native version.
Each agent has a header: `<!-- Behavioral contract ported from: agents/gsd-{name}.md -->`

### 5. Update library (manual)

Compare upstream CJS changes to the TypeScript port. Update types, functions, tests.

### 6. Verify

```bash
pnpm --filter @josorio/pi-gsd build
pnpm --filter @josorio/pi-gsd test
```
