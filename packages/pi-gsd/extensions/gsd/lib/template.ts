/**
 * template.ts — Template file loading and variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── renderTemplate ───────────────────────────────────────────────────────────

/**
 * Replace `{{variable}}` patterns in templateContent with the provided values.
 * Also handles built-in variables:
 *   {{TIMESTAMP}} — current ISO 8601 date-time string
 *   {{DATE}}      — current date in YYYY-MM-DD format
 *
 * Unknown placeholders are left unchanged.
 */
export function renderTemplate(
  templateContent: string,
  variables: Record<string, string>,
): string {
  const now = new Date();
  const timestamp = now.toISOString();
  const date = timestamp.split('T')[0];

  // Build a combined variables map with built-ins (caller variables take priority
  // over built-ins except TIMESTAMP and DATE which are always fresh)
  const builtins: Record<string, string> = {
    TIMESTAMP: timestamp,
    DATE: date,
  };

  return templateContent.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    if (trimmed in variables) return variables[trimmed];
    if (trimmed in builtins) return builtins[trimmed];
    return _match; // leave unknown placeholders unchanged
  });
}

// ─── loadTemplate ─────────────────────────────────────────────────────────────

/**
 * Read a template file from `<runtimePath>/templates/<templateName>`.
 * Returns the raw content (no variable substitution).
 * Throws if the file does not exist.
 */
export function loadTemplate(runtimePath: string, templateName: string): string {
  const templateFilePath = path.join(runtimePath, 'templates', templateName);
  return fs.readFileSync(templateFilePath, 'utf-8');
}

// ─── renderTemplateFile ───────────────────────────────────────────────────────

/**
 * Load a template file and render it with the given variables.
 * Convenience wrapper around `loadTemplate` + `renderTemplate`.
 * Throws if the template file does not exist.
 */
export function renderTemplateFile(
  runtimePath: string,
  templateName: string,
  variables: Record<string, string>,
): string {
  const content = loadTemplate(runtimePath, templateName);
  return renderTemplate(content, variables);
}
