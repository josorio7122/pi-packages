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

  it('has a ruby server with correct id and extensions', () => {
    const ruby = SERVERS.find(s => s.id === 'ruby');
    expect(ruby).toBeDefined();
    expect(ruby!.extensions).toContain('.rb');
    expect(ruby!.extensions).toContain('.rake');
    expect(ruby!.extensions).toContain('.gemspec');
    expect(ruby!.extensions).toContain('.ru');
  });

  it('ruby server has correct command and args', () => {
    const ruby = SERVERS.find(s => s.id === 'ruby');
    expect(ruby).toBeDefined();
    expect(ruby!.command).toBe('rubocop');
    expect(ruby!.args).toEqual(['--lsp']);
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

  it('returns ruby server for .rb', () => {
    const servers = getServersForExtension('.rb');
    expect(servers.some(s => s.id === 'ruby')).toBe(true);
  });

  it('returns ruby server for .rake', () => {
    const servers = getServersForExtension('.rake');
    expect(servers.some(s => s.id === 'ruby')).toBe(true);
  });

  it('returns empty for .go', () => {
    expect(getServersForExtension('.go')).toEqual([]);
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
