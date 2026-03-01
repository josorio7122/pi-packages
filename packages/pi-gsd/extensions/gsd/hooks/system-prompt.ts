/**
 * GSD System Prompt Injection — Injects GSD state into every agent turn
 *
 * Uses `before_agent_start` to prepend current GSD state (phase, plan, profile,
 * milestone, status) into the system prompt so the LLM always knows the GSD
 * context without calling `gsd_state` first.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import * as fs from 'node:fs';
import { planningDir, statePath, configPath, roadmapPath } from '../lib/paths.js';
import { extractFrontmatter } from '../lib/frontmatter.js';

function buildGsdContext(cwd: string): string | null {
  if (!fs.existsSync(planningDir(cwd))) return null;

  const lines: string[] = [];
  lines.push('## Current GSD State');

  // Read state.md frontmatter
  try {
    const stPath = statePath(cwd);
    if (fs.existsSync(stPath)) {
      const content = fs.readFileSync(stPath, 'utf-8');
      const fm = extractFrontmatter(content);

      const phase = fm.current_phase ? String(fm.current_phase) : null;
      const phaseName = fm.current_phase_name ? String(fm.current_phase_name) : null;
      const plan = fm.current_plan ? String(fm.current_plan) : null;
      const status = fm.status ? String(fm.status) : null;
      const milestone = fm.current_milestone ? String(fm.current_milestone) : null;
      const milestoneName = fm.milestone_name ? String(fm.milestone_name) : null;
      const totalPhases = fm.total_phases != null ? String(fm.total_phases) : null;
      const completedPlans = fm.completed_plans != null ? String(fm.completed_plans) : null;
      const totalPlans = fm.total_plans != null ? String(fm.total_plans) : null;

      if (phase) lines.push(`- **Phase:** ${phase}${phaseName ? ` (${phaseName})` : ''}`);
      if (plan) lines.push(`- **Plan:** ${plan}${totalPlans ? ` (${completedPlans ?? '?'}/${totalPlans} completed)` : ''}`);
      if (status) lines.push(`- **Status:** ${status}`);
      if (milestone) lines.push(`- **Milestone:** ${milestone}${milestoneName ? ` — ${milestoneName}` : ''}`);
      if (totalPhases) lines.push(`- **Total Phases:** ${totalPhases}`);
    } else {
      lines.push('- `.planning/` exists but no STATE.md yet');
    }
  } catch {
    lines.push('- _(unable to read state)_');
  }

  // Read config profile
  try {
    const cfgPath = configPath(cwd);
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const profile = cfg.active_profile ?? 'default';
      lines.push(`- **Profile:** ${profile}`);
    }
  } catch {
    // ignore
  }

  return lines.join('\n');
}

export function registerSystemPromptInjection(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (_event, ctx) => {
    const gsdContext = buildGsdContext(ctx.cwd);
    if (!gsdContext) return;

    return {
      systemPrompt: _event.systemPrompt + '\n\n' + gsdContext,
    };
  });
}
