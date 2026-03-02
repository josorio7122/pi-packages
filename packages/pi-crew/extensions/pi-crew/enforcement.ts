// ── Workflow Enforcement ────────────────────────────────────────────
// Determines when dispatch_crew should require a .crew/state.md workflow
// before proceeding. Prevents the LLM from skipping workflow management.

import type { CrewState } from "./state.js";
import { handoffExists } from "./handoff.js";
import { getRequiredHandoffs, getPhaseAllowedPresets, type PhaseId } from "./phases.js";

/**
 * Presets that only read — never modify code.
 * Note: researcher has bash access and may write to .crew/ for handoff,
 * but is still considered exploratory for workflow gating purposes.
 * Scout and reviewer have read-only tool sets (read,bash,grep,find,ls).
 */
const EXPLORATORY_PRESETS = new Set(["scout", "researcher", "reviewer"]);

/** Presets that write code or make design decisions. Debugger uses edit/write tools. */
const WRITE_PRESETS = new Set(["executor", "architect", "debugger"]);

/**
 * Determine if a dispatch_crew call should require an active workflow.
 *
 * Returns true when the dispatch represents multi-agent implementation work
 * that should be tracked — the LLM needs to write .crew/state.md first.
 *
 * Rules:
 * - Single agent dispatch: never requires workflow (simple tasks)
 * - Parallel with all exploratory presets (scout/researcher/reviewer): no workflow
 * - Parallel with any write preset (executor/architect) OR 3+ agents: requires workflow
 * - Chain with any write preset: requires workflow (multi-step implementation)
 * - Already has active workflow: never blocks (state.md exists)
 *
 * @param mode - Dispatch mode: "single", "parallel", or "chain"
 * @param agents - Array of { preset: string } for each agent being dispatched
 * @param hasActiveWorkflow - Whether .crew/state.md already exists with a workflow
 * @returns True if the LLM should write state.md before proceeding
 */
export function shouldRequireWorkflow(
  mode: "single" | "parallel" | "chain",
  agents: Array<{ preset: string }>,
  hasActiveWorkflow: boolean,
): boolean {
  // If workflow is already active, no gate needed
  if (hasActiveWorkflow) return false;

  // Single agent dispatch — always allowed (simple task)
  if (mode === "single") return false;

  const hasWritePreset = agents.some((a) => WRITE_PRESETS.has(a.preset));
  const allExploratory = agents.every((a) => EXPLORATORY_PRESETS.has(a.preset));

  if (mode === "chain") {
    // Chain with any write preset = multi-step implementation
    return hasWritePreset;
  }

  if (mode === "parallel") {
    // All exploratory presets = no implementation work, allow
    if (allExploratory) return false;
    // Any write preset or 3+ agents = needs workflow
    return hasWritePreset || agents.length >= 3;
  }

  return false;
}

/**
 * Build the error message returned when dispatch_crew is blocked by the workflow gate.
 * Tells the LLM exactly what to do: write .crew/state.md with the required fields.
 */
export function buildWorkflowGateMessage(): string {
  return `⚠️ **Workflow required.** Multi-agent implementation work needs a workflow for tracking.

Write \`.crew/state.md\` first, then retry this dispatch:

\`\`\`yaml
---
feature: {describe-the-work}
phase: explore
workflow: explore,plan,build,ship
---
\`\`\`

Choose the right workflow scope:
- **Full**: explore,design,plan,build,review,ship
- **Standard**: explore,plan,build,review,ship
- **Quick**: explore,build,ship
- **Minimal**: build,ship

Once you write state.md, this dispatch will be allowed.`;
}

/**
 * Check if the current phase should be blocked due to missing handoff files.
 *
 * Each phase requires its predecessor's handoff file to exist in `.crew/phases/<feature>/`.
 * In workflow shortcuts, only the phases actually in the workflow are checked.
 *
 * @param cwd - Project working directory
 * @param state - Current workflow state
 * @returns `{ blocked: false }` or `{ blocked: true, missing: PhaseId[] }`
 */
export function shouldBlockForMissingHandoff(
  cwd: string,
  state: CrewState,
): { blocked: boolean; missing: string[] } {
  // No workflow or no feature — no gating
  if (!state.workflow || state.workflow.length === 0 || !state.feature) {
    return { blocked: false, missing: [] };
  }

  const feature = state.feature; // narrowed to string by guard above
  const required = getRequiredHandoffs(state.phase as PhaseId, state.workflow);
  const missing = required.filter((phase) => !handoffExists(cwd, feature, phase));

  if (missing.length > 0) {
    return { blocked: true, missing };
  }

  return { blocked: false, missing: [] };
}

/**
 * Build error message for missing handoff files.
 */
export function buildMissingHandoffMessage(state: CrewState, missing: string[]): string {
  const paths = missing.map((p) => `  - \`.crew/phases/${state.feature}/${p}.md\``).join("\n");
  return `⚠️ **Phase gate:** Cannot proceed to "${state.phase}" — missing handoff files:

${paths}

Complete the previous phase(s) first. Dispatch the appropriate agents and the handoff files will be auto-captured.`;
}

/**
 * Check if a preset is allowed for the current workflow phase.
 * Only enforced when a workflow is active with a valid phase.
 * Returns null if no restriction applies (no workflow, no phase, unknown phase).
 *
 * @param phase - Current workflow phase (or null)
 * @param presets - Array of preset names being dispatched
 * @returns Object with blocked flag and list of invalid presets, or null if no restriction
 */
export function shouldBlockForInvalidPreset(
  phase: string | null,
  presets: string[],
): { blocked: boolean; invalidPresets: Array<{ preset: string; phase: string }> } | null {
  if (!phase) return null;

  const allowed = getPhaseAllowedPresets(phase);
  if (!allowed) return null; // unknown phase, no restriction

  const invalid = presets
    .filter((p) => !allowed.includes(p))
    .map((p) => ({ preset: p, phase }));

  if (invalid.length > 0) {
    return { blocked: true, invalidPresets: invalid };
  }

  return { blocked: false, invalidPresets: [] };
}

/**
 * Build error message for invalid preset dispatch during a phase.
 */
export function buildInvalidPresetMessage(
  phase: string,
  invalidPresets: Array<{ preset: string; phase: string }>,
  allowedPresets: string[],
): string {
  const names = invalidPresets.map((p) => `"${p.preset}"`).join(", ");
  const allowed = allowedPresets.map((p) => `"${p}"`).join(", ");
  return `⚠️ **Phase restriction:** Cannot dispatch ${names} during "${phase}" phase.\n\nAllowed presets for this phase: ${allowed}\n\nEither advance to the appropriate phase or use a different preset.`;
}
