// ── Rendering ───────────────────────────────────────────────────────
// Inline DynamicBorder agent cards for renderCall/renderResult.
// Uses DynamicBorder from pi-coding-agent, Container/Text/Markdown/Spacer from pi-tui.

import {
  DynamicBorder,
  getMarkdownTheme,
  keyHint,
  Theme,
  type ThemeColor,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { Message } from "@mariozechner/pi-ai";
import type { UsageStats } from "./spawn.js";

// ── Types ───────────────────────────────────────────────────────────

interface DispatchCrewArgs {
  preset?: string;
  task?: string;
  tasks?: Array<{ preset: string; task: string }>;
  chain?: Array<{ preset: string; task: string }>;
}

export interface AgentRenderState {
  preset: string; // "scout", "executor", etc.
  instance: number; // 1, 2, ... (per-preset counter)
  task: string; // Task description (original task text)
  status: "running" | "done" | "error";
  elapsedMs: number;
  exitCode: number; // -1 while running, 0 = success, >0 = error
  messages: Message[];
  usage: UsageStats;
  model: string; // Resolved model string
  stderr?: string; // Subprocess stderr output (populated on error)
  errorMessage?: string; // Error message from NDJSON stream or process exit
}

export interface CrewDispatchDetails {
  mode: "single" | "parallel" | "chain";
  agents: AgentRenderState[];
}

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; arguments: Record<string, unknown> };

// ── Formatting Helpers ──────────────────────────────────────────────

/**
 * Format a token count for display: 1200 → "1.2k", 45 → "45"
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/**
 * Format usage stats for display: "3 turns ↑1.2k ↓450 $0.0042 claude-haiku-4-5"
 */
