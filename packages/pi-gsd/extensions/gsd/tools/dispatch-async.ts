/**
 * gsd_dispatch_async tool — Fire-and-forget agent dispatch with follow-up delivery
 *
 * Spawns an agent in the background and delivers results as a follow-up message
 * via pi.sendMessage() when complete. The tool returns immediately so the
 * orchestrating LLM can continue working on other things.
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveModelForAgent } from '../lib/config.js';

// ── Types ─────────────────────────────────────────────────────────────

interface AsyncAgentState {
  id: number;
  agent: string;
  model: string;
  status: 'running' | 'done' | 'error';
  task: string;
  textChunks: string[];
  toolCount: number;
  startTime: number;
  elapsed: number;
  proc?: ReturnType<typeof import('node:child_process').spawn>;
}

// ── Shared state ──────────────────────────────────────────────────────

const activeAgents = new Map<number, AsyncAgentState>();
let nextId = 1;

// ── Event stream parser ───────────────────────────────────────────────

function processLine(state: AsyncAgentState, line: string): void {
  if (!line.trim()) return;
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    const type = event.type;

    if (type === 'message_update') {
      const delta = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
      if (delta?.type === 'text_delta' && delta.delta) {
        state.textChunks.push(delta.delta);
      }
    } else if (type === 'tool_execution_start') {
      state.toolCount++;
    } else if (type === 'agent_end' || type === 'agent_response') {
      const content = event.content;
      if (typeof content === 'string') {
        state.textChunks = [content];
      } else if (Array.isArray(content)) {
        const texts = (content as Array<{ type: string; text?: string }>)
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
          .join('\n');
        if (texts) state.textChunks = [texts];
      }
    }
  } catch {
    // Not JSON
  }
}

// ── Widget ────────────────────────────────────────────────────────────

function updateAsyncWidgets(ctx: ExtensionContext): void {
  if (activeAgents.size === 0) {
    ctx.ui.setWidget('gsd-dispatch-async', undefined);
    return;
  }

  ctx.ui.setWidget('gsd-dispatch-async', (_tui, theme) => {
    const container = new Container();
    const borderFn = (s: string) => theme.fg('dim', s);

    container.addChild(new Text('', 0, 0));
    container.addChild(new DynamicBorder(borderFn));
    const content = new Text('', 1, 0);
    container.addChild(content);
    container.addChild(new DynamicBorder(borderFn));

    return {
      render(width: number): string[] {
        const lines: string[] = [];
        const running = Array.from(activeAgents.values()).filter(a => a.status === 'running').length;
        lines.push(
          theme.fg('accent', `⚡ GSD Async`) +
          theme.fg('dim', ` — ${running} running`),
        );

        for (const a of activeAgents.values()) {
          const statusColor = a.status === 'running' ? 'accent'
            : a.status === 'done' ? 'success' : 'error';
          const statusIcon = a.status === 'running' ? '●'
            : a.status === 'done' ? '✓' : '✗';
          const elapsed = a.status === 'running'
            ? Math.round((Date.now() - a.startTime) / 1000)
            : a.elapsed;

          const taskPreview = a.task.length > 40
            ? a.task.slice(0, 37) + '...'
            : a.task;

          lines.push(
            theme.fg(statusColor, `  ${statusIcon} #${a.id} `) +
            theme.fg('accent', a.agent) +
            theme.fg('dim', `  ${elapsed}s | ${a.toolCount} tools`) +
            theme.fg('muted', `  ${taskPreview}`),
          );
        }

        content.setText(lines.join('\n'));
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
    };
  });
}

// ── Tool registration ─────────────────────────────────────────────────

export function registerDispatchAsyncTool(pi: ExtensionAPI, agentsDir: string): void {
  pi.registerTool({
    name: 'gsd_dispatch_async',
    label: 'GSD Dispatch Async',
    description:
      'Spawn a GSD agent in the background. Returns immediately while the agent runs. ' +
      'Results are delivered as a follow-up message when the agent completes. ' +
      'Use for fire-and-forget tasks where you want to continue working without waiting.',
    parameters: Type.Object({
      agent: Type.Union([
        Type.Literal('executor'),
        Type.Literal('planner'),
        Type.Literal('verifier'),
        Type.Literal('plan-checker'),
        Type.Literal('project-researcher'),
        Type.Literal('phase-researcher'),
        Type.Literal('research-synthesizer'),
        Type.Literal('roadmapper'),
        Type.Literal('codebase-mapper'),
        Type.Literal('debugger'),
        Type.Literal('integration-checker'),
      ]),
      task: Type.String({ description: 'Full task description for the agent' }),
      model: Type.Optional(Type.String({ description: 'Model override' })),
      session: Type.Optional(Type.String({ description: 'Session file path for persistent agent sessions' })),
      continue_session: Type.Optional(Type.Boolean({ description: 'Continue an existing session' })),
    }),

    renderCall(args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold('gsd_dispatch_async ')) +
        theme.fg('accent', args.agent) +
        theme.fg('dim', ' (background)'),
        0, 0,
      );
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      return new Text(theme.fg('accent', '⚡ ') + theme.fg('muted', msg), 0, 0);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const agentFile = path.join(agentsDir, `${params.agent}.md`);

      if (!fs.existsSync(agentFile)) {
        return {
          content: [{ type: 'text' as const, text: `Error: Agent file not found: ${agentFile}` }],
          details: null,
          isError: true,
        };
      }

      const systemPrompt = fs.readFileSync(agentFile, 'utf-8');
      const model = params.model ?? resolveModelForAgent(cwd, params.agent);

      const id = nextId++;
      const state: AsyncAgentState = {
        id,
        agent: params.agent,
        model,
        status: 'running',
        task: params.task,
        textChunks: [],
        toolCount: 0,
        startTime: Date.now(),
        elapsed: 0,
      };

      activeAgents.set(id, state);
      updateAsyncWidgets(ctx);

      // Fire-and-forget — spawn in background
      const { spawn } = await import('node:child_process');

      const piArgs: string[] = [
        '-p', params.task,
        '--system-prompt', systemPrompt,
        '--model', model,
        '--mode', 'json',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--tools', 'read,bash,edit,write,grep,find,ls',
      ];

      if (params.session) {
        piArgs.push('--session', params.session);
        if (params.continue_session) {
          piArgs.push('-c');
        }
      } else {
        piArgs.push('--no-session');
      }

      const proc = spawn('pi', piArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      state.proc = proc as any;

      const timer = setInterval(() => updateAsyncWidgets(ctx), 1000);

      let buffer = '';

      proc.stdout!.setEncoding('utf-8');
      proc.stdout!.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          processLine(state, line);
        }
        updateAsyncWidgets(ctx);
      });

      proc.stderr!.setEncoding('utf-8');
      proc.stderr!.on('data', () => {
        // Consume stderr
      });

      proc.on('close', (code) => {
        if (buffer.trim()) processLine(state, buffer);
        clearInterval(timer);
        state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
        state.status = code === 0 ? 'done' : 'error';
        state.proc = undefined;
        updateAsyncWidgets(ctx);

        const output = state.textChunks.join('').trim();
        const statusEmoji = state.status === 'done' ? '✓' : '✗';

        ctx.ui.notify(
          `${statusEmoji} Async agent #${id} (${params.agent}) ${state.status} in ${state.elapsed}s`,
          state.status === 'done' ? 'info' : 'error',
        );

        // Deliver result as follow-up message
        const truncated = output.length > 8000
          ? output.slice(0, 8000) + '\n\n... [truncated]'
          : output;

        pi.sendMessage({
          customType: 'gsd-async-result',
          content: `## ${statusEmoji} Async Agent #${id}: ${params.agent} (${state.elapsed}s)\n\n${truncated || '(no output)'}`,
          display: true,
        }, { deliverAs: 'followUp', triggerTurn: true });

        // Clean up after a delay
        setTimeout(() => {
          activeAgents.delete(id);
          updateAsyncWidgets(ctx);
        }, 5000);
      });

      proc.on('error', (err) => {
        clearInterval(timer);
        state.status = 'error';
        state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
        state.proc = undefined;
        updateAsyncWidgets(ctx);

        ctx.ui.notify(`✗ Async agent #${id} error: ${err.message}`, 'error');

        pi.sendMessage({
          customType: 'gsd-async-result',
          content: `## ✗ Async Agent #${id}: ${params.agent} — Error\n\n${err.message}`,
          display: true,
        }, { deliverAs: 'followUp', triggerTurn: true });

        setTimeout(() => {
          activeAgents.delete(id);
          updateAsyncWidgets(ctx);
        }, 5000);
      });

      return {
        content: [{ type: 'text' as const, text: `Async agent #${id} (${params.agent}) spawned in background. Results will be delivered as a follow-up message.` }],
        details: { id, agent: params.agent, model },
      };
    },
  });
}
