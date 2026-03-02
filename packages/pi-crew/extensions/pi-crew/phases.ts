/**
 * Phase metadata — allowed presets, auto-advance, descriptions, and handoff deps.
 *
 * Phase content (detailed instructions) was removed. The orchestrator's system
 * prompt now carries lightweight phase descriptions. Detailed protocol lives in
 * the coordinator prompt, not per-phase injection.
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

/**
 * Metadata about phase behavior and constraints.
 */
interface PhaseMeta {
  /** Short description of what happens in this phase */
  description: string;
  /** Which presets can be dispatched during this phase */
  allowedPresets: string[];
  /** Whether to auto-advance after first successful dispatch. False = orchestrator must complete phase explicitly */
  autoAdvance: boolean;
}

/**
 * Phase metadata indexed by phase ID.
 */
const PHASE_META: Record<PhaseId, PhaseMeta> = {
  explore: {
    description: "Dispatch scouts to map relevant code. Synthesize findings into .crew/findings/.",
    allowedPresets: ["scout", "researcher"],
    autoAdvance: true,
  },
  design: {
    description: "Dispatch architect with explore context. Present options to user. Lock decisions.",
    allowedPresets: ["architect", "researcher", "scout"],
    autoAdvance: true,
  },
  plan: {
    description: "Break approved design into executor-ready tasks with wave structure.",
    allowedPresets: ["scout", "researcher"],
    autoAdvance: true,
  },
  build: {
    description: "Dispatch executors wave by wave. Dispatch debuggers on failure. Max 3 retries per task.",
    allowedPresets: ["executor", "debugger", "scout"],
    autoAdvance: false,
  },
  review: {
    description: "Dispatch reviewer for spec compliance, code quality, and security. Loop until pass.",
    allowedPresets: ["reviewer", "scout"],
    autoAdvance: false,
  },
  ship: {
    description: "Push branch, open PR/MR, write feature summary.",
    allowedPresets: ["scout", "researcher"],
    autoAdvance: true,
  },
};

/**
 * Get the short description for a workflow phase.
 * @param phase - Phase identifier
 * @returns Short description string, or null if phase is invalid
 */
export function getPhaseDescription(phase: string): string | null {
  if (phase in PHASE_META) {
    return PHASE_META[phase as PhaseId].description;
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
  return true;
}

/**
 * Get the required handoff phases for a given phase in a specific workflow.
 * Only returns dependencies that are actually in the workflow (handles shortcuts).
 *
 * @param phase - Current phase
 * @param workflow - Active workflow phases
 * @returns Array of phase IDs that must have handoff files before this phase can proceed
 */
export function getRequiredHandoffs(phase: PhaseId, workflow: string[]): PhaseId[] {
  const phaseIndex = workflow.indexOf(phase);
  if (phaseIndex <= 0) return [];
  const prevPhase = workflow[phaseIndex - 1] as PhaseId;
  return [prevPhase];
}
