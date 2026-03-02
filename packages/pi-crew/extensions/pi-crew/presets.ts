// ── Agent Presets ───────────────────────────────────────────────────
// Each preset maps a role name to system prompt file, tools, and tier.
// The LLM just passes `preset: "scout"` — everything resolves here.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Tier } from "./profiles.js";
import { resolveModel } from "./profiles.js";

interface AgentPreset {
  name: string;
  description: string;
  promptFile: string; // Relative to package root: "references/prompts/scout.md"
  tools: string; // Comma-separated tool list
  tier: Tier;
}

const PRESETS: AgentPreset[] = [
  {
    name: "scout",
    description: "Fast codebase exploration — returns compressed findings. Read-only.",
    promptFile: "references/prompts/scout.md",
    tools: "read,bash,grep,find,ls",
    tier: "budget",
  },
  {
    name: "researcher",
    description: "Web/docs research via exa-search skill. Returns structured findings.",
    promptFile: "references/prompts/researcher.md",
    tools: "read,bash",
    tier: "budget",
  },
  {
    name: "architect",
    description: "Design decisions, component breakdowns. Produces specs.",
    promptFile: "references/prompts/architect.md",
    tools: "read,bash,grep,find,ls",
    tier: "quality",
  },
  {
    name: "executor",
    description: "Implements tasks from plans. Follows TDD. Commits per task.",
    promptFile: "references/prompts/executor.md",
    tools: "read,write,edit,bash,grep,find,ls",
    tier: "balanced",
  },
  {
    name: "reviewer",
    description: "Code review — spec compliance, code quality, security. Read-only.",
    promptFile: "references/prompts/reviewer.md",
    tools: "read,bash,grep,find,ls",
    tier: "balanced",
  },
  {
    name: "debugger",
    description: "Root cause analysis. Reads failing test, traces to fix, surgical repair.",
    promptFile: "references/prompts/debugger.md",
    tools: "read,write,edit,bash,grep,find,ls",
    tier: "quality",
  },
];

const PRESET_MAP = new Map(PRESETS.map((p) => [p.name, p]));

/**
 * Retrieve a preset definition by name.
 * @param name - Preset name (scout, researcher, architect, executor, reviewer, debugger)
 * @returns Preset definition with name, description, promptFile, tools, and tier, or undefined if not found
 */
export function getPreset(name: string): AgentPreset | undefined {
  return PRESET_MAP.get(name);
}

/**
 * List all available preset names.
 * @returns Array of preset names
 */
export function getPresetNames(): string[] {
  return PRESETS.map((p) => p.name);
}

/**
 * Resolve a preset into concrete SpawnParams.
 * Reads the system prompt from disk and resolves the model via profile + tier mapping.
 * @param name - Preset name
 * @param profile - Active model profile (quality/balanced/budget)
 * @param overrides - Per-agent model overrides
 * @param packageRoot - Package root directory (for reading prompt files)
 * @returns Resolved spawn parameters (systemPrompt, tools, model) or undefined if preset not found
 */
export function resolvePreset(
  name: string,
  profile: string,
  overrides: Record<string, string>,
  packageRoot: string,
): { systemPrompt: string; tools: string; model: string } | undefined {
  const preset = PRESET_MAP.get(name);
  if (!preset) return undefined;

  const promptPath = path.join(packageRoot, preset.promptFile);
  const systemPrompt = fs.readFileSync(promptPath, "utf-8");
  const model = resolveModel(profile, preset.tier, preset.name, overrides);

  return { systemPrompt, tools: preset.tools, model };
}

/**
 * Format preset table for LLM system prompt injection.
 * Generates a markdown table showing each preset with its resolved model and purpose.
 * @param profile - Active model profile
 * @param overrides - Per-agent model overrides
 * @returns Markdown table string
 */
export function formatPresetsForLLM(profile: string, overrides: Record<string, string>): string {
  const lines = ["| Preset | Model | Purpose |", "|--------|-------|---------|"];

  for (const preset of PRESETS) {
    const model = resolveModel(profile, preset.tier, preset.name, overrides);
    lines.push(`| ${preset.name} | ${model} | ${preset.description} |`);
  }

  return lines.join("\n");
}
