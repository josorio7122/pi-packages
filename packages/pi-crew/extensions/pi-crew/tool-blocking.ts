// ── Tool Blocking ───────────────────────────────────────────────────
// Pure function for the tool_call hook. Determines whether a tool call
// should be blocked. The orchestrator can only write/edit inside .crew/.

import * as path from "node:path";

/** Result of a tool blocking check. */
type BlockResult = { block: false } | { block: true; reason: string };

/** Tools that modify files. */
const WRITE_TOOLS = new Set(["write", "edit"]);

/**
 * Check if a path targets the .crew/ directory.
 *
 * Uses path.normalize to prevent traversal attacks (e.g. "../.crew/state.md").
 * For relative paths: must start with ".crew/"
 * For absolute paths: must contain "/.crew/" as a path segment
 *
 * Rejects:
 * - "../.crew/state.md" (traversal)
 * - "src/.crew/exploit.ts" (nested .crew dir that's not the project root .crew/)
 * - ".crew-utils/file.ts" (prefix match without separator)
 */
function isCrewPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);

  // Relative path: must start with .crew/ after normalization
  // path.normalize("../.crew/x") → "../.crew/x" which does NOT start with ".crew/"
  if (normalized.startsWith(`.crew${path.sep}`)) {
    return true;
  }

  // Absolute path: must have /.crew/ as a proper directory segment at the end of the base path
  // We need to check that .crew is a top-level directory, not nested (e.g. /project/.crew/ not /project/src/.crew/)
  // For absolute paths from pi, the cwd is prepended, so /Users/dev/project/.crew/state.md is valid
  if (path.isAbsolute(normalized)) {
    // Split into segments and check that ".crew" appears as a directory name
    const segments = normalized.split(path.sep);
    const crewIdx = segments.indexOf(".crew");
    // .crew must exist and must not be the last segment (needs a file after it)
    if (crewIdx >= 0 && crewIdx < segments.length - 1) {
      // Verify no ".." segments after normalization (path.normalize already resolves these,
      // but double-check there's no remaining traversal)
      if (!segments.includes("..")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determine whether a tool call should be blocked.
 *
 * Rules:
 * - dispatch_crew: always allowed
 * - read, bash, grep, find, ls: always allowed (read-only)
 * - write/edit to .crew/ paths: allowed (orchestrator's workspace)
 * - write/edit to anything else: BLOCKED (must use dispatch_crew)
 * - unknown tools: allowed (custom tools from other extensions)
 *
 * @param toolName - Name of the tool being called
 * @param input - Tool input parameters
 * @returns { block: false } or { block: true, reason: string }
 */
export function shouldBlockToolCall(
  toolName: string,
  input: Record<string, unknown>,
): BlockResult {
  // Write/edit tools need path checking
  if (WRITE_TOOLS.has(toolName)) {
    const targetPath = input.path as string | undefined;

    // No path = block (malformed call)
    if (!targetPath) {
      return {
        block: true,
        reason: "🚫 Coordinator mode: use dispatch_crew with an executor agent to make code changes. You cannot write or edit files directly.",
      };
    }

    // Allow writes to .crew/ (orchestrator's workspace)
    if (isCrewPath(targetPath)) {
      return { block: false };
    }

    // Block all other writes
    return {
      block: true,
      reason: "🚫 Coordinator mode: use dispatch_crew with an executor agent to make code changes. You cannot write or edit files directly.",
    };
  }

  // Everything else is allowed (dispatch_crew, read, bash, grep, find, ls, custom tools)
  return { block: false };
}