export function formatUsageStats(usage: UsageStats, model?: string): string {
  const parts: string[] = [];
  if (usage.turns > 0) parts.push(`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`);
  parts.push(`↑${formatTokens(usage.input)}`);
  parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cost > 0) parts.push(`$${usage.cost.toFixed(4)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

/**
 * Format a tool call for display: "read ~/project/package.json"
 */
export function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  themeFg: (color: ThemeColor, text: string) => string,
): string {
  const shortenPath = (p: string) => {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    if (home && p.startsWith(home)) return "~" + p.slice(home.length);
    return p;
  };

  let detail = "";
  if (toolName === "read" && args.path) {
    detail = shortenPath(String(args.path));
  } else if (toolName === "bash" && args.command) {
    const cmd = String(args.command);
    detail = cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  } else if (toolName === "write" && args.path) {
    detail = shortenPath(String(args.path));
  } else if (toolName === "edit" && args.path) {
    detail = shortenPath(String(args.path));
  } else if (toolName === "grep" && args.pattern) {
    detail = `/${args.pattern}/`;
    if (args.path) detail += ` in ${shortenPath(String(args.path))}`;
  } else if (toolName === "find" && args.path) {
    detail = shortenPath(String(args.path));
    if (args.pattern) detail += ` ${args.pattern}`;
  } else if (toolName === "ls" && args.path) {
    detail = shortenPath(String(args.path));
  } else {
    // Generic: show first string arg
    const firstArg = Object.values(args).find((v) => typeof v === "string");
    if (firstArg) {
      const s = String(firstArg);
      detail = s.length > 50 ? s.slice(0, 47) + "..." : s;
    }
  }

  return themeFg("muted", toolName) + (detail ? " " + themeFg("dim", detail) : "");
}

/**
 * Extract renderable display items from messages.
 * Walks AssistantMessage.content arrays for TextContent and ToolCall items.
 */
export function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (block.type === "text" && "text" in block) {
        items.push({ type: "text", text: block.text });
      } else if (block.type === "toolCall" && "name" in block) {
        items.push({
          type: "toolCall",
          name: block.name,
          arguments: (block as { arguments?: Record<string, unknown> }).arguments ?? {},
        });
      }
    }
  }

  return items;
}

/**
 * Get the last assistant text from messages (the agent's final output).
 */
export function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;

    for (let j = msg.content.length - 1; j >= 0; j--) {
      const block = msg.content[j];
      if (block.type === "text" && "text" in block && block.text.trim()) {
        return block.text;
      }
    }
  }
  return "";
}

/**
 * Extract a displayable error summary from an agent's error state.
 * Combines errorMessage and stderr (first meaningful line) for display.
 * Returns empty string for non-error agents.
 */
export function getErrorSummary(agent: AgentRenderState): string {
  if (agent.status !== "error") return "";

  const parts: string[] = [];

  if (agent.errorMessage) {
    parts.push(agent.errorMessage);
  }

  if (agent.stderr) {
    // Extract first non-empty line from stderr for a concise summary
    const firstLine = agent.stderr
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (firstLine && firstLine !== agent.errorMessage) {
      parts.push(firstLine);
    }
  }

  if (parts.length === 0 && agent.exitCode > 0) {
    parts.push(`Process exited with code ${agent.exitCode}`);
  }

  return parts.join(" — ");
}

// ── Agent Card Builder ──────────────────────────────────────────────

/**
 * Build a single agent card as a Container with DynamicBorder borders.
 */
function buildAgentCard(
  agent: AgentRenderState,
  expanded: boolean,
  showInstance: boolean,
  theme: Theme,
): Container {
  const card = new Container();
  const borderFn = (s: string) => theme.fg("dim", s);

  // Status icon
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const icon = isRunning
    ? theme.fg("warning", "●")
    : isError
      ? theme.fg("error", "✗")
      : theme.fg("success", "✓");

  // Name with optional instance number
  const name =
    agent.preset.charAt(0).toUpperCase() +
    agent.preset.slice(1) +
    (showInstance ? ` #${agent.instance}` : "");
  const elapsed = `${Math.round(agent.elapsedMs / 1000)}s`;

  // Header: icon + name + task preview + time
  const taskPreview = agent.task.length > 50 ? agent.task.slice(0, 47) + "..." : agent.task;
  const header =
    `${icon} ${theme.fg("accent", theme.bold(name))}` +
    theme.fg("dim", `  ${taskPreview}`) +
    `  ${theme.fg("dim", elapsed)}`;

  card.addChild(new DynamicBorder(borderFn));
  card.addChild(new Text(header, 0, 0));

  // Tool calls + output
  const displayItems = getDisplayItems(agent.messages);
  const finalOutput = getFinalOutput(agent.messages);

  // Show error summary for failed agents
  if (isError) {
    const errorSummary = getErrorSummary(agent);
    if (errorSummary) {
      card.addChild(new Text(theme.fg("error", `  ⚠ ${errorSummary}`), 0, 0));
    }
  }

  if (isRunning) {
    // Show only last tool call while running
    const lastTool = displayItems.filter((i) => i.type === "toolCall").pop();
    if (lastTool) {
      card.addChild(
        new Text(
          theme.fg("muted", "  → ") +
            formatToolCall(lastTool.name, lastTool.arguments, theme.fg.bind(theme)),
          0,
          0,
        ),
      );
    } else {
      card.addChild(new Text(theme.fg("muted", "  (starting...)"), 0, 0));
    }
  } else if (expanded) {
    // Show all tool calls + full output
    for (const item of displayItems) {
      if (item.type === "toolCall") {
        card.addChild(
          new Text(
            theme.fg("muted", "  → ") +
              formatToolCall(item.name, item.arguments, theme.fg.bind(theme)),
            0,
            0,
          ),
        );
      }
    }
    if (finalOutput) {
      card.addChild(new Spacer(1));
      card.addChild(new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()));
    }
    // Per-agent usage in expanded mode
    const usageStr = formatUsageStats(agent.usage, agent.model);
    if (usageStr) card.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
  } else {
    // Collapsed: last ~5 tool calls + truncated output
    const toolCalls = displayItems.filter((i) => i.type === "toolCall").slice(-5);
    for (const item of toolCalls) {
      card.addChild(
        new Text(
          theme.fg("muted", "  → ") +
            formatToolCall(item.name, item.arguments, theme.fg.bind(theme)),
          0,
          0,
        ),
      );
    }
    if (finalOutput) {
      const preview = finalOutput.split("\n").slice(0, 2).join("\n");
      card.addChild(new Text(theme.fg("dim", `  ${preview}`), 0, 0));
    }
  }

  card.addChild(new DynamicBorder(borderFn));
  return card;
}

