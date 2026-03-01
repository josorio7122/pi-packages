/**
 * gsd_roadmap tool — Roadmap Operations
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  parseRoadmap,
  getRoadmapPhase,
  listRoadmapPhases,
  getRequirements,
  analyzeRoadmap,
} from '../lib/roadmap.js';

export function registerRoadmapTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_roadmap',
    label: 'GSD Roadmap',
    description:
      'Parse and query ROADMAP.md: parse full roadmap, get a single phase section, list phases, get requirements, or analyze overall progress.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('parse'),
        Type.Literal('get-phase'),
        Type.Literal('list-phases'),
        Type.Literal('get-requirements'),
        Type.Literal('analyze'),
      ]),
      phase: Type.Optional(Type.String({ description: 'Phase number for "get-phase" action' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'parse':
            result = parseRoadmap(cwd);
            break;
          case 'get-phase':
            if (!params.phase) throw new Error('phase is required for "get-phase" action');
            result = getRoadmapPhase(cwd, params.phase);
            break;
          case 'list-phases':
            result = listRoadmapPhases(cwd);
            break;
          case 'get-requirements':
            result = getRequirements(cwd);
            break;
          case 'analyze':
            result = analyzeRoadmap(cwd);
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
