import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';

export const OPERATIONS = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
] as const;

export type LSPOperation = (typeof OPERATIONS)[number];

export const lspToolDefinition = {
  name: 'lsp' as const,
  label: 'LSP',
  description: `Interact with Language Server Protocol servers for code intelligence.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get type info and documentation for a symbol
- documentSymbol: List all symbols in a file
- workspaceSymbol: Search symbols across the workspace
- goToImplementation: Find implementations of an interface
- prepareCallHierarchy: Get call hierarchy at a position
- incomingCalls: Find callers of a function
- outgoingCalls: Find callees of a function

All operations require filePath, line (1-based), character (1-based).
If no LSP server is available for the file type, an error is returned.`,
  parameters: Type.Object({
    operation: StringEnum(OPERATIONS),
    filePath: Type.String({ description: 'Absolute or relative path to the file' }),
    line: Type.Number({ description: 'Line number (1-based)' }),
    character: Type.Number({ description: 'Character offset (1-based)' }),
  }),
};
