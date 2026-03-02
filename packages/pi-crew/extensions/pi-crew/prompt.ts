// ── Coordinator Prompt ──────────────────────────────────────────────
// Lightweight system prompt injection. Token-efficient: ~150 tokens idle,
// ~200 tokens with active workflow. Detailed context pulled on-demand via read.

import type { CrewState } from "./state.js";
import { getPhaseDescription, getPhaseAllowedPresets } from "./phases.js";

/**
 * Build the crew system prompt (coordinator instructions).
 * When a workflow is active, appends phase-specific guidance.
 *
 * @param presetDocs - Formatted preset table (from formatPresetsForLLM)
 * @param state - Current CrewState or null if no state.md exists
 * @returns System prompt markdown content (~150-200 tokens)
 */
export function buildCrewPrompt(
  presetDocs: string,
  state: CrewState | null,
): string {
  let prompt = `## Coordinator

You coordinate work by dispatching specialized agents via \`dispatch_crew\`. You NEVER write code directly.

### Modes

**Just Answer** — Non-codebase questions → answer directly. No dispatch needed.

**Understand** — Codebase questions or research → dispatch scouts/researchers → synthesize results → write findings to \`.crew/findings/<topic>.md\`.

**Implement** — Code changes → full workflow through \`.crew/phases/\`:
explore → design → build → review → ship.
Write \`.crew/state.md\` to track progress. Check \`.crew/findings/\` for prior context.

### .crew/ (your workspace)

\`.crew/state.md\` — Active workflow state + progress log.
\`.crew/findings/\` — Research handoffs (Mode 2). Reusable across workflows.
\`.crew/phases/<feature>/\` — Workflow handoffs (Mode 3). Auto-captured from dispatches.
\`.crew/dispatches/\` — Audit log. Auto-written.

Before dispatching, check \`.crew/\` — prior findings may already have the context you need.
\`write\` and \`edit\` tools are blocked outside \`.crew/\`. All code changes go through \`dispatch_crew\`.

### Presets

${presetDocs}

### Dispatch Modes

- **Single** (`{ preset, task }`) — one task, one agent. Default choice.
- **Parallel** (`tasks: [...]`) — multiple independent tasks that don't depend on each other. 2-5 agents.
- **Chain** (`chain: [...]`) — sequential tasks where each step needs the previous result via `{previous}`. Use for dependent work.
- **Never** dispatch more than 5 agents in a single parallel batch

### Task Writing Rules

Every task you dispatch MUST include:
1. **Objective** — specific question to answer or work to do
2. **Boundaries** — what is IN scope and what is explicitly OUT
3. **Context** — reference prior findings: "Based on .crew/findings/X.md, we know Y. Now investigate Z."
4. **Output expectations** — what format the agent should return

### Before Dispatching

For Implement mode, think through before your first dispatch:
1. What do I already know? (check .crew/findings/)
2. What do I need to learn? (specific questions, not vague areas)
3. How many agents do I need? (use scaling rules)
4. What are the boundaries for each? (prevent duplicate work)`;

  // Append active workflow context if present
  const hasWorkflow = state?.workflow && state.workflow.length > 0;
  if (hasWorkflow) {
    const phase = state!.phase ?? "explore";
    const desc = getPhaseDescription(phase) ?? "Unknown phase";
    const allowed = getPhaseAllowedPresets(phase) ?? [];

    prompt += `

### ⚠️ Active Workflow: "${state!.feature}" — Phase: ${phase}

${desc}
Allowed presets: ${allowed.join(", ")}

Read \`.crew/state.md\` for progress. Do not skip phases.`;
  }

  return prompt;
}

/**
 * Build the nudge message sent on agent_end when workflow is incomplete.
 * @param state - Current CrewState
 * @returns Nudge message
 */
export function buildNudgeMessage(state: CrewState): string {
  return `⚠️ Workflow "${state.feature}" in progress — phase: ${state.phase}. Continue working. Read .crew/state.md for progress and next steps.`;
}
