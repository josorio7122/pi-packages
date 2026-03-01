/**
 * gsd_phase tool — Phase Operations
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  listPhases,
  addPhase,
  removePhase,
  insertPhase,
  getPlanIndex,
  getWaveGroups,
  completePhase,
} from '../lib/phase.js';
import { findPhase } from '../lib/paths.js';
import { patchState } from '../lib/state.js';

export function registerPhaseTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_phase',
    label: 'GSD Phase',
    description:
      'Manage phases: list, add, remove, insert, get plan index, group by wave, get current, advance, set status, or mark complete.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('list'),
        Type.Literal('add'),
        Type.Literal('remove'),
        Type.Literal('insert'),
        Type.Literal('plan-index'),
        Type.Literal('wave-group'),
        Type.Literal('current'),
        Type.Literal('advance'),
        Type.Literal('set-status'),
        Type.Literal('complete'),
      ]),
      phase: Type.Optional(Type.String({ description: 'Phase number to operate on' })),
      name: Type.Optional(Type.String({ description: 'Phase name/description (for add/insert)' })),
      description: Type.Optional(Type.String({ description: 'Phase description (alias for name)' })),
      status: Type.Optional(Type.String({ description: 'Status to set (for set-status)' })),
      after: Type.Optional(Type.String({ description: 'Insert after this phase (for insert)' })),
      force: Type.Optional(Type.Boolean({ description: 'Force remove even with summaries' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'list': {
            result = listPhases(cwd);
            break;
          }
          case 'add': {
            const desc = params.description ?? params.name;
            if (!desc) throw new Error('description or name is required for "add" action');
            result = addPhase(cwd, desc);
            break;
          }
          case 'remove': {
            if (!params.phase) throw new Error('phase is required for "remove" action');
            result = removePhase(cwd, params.phase, { force: params.force ?? false });
            break;
          }
          case 'insert': {
            const afterPhase = params.after ?? params.phase;
            const desc = params.description ?? params.name;
            if (!afterPhase) throw new Error('after (or phase) is required for "insert" action');
            if (!desc) throw new Error('description or name is required for "insert" action');
            result = insertPhase(cwd, afterPhase, desc);
            break;
          }
          case 'plan-index': {
            if (!params.phase) throw new Error('phase is required for "plan-index" action');
            result = getPlanIndex(cwd, params.phase);
            break;
          }
          case 'wave-group': {
            if (!params.phase) throw new Error('phase is required for "wave-group" action');
            result = getWaveGroups(cwd, params.phase);
            break;
          }
          case 'current': {
            const phaseInfo = params.phase ? findPhase(cwd, params.phase) : null;
            result = phaseInfo ?? { found: false, error: 'Phase not found or no phase specified' };
            break;
          }
          case 'advance': {
            // Advance current phase in STATE.md
            if (!params.phase) throw new Error('phase is required for "advance" action');
            const ok = patchState(cwd, { current_phase: params.phase, status: 'Ready to plan' });
            result = { advanced: ok, current_phase: params.phase };
            break;
          }
          case 'set-status': {
            if (!params.phase) throw new Error('phase is required for "set-status" action');
            if (!params.status) throw new Error('status is required for "set-status" action');
            const ok = patchState(cwd, {
              current_phase: params.phase,
              status: params.status,
            });
            result = { updated: ok };
            break;
          }
          case 'complete': {
            if (!params.phase) throw new Error('phase is required for "complete" action');
            result = completePhase(cwd, params.phase);
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
