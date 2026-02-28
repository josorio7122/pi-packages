import type { Diagnostic } from 'vscode-languageserver-types';

const SEVERITY_MAP: Record<number, string> = {
  1: 'ERROR',
  2: 'WARN',
  3: 'INFO',
  4: 'HINT',
};

const DEFAULT_MAX_PER_FILE = 20;

export function formatDiagnostic(d: Diagnostic): string {
  const severity = SEVERITY_MAP[d.severity ?? 1] ?? 'ERROR';
  const line = d.range.start.line + 1;
  const col = d.range.start.character + 1;
  return `${severity} [${line}:${col}] ${d.message}`;
}

export function filterErrors(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(d => d.severity === 1);
}

export function formatDiagnosticsXml(
  filePath: string,
  diagnostics: Diagnostic[],
  maxPerFile: number = DEFAULT_MAX_PER_FILE,
): string {
  if (diagnostics.length === 0) return '';
  const limited = diagnostics.slice(0, maxPerFile);
  const formatted = limited.map(formatDiagnostic).join('\n');
  const suffix = diagnostics.length > maxPerFile
    ? `\n... and ${diagnostics.length - maxPerFile} more`
    : '';
  const escapedPath = filePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `LSP errors detected in this file, please fix:\n<diagnostics file="${escapedPath}">\n${formatted}${suffix}\n</diagnostics>`;
}
