/**
 * gsd_dispatch tool — Spawn a single agent subprocess
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

  // Fallback: if no structured output, return raw stdout
  return lastText || stdout.trim();
}

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
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        const agentFile = path.join(agentsDir, `${params.agent}.md`);

        if (!fs.existsSync(agentFile)) {
          return {
            content: [{ type: 'text' as const, text: `Error: Agent file not found: ${agentFile}` }],
            details: null, isError: true,
          };
        }

        const systemPrompt = fs.readFileSync(agentFile, 'utf-8');
        const model = params.model ?? resolveModelForAgent(cwd, params.agent);

        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);

        const { stdout, stderr } = await execFileAsync(
          'pi',
          [
            '-p', params.task,
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

        const output = parseAgentOutput(stdout);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ agent: params.agent, model, output, stderr: stderr.trim() || undefined }, null, 2),
            },
          ],
          details: null,
        };
      } catch (err) {
        const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        const output = error.stdout ? parseAgentOutput(error.stdout) : '';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                agent: params.agent,
                error: error.message,
                output: output || undefined,
                stderr: error.stderr?.trim() || undefined,
              }, null, 2),
            },
          ],
          details: null, isError: true,
        };
      }
    },
  });
}
