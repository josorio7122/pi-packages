// ── Model Profile Resolution ────────────────────────────────────────
// Maps agent tiers (budget/balanced/quality) to concrete model strings
// based on the active profile.

interface ModelProfile {
  budget: string;
  balanced: string;
  quality: string;
}

export type Tier = "budget" | "balanced" | "quality";
export type ProfileName = "quality" | "balanced" | "budget";

const PROFILES: Record<ProfileName, ModelProfile> = {
  quality: {
    budget: "claude-sonnet-4-6",
    balanced: "claude-sonnet-4-6",
    quality: "claude-opus-4-6",
  },
  balanced: {
    budget: "claude-haiku-4-5",
    balanced: "claude-sonnet-4-6",
    quality: "claude-sonnet-4-6",
  },
  budget: {
    budget: "claude-haiku-4-5",
    balanced: "claude-haiku-4-5",
    quality: "claude-sonnet-4-6",
  },
};

export const PROFILE_NAMES: ProfileName[] = ["quality", "balanced", "budget"];

export const PROFILE_DESCRIPTIONS: Record<ProfileName, string> = {
  quality: "Critical features, production code, complex architecture ($$$)",
  balanced: "General development — default ($$)",
  budget: "Exploration, prototyping, documentation ($)",
};

/**
 * Resolve model ID for a preset + profile combination.
 * Priority: per-agent override > profile tier mapping.
 * @param profile - Active model profile (quality/balanced/budget)
 * @param tier - Agent tier (budget/balanced/quality)
 * @param agentName - Agent preset name (for checking overrides)
 * @param overrides - Per-agent model overrides
 * @returns Resolved model ID string
 */
export function resolveModel(
  profile: string,
  tier: Tier,
  agentName: string,
  overrides: Record<string, string>,
): string {
  // Per-agent override takes precedence
  if (overrides[agentName]) {
    return overrides[agentName];
  }

  const profileName = PROFILE_NAMES.includes(profile as ProfileName)
    ? (profile as ProfileName)
    : "balanced";

  return PROFILES[profileName][tier];
}

/**
 * Check if a profile name is valid.
 * @param name - Profile name to validate
 * @returns True if the name is a valid ProfileName
 */
export function isValidProfile(name: string): name is ProfileName {
  return PROFILE_NAMES.includes(name as ProfileName);
}
