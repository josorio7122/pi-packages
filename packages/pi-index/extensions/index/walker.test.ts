import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  walkDirs,
  readMtimeCache,
  writeMtimeCache,
  diffFileSet,
  type MtimeEntry,
  type FileRecord,
  type WalkResult,
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

    const { files } = await walkDirs([tmpDir], tmpDir, [".ts", ".css"], 500);
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("index.ts");
    expect(paths).toContain("style.css");
    expect(paths).not.toContain("ignored.rb");
  });

  it("returns relative paths from the index root", async () => {
    const sub = join(tmpDir, "src");
    mkdirSync(sub);
    writeFileSync(join(sub, "login.ts"), "export function login() {}");

    const { files } = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files[0].relativePath).toBe("src/login.ts");
  });

  it("skips files exceeding maxFileKB (strictly greater than) and counts them", async () => {
    // 501 KB should be skipped when maxFileKB = 500
    const bigContent = "x".repeat(501 * 1024);
    writeFileSync(join(tmpDir, "big.ts"), bigContent);
    writeFileSync(join(tmpDir, "small.ts"), "const x = 1;");

    const result = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    const paths = result.files.map((f) => f.relativePath);
    expect(paths).not.toContain("big.ts");
    expect(paths).toContain("small.ts");
    expect(result.skippedLarge).toBe(1);
  });

  it("returns skippedLarge of 0 when no files exceed the limit", async () => {
    writeFileSync(join(tmpDir, "small.ts"), "const x = 1;");
    const { skippedLarge } = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(skippedLarge).toBe(0);
  });

  it("recurses into subdirectories", async () => {
    mkdirSync(join(tmpDir, "a/b"), { recursive: true });
    writeFileSync(join(tmpDir, "a/b/deep.ts"), "");

    const { files } = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files.map((f) => f.relativePath)).toContain("a/b/deep.ts");
  });

  it("returns empty files array for an empty directory", async () => {
    const { files, skippedLarge } = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
    expect(files).toHaveLength(0);
    expect(skippedLarge).toBe(0);
  });

  it("includes extension field on each record", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "const x = 1;");
    const { files } = await walkDirs([tmpDir], tmpDir, [".ts"], 500);
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

// ---------------------------------------------------------------------------
// .gitignore integration tests — use real temp dirs with async fs
// ---------------------------------------------------------------------------

