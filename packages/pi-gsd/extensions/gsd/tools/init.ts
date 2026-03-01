/**
 * gsd_init tool — Project & Phase Initialization
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  initNewProject,
  initPhaseOp,
  initExecutePhase,
  initPlanPhase,
  initNewMilestone,
  initQuick,
  initResume,
  initProgress,
  initMilestoneOp,
  initVerifyWork,
} from '../lib/init.js';

export function registerInitTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_init',
    label: 'GSD Init',
    description:
      'Load initialization context for GSD workflow commands. Returns JSON with resolved models, file paths, and project state needed to start a workflow.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('new-project'),
        Type.Literal('phase-op'),
        Type.Literal('execute-phase'),
        Type.Literal('plan-phase'),
        Type.Literal('new-milestone'),
        Type.Literal('quick'),
        Type.Literal('resume'),
        Type.Literal('verify-work'),
        Type.Literal('progress'),
        Type.Literal('milestone-op'),
      ]),
      phase: Type.Optional(Type.String({ description: 'Phase number (required for phase operations)' })),
      description: Type.Optional(Type.String({ description: 'Description (for quick action)' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'new-project':
            result = initNewProject(cwd);
            break;
          case 'phase-op':
            if (!params.phase) throw new Error('phase is required for phase-op action');
            result = initPhaseOp(cwd, params.phase);
            break;
          case 'execute-phase':
            if (!params.phase) throw new Error('phase is required for execute-phase action');
            result = initExecutePhase(cwd, params.phase);
            break;
          case 'plan-phase':
            if (!params.phase) throw new Error('phase is required for plan-phase action');
            result = initPlanPhase(cwd, params.phase);
            break;
          case 'new-milestone':
            result = initNewMilestone(cwd);
            break;
          case 'quick':
            result = initQuick(cwd, params.description);
            break;
          case 'resume':
            result = initResume(cwd);
            break;
          case 'verify-work':
            if (!params.phase) throw new Error('phase is required for verify-work action');
            result = initVerifyWork(cwd, params.phase);
            break;
          case 'progress':
            result = initProgress(cwd);
            break;
          case 'milestone-op':
            result = initMilestoneOp(cwd);
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
