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

${presetDocs}`;

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
