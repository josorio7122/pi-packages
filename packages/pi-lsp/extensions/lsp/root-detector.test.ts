import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nearestRoot } from './root-detector.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-lsp-root-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Helper: create a file (and any missing parent dirs) */
async function touch(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '');
}

describe('nearestRoot', () => {
  it('finds tsconfig.json in the file\'s own directory', async () => {
    // tmpDir/src/tsconfig.json, file is tmpDir/src/index.ts
    const srcDir = path.join(tmpDir, 'src');
    await touch(path.join(srcDir, 'tsconfig.json'));
    await touch(path.join(srcDir, 'index.ts'));

    const rootFn = nearestRoot(['tsconfig.json']);
    const result = await rootFn(path.join(srcDir, 'index.ts'), tmpDir);
    expect(result).toBe(srcDir);
  });

  it('finds package.json one level up from the file', async () => {
    // tmpDir/package.json, file is tmpDir/src/index.ts
    await touch(path.join(tmpDir, 'package.json'));
    const srcDir = path.join(tmpDir, 'src');
    await touch(path.join(srcDir, 'index.ts'));

    const rootFn = nearestRoot(['package.json']);
    const result = await rootFn(path.join(srcDir, 'index.ts'), tmpDir);
    expect(result).toBe(tmpDir);
  });

  it('finds go.mod two levels up from the file', async () => {
    // tmpDir/go.mod, file is tmpDir/pkg/sub/main.go
    await touch(path.join(tmpDir, 'go.mod'));
    const deepDir = path.join(tmpDir, 'pkg', 'sub');
    await touch(path.join(deepDir, 'main.go'));

    const rootFn = nearestRoot(['go.mod']);
    const result = await rootFn(path.join(deepDir, 'main.go'), tmpDir);
    expect(result).toBe(tmpDir);
  });

  it('returns projectRoot when no config files are found', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await touch(path.join(srcDir, 'index.ts'));

    const rootFn = nearestRoot(['tsconfig.json', 'package.json']);
    const result = await rootFn(path.join(srcDir, 'index.ts'), tmpDir);
    expect(result).toBe(tmpDir);
  });

  it('returns undefined when exclude pattern (deno.json) is found before include', async () => {
    // tmpDir/deno.json (exclude) + tmpDir/tsconfig.json (include)
    // file is tmpDir/src/index.ts
    await touch(path.join(tmpDir, 'deno.json'));
    await touch(path.join(tmpDir, 'tsconfig.json'));
    const srcDir = path.join(tmpDir, 'src');
    await touch(path.join(srcDir, 'index.ts'));

    const rootFn = nearestRoot(['tsconfig.json'], ['deno.json']);
    const result = await rootFn(path.join(srcDir, 'index.ts'), tmpDir);
    expect(result).toBeUndefined();
  });

  it('stops walking at projectRoot boundary and does not go higher', async () => {
    // package.json exists at tmpDir's PARENT — should NOT be found
    // file is tmpDir/src/index.ts, projectRoot is tmpDir
    const srcDir = path.join(tmpDir, 'src');
    await touch(path.join(srcDir, 'index.ts'));
    // Do NOT create package.json inside tmpDir; it only exists outside (we can't
    // reliably touch the real parent without side effects, so we just verify the
    // fallback: result is projectRoot, not something above it)
    const rootFn = nearestRoot(['package.json']);
    const result = await rootFn(path.join(srcDir, 'index.ts'), tmpDir);
    expect(result).toBe(tmpDir); // fallback — didn't escape boundary
  });

  it('works with deeply nested files', async () => {
    // tmpDir/tsconfig.json, file is tmpDir/a/b/c/d/e/index.ts
    await touch(path.join(tmpDir, 'tsconfig.json'));
    const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e');
    await touch(path.join(deepDir, 'index.ts'));

    const rootFn = nearestRoot(['tsconfig.json']);
    const result = await rootFn(path.join(deepDir, 'index.ts'), tmpDir);
    expect(result).toBe(tmpDir);
  });
});
