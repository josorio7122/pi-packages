import { describe, it, expect } from 'vitest';
import { getLanguageId } from './language-map';

describe('getLanguageId', () => {
  it('.ts → typescript', () => expect(getLanguageId('foo.ts')).toBe('typescript'));
  it('.tsx → typescriptreact', () => expect(getLanguageId('foo.tsx')).toBe('typescriptreact'));
  it('.js → javascript', () => expect(getLanguageId('foo.js')).toBe('javascript'));
  it('.jsx → javascriptreact', () => expect(getLanguageId('foo.jsx')).toBe('javascriptreact'));
  it('.mjs → javascript', () => expect(getLanguageId('foo.mjs')).toBe('javascript'));
  it('.cjs → javascript', () => expect(getLanguageId('foo.cjs')).toBe('javascript'));
  it('.py → python', () => expect(getLanguageId('foo.py')).toBe('python'));
  it('.go → go', () => expect(getLanguageId('foo.go')).toBe('go'));
  it('.rs → rust', () => expect(getLanguageId('foo.rs')).toBe('rust'));
  it('.css → css', () => expect(getLanguageId('foo.css')).toBe('css'));
  it('.html → html', () => expect(getLanguageId('foo.html')).toBe('html'));
  it('.json → json', () => expect(getLanguageId('foo.json')).toBe('json'));
  it('.md → markdown', () => expect(getLanguageId('foo.md')).toBe('markdown'));
  it('.unknown → plaintext', () => expect(getLanguageId('foo.unknown')).toBe('plaintext'));
  it('full path: /foo/bar.ts → typescript', () => expect(getLanguageId('/foo/bar.ts')).toBe('typescript'));
  it('Makefile → makefile', () => expect(getLanguageId('Makefile')).toBe('makefile'));
  it('.vue → vue', () => expect(getLanguageId('foo.vue')).toBe('vue'));
  it('.svelte → svelte', () => expect(getLanguageId('foo.svelte')).toBe('svelte'));
  it('.rb → ruby', () => expect(getLanguageId('foo.rb')).toBe('ruby'));
  it('.rake → ruby', () => expect(getLanguageId('foo.rake')).toBe('ruby'));
  it('.gemspec → ruby', () => expect(getLanguageId('foo.gemspec')).toBe('ruby'));
  it('.ru → ruby', () => expect(getLanguageId('foo.ru')).toBe('ruby'));
});
