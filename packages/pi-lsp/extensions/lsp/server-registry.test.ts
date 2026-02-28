import { describe, it, expect } from 'vitest';
import { getServersForExtension, SERVERS, type ServerInfo } from './server-registry.js';

describe('SERVERS', () => {
  it('has a typescript server', () => {
    const ts = SERVERS.find(s => s.id === 'typescript');
    expect(ts).toBeDefined();
    expect(ts!.extensions).toContain('.ts');
    expect(ts!.extensions).toContain('.tsx');
    expect(ts!.extensions).toContain('.js');
  });

  it('has a pyright server', () => {
    const py = SERVERS.find(s => s.id === 'pyright');
    expect(py).toBeDefined();
    expect(py!.extensions).toContain('.py');
  });

  it('has a gopls server', () => {
    const go = SERVERS.find(s => s.id === 'gopls');
    expect(go).toBeDefined();
    expect(go!.extensions).toContain('.go');
  });
});

describe('getServersForExtension', () => {
  it('returns typescript server for .ts', () => {
    const servers = getServersForExtension('.ts');
    expect(servers.some(s => s.id === 'typescript')).toBe(true);
  });

  it('returns pyright server for .py', () => {
    const servers = getServersForExtension('.py');
    expect(servers.some(s => s.id === 'pyright')).toBe(true);
  });

  it('returns gopls server for .go', () => {
    const servers = getServersForExtension('.go');
    expect(servers.some(s => s.id === 'gopls')).toBe(true);
  });

  it('returns empty for .txt', () => {
    expect(getServersForExtension('.txt')).toEqual([]);
  });

  it('returns empty for .md', () => {
    expect(getServersForExtension('.md')).toEqual([]);
  });

  it('typescript server handles .jsx', () => {
    const servers = getServersForExtension('.jsx');
    expect(servers.some(s => s.id === 'typescript')).toBe(true);
  });

  it('pyright server handles .pyi', () => {
    const servers = getServersForExtension('.pyi');
    expect(servers.some(s => s.id === 'pyright')).toBe(true);
  });
});
