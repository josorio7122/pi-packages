// ── Prompt Builders ─────────────────────────────────────────────────
// Build system prompts for idle (no workflow) and active (workflow in progress) modes.

import type { CrewState } from "./state.js";
import { getWorkflowProgress } from "./state.js";
import { getPhaseContent } from "./phases.js";

/**
 * Build the system prompt for idle mode — no active workflow.
 * Shows presets, dispatch syntax, workflow shortcuts, and how to start a workflow.
 * @param presetDocs - Formatted preset table (from formatPresetsForLLM)
 * @returns System prompt markdown content
 */
export function buildIdlePrompt(presetDocs: string): string {
  return `## Crew — Agentic Workflow Orchestration

You have access to the \`dispatch_crew\` tool which spawns isolated pi agents with preset configurations.

### Available Agent Presets

${presetDocs}

Each preset has a built-in system prompt, tool set, and model. Just pass the preset name and task:

\`\`\`
dispatch_crew({ preset: "scout", task: "Your task instructions here", cwd: "<project dir>" })
\`\`\`

For parallel dispatch:

\`\`\`
dispatch_crew({
  tasks: [
    { preset: "scout", task: "Map project structure", cwd: "<project dir>" },
    { preset: "scout", task: "Find auth-related code", cwd: "<project dir>" }
  ]
})
\`\`\`

For sequential chain (each agent gets the previous agent's output via \`{previous}\`):

\`\`\`
dispatch_crew({
  chain: [
    { preset: "scout", task: "Investigate the auth module", cwd: "<project dir>" },
    { preset: "architect", task: "Design a solution based on: {previous}", cwd: "<project dir>" }
  ]
})
\`\`\`

You can override a preset's model if needed: \`dispatch_crew({ preset: "executor", model: "claude-opus-4", task: "..." })\`

### Starting a Workflow

For multi-file features or new modules, create \`.crew/state.md\` to activate workflow tracking:

\`\`\`yaml
---
feature: {feature-name}
phase: explore
workflow: explore,design,plan,build,review,ship
---
\`\`\`

All dispatch results are automatically logged to \`.crew/dispatches/\`. When a workflow is active, results are also captured to \`.crew/phases/<feature>/<phase>.md\` and the system enforces phase-appropriate agent presets.

### Workflow Shortcuts

Not every task needs all 6 phases. Choose the right subset when starting:

| Scope | Workflow | When |
|-------|----------|------|
| Full | explore,design,plan,build,review,ship | New features, architectural changes |
| Standard | explore,plan,build,review,ship | Clear scope, no design debate needed |
| Quick | explore,build,ship | Small feature, obvious implementation |
| Minimal | build,ship | Bug fix, config change, documentation |

### Rules

1. **Full context** — Always pass complete context to dispatched agents. They have NO access to your conversation history.
2. **One agent = one concern** — Don't ask a scout to also write code. Don't ask an executor to also review.
3. **Ask humans for design decisions** — Present options and ask during design. During build, agents auto-fix bugs and escalate architectural changes.`;
}

/**
 * Build the system prompt for active mode — workflow in progress.
 * Injects enforcement header, progress bar, presets, and full current phase content.
 * @param presetDocs - Formatted preset table (from formatPresetsForLLM)
 * @param state - Current CrewState (feature, phase, workflow)
 * @returns System prompt markdown content
 */
export function buildActivePrompt(
  presetDocs: string,
  state: CrewState,
): string {
  const phaseContent = getPhaseContent(state.phase ?? "") ?? `Unknown phase: ${state.phase}`;
  const progress = getWorkflowProgress(state);

  return `## ⚠️ ACTIVE WORKFLOW: "${state.feature}"

${progress}

You MUST complete this workflow. Do NOT start unrelated work. Do NOT skip phases.
Follow the instructions below for the current phase.

### Available Agent Presets

${presetDocs}

### Current Phase: ${state.phase}

${phaseContent}`;
}

/**
 * Build the crew system prompt (routes to idle or active based on state).
 * If workflow is active, injects phase instructions. Otherwise shows dispatch guide.
 * @param presetDocs - Formatted preset table (from formatPresetsForLLM)
 * @param state - Current CrewState or null if no state.md exists
 * @returns System prompt markdown content
 */
export function buildCrewPrompt(
  presetDocs: string,
  state: CrewState | null,
): string {
  if (state?.workflow && state.workflow.length > 0) {
    return buildActivePrompt(presetDocs, state);
  }
  return buildIdlePrompt(presetDocs);
}

/**
 * Build the nudge message sent on agent_end when workflow is incomplete.
 * Reminds the LLM to continue with the current phase.
 * @param state - Current CrewState
 * @returns Nudge message markdown content
 */
export function buildNudgeMessage(state: CrewState): string {
  const progress = getWorkflowProgress(state);

  return `⚠️ Workflow in progress: "${state.feature}" — phase: ${state.phase}
${progress}
Continue with the current phase. The instructions are in your system prompt.`;
}
