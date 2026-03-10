import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Job, Store, TrackedJob } from "./types.js";

const STORE_DIR = join(homedir(), ".job-search");
const STORE_PATH = join(STORE_DIR, "jobs.json");
const STORE_TMP_PATH = join(STORE_DIR, "jobs.tmp.json");

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const normalized = (parsed.hostname + parsed.pathname)
      .toLowerCase()
      .replace(/\/$/, "");
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

export async function loadStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    try {
      return JSON.parse(raw) as Store;
    } catch {
      process.stderr.write(
        `[job-search] Warning: corrupt JSON in ${STORE_PATH}, starting with empty store\n`
      );
      return { version: 1, jobs: {} };
    }
  } catch {
    return { version: 1, jobs: {} };
  }
}

export async function saveStore(store: Store): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_TMP_PATH, JSON.stringify(store, null, 2), "utf-8");
  await rename(STORE_TMP_PATH, STORE_PATH);
}

export function upsertJobs(store: Store, jobs: Job[]): Store {
  const now = new Date().toISOString();

  for (const job of jobs) {
    const key = normalizeUrl(job.url);
    const existing = store.jobs[key];

    if (existing === undefined) {
      const tracked: TrackedJob = {
        ...job,
        status: "new",
        seenAt: now,
        updatedAt: now,
        notes: "",
      };
      store.jobs[key] = tracked;
    } else {
      existing.discoveredAt = job.discoveredAt;
    }
  }

  return store;
}
