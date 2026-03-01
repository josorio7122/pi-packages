// ── Model Profile Resolution ────────────────────────────────────────
// Maps agent tiers (budget/balanced/quality) to concrete model strings
// based on the active profile.

export interface ModelProfile {
	budget: string;
	balanced: string;
	quality: string;
}

export type Tier = "budget" | "balanced" | "quality";
export type ProfileName = "quality" | "balanced" | "budget";

const PROFILES: Record<ProfileName, ModelProfile> = {
	quality: {
		budget: "claude-sonnet-4-5",
		balanced: "claude-sonnet-4-5",
		quality: "claude-opus-4",
	},
	balanced: {
		budget: "claude-haiku-4-5",
		balanced: "claude-sonnet-4-5",
		quality: "claude-sonnet-4-5",
	},
	budget: {
		budget: "claude-haiku-4-5",
		balanced: "claude-haiku-4-5",
		quality: "claude-sonnet-4-5",
	},
};

export const PROFILE_NAMES: ProfileName[] = ["quality", "balanced", "budget"];

export const PROFILE_DESCRIPTIONS: Record<ProfileName, string> = {
	quality: "Critical features, production code, complex architecture ($$$)",
	balanced: "General development — default ($$)",
	budget: "Exploration, prototyping, documentation ($)",
};

/**
 * Resolve a tier to a concrete model string.
 * Priority: per-agent override > profile mapping
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

	const profileName = PROFILE_NAMES.includes(profile as ProfileName) ? (profile as ProfileName) : "balanced";

	return PROFILES[profileName][tier];
}

/**
 * Check if a profile name is valid.
 */
export function isValidProfile(name: string): name is ProfileName {
	return PROFILE_NAMES.includes(name as ProfileName);
}
