# pi-index — Spec

**Version:** 0.1.0
**Status:** Draft

`pi-index` is a pi coding agent extension that indexes a project's codebase into a hybrid vector + full-text search database so the LLM can call `codebase_search` instead of using grep, bash, or find to navigate large codebases.

---

## Reading Order

Read these files in dependency order. Each file assumes familiarity with the ones above it.

| # | File | What it covers |
| --- | --- | --- |
| 1 | `GLOSSARY.md` | Plain-English definitions for every domain term. Start here. |
| 2 | `CONSTITUTION.md` | Cross-cutting rules: design principles, error codes, configuration, scoring, chunking contract, incremental indexing contract, scope filter syntax, out-of-scope. |
| 3 | `DATA-MODEL.md` | The three entities — CodeChunk, MtimeEntry, IndexConfig — with full field tables and constraints. |
| 4 | `specs/00-overview.md` | End-to-end workflows (first build, incremental refresh, search) and data flow diagram. |
| 5 | `specs/01-indexing.md` | File walking, structural chunking, embedding pipeline, mtime-based incremental updates. |
| 6 | `specs/02-search.md` | Query parsing, scope filters, hybrid search, RRF fusion, MMR reranking, result formatting. |
| 7 | `specs/03-tool-api.md` | LLM tool contracts: `codebase_search`, `codebase_index`, `codebase_status`. |
| 8 | `specs/04-commands.md` | Slash command contracts: `/index-status`, `/index-rebuild`, `/index-clear`. |

---

## Repository Structure

```
packages/pi-index/
├── docs/
│   └── spec/
│       ├── README.md              ← this file
│       ├── GLOSSARY.md            ← domain vocabulary
│       ├── CONSTITUTION.md        ← cross-cutting rules
│       ├── DATA-MODEL.md          ← entity definitions
│       └── specs/
│           ├── 00-overview.md     ← workflows + data flow
│           ├── 01-indexing.md     ← indexing subsystem
│           ├── 02-search.md       ← search subsystem
│           ├── 03-tool-api.md     ← LLM tool contracts
│           └── 04-commands.md     ← slash command contracts
├── extensions/
│   └── index/                     ← extension source files (not yet written)
└── package.json
```

---

## LLM Usage Guide

When asking an LLM to implement, debug, or extend pi-index, include these spec files in context:

| Task | Files to include |
| --- | --- |
| Implement the indexing pipeline | `CONSTITUTION.md`, `DATA-MODEL.md`, `specs/01-indexing.md` |
| Implement the search pipeline | `CONSTITUTION.md`, `DATA-MODEL.md`, `specs/02-search.md` |
| Implement the LLM tools | `CONSTITUTION.md`, `DATA-MODEL.md`, `specs/03-tool-api.md` |
| Implement slash commands | `CONSTITUTION.md`, `specs/04-commands.md` |
| Implement the full extension | All files in reading order |
| Debug a spec question | `GLOSSARY.md` + the relevant subsystem spec |
| Add a new scope filter | `CONSTITUTION.md` (§ 7), `specs/02-search.md`, `specs/03-tool-api.md` |
| Add a new file type | `DATA-MODEL.md` (Supported Languages table), `specs/01-indexing.md` |
| Change the chunking strategy | `CONSTITUTION.md` (§ 5), `DATA-MODEL.md`, `specs/01-indexing.md` |
| Add a new LLM tool | `CONSTITUTION.md`, `DATA-MODEL.md`, `specs/03-tool-api.md` |
| Add a new slash command | `CONSTITUTION.md`, `specs/04-commands.md` |
| Extend the data model | `GLOSSARY.md`, `CONSTITUTION.md`, `DATA-MODEL.md`, `specs/00-overview.md` |

---

## Maintenance Policy

Update the spec before or alongside any code change, never after. If a behavior changes in code without a corresponding spec update, the spec is wrong. The spec is the source of truth — code is its implementation.

When updating a spec file:
- Update `GLOSSARY.md` if any new terms are introduced
- Update `CONSTITUTION.md` if a cross-cutting rule changes (error codes, configuration, contracts)
- Update `DATA-MODEL.md` if any entity field is added, removed, or constrained differently
- Update `specs/00-overview.md` if a workflow step changes or a new workflow is added
- Update the relevant subsystem spec for any behavior change
- Bump the version number in the changed file's header

---

## Key Design Decisions

See `specs/00-overview.md` § Key Design Decisions for the rationale behind the major choices:

- Hybrid search (vector + BM25) over pure vector
- autoIndex off by default
- Project-local storage (`.pi/index/`)
- No file exclusions at the spec level — `PI_INDEX_DIRS` controls scope
- MMR reranking for result diversity
- No cross-file deduplication
