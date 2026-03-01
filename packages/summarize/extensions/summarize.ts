/**
 * Summarize Extension
 *
 * Adds /summarize as an alias for pi's built-in /compact command.
 * Triggers conversation compaction with optional custom instructions.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function summarizeExtension(pi: ExtensionAPI) {
  pi.registerCommand("summarize", {
    description: "Summarize the conversation (alias for /compact)",
    handler: async (args, ctx) => {
      ctx.compact({
        customInstructions: args.trim() || undefined,
        onComplete: () => {
          ctx.ui.notify("Conversation summarized", "success");
        },
        onError: (error) => {
          ctx.ui.notify(`Summarize failed: ${error.message}`, "error");
        },
      });
    },
  });
}
