/**
 * GSD Tool Gating — Block unsafe operations based on GSD state
 *
 * Uses `tool_call` event to enforce workflow discipline:
 * - Block `gsd_dispatch` / `gsd_dispatch_wave` if no plan file exists for the current phase
 * - Block `gsd_phase` advance/complete actions if verification hasn't passed
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import * as fs from 'node:fs';
import { planningDir, statePath, findPhase } from '../lib/paths.js';
import { extractFrontmatter } from '../lib/frontmatter.js';

function getCurrentPhase(cwd: string): string | null {
  try {
    const stPath = statePath(cwd);
    if (!fs.existsSync(stPath)) return null;
    const content = fs.readFileSync(stPath, 'utf-8');
    const fm = extractFrontmatter(content);
    return fm.current_phase ? String(fm.current_phase) : null;
  } catch {
    return null;
  }
}

function phaseHasPlan(cwd: string, phase: string): boolean {
  const info = findPhase(cwd, phase);
  if (!info || !info.found) return false;
  return info.plans.length > 0;
}

function phaseHasVerification(cwd: string, phase: string): boolean {
  const info = findPhase(cwd, phase);
  if (!info || !info.found) return false;
  return info.has_verification;
}

export function registerToolGating(pi: ExtensionAPI): void {
  pi.on('tool_call', (event, ctx) => {
    const cwd = ctx.cwd;

    // Only gate when .planning/ exists (GSD is active)
    if (!fs.existsSync(planningDir(cwd))) {
      return { block: false };
    }

    // Gate: dispatch requires a plan
    if (event.toolName === 'gsd_dispatch' || event.toolName === 'gsd_dispatch_wave') {
      const phase = getCurrentPhase(cwd);
      if (phase && !phaseHasPlan(cwd, phase)) {
        return {
          block: true,
          reason: `🚫 GSD: Cannot dispatch agents — no plan exists for Phase ${phase}. Create a plan first with gsd_phase or the gsd-plan-phase skill.`,
        };
      }
    }

    // Gate: phase advance/complete requires verification
    if (event.toolName === 'gsd_phase') {
      const input = event.input as Record<string, unknown>;
      const action = input.action;

      if (action === 'advance' || action === 'complete') {
        const phase = getCurrentPhase(cwd);
        if (phase && !phaseHasVerification(cwd, phase)) {
          return {
            block: true,
            reason: `🚫 GSD: Cannot ${action} Phase ${phase} — no verification file found. Run gsd_verify or the gsd-verify-work skill first.`,
          };
        }
      }
    }

    return { block: false };
  });
}
