// Mock LSP server — plain ESM JavaScript, no transpilation needed.
// Speaks JSON-RPC over stdin/stdout using the Content-Length framing protocol.

let buffer = '';
let contentLength = -1;

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  while (true) {
    if (contentLength === -1) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) return;
      contentLength = parseInt(match[1]);
      buffer = buffer.slice(headerEnd + 4);
    }
    if (buffer.length < contentLength) return;
    const body = buffer.slice(0, contentLength);
    buffer = buffer.slice(contentLength);
    contentLength = -1;
    try {
      handleMessage(JSON.parse(body));
    } catch (e) {
      process.stderr.write('mock-lsp-server parse error: ' + e + '\n');
    }
  }
});

function send(msg) {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  process.stdout.write(header + json);
}

function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1,
          definitionProvider: true,
          referencesProvider: true,
          hoverProvider: true,
          documentSymbolProvider: true,
          workspaceSymbolProvider: true,
          implementationProvider: true,
          callHierarchyProvider: true,
        },
      },
    });
  } else if (msg.method === 'initialized') {
    // no response needed — it's a notification
  } else if (msg.method === 'textDocument/didOpen') {
    const uri = msg.params.textDocument.uri;
    setTimeout(() => {
      send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri,
          diagnostics: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
              severity: 1,
              message: 'Test error from mock server',
            },
          ],
        },
      });
    }, 10);
  } else if (msg.method === 'textDocument/didChange') {
    const uri = msg.params.textDocument.uri;
    setTimeout(() => {
      send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri,
          diagnostics: [
            {
              range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
              severity: 1,
              message: 'Updated error from mock server',
            },
          ],
        },
      });
    }, 10);
  } else if (msg.method === 'textDocument/definition') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          uri: msg.params.textDocument.uri,
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
        },
      ],
    });
  } else if (msg.method === 'textDocument/references') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          uri: msg.params.textDocument.uri,
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        },
      ],
    });
  } else if (msg.method === 'textDocument/hover') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        contents: { kind: 'markdown', value: 'function test(): void' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      },
    });
  } else if (msg.method === 'textDocument/documentSymbol') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          name: 'testFunction',
          kind: 12,
          range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } },
        },
      ],
    });
  } else if (msg.method === 'workspace/symbol') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          name: 'TestClass',
          kind: 5,
          location: {
            uri: 'file:///test.ts',
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
          },
        },
      ],
    });
  } else if (msg.method === 'textDocument/implementation') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          uri: msg.params.textDocument.uri,
          range: { start: { line: 20, character: 0 }, end: { line: 20, character: 10 } },
        },
      ],
    });
  } else if (msg.method === 'textDocument/prepareCallHierarchy') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          name: 'testFunc',
          kind: 12,
          uri: msg.params.textDocument.uri,
          range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 17 } },
        },
      ],
    });
  } else if (msg.method === 'callHierarchy/incomingCalls') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          from: {
            name: 'caller',
            kind: 12,
            uri: 'file:///caller.ts',
            range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
            selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
          },
          fromRanges: [{ start: { line: 3, character: 2 }, end: { line: 3, character: 10 } }],
        },
      ],
    });
  } else if (msg.method === 'callHierarchy/outgoingCalls') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: [
        {
          to: {
            name: 'callee',
            kind: 12,
            uri: 'file:///callee.ts',
            range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
            selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
          },
          fromRanges: [{ start: { line: 2, character: 2 }, end: { line: 2, character: 8 } }],
        },
      ],
    });
  } else if (msg.method === 'workspace/configuration') {
    // Server requests configuration — respond with empty object per section requested
    const items = msg.params && msg.params.items ? msg.params.items : [];
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: items.map(() => ({})),
    });
  } else if (msg.method === 'workspace/didChangeWatchedFiles') {
    // notification, no response
  } else if (msg.method === 'workspace/didChangeConfiguration') {
    // notification, no response
  } else if (msg.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: msg.id, result: null });
  } else if (msg.method === 'exit') {
    process.exit(0);
  } else {
    // Unknown method with an id → send null result so client doesn't hang
    if (msg.id !== undefined && msg.id !== null) {
      send({ jsonrpc: '2.0', id: msg.id, result: null });
    }
  }
}
