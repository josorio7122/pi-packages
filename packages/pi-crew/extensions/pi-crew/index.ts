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
  readPhaseSkill,
  isWorkflowComplete,
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

const MAX_CONCURRENT = Math.min(
  Math.max(1, parseInt(process.env.DISPATCH_CREW_MAX_CONCURRENT || "4", 10)),
  8,
);
const MAX_PARALLEL_TASKS = 8;

// ── Tool Schema ─────────────────────────────────────────────────────

const TaskItem = Type.Object({
  preset: Type.String({ description: "Agent preset name" }),
  task: Type.String({ description: "Task instructions" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  model: Type.Optional(Type.String({ description: "Override the preset's model" })),
  tools: Type.Optional(Type.String({ description: "Override the preset's tools" })),
  thinking: Type.Optional(
    Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh" }),
  ),
});

const ChainItem = Type.Object({
  preset: Type.String({ description: "Agent preset name" }),
  task: Type.String({
    description: "Task instructions. Use {previous} to reference prior agent's output.",
  }),
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
    Type.Array(TaskItem, { description: "Array of {preset, task} for parallel execution" }),
  ),
  // Chain mode
  chain: Type.Optional(
    Type.Array(ChainItem, {
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
    const skillContent = state?.phase ? readPhaseSkill(packageRoot, state.phase) : null;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildCrewPrompt(presetDocs, state, skillContent),
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
    description:
      "Dispatch specialized agents (scout, researcher, architect, executor, reviewer, debugger) with preset configurations. " +
      "Supports single, parallel (tasks array), and chain (chain array with {previous} placeholder) modes.",
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

      // ── Helper: resolve a single preset to SpawnParams ──────
      const resolveOne = (
        presetName: string,
        task: string,
        opts: { cwd?: string; model?: string; tools?: string; thinking?: string },
      ): { resolved: SpawnParams; error: null } | { resolved: null; error: string } => {
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
            cwd: opts.cwd || params.cwd || ctx.cwd,
            thinking: opts.thinking,
          },
        };
      };

      // ── Helper: build AgentRenderState[] ────────────────────
      const buildAgentStates = (
        items: Array<{ preset: string; task: string; model: string }>,
      ): AgentRenderState[] => {
        // Count instances per preset for numbering
        const instanceCounters = new Map<string, number>();
        return items.map((item) => {
          const count = (instanceCounters.get(item.preset) || 0) + 1;
          instanceCounters.set(item.preset, count);
          return {
            preset: item.preset,
            instance: count,
            task: item.task,
            status: "running" as const,
            elapsedMs: 0,
            exitCode: -1,
            messages: [],
            stderr: undefined,
            errorMessage: undefined,
            usage: emptyUsage(),
            model: item.model,
          };
        });
      };

      // ── Helper: emit update ─────────────────────────────────
      const emitUpdate = (
        mode: "single" | "parallel" | "chain",
        agents: AgentRenderState[],
        contentText: string,
      ) => {
        if (onUpdate) {
          onUpdate({
            content: [{ type: "text" as const, text: contentText }],
            details: { mode, agents } as CrewDispatchDetails,
          });
        }
      };

      // ── SINGLE MODE ─────────────────────────────────────────
      if (hasSingle) {
        const r = resolveOne(params.preset!, params.task!, params);
        if (r.error) {
          return { content: [{ type: "text", text: r.error }], details: undefined, isError: true };
        }

        const agents = buildAgentStates([
          { preset: params.preset!, task: params.task!, model: r.resolved!.model },
        ]);
        const startTime = Date.now();

        // Timer for elapsed time refresh
        const timer = setInterval(() => {
          agents[0].elapsedMs = Date.now() - startTime;
          emitUpdate("single", agents, getFinalOutput(agents[0].messages) || "(running...)");
        }, 1000);

        try {
          const result = await runSingleAgent(r.resolved!, ctx.cwd, signal, (update) => {
            agents[0].messages = update.messages;
            agents[0].usage = update.usage;
            agents[0].elapsedMs = Date.now() - startTime;
            emitUpdate("single", agents, getFinalOutput(update.messages) || "(running...)");
          });

          clearInterval(timer);
          agents[0].status = result.exitCode === 0 ? "done" : "error";
          agents[0].exitCode = result.exitCode;
          agents[0].messages = result.messages;
          agents[0].usage = result.usage;
          agents[0].elapsedMs = Date.now() - startTime;
          agents[0].stderr = result.stderr || undefined;
          agents[0].errorMessage = result.errorMessage || undefined;

          const output = getFinalOutput(result.messages) || "(no output)";
          const isError =
            result.exitCode !== 0 ||
            result.stopReason === "error" ||
            result.stopReason === "aborted";

          return {
            content: [{ type: "text", text: output }],
            details: { mode: "single", agents } as CrewDispatchDetails,
            isError,
          };
        } catch (e: unknown) {
          clearInterval(timer);
          agents[0].status = "error";
          agents[0].exitCode = 1;
          agents[0].elapsedMs = Date.now() - startTime;
          const errorMessage = e instanceof Error ? e.message : String(e);
          agents[0].errorMessage = errorMessage;
          return {
            content: [{ type: "text", text: `Agent aborted: ${errorMessage}` }],
            details: { mode: "single", agents } as CrewDispatchDetails,
            isError: true,
          };
        }
      }

      // ── PARALLEL MODE ───────────────────────────────────────
      if (hasTasks) {
        if (params.tasks!.length > MAX_PARALLEL_TASKS) {
          return {
            content: [
              {
                type: "text",
                text: `Too many parallel tasks (${params.tasks!.length}). Max is ${MAX_PARALLEL_TASKS}.`,
              },
            ],
            details: undefined,
            isError: true,
          };
        }

        // Resolve all presets first
        const spawnItems: Array<{
          spawnParams: SpawnParams;
          preset: string;
          task: string;
          model: string;
        }> = [];
        for (const t of params.tasks!) {
          const r = resolveOne(t.preset, t.task, t);
          if (r.error) {
            return {
              content: [{ type: "text", text: r.error }],
              details: undefined,
              isError: true,
            };
          }
          spawnItems.push({
            spawnParams: r.resolved!,
            preset: t.preset,
            task: t.task,
            model: r.resolved!.model,
          });
        }

        const agents = buildAgentStates(
          spawnItems.map((s) => ({ preset: s.preset, task: s.task, model: s.model })),
        );
        const startTimes = new Array(agents.length).fill(0);

        // Timer for elapsed time refresh
        const timer = setInterval(() => {
          for (let i = 0; i < agents.length; i++) {
            if (agents[i].status === "running" && startTimes[i] > 0) {
              agents[i].elapsedMs = Date.now() - startTimes[i];
            }
          }
          emitUpdate("parallel", agents, "(running...)");
        }, 1000);

        try {
          await mapWithConcurrencyLimit(spawnItems, MAX_CONCURRENT, async (item, idx) => {
            startTimes[idx] = Date.now();

            const result = await runSingleAgent(item.spawnParams, ctx.cwd, signal, (update) => {
              agents[idx].messages = update.messages;
              agents[idx].usage = update.usage;
              agents[idx].elapsedMs = Date.now() - startTimes[idx];
              emitUpdate("parallel", agents, "(running...)");
            });

            agents[idx].status = result.exitCode === 0 ? "done" : "error";
            agents[idx].exitCode = result.exitCode;
            agents[idx].messages = result.messages;
            agents[idx].usage = result.usage;
            agents[idx].elapsedMs = Date.now() - startTimes[idx];
            agents[idx].stderr = result.stderr || undefined;
            agents[idx].errorMessage = result.errorMessage || undefined;
            emitUpdate("parallel", agents, "(running...)");
          });

          clearInterval(timer);

          // Build formatted output for LLM
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
              if (agent.stderr)
                agentOutput += `\nStderr: ${agent.stderr.split("\n").slice(0, 5).join("\n")}`;
            }
            outputText += `## ${prefix}${label}: ${agent.task}\n${agentOutput}\n\n`;
          }

          const allFailed = agents.every((a) => a.status === "error");

          return {
            content: [{ type: "text", text: outputText.trim() }],
            details: { mode: "parallel", agents } as CrewDispatchDetails,
            isError: allFailed,
          };
        } catch (e: unknown) {
          clearInterval(timer);
          const errorMessage = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Parallel dispatch error: ${errorMessage}` }],
            details: { mode: "parallel", agents } as CrewDispatchDetails,
            isError: true,
          };
        }
      }

      // ── CHAIN MODE ──────────────────────────────────────────
      if (hasChain) {
        const agents = buildAgentStates(
          params.chain!.map((step) => {
            const preset = getPreset(step.preset);
            const model = preset
              ? step.model ||
                resolvePreset(step.preset, profile, overrides, packageRoot)?.model ||
                ""
              : "";
            return { preset: step.preset, task: step.task, model };
          }),
        );

        let previousOutput = "";

        for (let i = 0; i < params.chain!.length; i++) {
          const step = params.chain![i];

          // Replace {previous} with prior agent output
          const task = step.task.replace(/\{previous\}/g, previousOutput);

          const r = resolveOne(step.preset, task, step);
          if (r.error) {
            agents[i].status = "error";
            agents[i].exitCode = 1;
            return {
              content: [{ type: "text", text: r.error }],
              details: { mode: "chain", agents } as CrewDispatchDetails,
              isError: true,
            };
          }

          // Update task with substituted text
          agents[i].task = task.length > 200 ? task.slice(0, 197) + "..." : task;
          agents[i].model = r.resolved!.model;

          const startTime = Date.now();

          // Timer for elapsed time refresh
          const timer = setInterval(() => {
            agents[i].elapsedMs = Date.now() - startTime;
            emitUpdate("chain", agents, "(running...)");
          }, 1000);

          try {
            const result = await runSingleAgent(r.resolved!, ctx.cwd, signal, (update) => {
              agents[i].messages = update.messages;
              agents[i].usage = update.usage;
              agents[i].elapsedMs = Date.now() - startTime;
              emitUpdate("chain", agents, "(running...)");
            });

            clearInterval(timer);
            agents[i].status = result.exitCode === 0 ? "done" : "error";
            agents[i].exitCode = result.exitCode;
            agents[i].messages = result.messages;
            agents[i].usage = result.usage;
            agents[i].elapsedMs = Date.now() - startTime;
            agents[i].stderr = result.stderr || undefined;
            agents[i].errorMessage = result.errorMessage || undefined;

            const isError =
              result.exitCode !== 0 ||
              result.stopReason === "error" ||
              result.stopReason === "aborted";
            if (isError) {
              // Chain stops on first error
              const output = getFinalOutput(result.messages) || "(error — no output)";
              return {
                content: [{ type: "text", text: `Chain stopped at step ${i + 1}: ${output}` }],
                details: { mode: "chain", agents } as CrewDispatchDetails,
                isError: true,
              };
            }

            previousOutput = getFinalOutput(result.messages);
          } catch (e: unknown) {
            clearInterval(timer);
            agents[i].status = "error";
            agents[i].exitCode = 1;
            agents[i].elapsedMs = Date.now() - startTime;
            const errorMessage = e instanceof Error ? e.message : String(e);
            agents[i].errorMessage = errorMessage;
            return {
              content: [{ type: "text", text: `Chain aborted at step ${i + 1}: ${errorMessage}` }],
              details: { mode: "chain", agents } as CrewDispatchDetails,
              isError: true,
            };
          }
        }

        // Chain completed — return final agent's output
        return {
          content: [{ type: "text", text: previousOutput || "(no output)" }],
          details: { mode: "chain", agents } as CrewDispatchDetails,
        };
      }

      // Should never reach here
      return {
        content: [{ type: "text", text: "Internal error: no mode matched." }],
        details: undefined,
        isError: true,
      };
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