describe("walkDirs .gitignore integration", () => {
  let tmpGitDir: string;

  beforeEach(async () => {
    tmpGitDir = join(tmpdir(), `walker-git-test-${randomUUID()}`);
    await mkdir(tmpGitDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpGitDir, { recursive: true, force: true });
  });

  it("excludes files and directories matching .gitignore patterns", async () => {
    // .gitignore ignores *.log files and the build/ directory
    await writeFile(join(tmpGitDir, ".gitignore"), "*.log\nbuild/\n");
    await writeFile(join(tmpGitDir, "app.ts"), "const x = 1;");
    await writeFile(join(tmpGitDir, "error.log"), "some log");
    await mkdir(join(tmpGitDir, "build"), { recursive: true });
    await writeFile(join(tmpGitDir, "build", "output.ts"), "compiled");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts", ".log"], 500);
    const files = result.files.map((f) => f.relativePath);

    // app.ts is not ignored — must appear
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);
    // error.log is ignored via *.log pattern
    expect(files.some((f) => f.includes("error.log"))).toBe(false);
    // build/output.ts is inside the ignored build/ directory
    expect(files.some((f) => f.includes("build"))).toBe(false);
  });

  it("excludes node_modules even without a .gitignore file", async () => {
    // No .gitignore present — node_modules must be excluded via hardcoded rule
    await mkdir(join(tmpGitDir, "node_modules", "somepackage"), { recursive: true });
    await writeFile(join(tmpGitDir, "node_modules", "somepackage", "index.ts"), "module");
    await writeFile(join(tmpGitDir, "app.ts"), "const x = 1;");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);
  });

  it("excludes files exceeding maxFileKB (async variant)", async () => {
    const bigContent = "x".repeat(2 * 1024); // 2 KB
    await writeFile(join(tmpGitDir, "big.ts"), bigContent);
    await writeFile(join(tmpGitDir, "small.ts"), "const x = 1;");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts"], 1); // 1 KB limit
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("big.ts"))).toBe(false);
    expect(files.some((f) => f.includes("small.ts"))).toBe(true);
  });

  it("only indexes files whose extension is in the supported list", async () => {
    await writeFile(join(tmpGitDir, "script.ts"), "const x = 1;");
    await writeFile(join(tmpGitDir, "image.png"), "binary data");
    await writeFile(join(tmpGitDir, "data.csv"), "a,b,c");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("script.ts"))).toBe(true);
    expect(files.some((f) => f.includes("image.png"))).toBe(false);
    expect(files.some((f) => f.includes("data.csv"))).toBe(false);
  });

  it("dist/** excludes .js files nested two levels deep", async () => {
    // Use **/*.js pattern — intermediate directories (src/deep) don't match *.js,
    // so directory-level exclusion cannot hide the bug. Only the file-path check is exercised.
    await writeFile(join(tmpGitDir, ".gitignore"), "**/*.js\n");
    await mkdir(join(tmpGitDir, "src", "deep"), { recursive: true });
    await writeFile(join(tmpGitDir, "src", "deep", "util.js"), "module.exports = {};");
    await writeFile(join(tmpGitDir, "app.ts"), "const x = 1;");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts", ".js"], 500);
    const files = result.files.map((f) => f.relativePath);

    // util.js is 2 levels deep and must be excluded by **/*.js
    expect(files.some((f) => f.includes("util.js"))).toBe(false);
    // app.ts is not a .js file — must still appear
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);
  });

  it("emits console.warn and skips negation patterns (lines starting with !) from .gitignore", async () => {
    // .gitignore has a negation pattern — it should be skipped (not create broken regex)
    // and a console.warn should be emitted once for that file
    await writeFile(
      join(tmpGitDir, ".gitignore"),
      "*.log\n!important.log\nbuild/\n",
    );
    await writeFile(join(tmpGitDir, "app.ts"), "const x = 1;");
    await writeFile(join(tmpGitDir, "error.log"), "some log");
    await writeFile(join(tmpGitDir, "important.log"), "important log");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts", ".log"], 500);
    const files = result.files.map((f) => f.relativePath);

    // console.warn must have been called once with a message about negation
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain("!important.log");
    expect(warnMsg).toContain("not supported");

    // *.log pattern still excludes both .log files (negation was NOT applied)
    expect(files.some((f) => f.includes("error.log"))).toBe(false);
    expect(files.some((f) => f.includes("important.log"))).toBe(false);
    // .ts file must still appear
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);

    warnSpy.mockRestore();
  });

  it("dist/** excludes files directly inside dist/ and in nested subdirectories", async () => {
    await writeFile(join(tmpGitDir, ".gitignore"), "dist/**\n");
    await mkdir(join(tmpGitDir, "dist", "sub"), { recursive: true });
    // A file directly in dist/ (one level deep)
    await writeFile(join(tmpGitDir, "dist", "bundle.js"), "code");
    // A file nested inside dist/sub/ (two levels deep)
    await writeFile(join(tmpGitDir, "dist", "sub", "chunk.js"), "code");
    await writeFile(join(tmpGitDir, "app.ts"), "const x = 1;");

    const result = await walkDirs([tmpGitDir], tmpGitDir, [".ts", ".js"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("bundle.js"))).toBe(false);
    expect(files.some((f) => f.includes("chunk.js"))).toBe(false);
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);
  });
});

