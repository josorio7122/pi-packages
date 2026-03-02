// ── pi-crew Extension ───────────────────────────────────────────────
// Registers dispatch_crew tool, injects crew system prompt, manages commands.

import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { Type, Static } from "@sinclair/typebox";
import { resolvePreset, formatPresetsForLLM, getPreset, getPresetNames } from "./presets.js";
import { isValidProfile, PROFILE_NAMES } from "./profiles.js";
import {
  readConfig,
  writeConfig,
  readState,
  readStateRaw,
  isWorkflowComplete,
  advancePhase,
} from "./state.js";
import { runSingleAgent, mapWithConcurrencyLimit, emptyUsage } from "./spawn.js";
import type { SpawnParams } from "./spawn.js";
import { Text } from "@mariozechner/pi-tui";
import {
  buildRenderResult,
  buildRenderCall,
  getFinalOutput,
  type AgentRenderState,
  type CrewDispatchDetails,
} from "./rendering.js";
import { buildCrewPrompt, buildNudgeMessage } from "./prompt.js";
import {
  shouldRequireWorkflow,
  buildWorkflowGateMessage,
  shouldBlockForMissingHandoff,
  buildMissingHandoffMessage,
} from "./enforcement.js";
import { writeHandoff } from "./handoff.js";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  BeforeAgentStartEvent,
  AgentEndEvent,
  ToolRenderResultOptions,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";

// ── Package Root ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "../.."); // extensions/pi-crew/ → pi-crew/

// ── Constants ───────────────────────────────────────────────────────

/**
 * Maximum concurrent agents for parallel dispatch.
 * Default: 4. Hard ceiling: 8 (empirically tested on M-series Macs).
 * Override via DISPATCH_CREW_MAX_CONCURRENT environment variable.
 */
const MAX_CONCURRENT = Math.min(
  Math.max(1, parseInt(process.env.DISPATCH_CREW_MAX_CONCURRENT || "4", 10)),
  8,
);
const MAX_PARALLEL_TASKS = 8;

/** Max characters for task preview in chain mode state. */
const TASK_PREVIEW_LENGTH = 200;

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract a human-readable message from an unknown error value. */
function extractErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Create a 1-second interval timer that updates agent elapsed time and emits a render update.
 * Returns a cleanup function to clear the interval.
 */
function startAgentTimer(
  agent: AgentRenderState,
  startTime: number,
  emitUpdate: () => void,
): () => void {
  const timer = setInterval(() => {
    agent.elapsedMs = Date.now() - startTime;
    emitUpdate();
  }, 1000);
  return () => clearInterval(timer);
}

/** Resolve cwd to an absolute path. */
function resolveAbsoluteCwd(cwd: string | undefined, fallback: string): string {
  if (!cwd) return fallback;
  return path.isAbsolute(cwd) ? cwd : path.resolve(fallback, cwd);
}

// ── Tool Result Type ────────────────────────────────────────────────

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: CrewDispatchDetails | undefined;
  isError?: boolean;
}

// ── Resolve One Preset ──────────────────────────────────────────────

type ResolveResult =
  | { resolved: SpawnParams; error: null }
  | { resolved: null; error: string };

function resolveOne(
  presetName: string,
  task: string,
  opts: { cwd?: string; model?: string; tools?: string; thinking?: string },
  profile: string,
  overrides: Record<string, string>,
  defaultCwd: string,
): ResolveResult {
  const resolved = resolvePreset(presetName, profile, overrides, packageRoot);
  if (!resolved) {
    return {
      resolved: null,
      error: `Unknown preset "${presetName}". Available: ${getPresetNames().join(", ")}`,
    };
  }
  return {
    error: null,
    resolved: {
      task,
      systemPrompt: resolved.systemPrompt,
      tools: opts.tools || resolved.tools,
      model: opts.model || resolved.model,
      cwd: resolveAbsoluteCwd(opts.cwd, defaultCwd),
      thinking: opts.thinking,
    },
  };
}

