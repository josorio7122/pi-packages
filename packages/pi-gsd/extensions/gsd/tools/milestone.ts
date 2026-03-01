/**
 * gsd_milestone tool — Milestone Operations
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { completeMilestone, listMilestones } from '../lib/milestone.js';
import { getMilestoneInfo } from '../lib/paths.js';

export function registerMilestoneTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_milestone',
    label: 'GSD Milestone',
    description:
      'Milestone operations: complete the current milestone (archive, update STATE.md), list archived milestones, or get current milestone info.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('complete'),
        Type.Literal('list'),
        Type.Literal('info'),
      ]),
      version: Type.Optional(Type.String({ description: 'Milestone version (e.g. "v1.0") — required for "complete"' })),
      name: Type.Optional(Type.String({ description: 'Milestone name override for "complete"' })),
      archive_phases: Type.Optional(Type.Boolean({ description: 'Archive phase directories when completing milestone' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'complete': {
            if (!params.version) throw new Error('version is required for "complete" action');
            result = completeMilestone(cwd, params.version, {
              name: params.name,
              archivePhases: params.archive_phases ?? false,
            });
            break;
          }
          case 'list': {
            result = { milestones: listMilestones(cwd) };
            break;
          }
          case 'info': {
            result = getMilestoneInfo(cwd);
            break;
          }
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