describe("subdirectory .gitignore integration", () => {
  let tmpDir2: string;

  beforeEach(async () => {
    tmpDir2 = join(tmpdir(), `walker-subgit-test-${randomUUID()}`);
    await mkdir(tmpDir2, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir2, { recursive: true, force: true });
  });

  it("applies subdirectory .gitignore patterns to files in that subdirectory", async () => {
    // packages/frontend has its own node_modules that should be excluded
    await mkdir(join(tmpDir2, "packages", "frontend", "node_modules", "lodash"), { recursive: true });
    await writeFile(join(tmpDir2, "packages", "frontend", "node_modules", "lodash", "index.ts"), "module");
    await writeFile(join(tmpDir2, "packages", "frontend", "app.ts"), "app");
    await writeFile(join(tmpDir2, "packages", "frontend", ".gitignore"), "node_modules/\n");

    const result = await walkDirs([tmpDir2], tmpDir2, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes("app.ts"))).toBe(true);
  });

  it("subdirectory .gitignore does not affect files outside its directory", async () => {
    // root app.ts should not be affected by packages/api/.gitignore
    await mkdir(join(tmpDir2, "packages", "api"), { recursive: true });
    await writeFile(join(tmpDir2, "packages", "api", ".gitignore"), "*.ts\n"); // exclude .ts in api
    await writeFile(join(tmpDir2, "packages", "api", "excluded.ts"), "excluded");
    await writeFile(join(tmpDir2, "app.ts"), "not excluded"); // root file, not in api/

    const result = await walkDirs([tmpDir2], tmpDir2, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files.some((f) => f.includes("excluded.ts"))).toBe(false); // excluded by api/.gitignore
    expect(files.some((f) => f === "app.ts")).toBe(true); // root file unaffected
  });

  it("? in .gitignore matches exactly one character", async () => {
    await writeFile(join(tmpDir2, ".gitignore"), "?.ts\n");
    // Files that should be excluded: a.ts (? matches 'a'), b.ts (? matches 'b')
    await writeFile(join(tmpDir2, "a.ts"), "content");
    await writeFile(join(tmpDir2, "b.ts"), "content");
    // Files that should be INCLUDED: ab.ts (two chars before .ts, ? matches only 1)
    await writeFile(join(tmpDir2, "ab.ts"), "content");
    // Files that should be INCLUDED: config.ts (more than 1 char before .ts)
    await writeFile(join(tmpDir2, "config.ts"), "content");

    const result = await walkDirs([tmpDir2], tmpDir2, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);

    expect(files).not.toContain("a.ts");      // excluded: ? matches 'a'
    expect(files).not.toContain("b.ts");      // excluded: ? matches 'b'
    expect(files).toContain("ab.ts");         // included: 2 chars before .ts
    expect(files).toContain("config.ts");     // included: 6 chars before .ts
  });

  it("? in .gitignore does not match a path separator", async () => {
    await mkdir(join(tmpDir2, "src"), { recursive: true });
    await writeFile(join(tmpDir2, ".gitignore"), "?rc/\n");
    await writeFile(join(tmpDir2, "src", "index.ts"), "content");

    const result = await walkDirs([tmpDir2], tmpDir2, [".ts"], 500);
    const files = result.files.map((f) => f.relativePath);
    expect(files).not.toContain("src/index.ts"); // excluded: ?rc/ matches src/
  });

  it("rooted /dist pattern matches only root dist, not nested dist", async () => {
    await mkdir(join(tmpDir2, "dist"), { recursive: true });
    await mkdir(join(tmpDir2, "packages", "frontend", "dist"), { recursive: true });
    await writeFile(join(tmpDir2, "dist", "bundle.js"), "built");
    await writeFile(join(tmpDir2, "packages", "frontend", "dist", "bundle.js"), "built");
    await writeFile(join(tmpDir2, "app.ts"), "app");
    await writeFile(join(tmpDir2, ".gitignore"), "/dist\n"); // rooted: only root dist

    const result = await walkDirs([tmpDir2], tmpDir2, [".ts", ".js"], 500);
    const files = result.files.map((f) => f.relativePath);

    // root dist/bundle.js excluded
    expect(files.some((f) => f === "dist/bundle.js")).toBe(false);
    // nested dist is NOT excluded by root /dist — should be included
    expect(files.some((f) => f === "packages/frontend/dist/bundle.js")).toBe(true);
    expect(files.some((f) => f === "app.ts")).toBe(true);
  });
});
