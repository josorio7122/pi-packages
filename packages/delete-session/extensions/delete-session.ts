/**
 * Delete Session Extension
 *
 * Adds /delete to delete the current session.
 * If other sessions exist for the same cwd, switches to the most recent one.
 * If no other sessions exist, creates a new session first.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SessionManager } from "@mariozechner/pi-coding-agent";

export default function deleteSessionExtension(pi: ExtensionAPI) {
  pi.registerCommand("delete", {
    description: "Delete the current session",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const currentFile = ctx.sessionManager.getSessionFile();
      if (!currentFile) {
        ctx.ui.notify("No session file to delete", "info");
        return;
      }

      const cwd = ctx.sessionManager.getCwd();
      const sessions = await SessionManager.list(cwd);
      const others = sessions
        .filter((s) => s.path !== currentFile)
        .sort((a, b) => b.modified.getTime() - a.modified.getTime());

      if (others.length > 0) {
        ctx.sessionManager.setSessionFile(others[0].path);
      } else {
        await ctx.newSession();
      }

      await pi.exec("rm", [currentFile]);
      ctx.ui.notify("Session deleted", "success");
    },
  });
}
