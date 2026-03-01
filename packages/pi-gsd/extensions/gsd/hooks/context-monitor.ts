import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export function registerContextMonitor(pi: ExtensionAPI): void {
  let turnCount = 0;
  let lastWarningTurn = 0;

  pi.on('turn_end', (_event, ctx) => {
    try {
      turnCount++;

      // Debounce: only check every 5 turns
      if (turnCount - lastWarningTurn < 5) return;

      const usage = ctx.getContextUsage();
      if (!usage) return;

      // percent is 0–100 (e.g. 75 means 75% used, 25% remaining)
      const percent = usage.percent;
      if (percent === null) return;

      const remainingPct = 100 - percent;

      if (remainingPct <= 25) {
        lastWarningTurn = turnCount;
        ctx.ui.notify(
          '⚠️ GSD: Context critically low (<25% remaining). Save your work with /skill:gsd-pause-work and start a new session.',
          'warning',
        );
      } else if (remainingPct <= 35) {
        lastWarningTurn = turnCount;
        ctx.ui.notify(
          '⚡ GSD: Context running low (~35% remaining). Consider pausing soon.',
          'info',
        );
      }
    } catch {
      // Silently ignore — context monitor is informational only
    }
  });
}