// ── Build Agent States ──────────────────────────────────────────────

function buildAgentStates(
  items: Array<{ preset: string; task: string; model: string }>,
  initialStatus: AgentRenderState["status"] = "running",
): AgentRenderState[] {
  const instanceCounters = new Map<string, number>();
  return items.map((item) => {
    const count = (instanceCounters.get(item.preset) || 0) + 1;
    instanceCounters.set(item.preset, count);
    return {
      preset: item.preset,
      instance: count,
      task: item.task,
      status: initialStatus,
      elapsedMs: 0,
      exitCode: -1,
      messages: [],
      stderr: undefined,
      errorMessage: undefined,
      usage: emptyUsage(),
      model: item.model,
    };
  });
}

// ── Emit Update Helper ──────────────────────────────────────────────

function createEmitUpdate(
  mode: "single" | "parallel" | "chain",
  agents: AgentRenderState[],
  onUpdate: AgentToolUpdateCallback<CrewDispatchDetails> | undefined,
): (contentText?: string) => void {
  return (contentText = "(running...)") => {
    if (onUpdate) {
      onUpdate({
        content: [{ type: "text" as const, text: contentText }],
        details: { mode, agents } as CrewDispatchDetails,
      });
    }
  };
}

// ── Update Agent From Result ────────────────────────────────────────

function applyAgentResult(
  agent: AgentRenderState,
  result: { exitCode: number; messages: unknown[]; usage: ReturnType<typeof emptyUsage>; stderr: string; errorMessage?: string; stopReason?: string },
  startTime: number,
): void {
  agent.status = result.exitCode === 0 ? "done" : "error";
  agent.exitCode = result.exitCode;
  agent.messages = result.messages as AgentRenderState["messages"];
  agent.usage = result.usage;
  agent.elapsedMs = Date.now() - startTime;
  agent.stderr = result.stderr || undefined;
  agent.errorMessage = result.errorMessage || undefined;
}

function isAgentError(result: { exitCode: number; stopReason?: string }): boolean {
  return (
    result.exitCode !== 0 ||
    result.stopReason === "error" ||
    result.stopReason === "aborted"
  );
}

// ── Single Mode ─────────────────────────────────────────────────────

async function executeSingleMode(
  preset: string,
  task: string,
  opts: { cwd?: string; model?: string; tools?: string; thinking?: string },
  profile: string,
  overrides: Record<string, string>,
  defaultCwd: string,
  signal: AbortSignal,
  onUpdate: AgentToolUpdateCallback<CrewDispatchDetails> | undefined,
): Promise<ToolResult> {
  const r = resolveOne(preset, task, opts, profile, overrides, defaultCwd);
  if (r.error !== null) {
    return { content: [{ type: "text", text: r.error }], details: undefined, isError: true };
  }
  const spawnParams = r.resolved;

  const agents = buildAgentStates([{ preset, task, model: spawnParams.model }]);
  const emitUpdate = createEmitUpdate("single", agents, onUpdate);
  const startTime = Date.now();
  const stopTimer = startAgentTimer(agents[0], startTime, () =>
    emitUpdate(getFinalOutput(agents[0].messages) || "(running...)"),
  );

  try {
    const result = await runSingleAgent(spawnParams, defaultCwd, signal, (update) => {
      agents[0].messages = update.messages;
      agents[0].usage = update.usage;
      agents[0].elapsedMs = Date.now() - startTime;
      emitUpdate(getFinalOutput(update.messages) || "(running...)");
    });

    stopTimer();
    applyAgentResult(agents[0], result, startTime);

    const output = getFinalOutput(result.messages) || "(no output)";
    return {
      content: [{ type: "text", text: output }],
      details: { mode: "single", agents } as CrewDispatchDetails,
      isError: isAgentError(result),
    };
  } catch (e: unknown) {
    stopTimer();
    agents[0].status = "error";
    agents[0].exitCode = 1;
    agents[0].elapsedMs = Date.now() - startTime;
    const errorMessage = extractErrorMessage(e);
    agents[0].errorMessage = errorMessage;
    return {
      content: [{ type: "text", text: `Agent aborted: ${errorMessage}` }],
      details: { mode: "single", agents } as CrewDispatchDetails,
      isError: true,
    };
  }
}

