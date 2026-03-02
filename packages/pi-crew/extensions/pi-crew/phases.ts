/**
 * Phase content constants — replaces SKILL.md files.
 *
 * Each phase has instructions that are injected into the system prompt
 * when the workflow is active. Previously these were read from disk
 * as skill files; now they're embedded as constants for mechanical
 * enforcement (no file I/O, no missing file failures).
 */

/** Valid phase identifiers in workflow order. */
export const VALID_PHASES = Object.freeze([
  "explore",
  "design",
  "plan",
  "build",
  "review",
  "ship",
] as const);

/** A valid phase identifier. */
export type PhaseId = (typeof VALID_PHASES)[number];

/** Phase content indexed by phase ID. */
const PHASE_CONTENT: Record<PhaseId, string> = {
  explore: `# Explore Phase

Dispatch scouts to understand the codebase before making any changes.

## When to Use

- Starting work on an unfamiliar codebase
- Working on a part of the codebase you haven't explored yet
- Before any non-trivial implementation

## Protocol

### 1. Assess Project Size

Run a quick file count to determine scale:

\`\`\`bash
find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -not -path '*/__pycache__/*' -not -path '*/.venv/*' | wc -l
\`\`\`

### 2. Dispatch Scouts

Scale scout count to project size:

| Project Size | Files  | Scouts | Focus Areas                                                                           |
| ------------ | ------ | ------ | ------------------------------------------------------------------------------------- |
| Small        | < 50   | 1      | Full project scan                                                                     |
| Medium       | 50-500 | 2      | 1: project structure + stack, 2: area relevant to task                                |
| Large        | 500+   | 3-4    | 1: structure, 2: relevant area, 3: conventions/patterns, 4: dependencies/integrations |

Dispatch scouts in **parallel** via \`dispatch_crew({ tasks: [...] })\`.

Each scout task should be specific:

- ✓ "Explore the authentication system — find all files related to login, JWT, sessions, middleware"
- ✓ "Map the project structure — directory layout, tech stack, key entry points, configuration"
- ✗ "Look at the project" (too vague)

### 3. Synthesize Findings

After scouts return, combine their findings into a coherent picture:

- **Project overview:** Stack, size, conventions
- **Relevant code:** Key files and their roles
- **Patterns:** How the codebase does things
- **Concerns:** Anything notable for implementation
- **Key dependencies:** What's used and how

### 4. Present to User

Show a compressed summary of findings. Highlight:

- What's relevant to the task
- Anything surprising or concerning
- Suggested approach based on what was found

## Evaluation Gate

Before moving to the next phase:

- [ ] At least one scout completed successfully
- [ ] Summary presented to user`,

  design: `# Design Phase

Make design decisions with the user before writing any code.

## When to Use

- After explore phase for non-trivial features
- When there are multiple valid approaches
- When the user needs to make decisions about behavior, UI, or architecture

## Protocol

### 1. Load Context

Review the explore findings from the previous phase.

### 2. Assess Design Complexity

| Complexity                                         | Approach                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Obvious (1 clear way)                              | Propose it directly, ask user to confirm                             |
| Moderate (2-3 options)                             | Present options yourself based on explore findings                   |
| Complex (architectural decisions, many trade-offs) | Dispatch an **architect** agent with explore findings + requirements |

### 3. For Complex Designs — Dispatch Architect

\`\`\`
dispatch_crew({
  preset: "architect",
  task: "Design the {feature} feature. Requirements: {requirements}. Codebase context: {paste explore findings}. User constraints: {any locked decisions}.",
  cwd: "<project dir>"
})
\`\`\`

The architect returns a structured design with multiple approaches, trade-offs, and a recommendation.

### 4. Present Options to User

Show the design options with clear trade-offs. Ask the user to decide:

- **Approach A** vs **Approach B** — which one?
- **Scope** — what's in, what's out?
- **Behavior details** — how should edge cases work?

### 5. Lock Decisions

After the user approves, document the locked decisions:

- What was decided and why
- Technical approach
- Must-haves (observable behaviors, artifacts, key connections)
- What's out of scope

## Evaluation Gate

Before moving to the next phase:

- [ ] User explicitly approved the design
- [ ] Locked decisions are specific and actionable
- [ ] Must-haves list is complete`,

  plan: `# Plan Phase

Break the approved design into tasks that executor agents can implement independently.

## When to Use

- After design is approved
- When you need to coordinate multiple implementation tasks
- Before dispatching any executors

## Protocol

### 1. Load Context

Review the design decisions and explore findings from previous phases.

### 2. Task Breakdown

Break the design into tasks. Each task must be:

- **Independently executable** — An executor can complete it without needing output from another running task
- **Specifically scoped** — Exact files, exact changes, exact verification
- **Right-sized** — 15-60 minutes of agent execution time. If shorter, combine. If longer, split.
- **2-3 tasks per wave maximum** — Keeps agent context budget at ~50%

#### Task Structure

Each task needs:

- **Name** — Action-oriented: "Create auth middleware" not "Authentication"
- **Files** — Exact paths to create/modify
- **Action** — Specific implementation instructions
- **Verify** — A command to prove completion (test command, curl, file check)
- **Done criteria** — What must be true for the task to be complete

#### Specificity Test

Could a different agent implement this task without asking clarifying questions? If not, add more detail.

- ✗ "Add authentication" → too vague
- ✓ "Create POST /api/auth/login accepting {email, password}, validate with bcrypt against users table, return JWT in httpOnly cookie with 15-min expiry using jose library"

### 3. Dependency Analysis — Wave Structure

For each task, identify:

- **Needs:** What must exist before this task can run?
- **Creates:** What does this task produce?

Build a dependency graph and assign waves:

\`\`\`
Wave 1: Independent tasks (no dependencies)
Wave 2: Depends on Wave 1
Wave 3: Depends on Wave 2
\`\`\`

**Prefer vertical slices over horizontal layers:**

- ✓ "User feature (model + API + UI)" — self-contained, can run parallel with other features
- ✗ "All models, then all APIs, then all UI" — forces sequential execution

### 4. Goal-Backward Verification

Verify completeness using the must-haves from the design:

- For each **truth** (observable behavior): Is there a task that implements it?
- For each **artifact** (file): Is there a task that creates it?
- For each **key link** (connection): Is there a task that wires it?

If anything is missing, add a task.

### 5. Present to User

Show the wave structure and ask for approval. Highlight:

- Total task count and estimated waves
- Any dependencies or potential bottlenecks
- File overlap between tasks (if any — should be avoided)

## Evaluation Gate

Before moving to build:

- [ ] User approved the plan
- [ ] Every task has: name, files, action, verify, done criteria
- [ ] Every must-have from the design maps to at least one task
- [ ] Wave structure is valid (no circular dependencies)
- [ ] No file overlap between tasks in the same wave`,

  build: `# Build Phase

Execute the plan by dispatching executor agents wave by wave.

## When to Use

- After plan is approved and task files exist
- To resume a partially completed build (check task statuses)

## Protocol

### 1. Load Context

Review the plan, design decisions, and explore findings from previous phases. Check which tasks are already done. Resume from the first incomplete wave.

### 2. Execute Waves

For each wave, in order:

#### a. Prepare Executor Tasks

For each task in the wave, build the dispatch:

\`\`\`
dispatch_crew({
  tasks: [
    {
      preset: "executor",
      task: "<full task context>",
      cwd: "<project working directory>"
    }
  ]
})
\`\`\`

**Full task context** passed to each executor (they have NO access to your conversation):

- Design context: relevant locked decisions and must-haves
- Task spec: action, verify, done criteria
- Codebase context: relevant file paths and patterns
- Dependencies: output from prerequisite tasks
- Constraints: follow conventions, commit format, run tests

#### b. Dispatch and Monitor

Dispatch all tasks in the wave as a parallel \`dispatch_crew\` call.

#### c. Evaluate Wave Results

After the wave completes, for each task:

**If task succeeded:** Verify the task's done criteria. Run the verify command.

**If task failed:** Dispatch a **debugger** agent:

\`\`\`
dispatch_crew({
  preset: "debugger",
  task: "Debug this failure. Error: {error output}. Task was: {task spec}.",
  cwd: "<project dir>"
})
\`\`\`

- If debugger fixes it: continue
- If debugger can't fix: present to user
- **Max 3 retry attempts per task**

**If task returned a deviation (architectural change needed):** Present to user, wait for decision.

#### d. Verify Wave

After all tasks in a wave are done:

- Run the project's test suite
- Check that all expected files exist
- Verify no regressions from previous waves

Only proceed to the next wave if verification passes.

### 3. Write Build Summary

After all waves complete, summarize what was built:

- Task completion status for each task
- Any deviations from the plan
- Test results
- Files changed

## Evaluation Gate

Before moving to review:

- [ ] All tasks complete or explicitly failed with documentation
- [ ] Test suite passes
- [ ] All expected files exist
- [ ] No unresolved deviations`,

  review: `# Review Phase

Verify the implementation through three sequential review gates.

## When to Use

- After build phase completes
- Before shipping any feature

## Protocol

### 1. Load Context

Review the design spec and build summary. Get the diff:

\`\`\`bash
git diff main...HEAD
\`\`\`

(or \`master...HEAD\`, or the appropriate base branch)

### 2. Three Review Gates

Execute these gates **sequentially** — three separate \`dispatch_crew\` single-mode calls, NOT a chain. Each gate's pass/fail determines whether to proceed to the next.

#### Gate 1: Spec Compliance

\`\`\`
dispatch_crew({
  preset: "reviewer",
  task: "Review this implementation for spec compliance.\\n\\nMode: spec-compliance\\n\\n## Design Spec\\n{paste design content}\\n\\n## Code Diff\\n{paste git diff}\\n\\n## Build Summary\\n{paste build summary}",
  cwd: "<project dir>"
})
\`\`\`

**If FAIL:** Present critical findings to user. Fix or accept.

#### Gate 2: Code Quality

\`\`\`
dispatch_crew({
  preset: "reviewer",
  task: "Review this code for quality.\\n\\nMode: code-quality\\n\\n## Code Diff\\n{paste git diff}",
  cwd: "<project dir>"
})
\`\`\`

**If FAIL:** Same options as Gate 1.

#### Gate 3: Security

\`\`\`
dispatch_crew({
  preset: "reviewer",
  task: "Security audit of this code.\\n\\nMode: security\\n\\n## Code Diff\\n{paste git diff}",
  cwd: "<project dir>"
})
\`\`\`

**If FAIL:** Critical security issues MUST be fixed before shipping.

### 3. Handle Failures

If any gate has critical findings:

1. Dispatch executor to fix specific issues
2. Re-run the failed gate
3. Max 2 fix-and-recheck cycles per gate

## Evaluation Gate

Before moving to ship:

- [ ] All three gates pass (or user explicitly accepts with justification)
- [ ] No critical security findings unresolved`,

  ship: `# Ship Phase

Ship the completed, reviewed feature.

## When to Use

- After review phase passes
- When the user says "ship it"

## Protocol

### 1. Verify Readiness

Check:

- [ ] Review phase passed
- [ ] Tests pass: run the project's test suite
- [ ] No uncommitted changes: \`git status\`

### 2. Show Commit Summary

\`\`\`bash
git log --oneline main..HEAD
\`\`\`

Present the commits to the user. Ask preference:

- **Squash** — single clean commit (default)
- **Keep** — preserve atomic commits

### 3. Squash (if chosen)

\`\`\`bash
git rebase -i main
\`\`\`

Commit message format:

\`\`\`
feat: {feature name}

{One-paragraph description}

- {key change 1}
- {key change 2}
- {key change 3}
\`\`\`

### 4. Push

\`\`\`bash
git push origin HEAD
\`\`\`

### 5. Open PR/MR

Generate PR description from workflow artifacts:

- **What:** Goal of the feature
- **Why:** Rationale
- **Changes:** Files changed, key decisions
- **Testing:** Test results
- **Review Notes:** Warnings or accepted deviations

Use the appropriate CLI:

- GitHub: \`gh pr create --title "..." --body "..."\`
- GitLab: \`glab mr create --title "..." --description "..."\`

### 6. Write Feature Summary

Document what was built:

- What was built (one paragraph)
- Commits (hash, message, file count)
- Decisions made
- Deviations from plan
- Stats (agents dispatched, cost, PR/MR URL)

## Evaluation Gate

- [ ] Branch pushed
- [ ] PR/MR opened
- [ ] Feature Summary written`,
};

