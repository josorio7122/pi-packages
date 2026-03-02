// ── Phase Enforcement ───────────────────────────────────────────────
// Phase gates: handoff dependency checks and preset validation.
// The workflow gate (shouldRequireWorkflow) was removed — the tool_call
// hook now mechanically blocks write/edit, making it redundant.

import type { CrewState } from "./state.js";
import { handoffExists } from "./handoff.js";
import { getRequiredHandoffs, getPhaseAllowedPresets, type PhaseId } from "./phases.js";

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
  if (!state.workflow || state.workflow.length === 0 || !state.feature) {
    return { blocked: false, missing: [] };
  }

  const feature = state.feature;
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
  if (!allowed) return null;

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
