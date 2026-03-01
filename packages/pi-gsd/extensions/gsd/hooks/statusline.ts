import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'node:fs';
import { planningDir, statePath } from '../lib/paths.js';
import { extractFrontmatter } from '../lib/frontmatter.js';

export function registerStatusline(pi: ExtensionAPI): void {
  function updateStatus(ctx: ExtensionContext): void {
    try {
      const cwd = ctx.cwd;

      // Only show status if .planning/ exists
      if (!fs.existsSync(planningDir(cwd))) {
        ctx.ui.setStatus('gsd', undefined);
        return;
      }

      const stPath = statePath(cwd);
      if (!fs.existsSync(stPath)) {
        ctx.ui.setStatus('gsd', 'GSD: no state');
        return;
      }

      const content = fs.readFileSync(stPath, 'utf-8');
      const fm = extractFrontmatter(content);

      const phase = fm.current_phase ?? '?';
      const plan = fm.current_plan ?? '?';
      const status = fm.status ?? 'unknown';

      ctx.ui.setStatus('gsd', `GSD: Phase ${phase} | Plan ${plan} | ${status}`);
    } catch {
      // Silently ignore — statusline is informational only
    }
  }

  pi.on('session_start', (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on('turn_end', (_event, ctx) => {
    updateStatus(ctx);
  });
}