/**
 * Metadata about phase behavior and constraints.
 */
interface PhaseMeta {
  /** Which presets can be dispatched during this phase */
  allowedPresets: string[];
  /** Whether to auto-advance after first successful dispatch. False = orchestrator must complete phase explicitly */
  autoAdvance: boolean;
}

/**
 * Phase metadata indexed by phase ID.
 */
const PHASE_META: Record<PhaseId, PhaseMeta> = {
  explore: { allowedPresets: ["scout", "researcher"], autoAdvance: true },
  design: { allowedPresets: ["architect", "researcher", "scout"], autoAdvance: true },
  plan: { allowedPresets: ["scout", "researcher"], autoAdvance: true },
  build: { allowedPresets: ["executor", "debugger", "scout"], autoAdvance: false },
  review: { allowedPresets: ["reviewer", "scout"], autoAdvance: false },
  ship: { allowedPresets: ["scout", "researcher"], autoAdvance: true },
};

/**
 * Get the content for a workflow phase.
 * @param phase - Phase identifier (explore, design, plan, build, review, ship)
 * @returns Phase content string, or null if phase is invalid
 */
export function getPhaseContent(phase: string): string | null {
  if (phase in PHASE_CONTENT) {
    return PHASE_CONTENT[phase as PhaseId];
  }
  return null;
}

