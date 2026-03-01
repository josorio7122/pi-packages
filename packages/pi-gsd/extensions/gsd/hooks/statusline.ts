/**
 * GSD Statusline — Rich footer showing phase, plan, profile, and status
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'node:fs';
import { planningDir, statePath, configPath } from '../lib/paths.js';
import { extractFrontmatter } from '../lib/frontmatter.js';

interface GsdState {
  exists: boolean;
  phase: string;
  plan: string;
  status: string;
  profile: string;
  milestone: string;
}

function readGsdState(cwd: string): GsdState {
  const defaultState: GsdState = {
    exists: false,
    phase: '–',
    plan: '–',
    status: 'inactive',
    profile: 'default',
    milestone: '–',
  };

  if (!fs.existsSync(planningDir(cwd))) return defaultState;

  defaultState.exists = true;

  // Read state.md
  try {
    const stPath = statePath(cwd);
    if (fs.existsSync(stPath)) {
      const content = fs.readFileSync(stPath, 'utf-8');
      const fm = extractFrontmatter(content);
      defaultState.phase = String(fm.current_phase ?? '?');
      defaultState.plan = String(fm.current_plan ?? '?');
      defaultState.status = String(fm.status ?? 'unknown');
      defaultState.milestone = String(fm.current_milestone ?? '–');
    }
  } catch {
    // ignore
  }

  // Read config.json for profile
  try {
    const cfgPath = configPath(cwd);
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      defaultState.profile = cfg.active_profile ?? 'default';
    }
  } catch {
    // ignore
  }

  return defaultState;
}

export function registerStatusline(pi: ExtensionAPI): void {
  let lastState: GsdState = { exists: false, phase: '–', plan: '–', status: 'inactive', profile: 'default', milestone: '–' };

  function refresh(ctx: ExtensionContext): void {
    lastState = readGsdState(ctx.cwd);

    if (!lastState.exists) {
      // No .planning/ — set a minimal status indicator
      ctx.ui.setStatus('gsd', undefined);
      return;
    }

    // Status string for the built-in status area
    const statusIcon = lastState.status === 'active' ? '●'
      : lastState.status === 'paused' ? '⏸'
      : lastState.status === 'completed' ? '✓'
      : '○';

    ctx.ui.setStatus(
      'gsd',
      `${statusIcon} GSD: P${lastState.phase} · ${lastState.plan} · ${lastState.profile}`,
    );
  }

  pi.on('session_start', (_event, ctx) => {
    refresh(ctx);
  });

  pi.on('turn_end', (_event, ctx) => {
    refresh(ctx);
  });

  // Also refresh after tool executions that might change state
  pi.on('tool_execution_end', (event, ctx) => {
    if (event.toolName?.startsWith('gsd_')) {
      refresh(ctx);
    }
  });
}
