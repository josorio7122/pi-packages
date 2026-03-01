/**
 * frontmatter.ts — YAML frontmatter parsing, serialization, and splicing
 */

import type { FrontmatterData } from './types.js';

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Extract YAML frontmatter from a markdown string.
 * Returns an empty object if no frontmatter is found.
 */
export function extractFrontmatter(content: string): FrontmatterData {
  const frontmatter: FrontmatterData = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack entries: { obj: object to write into, indent: indent level }
  type StackEntry = { obj: FrontmatterData | string[]; indent: number };
  const stack: StackEntry[] = [{ obj: frontmatter, indent: -1 }];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Pop stack back to appropriate level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();
      const currentObj = current.obj as FrontmatterData;

      if (value === '' || value === '[') {
        // Empty value or opening bracket → nested object or array
        const placeholder: FrontmatterData = {};
        currentObj[key] = value === '[' ? [] : placeholder;
        stack.push({ obj: currentObj[key] as FrontmatterData | string[], indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        currentObj[key] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else {
        // Simple scalar
        currentObj[key] = value.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Array item pattern
    if (line.trim().startsWith('- ')) {
      const itemValue = line.trim().slice(2).replace(/^["']|["']$/g, '');

      if (Array.isArray(current.obj)) {
        (current.obj as string[]).push(itemValue);
      } else if (
        typeof current.obj === 'object' &&
        !Array.isArray(current.obj) &&
        Object.keys(current.obj).length === 0
      ) {
        // Convert empty object to array in parent
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent && !Array.isArray(parent.obj)) {
          const parentObj = parent.obj as FrontmatterData;
          for (const k of Object.keys(parentObj)) {
            if (parentObj[k] === current.obj) {
              const newArr: string[] = [itemValue];
              parentObj[k] = newArr;
              current.obj = newArr;
              break;
            }
          }
        }
      }
    }
  }

  return frontmatter;
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize a frontmatter object back to a YAML string (without delimiters).
 */
export function reconstructFrontmatter(obj: FrontmatterData): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (
        value.every(v => typeof v === 'string') &&
        value.length <= 3 &&
        value.join(', ').length < 60
      ) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          const sv = String(item);
          lines.push(
            `  - ${typeof item === 'string' && (sv.includes(':') || sv.includes('#')) ? `"${sv}"` : sv}`,
          );
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;

        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (
            subval.every(v => typeof v === 'string') &&
            subval.length <= 3 &&
            subval.join(', ').length < 60
          ) {
            lines.push(`  ${subkey}: [${subval.join(', ')}]`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              const sv = String(item);
              lines.push(
                `    - ${typeof item === 'string' && (sv.includes(':') || sv.includes('#')) ? `"${sv}"` : sv}`,
              );
            }
          }
        } else if (typeof subval === 'object') {
          lines.push(`  ${subkey}:`);
          for (const [subsubkey, subsubval] of Object.entries(subval)) {
            if (subsubval === null || subsubval === undefined) continue;
            if (Array.isArray(subsubval)) {
              if (subsubval.length === 0) {
                lines.push(`    ${subsubkey}: []`);
              } else {
                lines.push(`    ${subsubkey}:`);
                for (const item of subsubval) {
                  lines.push(`      - ${item}`);
                }
              }
            } else {
              lines.push(`    ${subsubkey}: ${subsubval}`);
            }
          }
        } else {
          const sv = String(subval);
          lines.push(
            `  ${subkey}: ${sv.includes(':') || sv.includes('#') ? `"${sv}"` : sv}`,
          );
        }
      }
    } else {
      const sv = String(value);
      if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
        lines.push(`${key}: "${sv}"`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Splicing ─────────────────────────────────────────────────────────────────

/**
 * Replace the frontmatter in a markdown document with the serialized form of newObj.
 * If no frontmatter exists, prepend it.
 */
export function spliceFrontmatter(content: string, newObj: FrontmatterData): string {
  const yamlStr = reconstructFrontmatter(newObj);
  const match = content.match(/^---\n[\s\S]+?\n---/);
  if (match) {
    return `---\n${yamlStr}\n---` + content.slice(match[0].length);
  }
  return `---\n${yamlStr}\n---\n\n` + content;
}

// ─── parseMustHavesBlock ──────────────────────────────────────────────────────

/**
 * Parse a specific named block from the must_haves section of frontmatter.
 * Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
 */
export function parseMustHavesBlock(
  content: string,
  blockName: string,
): Array<Record<string, string | number | string[]> | string> {
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!fmMatch) return [];

  const yaml = fmMatch[1];
  const blockPattern = new RegExp(`^\\s{4}${blockName}:\\s*$`, 'm');
  const blockStart = yaml.search(blockPattern);
  if (blockStart === -1) return [];

  const afterBlock = yaml.slice(blockStart);
  const blockLines = afterBlock.split('\n').slice(1); // skip the header line

  const items: Array<Record<string, string | number | string[]> | string> = [];
  let current: Record<string, string | number | string[]> | string | null = null;

  for (const line of blockLines) {
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= 4 && line.trim() !== '') break;

    if (line.match(/^\s{6}-\s+/)) {
      if (current !== null) items.push(current);
      current = {};
      const simpleMatch = line.match(/^\s{6}-\s+"?([^"]+)"?\s*$/);
      if (simpleMatch && !line.includes(':')) {
        current = simpleMatch[1];
      } else {
        const kvMatch = line.match(/^\s{6}-\s+(\w+):\s*"?([^"]*)"?\s*$/);
        if (kvMatch) {
          current = {};
          (current as Record<string, string>)[kvMatch[1]] = kvMatch[2];
        }
      }
    } else if (current !== null && typeof current === 'object') {
      const kvMatch = line.match(/^\s{8,}(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        const val = kvMatch[2];
        (current as Record<string, string | number>)[kvMatch[1]] = /^\d+$/.test(val)
          ? parseInt(val, 10)
          : val;
      }
      const arrMatch = line.match(/^\s{10,}-\s+"?([^"]+)"?\s*$/);
      if (arrMatch) {
        const keys = Object.keys(current as object);
        const lastKey = keys[keys.length - 1];
        if (lastKey) {
          const rec = current as Record<string, string | number | string[]>;
          if (!Array.isArray(rec[lastKey])) {
            rec[lastKey] = rec[lastKey] !== undefined ? [String(rec[lastKey])] : [];
          }
          (rec[lastKey] as string[]).push(arrMatch[1]);
        }
      }
    }
  }
  if (current !== null) items.push(current);

  return items;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const FRONTMATTER_SCHEMAS: Record<string, { required: string[] }> = {
  plan: {
    required: ['phase', 'plan', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'],
  },
  summary: {
    required: ['phase', 'plan', 'subsystem', 'tags', 'duration', 'completed'],
  },
  verification: {
    required: ['phase', 'verified', 'status', 'score'],
  },
};
