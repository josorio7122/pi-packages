/**
 * gsd_util tool — Utilities
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { renderTemplate, renderTemplateFile } from '../lib/template.js';
import { extractFrontmatter, reconstructFrontmatter } from '../lib/frontmatter.js';
import { generateSlug } from '../lib/paths.js';

export function registerUtilTool(pi: ExtensionAPI, runtimeDir: string): void {
  pi.registerTool({
    name: 'gsd_util',
    label: 'GSD Util',
    description:
      'Utility functions: generate timestamps/slugs, render templates with variable substitution, parse or reconstruct YAML frontmatter.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('timestamp'),
        Type.Literal('slug'),
        Type.Literal('render-template'),
        Type.Literal('parse-frontmatter'),
        Type.Literal('reconstruct-frontmatter'),
      ]),
      input: Type.Optional(Type.String({ description: 'Input string for slug/parse-frontmatter/reconstruct-frontmatter actions' })),
      template: Type.Optional(Type.String({ description: 'Template name (filename) or inline template content for render-template' })),
      variables: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Variables for template substitution' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        let result: unknown;

        switch (params.action) {
          case 'timestamp': {
            const now = new Date();
            result = {
              iso: now.toISOString(),
              date: now.toISOString().split('T')[0],
              timestamp: now.getTime(),
            };
            break;
          }
          case 'slug': {
            if (!params.input) throw new Error('input is required for "slug" action');
            result = { input: params.input, slug: generateSlug(params.input) };
            break;
          }
          case 'render-template': {
            if (!params.template) throw new Error('template is required for "render-template" action');
            const vars = params.variables ?? {};

            // Check if template looks like a filename (no {{ or newlines) — try file first
            let rendered: string;
            if (!params.template.includes('{{') && !params.template.includes('\n')) {
              try {
                rendered = renderTemplateFile(runtimeDir, params.template, vars);
              } catch {
                // Fall back to treating it as inline content
                rendered = renderTemplate(params.template, vars);
              }
            } else {
              rendered = renderTemplate(params.template, vars);
            }

            result = { rendered };
            break;
          }
          case 'parse-frontmatter': {
            if (!params.input) throw new Error('input is required for "parse-frontmatter" action');
            result = { frontmatter: extractFrontmatter(params.input) };
            break;
          }
          case 'reconstruct-frontmatter': {
            if (!params.input) throw new Error('input is required for "reconstruct-frontmatter" action');
            // Parse the input as JSON object (frontmatter data)
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(params.input) as Record<string, unknown>;
            } catch {
              throw new Error('input must be a JSON object for "reconstruct-frontmatter" action');
            }
            result = { yaml: reconstructFrontmatter(data as import('../lib/types.js').FrontmatterData) };
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
