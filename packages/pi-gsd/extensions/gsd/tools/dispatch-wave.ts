/**
 * gsd_dispatch_wave tool — Spawn multiple agents in parallel
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveModelForAgent } from '../lib/config.js';

/** Parse pi's JSON event stream and return the final text output. */
function parseAgentOutput(stdout: string): string {
  const lines = stdout.split('\n').filter(l => l.trim());
  let lastText = '';

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'agent_end' || event.type === 'agent_response') {
        const content = event.content;
        if (typeof content === 'string') lastText = content;
        else if (Array.isArray(content)) {
          const texts = (content as Array<{ type: string; text?: string }>)
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text!)
            .join('\n');
          if (texts) lastText = texts;
        }
      }
    } catch {
      // Not a JSON line — skip
    }
  }

  return lastText || stdout.trim();
}

interface DispatchEntry {
  agent: string;
  task: string;
  label?: string;
  model?: string;
}

interface DispatchResult {
  agent: string;
  label?: string;
  model: string;
  output?: string;
  error?: string;
  stderr?: string;
}

async function spawnAgent(
  entry: DispatchEntry,
  agentsDir: string,
  cwd: string,
): Promise<DispatchResult> {
  const agentFile = path.join(agentsDir, `${entry.agent}.md`);

  if (!fs.existsSync(agentFile)) {
    return {
      agent: entry.agent,
      label: entry.label,
      model: entry.model ?? 'unknown',
      error: `Agent file not found: ${agentFile}`,
    };
  }

  const systemPrompt = fs.readFileSync(agentFile, 'utf-8');
  const model = entry.model ?? resolveModelForAgent(cwd, entry.agent);

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const { stdout, stderr } = await execFileAsync(
      'pi',
      [
        '-p', entry.task,
        '--system-prompt', systemPrompt,
        '--model', model,
        '--mode', 'json',
        '--no-session',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--tools', 'read,bash,edit,write,grep,find,ls',
      ],
      { cwd, timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
    );

    return {
      agent: entry.agent,
      label: entry.label,
      model,
      output: parseAgentOutput(stdout),
      stderr: stderr.trim() || undefined,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      agent: entry.agent,
      label: entry.label,
      model,
      error: error.message,
      output: error.stdout ? parseAgentOutput(error.stdout) : undefined,
      stderr: error.stderr?.trim() || undefined,
    };
  }
}

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
      try {
        const cwd = ctx.cwd;

        if (params.dispatches.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ results: [], total: 0 }, null, 2) }],
            details: null,
          };
        }

        const results = await Promise.all(
          params.dispatches.map(entry => spawnAgent(entry, agentsDir, cwd)),
        );

        const errors = results.filter(r => r.error);
        const succeeded = results.filter(r => !r.error);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  total: results.length,
                  succeeded: succeeded.length,
                  failed: errors.length,
                  results,
                },
                null,
                2,
              ),
            },
          ],
          details: null,
          isError: errors.length > 0 && succeeded.length === 0,
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          details: null, isError: true,
        };
      }
    },
  });
}