/**
 * Get the allowed agent presets for a workflow phase.
 * @param phase - Phase identifier
 * @returns Array of allowed preset names, or null if phase is invalid
 */
export function getPhaseAllowedPresets(phase: string): string[] | null {
  if (phase in PHASE_META) {
    return PHASE_META[phase as PhaseId].allowedPresets;
  }
  return null;
}

/**
 * Check if a phase should auto-advance after first successful dispatch.
 * @param phase - Phase identifier
 * @returns true if phase auto-advances, false if orchestrator must complete explicitly. Returns true for unknown phases.
 */
export function isPhaseAutoAdvance(phase: string): boolean {
  if (phase in PHASE_META) {
    return PHASE_META[phase as PhaseId].autoAdvance;
  }
  return true; // default to auto-advance for unknown phases
}

/**
 * Get the required handoff phases for a given phase in a specific workflow.
 * Only returns dependencies that are actually in the workflow (handles shortcuts).
 *
 * For example, in a "quick" workflow [explore, build, ship]:
 * - build's canonical dep is "plan", but plan isn't in the workflow
 * - Walk back through canonical deps until we find one in the workflow: "explore"
 * - So build requires ["explore"]
 *
 * @param phase - Current phase
 * @param workflow - Active workflow phases
 * @returns Array of phase IDs that must have handoff files before this phase can proceed
 */
export function getRequiredHandoffs(phase: PhaseId, workflow: string[]): PhaseId[] {
  const phaseIndex = workflow.indexOf(phase);
  // First phase in workflow has no deps
  if (phaseIndex <= 0) return [];

  // The required handoff is the phase immediately before in the workflow
  const prevPhase = workflow[phaseIndex - 1] as PhaseId;
  return [prevPhase];
}
