/**
 * gsd_state tool — State Machine Operations
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  loadState,
  getStateField,
  patchState,
  advancePlan,
  addDecision,
  addBlocker,
  resolveBlocker,
  recordSession,
  snapshotState,
  stateToJson,
} from '../lib/state.js';
import type { FrontmatterData } from '../lib/types.js';

export function registerStateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_state',
    label: 'GSD State',
    description:
      'Read and write STATE.md: load, get fields, patch frontmatter, advance plans, record decisions/blockers, snapshot, and serialize to JSON.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('load'),
        Type.Literal('get'),
        Type.Literal('patch'),
        Type.Literal('advance-plan'),
        Type.Literal('record-metric'),
        Type.Literal('add-decision'),
        Type.Literal('add-blocker'),
        Type.Literal('resolve-blocker'),
        Type.Literal('record-session'),
        Type.Literal('snapshot'),
        Type.Literal('json'),
      ]),
      field: Type.Optional(Type.String({ description: 'Field name for "get" action' })),
      updates: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Fields to patch for "patch" action' })),
      phase: Type.Optional(Type.String({ description: 'Phase number for "advance-plan"' })),
      plan_id: Type.Optional(Type.String({ description: 'Plan ID for "advance-plan"' })),
      metric: Type.Optional(Type.String({ description: 'Metric text for "record-metric"' })),
      decision: Type.Optional(Type.String({ description: 'Decision summary for "add-decision"' })),
      rationale: Type.Optional(Type.String({ description: 'Rationale for "add-decision"' })),
      blocker: Type.Optional(Type.String({ description: 'Blocker text for "add-blocker" or "resolve-blocker"' })),
      stopped_at: Type.Optional(Type.String({ description: 'Stopped-at value for "record-session"' })),
      resume_file: Type.Optional(Type.String({ description: 'Resume file path for "record-session"' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'load': {
            result = loadState(cwd);
            break;
          }
          case 'get': {
            if (!params.field) throw new Error('field is required for "get" action');
            result = { field: params.field, value: getStateField(cwd, params.field) };
            break;
          }
          case 'patch': {
            if (!params.updates) throw new Error('updates is required for "patch" action');
            const success = patchState(cwd, params.updates as FrontmatterData);
            result = { success };
            break;
          }
          case 'advance-plan': {
            result = advancePlan(cwd);
            break;
          }
          case 'record-metric': {
            // record-metric is a lightweight patch to frontmatter
            if (!params.metric) throw new Error('metric is required for "record-metric" action');
            const ok = patchState(cwd, { last_metric: params.metric });
            result = { recorded: ok, metric: params.metric };
            break;
          }
          case 'add-decision': {
            if (!params.decision) throw new Error('decision is required for "add-decision" action');
            const ok = addDecision(cwd, {
              phase: params.phase,
              summary: params.decision,
              rationale: params.rationale,
            });
            result = { added: ok };
            break;
          }
          case 'add-blocker': {
            if (!params.blocker) throw new Error('blocker is required for "add-blocker" action');
            const ok = addBlocker(cwd, params.blocker);
            result = { added: ok };
            break;
          }
          case 'resolve-blocker': {
            if (!params.blocker) throw new Error('blocker is required for "resolve-blocker" action');
            const ok = resolveBlocker(cwd, params.blocker);
            result = { resolved: ok };
            break;
          }
          case 'record-session': {
            const ok = recordSession(cwd, {
              stopped_at: params.stopped_at,
              resume_file: params.resume_file,
            });
            result = { updated: ok };
            break;
          }
          case 'snapshot': {
            const snapshotPath = snapshotState(cwd);
            result = { path: snapshotPath, created: snapshotPath !== null };
            break;
          }
          case 'json': {
            result = stateToJson(cwd);
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
