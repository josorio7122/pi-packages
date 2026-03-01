/**
 * gsd_config tool — Configuration
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { loadConfig, ensureConfig, getConfig, setConfig, resolveModelForAgent } from '../lib/config.js';

export function registerConfigTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_config',
    label: 'GSD Config',
    description:
      'Read and write .planning/config.json: load full config, ensure defaults exist, get/set individual keys, or resolve the model for a given agent.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('load'),
        Type.Literal('ensure'),
        Type.Literal('get'),
        Type.Literal('set'),
        Type.Literal('resolve-model'),
      ]),
      key: Type.Optional(Type.String({ description: 'Dot-notation key for "get" or "set" actions (e.g. "model_profile")' })),
      value: Type.Optional(Type.String({ description: 'Value to set for "set" action' })),
      agent: Type.Optional(Type.String({ description: 'Agent name for "resolve-model" action (e.g. "planner", "executor")' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'load':
            result = loadConfig(cwd);
            break;
          case 'ensure':
            ensureConfig(cwd);
            result = { ensured: true };
            break;
          case 'get':
            if (!params.key) throw new Error('key is required for "get" action');
            result = { key: params.key, value: getConfig(cwd, params.key) };
            break;
          case 'set':
            if (!params.key) throw new Error('key is required for "set" action');
            if (params.value === undefined) throw new Error('value is required for "set" action');
            setConfig(cwd, params.key, params.value);
            result = { set: true, key: params.key, value: params.value };
            break;
          case 'resolve-model':
            if (!params.agent) throw new Error('agent is required for "resolve-model" action');
            result = { agent: params.agent, model: resolveModelForAgent(cwd, params.agent) };
            break;
          default:
            throw new Error(`Unknown action: ${String(params.action)}`);
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: null,
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