// ── renderResult Builder ────────────────────────────────────────────

/**
 * Build the full render result: stacked agent cards + total usage footer.
 */
export function buildRenderResult(
  details: CrewDispatchDetails,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Container {
  const root = new Container();
  const { expanded, isPartial } = options;

  // Determine which presets have multiple instances (for #N display)
  const presetCounts = new Map<string, number>();
  for (const agent of details.agents) {
    presetCounts.set(agent.preset, (presetCounts.get(agent.preset) || 0) + 1);
  }

  // Build agent cards
  for (const agent of details.agents) {
    const showInstance = (presetCounts.get(agent.preset) || 0) > 1;
    const card = buildAgentCard(agent, expanded, showInstance, theme);
    root.addChild(card);
  }

  // Total usage footer (only when not partial)
  if (!isPartial) {
    const totalUsage: UsageStats = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    };

    const allModels = new Set<string>();
    for (const agent of details.agents) {
      totalUsage.input += agent.usage.input;
      totalUsage.output += agent.usage.output;
      totalUsage.cacheRead += agent.usage.cacheRead;
      totalUsage.cacheWrite += agent.usage.cacheWrite;
      totalUsage.cost += agent.usage.cost;
      totalUsage.turns += agent.usage.turns;
      if (agent.model) allModels.add(agent.model);
    }

    const modelStr = allModels.size === 1 ? [...allModels][0] : undefined;
    let footerText = "";

    if (details.agents.length > 1) {
      footerText += "\n" + theme.fg("dim", `Total: ${formatUsageStats(totalUsage, modelStr)}`);
    }

    if (!expanded) {
      footerText += `\n${theme.fg("muted", `(${keyHint("expandTools", "to expand")})`)}`;
    }

    if (footerText) {
      root.addChild(new Text(footerText.trimStart(), 0, 0));
    }
  }

  return root;
}

// ── renderCall Builder ──────────────────────────────────────────────

/**
 * Build the renderCall display for a dispatch_crew tool call.
 */
export function buildRenderCall(args: DispatchCrewArgs, theme: Theme): Text {
  if (args.preset && args.task) {
    // Single mode
    const preview = args.task.length > 60 ? args.task.slice(0, 57) + "..." : args.task;
    return new Text(
      theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
        theme.fg("accent", args.preset) +
        "\n  " +
        theme.fg("dim", preview),
      0,
      0,
    );
  }

  if (args.tasks) {
    // Parallel mode
    let text =
      theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
      theme.fg("accent", `parallel (${args.tasks.length} tasks)`);
    for (const t of args.tasks.slice(0, 3)) {
      const preview = t.task.length > 40 ? t.task.slice(0, 37) + "..." : t.task;
      text += `\n  ${theme.fg("accent", t.preset)} ${theme.fg("dim", preview)}`;
    }
    if (args.tasks.length > 3) {
      text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
    }
    return new Text(text, 0, 0);
  }

  if (args.chain) {
    // Chain mode
    let text =
      theme.fg("toolTitle", theme.bold("dispatch_crew ")) +
      theme.fg("accent", `chain (${args.chain.length} steps)`);
    for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
      const step = args.chain[i];
      const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
      const preview = cleanTask.length > 40 ? cleanTask.slice(0, 37) + "..." : cleanTask;
      text += `\n  ${theme.fg("muted", `${i + 1}.`)} ${theme.fg("accent", step.preset)} ${theme.fg("dim", preview)}`;
    }
    return new Text(text, 0, 0);
  }

  return new Text(theme.fg("toolTitle", theme.bold("dispatch_crew")), 0, 0);
}
