// ── Workflow Enforcement ────────────────────────────────────────────
// Determines when dispatch_crew should require a .crew/state.md workflow
// before proceeding. Prevents the LLM from skipping workflow management.

/** Presets that only read — never modify code. */
const READ_ONLY_PRESETS = new Set(["scout", "researcher", "reviewer"]);

/** Presets that write code or make design decisions. */
const WRITE_PRESETS = new Set(["executor", "architect"]);

/**
 * Determine if a dispatch_crew call should require an active workflow.
 *
 * Returns true when the dispatch represents multi-agent implementation work
 * that should be tracked — the LLM needs to write .crew/state.md first.
 *
 * Rules:
 * - Single agent dispatch: never requires workflow (simple tasks)
 * - Parallel with all read-only presets: no workflow (exploratory)
 * - Parallel with any write preset OR 3+ agents: requires workflow
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
  const allReadOnly = agents.every((a) => READ_ONLY_PRESETS.has(a.preset));

  if (mode === "chain") {
    // Chain with any write preset = multi-step implementation
    return hasWritePreset;
  }

  if (mode === "parallel") {
    // All read-only presets = exploratory, allow
    if (allReadOnly) return false;
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
