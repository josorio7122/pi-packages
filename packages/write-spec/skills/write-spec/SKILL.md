---
name: write-spec
description: >
  Writes a specification before any code is written. Use when the user wants to build a
  feature, system, or product and needs a written spec as the source of truth first.
  Guides the agent through four gated phases — Specify → Plan → Tasks → Implement & Verify
  — so implementation only begins once behaviors, contracts, and a sequenced task list are
  approved. Prevents premature coding, scope creep, and rewrites.
metadata:
  author: josorio7122
  version: "1.0"
---

# Spec-Driven Development

A four-phase workflow where a written specification is produced and gate-approved *before* any implementation code is written. Each phase ends with a concrete, reviewable artifact. The agent does not advance until the user explicitly approves.

**Phases:** Specify → Plan → Tasks → Implement & Verify

---

## Phase 0 — Activation

When this skill activates, ask exactly one diagnostic question before doing anything else:

> "Where are we in the SDD cycle — starting fresh, or resuming a phase?"

This prevents re-specifying features that already have approved artifacts. If resuming, ask which phase was last approved, load the relevant artifact, and continue from there.

---

## Phase Gate Protocol

- Announce the current phase and the artifact it will produce before starting.
- Do **not** proceed to the next phase until the user **explicitly approves** the current artifact. The gate is a hard stop, not advisory.
- If the user asks to skip a phase: explain what is sacrificed, then ask for explicit confirmation before skipping.

---

## Phase 1 — Specify

**Goal:** Produce a written specification grounded in existing code.

**Before writing the spec:**
- Read all relevant existing code and configuration files.
- For greenfield projects, note "Greenfield — no prior implementation" in the Constraints section.

**The spec artifact covers:**
- **Goal** — what must be true when the feature is done
- **Behaviors** — observable outcomes (no implementation details)
- **Contracts** — data shapes at system boundaries
- **Constraints** — existing system properties to preserve
- **Error Cases** — how the system behaves under failure
- **Out of Scope** — what this work explicitly does not do
- **Open Questions** — unresolved decisions blocking the spec

**Rules:**
- Write in prose + structured sections, not code.
- Describe WHAT (behaviors, outcomes, contracts) — never HOW (implementation details, file names, function names).
- Do not name files, classes, or functions. That is the executor's job.

Read `references/phases.md` for the full spec artifact template and examples.

**Gate:** User approves the spec document before any implementation begins.

---

## Phase 2 — Plan

**Goal:** Translate the approved spec into an architectural plan.

**The plan covers:**
- **Components Affected** — which parts of the system change
- **Sequence of Changes** — ordered list of what must change and why
- **Risk Areas** — places where implementation is likely to be tricky
- **Dependencies Map** — what depends on what

**Rules:**
- Reference spec behaviors by name — do not restate them.
- No code. No file names. No function names. Only "what must change" and "in what order."
- If the plan reveals the feature is larger than the spec implied, surface the scope gap immediately. Do not silently expand.

Read `references/phases.md` for the full plan artifact template and examples.

**Gate:** User approves the plan before tasks are written.

---

## Phase 3 — Tasks

**Goal:** Break the approved plan into a sequenced, independently-completable task list.

**Each task must include:**
- A verb-phrase title
- The spec behavior it satisfies (by name)
- The acceptance condition that proves it done (observable outcome)
- Its dependencies on prior tasks (or "none")

**Rules:**
- Tasks are numbered and ordered by dependency — no task depends on a later task.
- Each task must be completable independently before the next begins.
- "We already know what to do" is not a reason to skip the task list.

Read `references/phases.md` for the task list template and examples.

**Gate:** User approves the sequenced task list before implementation begins.

---

## Phase 4 — Implement & Verify

**Goal:** Work through the approved task list, one task at a time, with full TDD discipline.

**For each task:**
1. Write the failing test first — run it to confirm it fails. A test that passes before implementation is broken.
2. Write the minimum code to make the test pass.
3. Run the tests — they must pass.
4. Commit: `type: description` format (feat, fix, test, refactor, chore, docs).
5. Mark the task done. State which spec behavior is now satisfied.

**If implementation contradicts the spec:** Stop. Flag the contradiction explicitly. The spec wins unless the user consciously updates it.

**If a gap in the spec is discovered:** Surface it immediately — do not silently paper over it with code.

**AGENTS.md rules that apply in Phase 4:**
- TDD is non-negotiable: test first, confirm it fails, implement, confirm it passes, commit.
- One commit per task. `type: description` format. Never `--no-verify`.
- Run linter/formatter on changed files before every commit.
- Python: use `uv run`, always with a venv. Node: use `pnpm`.
- Docker-based projects (e.g. `website`): run tests inside the container via `docker compose exec`.
- Never use `git add .` — stage files individually.

Read `references/phases.md` for TDD exception handling and Phase 4 diagnostic questions.

**Gate:** All tasks complete, all tests pass, all spec behaviors verifiably satisfied.

---

## Anti-Patterns — Refuse These

| Request | Response |
|---|---|
| "Just start coding" | Acknowledge the desire to move fast. Explain the cost (rewrites, spec drift). Offer a 10-minute fast-spec. Do not skip. |
| Writing implementation during Phase 1 or 2 | Refuse. Phases 1–2 produce prose artifacts only. |
| Advancing without gate approval | Refuse. Present the artifact and wait for explicit approval. |
| Spec that describes HOW instead of WHAT | Rewrite the offending section to describe observable behavior, not implementation. |
| Skipping the task list | Explain that the task list is what makes Phase 4 auditable. Offer to produce it quickly. |

---

## Phase Boundaries

| From | To | Artifact that crosses the boundary |
|---|---|---|
| Phase 1 → Phase 2 | Approved spec document |
| Phase 2 → Phase 3 | Approved architectural plan |
| Phase 3 → Phase 4 | Approved, sequenced task list |

Each phase accepts only the artifact produced by the previous phase. Nothing else.
