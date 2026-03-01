# @josorio/pi-meta

Pi Meta — a meta-agent that builds Pi agents using parallel domain-expert research.

A team of 9 domain-specific research experts (extensions, themes, skills, settings, TUI, CLI, prompts, agents, keybindings) operate **in parallel** to gather fresh documentation and patterns. The primary orchestrator agent synthesizes their findings and writes complete, working implementations.

## Installation

```bash
pi install /path/to/pi-packages/packages/pi-meta
```

Or in the monorepo:

```bash
pnpm install
```

## Usage

```bash
pi -e packages/pi-meta/extensions/pi-meta.ts
```

Then ask it to build any Pi component:

- "Build me an extension that tracks API costs"
- "Create a cyberpunk theme with neon accents"
- "Make a skill that runs database migrations"
- "Create an agent team for code review"

## Architecture

```
User Request → Pi Meta Orchestrator (read/write)
                    │
                    ├── query_experts (parallel)
                    │
          ┌─────┬──┴──┬─────┬─────┬─────┬─────┬─────┬─────┐
          │     │     │     │     │     │     │     │     │
        ext   theme skill config tui   cli  prompt agent keybinding
       expert expert expert expert expert expert expert expert expert
          │     │     │     │     │     │     │     │     │
          └─────┴──┬──┴─────┴─────┴─────┴─────┴─────┴─────┘
                    │
                    ▼
            Synthesize + Write Files
```

Each expert:
1. Fetches fresh Pi docs from GitHub (firecrawl → curl fallback)
2. Searches local codebase for existing patterns
3. Returns structured research findings

The orchestrator is the only agent that writes files.

## Agent Definitions

Expert agent files live in `.pi/agents/pi-meta/` at the project root. The extension reads them from there on session start.

## Experts

| Expert | Domain |
|--------|--------|
| ext-expert | Extensions — tools, events, commands, rendering |
| theme-expert | Themes — JSON format, 51 color tokens |
| skill-expert | Skills — SKILL.md packages, frontmatter |
| config-expert | Settings — settings.json, providers, models |
| tui-expert | TUI — components, widgets, keyboard input |
| cli-expert | CLI — flags, output modes, non-interactive |
| prompt-expert | Prompt templates — .md format, arguments |
| agent-expert | Agent definitions — .md personas, teams.yaml |
| keybinding-expert | Keyboard shortcuts — reserved keys, macOS compat |

## Commands

| Command | Description |
|---------|-------------|
| `/experts` | List available experts and their status |
| `/experts-grid N` | Set dashboard columns (1-5) |
