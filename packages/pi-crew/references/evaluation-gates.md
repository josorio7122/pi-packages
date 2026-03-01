# Evaluation Gates

Quick reference for all phase gates in one place. The authoritative definitions live in each phase skill (skills/crew-\*/SKILL.md). This file exists so the LLM or user can review all gates without loading every skill.

Each phase has an evaluation gate that must pass before advancing.

## Explore Gate

- [ ] At least one scout completed successfully
- [ ] Findings written to `.crew/phases/<feature>/explore.md`
- [ ] Summary presented to user

## Design Gate

- [ ] User explicitly approved the design (not just acknowledged — approved)
- [ ] Design written to `.crew/phases/<feature>/design.md`
- [ ] Locked decisions are specific and actionable
- [ ] Must-haves list complete: truths, artifacts, key links

## Plan Gate

- [ ] User approved the plan
- [ ] Every task has: name, files, action, verify, done criteria
- [ ] Every must-have maps to at least one task
- [ ] Wave structure valid (no circular deps)
- [ ] No file overlap between tasks in the same wave
- [ ] Task files written to `.crew/phases/<feature>/build/`

## Build Gate

- [ ] All tasks complete (or explicitly failed with documentation)
- [ ] Test suite passes
- [ ] All expected files exist
- [ ] Build summary written
- [ ] No unresolved Rule 4 deviations

## Review Gate

- [ ] All three review gates pass (spec, code, security)
- [ ] Review report written
- [ ] No critical security findings unresolved

## Ship Gate

- [ ] Branch pushed
- [ ] PR/MR opened
- [ ] Summary written
