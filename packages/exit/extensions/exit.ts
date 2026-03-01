/**
 * Exit Extension
 *
 * Adds /exit as an alias for pi's built-in /quit command.
 * Triggers a graceful shutdown of pi.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function exitExtension(pi: ExtensionAPI) {
  pi.registerCommand("exit", {
    description: "Exit pi (alias for /quit)",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}
