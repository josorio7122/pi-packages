/**
 * gsd_dispatch tool — Spawn a single agent subprocess with live widget + rich rendering
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveModelForAgent } from '../lib/config.js';

// ── Types ─────────────────────────────────────────────────────────────

interface AgentState {
  agent: string;
  model: string;
  status: 'running' | 'done' | 'error';
  task: string;
  textChunks: string[];
  toolCount: number;
  elapsed: number;
  startTime: number;
}

export interface DispatchDetails {
  agent: string;
  model: string;
  status: 'done' | 'error';
  elapsed: number;
  toolCount: number;
  output?: string;
  error?: string;
}

// ── Event stream parser ───────────────────────────────────────────────

function processLine(state: AgentState, line: string): void {
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
    // Not JSON — skip
  }
}

function extractFinalOutput(state: AgentState): string {
  return state.textChunks.join('').trim();
}

// ── Widget rendering ──────────────────────────────────────────────────

function updateWidget(ctx: ExtensionContext, state: AgentState): void {
  ctx.ui.setWidget('gsd-dispatch', (_tui, theme) => {
    const container = new Container();
    const borderFn = (s: string) => theme.fg('dim', s);

    container.addChild(new Text('', 0, 0)); // top margin
    container.addChild(new DynamicBorder(borderFn));
    const content = new Text('', 1, 0);
    container.addChild(content);
    container.addChild(new DynamicBorder(borderFn));

    return {
      render(width: number): string[] {
        const lines: string[] = [];

        const statusColor = state.status === 'running' ? 'accent'
          : state.status === 'done' ? 'success' : 'error';
        const statusIcon = state.status === 'running' ? '●'
          : state.status === 'done' ? '✓' : '✗';

        const elapsed = Math.round((Date.now() - state.startTime) / 1000);
        const taskPreview = state.task.length > 50
          ? state.task.slice(0, 47) + '...'
          : state.task;

        lines.push(
          theme.fg(statusColor, `${statusIcon} `) +
          theme.fg('accent', state.agent) +
          theme.fg('dim', ` (${state.model.split('/').pop()})`) +
          theme.fg('dim', `  ${elapsed}s`) +
          theme.fg('dim', ` | Tools: ${state.toolCount}`),
        );

        lines.push(theme.fg('muted', `  ${taskPreview}`));

        // Show last line of output
        const fullText = state.textChunks.join('');
        const lastLine = fullText.split('\n').filter(l => l.trim()).pop() || '';
        if (lastLine) {
          const maxW = width - 6;
          const trimmed = lastLine.length > maxW
            ? lastLine.slice(0, maxW - 3) + '...'
            : lastLine;
          lines.push(theme.fg('dim', `  > ${trimmed}`));
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

function clearWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget('gsd-dispatch', undefined);
}

// ── Tool registration ─────────────────────────────────────────────────

export function registerDispatchTool(pi: ExtensionAPI, agentsDir: string): void {
  pi.registerTool({
    name: 'gsd_dispatch',
    label: 'GSD Dispatch',
    description:
      'Spawn a single GSD agent subprocess synchronously. The agent reads its system prompt from agents/<agent>.md and runs in an isolated pi process with standard file tools.',
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
      model: Type.Optional(Type.String({ description: 'Model override (default: resolved from config profile)' })),
      session: Type.Optional(Type.String({ description: 'Session file path for persistent agent sessions. Enables resuming agent context across calls.' })),
      continue_session: Type.Optional(Type.Boolean({ description: 'If true and session is set, continue an existing session instead of starting fresh.' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const agentFile = path.join(agentsDir, `${params.agent}.md`);

      if (!fs.existsSync(agentFile)) {
        return {
          content: [{ type: 'text' as const, text: `Error: Agent file not found: ${agentFile}` }],
          details: { agent: params.agent, model: 'unknown', status: 'error', elapsed: 0, toolCount: 0, error: 'Agent file not found' } satisfies DispatchDetails,
          isError: true,
        };
      }

      const systemPrompt = fs.readFileSync(agentFile, 'utf-8');
      const model = params.model ?? resolveModelForAgent(cwd, params.agent);

      const state: AgentState = {
        agent: params.agent,
        model,
        status: 'running',
        task: params.task,
        textChunks: [],
        toolCount: 0,
        elapsed: 0,
        startTime: Date.now(),
      };

      // Show live widget
      updateWidget(ctx, state);
      const timer = setInterval(() => updateWidget(ctx, state), 1000);

      try {
        const { spawn } = await import('node:child_process');

        const output = await new Promise<string>((resolve, reject) => {
          // Build args — support persistent sessions
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

          let buffer = '';

          proc.stdout!.setEncoding('utf-8');
          proc.stdout!.on('data', (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              processLine(state, line);
            }
            updateWidget(ctx, state);
          });

          proc.stderr!.setEncoding('utf-8');
          proc.stderr!.on('data', () => {
            // Consume stderr but don't display
          });

          proc.on('close', (code) => {
            if (buffer.trim()) processLine(state, buffer);
            if (code === 0) {
              resolve(extractFinalOutput(state));
            } else {
              reject(new Error(`Agent exited with code ${code}`));
            }
          });

          proc.on('error', (err) => {
            reject(err);
          });

          // Handle abort signal
          if (_signal) {
            _signal.addEventListener('abort', () => {
              proc.kill('SIGTERM');
            });
          }
        });

        clearInterval(timer);
        state.status = 'done';
        state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
        updateWidget(ctx, state);

        // Clear widget after a brief display
        setTimeout(() => clearWidget(ctx), 2000);

        ctx.ui.notify(`✓ ${params.agent} completed in ${state.elapsed}s`, 'info');

        const details: DispatchDetails = {
          agent: params.agent,
          model,
          status: 'done',
          elapsed: state.elapsed,
          toolCount: state.toolCount,
          output,
        };

        return {
          content: [{ type: 'text' as const, text: output || '(no output)' }],
          details,
        };
      } catch (err) {
        clearInterval(timer);
        state.status = 'error';
        state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
        updateWidget(ctx, state);
        setTimeout(() => clearWidget(ctx), 3000);

        const error = err as Error;
        const partialOutput = extractFinalOutput(state);

        ctx.ui.notify(`✗ ${params.agent} failed after ${state.elapsed}s`, 'error');

        const details: DispatchDetails = {
          agent: params.agent,
          model,
          status: 'error',
          elapsed: state.elapsed,
          toolCount: state.toolCount,
          output: partialOutput || undefined,
          error: error.message,
        };

        return {
          content: [{ type: 'text' as const, text: partialOutput || error.message }],
          details,
          isError: true,
        };
      }
    },

    // ── Custom rendering ────────────────────────────────────────────────

    renderCall(args, theme) {
      const text =
        theme.fg('toolTitle', theme.bold('gsd_dispatch ')) +
        theme.fg('accent', args.agent) +
        (args.model ? theme.fg('dim', ` (${args.model})`) : '');
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as DispatchDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === 'text' ? text.text : '', 0, 0);
      }

      if (details.status === 'error') {
        let msg =
          theme.fg('error', '✗ ') +
          theme.fg('accent', details.agent) +
          theme.fg('dim', ` ${details.elapsed}s`) +
          theme.fg('dim', ` | ${details.toolCount} tools`);
        if (details.error) {
          msg += '\n' + theme.fg('error', details.error);
        }
        return new Text(msg, 0, 0);
      }

      // Success
      let msg =
        theme.fg('success', '✓ ') +
        theme.fg('accent', details.agent) +
        theme.fg('dim', ` ${details.elapsed}s`) +
        theme.fg('dim', ` | ${details.toolCount} tools`);

      if (details.output && expanded) {
        const preview = details.output.length > 500
          ? details.output.slice(0, 497) + '...'
          : details.output;
        msg += '\n' + theme.fg('muted', preview);
      } else if (details.output) {
        const firstLine = details.output.split('\n').find(l => l.trim()) || '';
        const preview = firstLine.length > 80
          ? firstLine.slice(0, 77) + '...'
          : firstLine;
        if (preview) {
          msg += '\n' + theme.fg('dim', preview);
        }
      }

      return new Text(msg, 0, 0);
    },
  });
}