// ── Parallel Mode ───────────────────────────────────────────────────

/** Shared shape for task/chain step input. */
interface AgentInput {
  preset: string;
  task: string;
  cwd?: string;
  model?: string;
  tools?: string;
  thinking?: string;
}

async function executeParallelMode(
  tasks: AgentInput[],
  profile: string,
  overrides: Record<string, string>,
  defaultCwd: string,
  signal: AbortSignal,
  onUpdate: AgentToolUpdateCallback<CrewDispatchDetails> | undefined,
): Promise<ToolResult> {
  if (tasks.length > MAX_PARALLEL_TASKS) {
    return {
      content: [{ type: "text", text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
      details: undefined,
      isError: true,
    };
  }

  // Resolve all presets
  const spawnItems: Array<{ spawnParams: SpawnParams; preset: string; task: string; model: string }> = [];
  for (const t of tasks) {
    const r = resolveOne(t.preset, t.task, t, profile, overrides, defaultCwd);
    if (r.error !== null) {
      return { content: [{ type: "text", text: r.error }], details: undefined, isError: true };
    }
    spawnItems.push({ spawnParams: r.resolved, preset: t.preset, task: t.task, model: r.resolved.model });
  }

  const agents = buildAgentStates(spawnItems.map((s) => ({ preset: s.preset, task: s.task, model: s.model })));
  const emitUpdate = createEmitUpdate("parallel", agents, onUpdate);
  const startTimes = new Array<number>(agents.length).fill(0);

  const stopTimer = (() => {
    const timer = setInterval(() => {
      for (let i = 0; i < agents.length; i++) {
        if (agents[i].status === "running" && startTimes[i] > 0) {
          agents[i].elapsedMs = Date.now() - startTimes[i];
        }
      }
      emitUpdate();
    }, 1000);
    return () => clearInterval(timer);
  })();

  try {
    await mapWithConcurrencyLimit(spawnItems, MAX_CONCURRENT, async (item, idx) => {
      startTimes[idx] = Date.now();
      const result = await runSingleAgent(item.spawnParams, defaultCwd, signal, (update) => {
        agents[idx].messages = update.messages;
        agents[idx].usage = update.usage;
        agents[idx].elapsedMs = Date.now() - startTimes[idx];
        emitUpdate();
      });
      applyAgentResult(agents[idx], result, startTimes[idx]);
      emitUpdate();
    });

    stopTimer();
    return buildParallelResult(agents);
  } catch (e: unknown) {
    stopTimer();
    return {
      content: [{ type: "text", text: `Parallel dispatch error: ${extractErrorMessage(e)}` }],
      details: { mode: "parallel", agents } as CrewDispatchDetails,
      isError: true,
    };
  }
}

/** Format parallel results for LLM consumption. */
function buildParallelResult(agents: AgentRenderState[]): ToolResult {
  const presetCounts = new Map<string, number>();
  for (const a of agents) presetCounts.set(a.preset, (presetCounts.get(a.preset) || 0) + 1);

  let outputText = "";
  for (const agent of agents) {
    const showNum = (presetCounts.get(agent.preset) || 0) > 1;
    const label =
      agent.preset.charAt(0).toUpperCase() +
      agent.preset.slice(1) +
      (showNum ? ` #${agent.instance}` : "");
    const prefix = agent.status === "error" ? "[ERROR] " : "";
    let agentOutput = getFinalOutput(agent.messages) || "(no output)";
    if (agent.status === "error") {
      if (agent.errorMessage) agentOutput += `\nError: ${agent.errorMessage}`;
      if (agent.stderr) agentOutput += `\nStderr: ${agent.stderr.split("\n").slice(0, 5).join("\n")}`;
    }
    outputText += `## ${prefix}${label}: ${agent.task}\n${agentOutput}\n\n`;
  }

  return {
    content: [{ type: "text", text: outputText.trim() }],
    details: { mode: "parallel", agents } as CrewDispatchDetails,
    isError: agents.every((a) => a.status === "error"),
  };
}

// ── Chain Mode ──────────────────────────────────────────────────────

async function executeChainMode(
  chain: AgentInput[],
  profile: string,
  overrides: Record<string, string>,
  defaultCwd: string,
  signal: AbortSignal,
  onUpdate: AgentToolUpdateCallback<CrewDispatchDetails> | undefined,
): Promise<ToolResult> {
  const agents = buildAgentStates(
    chain.map((step) => {
      const preset = getPreset(step.preset);
      const model = preset
        ? step.model || resolvePreset(step.preset, profile, overrides, packageRoot)?.model || ""
        : "";
      return { preset: step.preset, task: step.task, model };
    }),
    "queued",
  );

  const emitUpdate = createEmitUpdate("chain", agents, onUpdate);
  let previousOutput = "";

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    agents[i].status = "running";

    // Replace {previous} with prior agent output
    const task = step.task.replace(/\{previous\}/g, previousOutput);

    const r = resolveOne(step.preset, task, step, profile, overrides, defaultCwd);
    if (r.error !== null) {
      agents[i].status = "error";
      agents[i].exitCode = 1;
      return {
        content: [{ type: "text", text: r.error }],
        details: { mode: "chain", agents } as CrewDispatchDetails,
        isError: true,
      };
    }
    const spawnParams = r.resolved;

    // Update task with substituted text
    agents[i].task = task.length > TASK_PREVIEW_LENGTH ? task.slice(0, TASK_PREVIEW_LENGTH - 3) + "..." : task;
    agents[i].model = spawnParams.model;

    const startTime = Date.now();
    const stopTimer = startAgentTimer(agents[i], startTime, emitUpdate);

    try {
      const result = await runSingleAgent(spawnParams, defaultCwd, signal, (update) => {
        agents[i].messages = update.messages;
        agents[i].usage = update.usage;
        agents[i].elapsedMs = Date.now() - startTime;
        emitUpdate();
      });

      stopTimer();
      applyAgentResult(agents[i], result, startTime);

      if (isAgentError(result)) {
        return buildChainErrorResult(agents, i, chain.length, getFinalOutput(result.messages) || "(error — no output)", "stopped");
      }

      previousOutput = getFinalOutput(result.messages);
    } catch (e: unknown) {
      stopTimer();
      agents[i].status = "error";
      agents[i].exitCode = 1;
      agents[i].elapsedMs = Date.now() - startTime;
      agents[i].errorMessage = extractErrorMessage(e);
      return buildChainErrorResult(agents, i, chain.length, extractErrorMessage(e), "aborted");
    }
  }

  return {
    content: [{ type: "text", text: previousOutput || "(no output)" }],
    details: { mode: "chain", agents } as CrewDispatchDetails,
  };
}

/** Build error result for chain mode with completed step summaries. */
function buildChainErrorResult(
  agents: AgentRenderState[],
  failedIndex: number,
  totalSteps: number,
  errorText: string,
  verb: "stopped" | "aborted",
): ToolResult {
  let errorContent = `Chain ${verb} at step ${failedIndex + 1}/${totalSteps}: ${errorText}`;
  if (failedIndex > 0) {
    errorContent += "\n\nCompleted steps:";
    for (let j = 0; j < failedIndex; j++) {
      const stepOutput = getFinalOutput(agents[j].messages);
      const preview = stepOutput.split("\n").slice(0, 3).join("\n");
      errorContent += `\n\n## Step ${j + 1} (${agents[j].preset}):\n${preview}`;
      if (stepOutput.split("\n").length > 3) errorContent += "\n...";
    }
  }
  return {
    content: [{ type: "text", text: errorContent }],
    details: { mode: "chain", agents } as CrewDispatchDetails,
    isError: true,
  };
}

// ── Tool Schema ─────────────────────────────────────────────────────

const AgentTaskSchema = Type.Object({
  preset: Type.String({ description: "Agent preset name" }),
  task: Type.String({ description: "Task instructions. Use {previous} in chain mode to reference prior agent's output." }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  model: Type.Optional(Type.String({ description: "Override the preset's model" })),
  tools: Type.Optional(Type.String({ description: "Override the preset's tools" })),
  thinking: Type.Optional(
    Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh" }),
  ),
});

const DispatchCrewParams = Type.Object({
  // Single mode
  preset: Type.Optional(
    Type.String({
      description:
        "Agent preset: scout, researcher, architect, executor, reviewer, debugger (for single mode)",
    }),
  ),
  task: Type.Optional(
    Type.String({
      description:
        "Task instructions — include all context, agent has no access to your conversation (for single mode)",
    }),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent (single mode)" })),
  model: Type.Optional(
    Type.String({ description: "Override the preset's model, e.g. 'claude-opus-4' (single mode)" }),
  ),
  tools: Type.Optional(
    Type.String({
      description: "Override the preset's tools, e.g. 'read,bash,grep' (single mode)",
    }),
  ),
  thinking: Type.Optional(
    Type.String({
      description: "Thinking level: off, minimal, low, medium, high, xhigh (single mode)",
    }),
  ),
  // Parallel mode
  tasks: Type.Optional(
    Type.Array(AgentTaskSchema, { description: "Array of {preset, task} for parallel execution" }),
  ),
  // Chain mode
  chain: Type.Optional(
    Type.Array(AgentTaskSchema, {
      description: "Array of {preset, task} for sequential execution with {previous} placeholder",
    }),
  ),
});

// ── Extension Entry Point ───────────────────────────────────────────

export default function piCrew(pi: ExtensionAPI) {
  let nudgedThisCycle = false;

  // ── Reset nudge guard on user input ──────────────────────────────
  pi.on("input", async () => {
    nudgedThisCycle = false;
  });

  // ── Before agent start: inject crew system prompt ────────────────
  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const config = readConfig(ctx.cwd);
    const profile = config.profile || "balanced";
    const overrides = config.overrides || {};
    const presetDocs = formatPresetsForLLM(profile, overrides);

    const state = readState(ctx.cwd);

    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildCrewPrompt(presetDocs, state),
    };
  });

  // ── Agent end: nudge if workflow incomplete ──────────────────────
  pi.on("agent_end", async (_event: AgentEndEvent, ctx: ExtensionContext) => {
    const state = readState(ctx.cwd);
    if (!state || !state.workflow || state.workflow.length === 0) return;
    if (isWorkflowComplete(state)) return;
    if (nudgedThisCycle) return;

    nudgedThisCycle = true;
    pi.sendMessage(
      {
        customType: "crew-nudge",
        content: buildNudgeMessage(state),
        display: true,
      },
      { triggerTurn: true },
    );
  });

  // ── Register dispatch_crew tool ──────────────────────────────────
  pi.registerTool({
    name: "dispatch_crew",
    label: "Dispatch Crew",
    description: [
      "Dispatch specialized agents (scout, researcher, architect, executor, reviewer, debugger) with preset configurations.",
      "Supports single, parallel (tasks array), and chain (chain array with {previous} placeholder) modes.",
      "",
      "Each preset has a built-in system prompt, tool set, and model. Just pass the preset name and task:",
      "",
      '```',
      'dispatch_crew({ preset: "scout", task: "Your task instructions here", cwd: "<project dir>" })',
      '```',
      "",
      "For parallel dispatch:",
      "",
      '```',
      'dispatch_crew({',
      '  tasks: [',
      '    { preset: "scout", task: "Map project structure", cwd: "<project dir>" },',
      '    { preset: "scout", task: "Find auth-related code", cwd: "<project dir>" }',
      '  ]',
      '})',
      '```',
      "",
      "For sequential chain (each agent gets the previous agent's output via `{previous}`):",
      "",
      '```',
      'dispatch_crew({',
      '  chain: [',
      '    { preset: "scout", task: "Investigate the auth module", cwd: "<project dir>" },',
      '    { preset: "architect", task: "Design a solution based on: {previous}", cwd: "<project dir>" }',
      '  ]',
      '})',
      '```',
      "",
      "You can override a preset's model if needed: `dispatch_crew({ preset: \"executor\", model: \"claude-opus-4\", task: \"...\" })`",
    ].join("\n"),
    parameters: DispatchCrewParams,

    async execute(
      _toolCallId: string,
      params: Static<typeof DispatchCrewParams>,
      signal: AbortSignal,
      onUpdate: AgentToolUpdateCallback<CrewDispatchDetails> | undefined,
      ctx: ExtensionContext,
    ) {
      const config = readConfig(ctx.cwd);
      const profile = config.profile || "balanced";
      const overrides = config.overrides || {};

      // ── Determine mode ──────────────────────────────────────
      const hasChain = (params.chain?.length ?? 0) > 0;
      const hasTasks = (params.tasks?.length ?? 0) > 0;
      const hasSingle = Boolean(params.preset && params.task);
      const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

      if (modeCount !== 1) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Specify exactly one mode — single (preset + task), parallel (tasks array), or chain (chain array).",
            },
          ],
          details: undefined,
          isError: true,
        };
      }

      // ── Workflow gate: require state.md for multi-agent work ──
      const state = readState(ctx.cwd);
      const hasActiveWorkflow = Boolean(state?.workflow && state.workflow.length > 0);

      if (hasSingle || hasTasks || hasChain) {
        const mode = hasSingle ? "single" : hasTasks ? "parallel" : "chain";
        const agentList = hasSingle
          ? [{ preset: params.preset! }]
          : hasTasks
            ? params.tasks!.map((t) => ({ preset: t.preset }))
            : params.chain!.map((c) => ({ preset: c.preset }));

        if (shouldRequireWorkflow(mode, agentList, hasActiveWorkflow)) {
          return {
            content: [{ type: "text", text: buildWorkflowGateMessage() }],
            details: undefined,
            isError: true,
          };
        }
      }

      // ── Phase gate: check handoff files exist ───────────────
      if (hasActiveWorkflow) {
        const state = readState(ctx.cwd);
        if (state) {
          const handoffCheck = shouldBlockForMissingHandoff(ctx.cwd, state);
          if (handoffCheck.blocked) {
            return {
              content: [{ type: "text", text: buildMissingHandoffMessage(state, handoffCheck.missing) }],
              details: undefined,
              isError: true,
            };
          }
        }
      }

      // ── Dispatch to mode handler ────────────────────────────
      let result: {
        content: Array<{ type: "text"; text: string }>;
        details: CrewDispatchDetails | undefined;
        isError?: boolean;
      };

      if (hasSingle) {
        result = await executeSingleMode(
          params.preset!, params.task!, params, profile, overrides, ctx.cwd, signal, onUpdate,
        );
      } else if (hasTasks) {
        result = await executeParallelMode(params.tasks!, profile, overrides, ctx.cwd, signal, onUpdate);
      } else if (hasChain) {
        result = await executeChainMode(params.chain!, profile, overrides, ctx.cwd, signal, onUpdate);
      } else {
        return {
          content: [{ type: "text", text: "Internal error: no mode matched." }],
          details: undefined,
          isError: true,
        };
      }

      // ── Auto-capture handoff to .crew/ ──────────────────────
      if (!result.isError && hasActiveWorkflow) {
        const state = readState(ctx.cwd);
        if (state?.feature && state.phase) {
          const output = result.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n\n");
          if (output.trim()) {
            writeHandoff(ctx.cwd, state.feature, state.phase, output);
            // Auto-advance to next phase now that handoff is written
            advancePhase(ctx.cwd);
          }
        }
      }

      return result;
    },

    renderCall(args: Static<typeof DispatchCrewParams>, theme: Theme) {
      return buildRenderCall(args, theme);
    },

    renderResult(
      result: {
        content: Array<{ type: string; text?: string }>;
        details: CrewDispatchDetails | undefined;
      },
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const details = result.details;
      if (!details || details.agents.length === 0) {
        const text = result.content?.[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }
      return buildRenderResult(details, options, theme);
    },
  });

  // ── Commands ─────────────────────────────────────────────────────

  pi.registerCommand("crew", {
    description: "Show current crew state — phase, feature, progress, agent presets",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const config = readConfig(ctx.cwd);
      const state = readState(ctx.cwd);
      const presetDocs = formatPresetsForLLM(config.profile, config.overrides);

      let msg = `**Crew Status**\n\nProfile: ${config.profile}\n`;
      if (state?.feature) msg += `Feature: ${state.feature}\n`;
      if (state?.phase) msg += `Phase: ${state.phase}\n`;
      if (state?.progress) msg += `Progress: ${state.progress}\n`;
      msg += `\n**Presets:**\n${presetDocs}`;
      if (Object.keys(config.overrides).length > 0) {
        msg += `\n\n**Overrides:** ${JSON.stringify(config.overrides)}`;
      }
      ctx.ui.notify(msg, "info");
    },
  });

  pi.registerCommand("crew:profile", {
    description: "Switch model profile: quality, balanced, budget",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const profileName = args.trim();
      if (!isValidProfile(profileName)) {
        ctx.ui.notify(
          `Invalid profile "${profileName}". Available: ${PROFILE_NAMES.join(", ")}`,
          "error",
        );
        return;
      }
      const config = readConfig(ctx.cwd);
      config.profile = profileName;
      writeConfig(ctx.cwd, config);
      ctx.ui.notify(`Profile switched to ${profileName}`, "info");
    },
  });

  pi.registerCommand("crew:override", {
    description: "Override a specific agent's model: /crew:override <agent> <model>",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length !== 2) {
        ctx.ui.notify("Usage: /crew:override <agent> <model>", "error");
        return;
      }
      const [agentName, model] = parts;
      if (!getPreset(agentName)) {
        ctx.ui.notify(
          `Unknown agent "${agentName}". Available: ${getPresetNames().join(", ")}`,
          "error",
        );
        return;
      }
      const config = readConfig(ctx.cwd);
      config.overrides[agentName] = model;
      writeConfig(ctx.cwd, config);
      ctx.ui.notify(`Override set: ${agentName} → ${model}`, "info");
    },
  });

  pi.registerCommand("crew:reset", {
    description: "Clear .crew/state.md — start fresh",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const fs = await import("node:fs");
      const statePath = path.join(ctx.cwd, ".crew", "state.md");
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
        ctx.ui.notify("State cleared. Starting fresh.", "info");
      } else {
        ctx.ui.notify("No state to clear.", "info");
      }
    },
  });

  pi.registerCommand("crew:status", {
    description: "Show detailed status of current feature",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const stateRaw = readStateRaw(ctx.cwd);
      if (!stateRaw) {
        ctx.ui.notify("No active feature. `.crew/state.md` does not exist.", "info");
        return;
      }
      ctx.ui.notify(stateRaw, "info");
    },
  });
}

// ── Public Type Exports ─────────────────────────────────────────────
export type { SpawnParams, SpawnResult, UsageStats, OnAgentUpdate } from "./spawn.js";
export type { CrewConfig, CrewState } from "./state.js";
export type { AgentRenderState, CrewDispatchDetails } from "./rendering.js";
