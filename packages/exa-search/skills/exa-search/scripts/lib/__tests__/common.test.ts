import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterOptions, buildContentsOptions, requireArg, requireApiKey, handleError, createClient, executeAndPrint } from '../common.js';

describe('filterOptions', () => {
  it('returns only keys present in the allowed list', () => {
    const opts = { query: 'test', limit: 10, extra: true };
    const result = filterOptions(opts, ['query', 'limit']);
    expect(result).toEqual({ query: 'test', limit: 10 });
  });

  it('skips undefined values', () => {
    const opts = { query: 'test', limit: undefined };
    const result = filterOptions(opts, ['query', 'limit']);
    expect(result).toEqual({ query: 'test' });
  });

  it('returns empty object when no keys match', () => {
    const result = filterOptions({ foo: 1 }, ['bar', 'baz']);
    expect(result).toEqual({});
  });

  it('handles empty options', () => {
    const result = filterOptions({}, ['query']);
    expect(result).toEqual({});
  });

  it('preserves falsy values that are not undefined', () => {
    const opts = { a: 0, b: false, c: '', d: null, e: undefined };
    const result = filterOptions(opts, ['a', 'b', 'c', 'd', 'e']);
    expect(result).toEqual({ a: 0, b: false, c: '', d: null });
  });
});

describe('buildContentsOptions', () => {
  it('builds text options when text is true', () => {
    const result = buildContentsOptions({ text: true });
    expect(result).toEqual({ text: true });
  });

  it('builds text options when text is an object', () => {
    const result = buildContentsOptions({ text: { maxCharacters: 500 } });
    expect(result).toEqual({ text: { maxCharacters: 500 } });
  });

  it('builds highlights options when highlights is true', () => {
    const result = buildContentsOptions({ highlights: true });
    expect(result).toEqual({ highlights: true });
  });

  it('builds highlights options when highlights is an object', () => {
    const result = buildContentsOptions({ highlights: { numSentences: 3 } });
    expect(result).toEqual({ highlights: { numSentences: 3 } });
  });

  it('builds summary options when summary is true', () => {
    const result = buildContentsOptions({ summary: true });
    expect(result).toEqual({ summary: true });
  });

  it('builds summary options when summary is an object', () => {
    const result = buildContentsOptions({ summary: { query: 'test' } });
    expect(result).toEqual({ summary: { query: 'test' } });
  });

  it('returns empty when no content options specified', () => {
    const result = buildContentsOptions({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('combines multiple content options', () => {
    const result = buildContentsOptions({
      text: true,
      highlights: { numSentences: 3 },
      summary: true
    });
    expect(result).toEqual({
      text: true,
      highlights: { numSentences: 3 },
      summary: true
    });
  });

  it('merges contents object with individual options', () => {
    const result = buildContentsOptions({
      text: true,
      contents: { livecrawl: 'always' }
    });
    expect(result).toEqual({
      text: true,
      livecrawl: 'always'
    });
  });

  it('ignores non-true/non-object values for text', () => {
    const result = buildContentsOptions({ text: 'invalid' });
    expect(result).toEqual({});
  });
});

describe('requireArg', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('returns the value when provided', () => {
    const result = requireArg('test-value', 'query');
    expect(result).toBe('test-value');
  });

  it('exits with error when value is undefined', () => {
    requireArg(undefined, 'query');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: query is required');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error when value is empty string', () => {
    requireArg('', 'apiKey');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: apiKey is required');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe('requireApiKey', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalEnv = process.env.EXA_API_KEY;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.EXA_API_KEY = originalEnv;
    } else {
      delete process.env.EXA_API_KEY;
    }
  });

  it('does not exit when EXA_API_KEY is set', () => {
    process.env.EXA_API_KEY = 'test-key';
    requireApiKey();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('exits with error when EXA_API_KEY is not set', () => {
    delete process.env.EXA_API_KEY;
    requireApiKey();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: EXA_API_KEY environment variable is required.');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Get one at: https://dashboard.exa.ai/api-keys');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe('handleError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('prints error message and exits', () => {
    const error = new Error('Test error');
    handleError(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Test error');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('handles non-Error objects', () => {
    handleError({ message: 'Custom error' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Custom error');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe('createClient', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXA_API_KEY = originalEnv;
    } else {
      delete process.env.EXA_API_KEY;
    }
  });

  it('creates an Exa client instance', () => {
    const client = createClient();
    expect(client).toBeDefined();
    expect(typeof client).toBe('object');
    // Verify it has expected Exa client methods
    expect(typeof client.search).toBe('function');
  });
});

describe('executeAndPrint', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('prints JSON result on success', async () => {
    const apiCall = async () => ({ data: 'test' });
    await executeAndPrint(apiCall);
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({ data: 'test' }, null, 2));
  });

  it('handles errors and exits', async () => {
    const apiCall = async () => {
      throw new Error('API error');
    };
    await executeAndPrint(apiCall);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: API error');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('handles complex nested objects', async () => {
    const complexData = {
      results: [{ id: 1, name: 'test' }],
      metadata: { count: 1 }
    };
    const apiCall = async () => complexData;
    await executeAndPrint(apiCall);
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(complexData, null, 2));
  });
});
