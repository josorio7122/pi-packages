/**
 * gsd_dispatch_wave tool — Spawn multiple agents in parallel with live widget grid
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, Text, truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveModelForAgent } from '../lib/config.js';

// ── Types ─────────────────────────────────────────────────────────────

interface AgentState {
  agent: string;
  label?: string;
  model: string;
  status: 'running' | 'done' | 'error';
  task: string;
  textChunks: string[];
  toolCount: number;
  startTime: number;
  elapsed: number;
}

export interface WaveDispatchDetails {
  total: number;
  succeeded: number;
  failed: number;
  elapsed: number;
  results: Array<{
    agent: string;
    label?: string;
    model: string;
    status: 'done' | 'error';
    elapsed: number;
    toolCount: number;
    output?: string;
    error?: string;
  }>;
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

// ── Widget rendering — multi-agent grid ───────────────────────────────

function updateWaveWidget(ctx: ExtensionContext, agents: AgentState[]): void {
  ctx.ui.setWidget('gsd-dispatch-wave', (_tui, theme) => {
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

        // Header
        const running = agents.filter(a => a.status === 'running').length;
        const done = agents.filter(a => a.status === 'done').length;
        const errored = agents.filter(a => a.status === 'error').length;

        lines.push(
          theme.fg('accent', '⚡ GSD Wave') +
          theme.fg('dim', '  ') +
          theme.fg('accent', `● ${running}`) +
          theme.fg('dim', ' running  ') +
          theme.fg('success', `✓ ${done}`) +
          theme.fg('dim', ' done  ') +
          (errored > 0 ? theme.fg('error', `✗ ${errored}`) + theme.fg('dim', ' failed') : ''),
        );

        lines.push('');

        // Agent cards (compact: one line per agent)
        for (const a of agents) {
          const statusColor = a.status === 'running' ? 'accent'
            : a.status === 'done' ? 'success' : 'error';
          const statusIcon = a.status === 'running' ? '●'
            : a.status === 'done' ? '✓' : '✗';

          const elapsed = a.status === 'running'
            ? Math.round((Date.now() - a.startTime) / 1000)
            : a.elapsed;

          const name = a.label || a.agent;
          const modelShort = a.model.split('/').pop() || a.model;

          let line =
            theme.fg(statusColor, `  ${statusIcon} `) +
            theme.fg('accent', name) +
            theme.fg('dim', ` (${modelShort})`) +
            theme.fg('dim', `  ${elapsed}s`) +
            theme.fg('dim', ` | ${a.toolCount} tools`);

          // Show last output line for running agents
          if (a.status === 'running') {
            const fullText = a.textChunks.join('');
            const lastLine = fullText.split('\n').filter(l => l.trim()).pop() || '';
            if (lastLine) {
              const maxW = width - visibleWidth(line) - 6;
              if (maxW > 10) {
                const preview = lastLine.length > maxW
                  ? lastLine.slice(0, maxW - 3) + '...'
                  : lastLine;
                line += theme.fg('dim', `  > ${preview}`);
              }
            }
          }

          lines.push(truncateToWidth(line, width));
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

function clearWaveWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget('gsd-dispatch-wave', undefined);
}

// ── Spawn single agent (streaming) ───────────────────────────────────

async function spawnAgent(
  state: AgentState,
  agentsDir: string,
  cwd: string,
  ctx: ExtensionContext,
  allStates: AgentState[],
  signal?: AbortSignal,
): Promise<void> {
  const agentFile = path.join(agentsDir, `${state.agent}.md`);

  if (!fs.existsSync(agentFile)) {
    state.status = 'error';
    state.elapsed = 0;
    state.textChunks = [`Agent file not found: ${agentFile}`];
    updateWaveWidget(ctx, allStates);
    return;
  }

  const systemPrompt = fs.readFileSync(agentFile, 'utf-8');

  const { spawn } = await import('node:child_process');

  return new Promise<void>((resolve) => {
    const proc = spawn('pi', [
      '-p', state.task,
      '--system-prompt', systemPrompt,
      '--model', state.model,
      '--mode', 'json',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--tools', 'read,bash,edit,write,grep,find,ls',
    ], {
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
      updateWaveWidget(ctx, allStates);
    });

    proc.stderr!.setEncoding('utf-8');
    proc.stderr!.on('data', () => {
      // Consume stderr
    });

    proc.on('close', (code) => {
      if (buffer.trim()) processLine(state, buffer);
      state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
      state.status = code === 0 ? 'done' : 'error';
      updateWaveWidget(ctx, allStates);
      resolve();
    });

    proc.on('error', (err) => {
      state.elapsed = Math.round((Date.now() - state.startTime) / 1000);
      state.status = 'error';
      state.textChunks.push(`Process error: ${err.message}`);
      updateWaveWidget(ctx, allStates);
      resolve();
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
      });
    }
  });
}

// ── Tool registration ─────────────────────────────────────────────────

export function registerDispatchWaveTool(pi: ExtensionAPI, agentsDir: string): void {
  pi.registerTool({
    name: 'gsd_dispatch_wave',
    label: 'GSD Dispatch Wave',
    description:
      'Spawn multiple GSD agents in parallel. All agents run simultaneously and results are returned together. Use for wave-based parallel execution of independent tasks.',
    parameters: Type.Object({
      dispatches: Type.Array(
        Type.Object({
          agent: Type.String({ description: 'Agent name (e.g. "executor", "verifier")' }),
          task: Type.String({ description: 'Full task description for this agent' }),
          label: Type.Optional(Type.String({ description: 'Human-readable label for this dispatch' })),
          model: Type.Optional(Type.String({ description: 'Model override for this agent' })),
        }),
        { description: 'Array of agent dispatches to run in parallel' },
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      if (params.dispatches.length === 0) {
        const details: WaveDispatchDetails = { total: 0, succeeded: 0, failed: 0, elapsed: 0, results: [] };
        return {
          content: [{ type: 'text' as const, text: 'No dispatches provided.' }],
          details,
        };
      }

      const waveStart = Date.now();

      // Build agent states
      const agentStates: AgentState[] = params.dispatches.map(entry => ({
        agent: entry.agent,
        label: entry.label,
        model: entry.model ?? resolveModelForAgent(cwd, entry.agent),
        status: 'running' as const,
        task: entry.task,
        textChunks: [],
        toolCount: 0,
        startTime: Date.now(),
        elapsed: 0,
      }));

      // Show widget and start timer
      updateWaveWidget(ctx, agentStates);
      const timer = setInterval(() => updateWaveWidget(ctx, agentStates), 1000);

      // Spawn all in parallel
      await Promise.all(
        agentStates.map(state =>
          spawnAgent(state, agentsDir, cwd, ctx, agentStates, _signal ?? undefined),
        ),
      );

      clearInterval(timer);

      const waveElapsed = Math.round((Date.now() - waveStart) / 1000);
      const succeeded = agentStates.filter(s => s.status === 'done');
      const failed = agentStates.filter(s => s.status === 'error');

      // Final widget update, then clear
      updateWaveWidget(ctx, agentStates);
      setTimeout(() => clearWaveWidget(ctx), 3000);

      const statusEmoji = failed.length === 0 ? '✓' : failed.length === agentStates.length ? '✗' : '⚠';
      ctx.ui.notify(
        `${statusEmoji} Wave: ${succeeded.length}/${agentStates.length} agents completed in ${waveElapsed}s`,
        failed.length === 0 ? 'info' : 'warning',
      );

      const details: WaveDispatchDetails = {
        total: agentStates.length,
        succeeded: succeeded.length,
        failed: failed.length,
        elapsed: waveElapsed,
        results: agentStates.map(s => ({
          agent: s.agent,
          label: s.label,
          model: s.model,
          status: s.status as 'done' | 'error',
          elapsed: s.elapsed,
          toolCount: s.toolCount,
          output: extractFinalOutput(s) || undefined,
          error: s.status === 'error' ? (extractFinalOutput(s) || 'Unknown error') : undefined,
        })),
      };

      // Build text content — combine all outputs
      const outputParts = agentStates.map(s => {
        const name = s.label || s.agent;
        const output = extractFinalOutput(s);
        const status = s.status === 'done' ? '✓' : '✗';
        return `## ${status} ${name} (${s.elapsed}s)\n\n${output || '(no output)'}`;
      });

      return {
        content: [{ type: 'text' as const, text: outputParts.join('\n\n---\n\n') }],
        details,
        isError: failed.length === agentStates.length,
      };
    },

    // ── Custom rendering ────────────────────────────────────────────────

    renderCall(args, theme) {
      const agents = (args.dispatches as Array<{ agent: string; label?: string }>)
        .map(d => d.label || d.agent);
      const text =
        theme.fg('toolTitle', theme.bold('gsd_dispatch_wave ')) +
        theme.fg('accent', `${agents.length} agents`) +
        theme.fg('dim', `: ${agents.join(', ')}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as WaveDispatchDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === 'text' ? text.text : '', 0, 0);
      }

      // Summary line
      const statusColor = details.failed === 0 ? 'success'
        : details.failed === details.total ? 'error' : 'warning';
      const statusIcon = details.failed === 0 ? '✓'
        : details.failed === details.total ? '✗' : '⚠';

      let msg =
        theme.fg(statusColor, `${statusIcon} Wave `) +
        theme.fg('dim', `${details.succeeded}/${details.total} succeeded`) +
        theme.fg('dim', ` · ${details.elapsed}s total`);

      if (!expanded) {
        // Compact: one-line summary per agent
        for (const r of details.results) {
          const icon = r.status === 'done' ? theme.fg('success', '✓') : theme.fg('error', '✗');
          const name = r.label || r.agent;
          msg += `\n${icon} ${theme.fg('accent', name)} ${theme.fg('dim', `${r.elapsed}s | ${r.toolCount} tools`)}`;
        }
      } else {
        // Expanded: agent details + output preview
        for (const r of details.results) {
          const icon = r.status === 'done' ? theme.fg('success', '✓') : theme.fg('error', '✗');
          const name = r.label || r.agent;
          msg += `\n${icon} ${theme.fg('accent', name)} ${theme.fg('dim', `${r.elapsed}s | ${r.toolCount} tools`)}`;

          const output = r.status === 'done' ? r.output : r.error;
          if (output) {
            const preview = output.length > 200
              ? output.slice(0, 197) + '...'
              : output;
            const previewLines = preview.split('\n').slice(0, 3);
            for (const line of previewLines) {
              msg += '\n' + theme.fg('dim', `  ${line}`);
            }
          }
        }
      }

      return new Text(msg, 0, 0);
    },
  });
}
