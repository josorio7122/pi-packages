import { describe, it, expect } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { formatDiagnostic, formatDiagnosticsXml, filterErrors } from './diagnostics.js';

function makeDiag(opts: { severity?: number; line?: number; char?: number; message?: string }): Diagnostic {
  return {
    range: {
      start: { line: opts.line ?? 0, character: opts.char ?? 0 },
      end: { line: opts.line ?? 0, character: (opts.char ?? 0) + 5 },
    },
    message: opts.message ?? 'Some error',
    severity: opts.severity ?? 1,
  };
}

describe('formatDiagnostic', () => {
  it('formats ERROR with 1-based line/col', () => {
    const d = makeDiag({ severity: 1, line: 4, char: 9, message: "Type 'string' not assignable to 'number'" });
    expect(formatDiagnostic(d)).toBe("ERROR [5:10] Type 'string' not assignable to 'number'");
  });

  it('formats WARN for severity 2', () => {
    const d = makeDiag({ severity: 2, line: 0, char: 0, message: 'Unused variable' });
    expect(formatDiagnostic(d)).toBe('WARN [1:1] Unused variable');
  });

  it('formats INFO for severity 3', () => {
    const d = makeDiag({ severity: 3, message: 'Info message' });
    expect(formatDiagnostic(d)).toBe('INFO [1:1] Info message');
  });

  it('formats HINT for severity 4', () => {
    const d = makeDiag({ severity: 4, message: 'Hint' });
    expect(formatDiagnostic(d)).toBe('HINT [1:1] Hint');
  });

  it('defaults to ERROR when severity is undefined', () => {
    const d = makeDiag({});
    delete (d as any).severity;
    expect(formatDiagnostic(d)).toMatch(/^ERROR/);
  });
});

describe('filterErrors', () => {
  it('keeps only severity 1 (ERROR)', () => {
    const diags = [makeDiag({ severity: 1 }), makeDiag({ severity: 2 }), makeDiag({ severity: 3 })];
    expect(filterErrors(diags)).toHaveLength(1);
    expect(filterErrors(diags)[0].severity).toBe(1);
  });

  it('returns empty for no errors', () => {
    expect(filterErrors([makeDiag({ severity: 2 })])).toEqual([]);
  });

  it('returns all when all are errors', () => {
    const diags = [makeDiag({ severity: 1 }), makeDiag({ severity: 1 })];
    expect(filterErrors(diags)).toHaveLength(2);
  });
});

describe('formatDiagnosticsXml', () => {
  it('wraps errors in <diagnostics> XML tags', () => {
    const diags = [makeDiag({ severity: 1, message: 'Type error' })];
    const result = formatDiagnosticsXml('/src/foo.ts', diags);
    expect(result).toContain('<diagnostics file="/src/foo.ts">');
    expect(result).toContain('</diagnostics>');
    expect(result).toContain('ERROR [1:1] Type error');
    expect(result).toContain('LSP errors detected');
  });

  it('returns empty string when no diagnostics', () => {
    expect(formatDiagnosticsXml('/src/foo.ts', [])).toBe('');
  });

  it('truncates at maxPerFile with suffix', () => {
    const diags = Array.from({ length: 25 }, (_, i) => makeDiag({ severity: 1, message: `Error ${i}` }));
    const result = formatDiagnosticsXml('/src/foo.ts', diags, 20);
    expect(result).toContain('... and 5 more');
    // Should contain exactly 20 ERROR lines
    const errorLines = result.split('\n').filter(l => l.startsWith('ERROR'));
    expect(errorLines).toHaveLength(20);
  });

  it('defaults maxPerFile to 20', () => {
    const diags = Array.from({ length: 25 }, (_, i) => makeDiag({ severity: 1, message: `Error ${i}` }));
    const result = formatDiagnosticsXml('/src/foo.ts', diags);
    expect(result).toContain('... and 5 more');
  });

  it('does not add suffix when count <= maxPerFile', () => {
    const diags = [makeDiag({ severity: 1, message: 'Only one' })];
    const result = formatDiagnosticsXml('/src/foo.ts', diags);
    expect(result).not.toContain('... and');
  });
});
