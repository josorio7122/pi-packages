import { describe, it, expect } from 'vitest';
import { lspToolDefinition, OPERATIONS } from './tools.js';

describe('lspToolDefinition', () => {
  it('has name "lsp"', () => {
    expect(lspToolDefinition.name).toBe('lsp');
  });

  it('has label "LSP"', () => {
    expect(lspToolDefinition.label).toBe('LSP');
  });

  it('has a description mentioning all operations', () => {
    for (const op of OPERATIONS) {
      expect(lspToolDefinition.description).toContain(op);
    }
  });

  it('has parameters with operation, filePath, line, character', () => {
    const props = lspToolDefinition.parameters.properties;
    expect(props).toHaveProperty('operation');
    expect(props).toHaveProperty('filePath');
    expect(props).toHaveProperty('line');
    expect(props).toHaveProperty('character');
  });
});

describe('OPERATIONS', () => {
  it('contains all 9 operations', () => {
    expect(OPERATIONS).toHaveLength(9);
    expect(OPERATIONS).toContain('goToDefinition');
    expect(OPERATIONS).toContain('findReferences');
    expect(OPERATIONS).toContain('hover');
    expect(OPERATIONS).toContain('documentSymbol');
    expect(OPERATIONS).toContain('workspaceSymbol');
    expect(OPERATIONS).toContain('goToImplementation');
    expect(OPERATIONS).toContain('prepareCallHierarchy');
    expect(OPERATIONS).toContain('incomingCalls');
    expect(OPERATIONS).toContain('outgoingCalls');
  });
});
