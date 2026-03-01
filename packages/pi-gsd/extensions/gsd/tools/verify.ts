/**
 * gsd_verify tool — Verification & Health
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  validateHealth,
  verifyPlanStructure,
  verifySummary,
  verifyPhaseCompleteness,
  verifyReferences,
  validateConsistency,
} from '../lib/verify.js';

export function registerVerifyTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'gsd_verify',
    label: 'GSD Verify',
    description:
      'Health checks and validation: overall health, plan structure, summary, phase completeness, file references, or roadmap consistency.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('health'),
        Type.Literal('validate-plan'),
        Type.Literal('validate-summary'),
        Type.Literal('check-phase'),
        Type.Literal('check-references'),
        Type.Literal('check-consistency'),
      ]),
      path: Type.Optional(Type.String({ description: 'Relative file path for validate-plan, validate-summary, or check-references' })),
      phase: Type.Optional(Type.String({ description: 'Phase number for "check-phase" action' })),
      repair: Type.Optional(Type.Boolean({ description: 'Attempt to repair issues found by "health" action' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd;
        let result: unknown;

        switch (params.action) {
          case 'health':
            result = validateHealth(cwd, { repair: params.repair ?? false });
            break;
          case 'validate-plan':
            if (!params.path) throw new Error('path is required for "validate-plan" action');
            result = verifyPlanStructure(cwd, params.path);
            break;
          case 'validate-summary':
            if (!params.path) throw new Error('path is required for "validate-summary" action');
            result = verifySummary(cwd, params.path);
            break;
          case 'check-phase':
            if (!params.phase) throw new Error('phase is required for "check-phase" action');
            result = verifyPhaseCompleteness(cwd, params.phase);
            break;
          case 'check-references':
            if (!params.path) throw new Error('path is required for "check-references" action');
            result = verifyReferences(cwd, params.path);
            break;
          case 'check-consistency':
            result = validateConsistency(cwd);
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
