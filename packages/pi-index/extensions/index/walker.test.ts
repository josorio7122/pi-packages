import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  walkDirs,
  readMtimeCache,
  writeMtimeCache,
  diffFileSet,
  type MtimeEntry,
  type FileRecord,
} from "./walker.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pi-index-walker-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("walkDirs", () => {
  it("discovers files with supported extensions", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const x = 1;");
    writeFileSync(join(tmpDir, "style.css"), "body {}");
    writeFileSync(join(tmpDir, "ignored.rb"), "# ruby");

    const files = await walkDirs([tmpDir], tmpDir, [".ts", ".css"], 500);
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("index.ts");
    expect(paths).toContain("style.css");
    expect(paths).not.toContain("ignored.rb");
  });

  it("returns relative paths from the index root", async () => {
    const sub = join(tmpDir, "src");
    mkdirSync(sub);
    writeFileSync(join(sub, "login.ts"), "export function login() {}");

    const files = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files[0].relativePath).toBe("src/login.ts");
  });

  it("skips files exceeding maxFileKB (strictly greater than)", async () => {
    // 501 KB should be skipped when maxFileKB = 500
    const bigContent = "x".repeat(501 * 1024);
    writeFileSync(join(tmpDir, "big.ts"), bigContent);
    writeFileSync(join(tmpDir, "small.ts"), "const x = 1;");

    const files = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    const paths = files.map((f) => f.relativePath);
    expect(paths).not.toContain("big.ts");
    expect(paths).toContain("small.ts");
  });

  it("recurses into subdirectories", async () => {
    mkdirSync(join(tmpDir, "a/b"), { recursive: true });
    writeFileSync(join(tmpDir, "a/b/deep.ts"), "");

    const files = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files.map((f) => f.relativePath)).toContain("a/b/deep.ts");
  });

  it("returns empty array for an empty directory", async () => {
    const files = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files).toHaveLength(0);
  });

  it("includes extension field on each record", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const x = 1;");
    const files = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files[0].extension).toBe(".ts");
  });
});

describe("readMtimeCache / writeMtimeCache", () => {
  it("returns empty map when cache file does not exist", async () => {
    const cache = await readMtimeCache(join(tmpDir, "nonexistent.json"));
    expect(cache.size).toBe(0);
  });

  it("round-trips entries correctly", async () => {
    const cachePath = join(tmpDir, "mtime-cache.json");
    const entry: MtimeEntry = {
      filePath: "src/index.ts",
      mtime: 1234567890000,
      chunkCount: 3,
      indexedAt: 9999,
    };
    const map = new Map([["src/index.ts", entry]]);
    await writeMtimeCache(cachePath, map);
    const loaded = await readMtimeCache(cachePath);
    expect(loaded.get("src/index.ts")).toEqual(entry);
  });

  it("overwrites existing cache file (not appends)", async () => {
    const cachePath = join(tmpDir, "mtime-cache.json");
    const map1 = new Map([["a.ts", { filePath: "a.ts", mtime: 1, chunkCount: 1, indexedAt: 1 }]]);
    await writeMtimeCache(cachePath, map1);
    const map2 = new Map([["b.ts", { filePath: "b.ts", mtime: 2, chunkCount: 2, indexedAt: 2 }]]);
    await writeMtimeCache(cachePath, map2);
    const loaded = await readMtimeCache(cachePath);
    expect(loaded.has("a.ts")).toBe(false);
    expect(loaded.has("b.ts")).toBe(true);
  });

  it("creates parent directories if they do not exist", async () => {
    const cachePath = join(tmpDir, "deep/nested/mtime-cache.json");
    const map = new Map([["x.ts", { filePath: "x.ts", mtime: 1, chunkCount: 1, indexedAt: 1 }]]);
    await writeMtimeCache(cachePath, map);
    const loaded = await readMtimeCache(cachePath);
    expect(loaded.size).toBe(1);
  });
});

describe("diffFileSet", () => {
  const record = (path: string, mtime: number): FileRecord => ({
    relativePath: path,
    absolutePath: `/project/${path}`,
    mtime,
    sizeKB: 10,
    extension: ".ts",
  });

  const entry = (path: string, mtime: number): MtimeEntry => ({
    filePath: path,
    mtime,
    chunkCount: 2,
    indexedAt: 1000,
  });

  it("identifies new files (in current, absent from cache)", () => {
    const current = [record("new.ts", 100)];
    const cache = new Map<string, MtimeEntry>();
    const diff = diffFileSet(current, cache);
    expect(diff.toAdd.map((f) => f.relativePath)).toContain("new.ts");
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it("identifies changed files (mtime differs)", () => {
    const current = [record("changed.ts", 999)];
    const cache = new Map([["changed.ts", entry("changed.ts", 100)]]);
    const diff = diffFileSet(current, cache);
    expect(diff.toUpdate.map((f) => f.relativePath)).toContain("changed.ts");
    expect(diff.toAdd).toHaveLength(0);
  });

  it("identifies deleted files (in cache but not on disk)", () => {
    const current: FileRecord[] = [];
    const cache = new Map([["deleted.ts", entry("deleted.ts", 100)]]);
    const diff = diffFileSet(current, cache);
    expect(diff.toDelete).toContain("deleted.ts");
  });

  it("skips unchanged files (mtime matches)", () => {
    const current = [record("same.ts", 100)];
    const cache = new Map([["same.ts", entry("same.ts", 100)]]);
    const diff = diffFileSet(current, cache);
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDelete).toHaveLength(0);
  });

  it("handles mix of all four states", () => {
    const current = [
      record("new.ts", 100),
      record("changed.ts", 200),
      record("same.ts", 300),
    ];
    const cache = new Map([
      ["changed.ts", entry("changed.ts", 100)],
      ["same.ts", entry("same.ts", 300)],
      ["deleted.ts", entry("deleted.ts", 400)],
    ]);
    const diff = diffFileSet(current, cache);
    expect(diff.toAdd.map((f) => f.relativePath)).toEqual(["new.ts"]);
    expect(diff.toUpdate.map((f) => f.relativePath)).toEqual(["changed.ts"]);
    expect(diff.toDelete).toEqual(["deleted.ts"]);
  });
});
