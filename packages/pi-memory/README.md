# @josorio/pi-memory

Persistent cross-session memory for pi agents. Ported from OpenClaw's `memory-lancedb` extension.

## What it does

- **Auto-recall** — before each agent turn, recalls semantically relevant memories and injects them into the system prompt
- **Auto-capture** — after each agent turn, scans user messages for memorable facts and stores them automatically
- **LLM tools** — the LLM can explicitly call `memory_recall`, `memory_store`, and `memory_forget`
- **Commands** — `/memory-stats` and `/memory-search` for quick inspection

## Storage

LanceDB vector database (embedded, file-based — no server needed). Default path: `~/.pi-memory/lancedb`

## Install

```bash
pi install /path/to/pi-packages/packages/pi-memory
```

## Configuration

Set environment variables before running pi:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | required | OpenAI API key for embeddings |
| `PI_MEMORY_API_KEY` | — | Alternative to `OPENAI_API_KEY` |
| `PI_MEMORY_AUTO_RECALL` | `true` | Inject memories before each turn |
| `PI_MEMORY_AUTO_CAPTURE` | `false` | Auto-capture memorable user messages |
| `PI_MEMORY_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `PI_MEMORY_DB_PATH` | `~/.pi-memory/lancedb` | LanceDB storage path |

## LLM tools

| Tool | Description |
|------|-------------|
| `memory_recall` | Search memories by semantic query |
| `memory_store` | Save a new memory |
| `memory_forget` | Delete a memory by ID or semantic search |

## Commands

| Command | Description |
|---------|-------------|
| `/memory-stats` | Show total memory count and DB path |
| `/memory-search <query>` | Search memories from the command line |

## Tech

- [LanceDB](https://lancedb.github.io/lancedb/) — embedded vector database (no server)
- [OpenAI embeddings](https://platform.openai.com/docs/guides/embeddings) — `text-embedding-3-small` (1536d) or `text-embedding-3-large` (3072d)

## Credits

Core logic ported from [OpenClaw](https://github.com/openclawai/openclaw) `extensions/memory-lancedb`.
