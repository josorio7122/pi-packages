#!/usr/bin/env tsx
/**
 * track.ts — Manage tracked job search results
 *
 * Usage:
 *   tsx scripts/track.ts list                    # all jobs
 *   tsx scripts/track.ts list --status new        # filter by status
 *   tsx scripts/track.ts set <url-prefix> <status> # update status
 *   tsx scripts/track.ts set <url-prefix> <status> --notes "applied via email"
 *   tsx scripts/track.ts stats                    # counts per status
 *   tsx scripts/track.ts clear                    # reset all jobs (with confirmation prompt)
 */

import { createInterface } from "node:readline";
import { loadStore, saveStore } from "./lib/store.js";
import type { TrackedJob } from "./lib/types.js";

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_STATUSES = [
  "new",
  "saved",
  "applied",
  "rejected",
  "offer",
  "archived",
] as const;

type Status = (typeof VALID_STATUSES)[number];

// ── Table helpers ──────────────────────────────────────────────────────────

function trunc(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function pad(str: string, width: number): string {
  return str + " ".repeat(Math.max(0, width - str.length));
}

const COL_URL = 47;
const COL_COMPANY = 14;
const COL_TITLE = 24;
const COL_STATUS = 8;
const COL_SEEN = 10;

function tableRow(
  url: string,
  company: string,
  title: string,
  status: string,
  seen: string
): string {
  return (
    "│ " +
    pad(trunc(url, COL_URL), COL_URL) +
    " │ " +
    pad(trunc(company, COL_COMPANY), COL_COMPANY) +
    " │ " +
    pad(trunc(title, COL_TITLE), COL_TITLE) +
    " │ " +
    pad(trunc(status, COL_STATUS), COL_STATUS) +
    " │ " +
    pad(trunc(seen, COL_SEEN), COL_SEEN) +
    " │"
  );
}

function tableSep(char: "┌" | "├" | "└"): string {
  const top = char === "┌";
  const bot = char === "└";
  const lft = top ? "┌" : bot ? "└" : "├";
  const rgt = top ? "┐" : bot ? "┘" : "┤";
  const mid = top ? "┬" : bot ? "┴" : "┼";
  const h = "─";
  return (
    lft +
    h.repeat(COL_URL + 2) +
    mid +
    h.repeat(COL_COMPANY + 2) +
    mid +
    h.repeat(COL_TITLE + 2) +
    mid +
    h.repeat(COL_STATUS + 2) +
    mid +
    h.repeat(COL_SEEN + 2) +
    rgt
  );
}

// ── Subcommands ────────────────────────────────────────────────────────────

async function cmdList(args: string[]): Promise<void> {
  // Parse optional --status <value>
  let statusFilter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--status" && args[i + 1]) {
      statusFilter = args[i + 1];
      i++;
    }
  }

  const store = await loadStore();
  let jobs = Object.values(store.jobs);

  if (statusFilter !== undefined) {
    jobs = jobs.filter((j) => j.status === statusFilter);
  }

  // Sort by seenAt descending (newest first)
  jobs.sort(
    (a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime()
  );

  process.stdout.write(tableSep("┌") + "\n");
  process.stdout.write(
    tableRow("URL", "Company", "Title", "Status", "Seen") + "\n"
  );
  process.stdout.write(tableSep("├") + "\n");

  for (const job of jobs) {
    const seenDate = job.seenAt.slice(0, 10); // YYYY-MM-DD
    process.stdout.write(
      tableRow(job.url, job.company, job.title, job.status, seenDate) + "\n"
    );
  }

  process.stdout.write(tableSep("└") + "\n");
  process.stderr.write(`${jobs.length} job(s)\n`);
}

async function cmdSet(args: string[]): Promise<void> {
  // Parse positional: set <url-prefix> <status>
  // Optional: --notes "text"
  const positional: string[] = [];
  let notes: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--notes" && args[i + 1] !== undefined) {
      notes = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  const [prefix, rawStatus] = positional;

  if (!prefix || !rawStatus) {
    process.stderr.write(
      "Usage: track.ts set <url-prefix> <status> [--notes \"text\"]\n"
    );
    process.exit(1);
  }

  if (!VALID_STATUSES.includes(rawStatus as Status)) {
    process.stderr.write(
      `Invalid status "${rawStatus}". Valid: ${VALID_STATUSES.join(", ")}\n`
    );
    process.exit(1);
  }

  const status = rawStatus as Status;
  const store = await loadStore();
  const keys = Object.keys(store.jobs);
  const matches = keys.filter((k) => k.startsWith(prefix));

  if (matches.length === 0) {
    process.stderr.write(`No jobs found matching prefix: ${prefix}\n`);
    process.exit(1);
  }

  if (matches.length > 1) {
    process.stderr.write(
      `Multiple jobs match "${prefix}" — be more specific:\n`
    );
    for (const m of matches) {
      process.stderr.write(`  ${m}\n`);
    }
    process.exit(1);
  }

  const key = matches[0];
  const job = store.jobs[key];
  const now = new Date().toISOString();

  job.status = status;
  job.updatedAt = now;
  if (notes !== undefined) {
    job.notes = notes;
  }

  await saveStore(store);
  process.stderr.write(
    `Updated "${key}": status=${status}${notes !== undefined ? `, notes="${notes}"` : ""}\n`
  );
}

async function cmdStats(): Promise<void> {
  const store = await loadStore();
  const jobs = Object.values(store.jobs);

  const counts: Record<Status, number> = {
    new: 0,
    saved: 0,
    applied: 0,
    rejected: 0,
    offer: 0,
    archived: 0,
  };

  for (const job of jobs) {
    if (job.status in counts) {
      counts[job.status]++;
    }
  }

  const total = jobs.length;
  const maxLabel = Math.max(...VALID_STATUSES.map((s) => s.length));

  process.stdout.write("📊 Job Search Stats\n");
  for (const status of VALID_STATUSES) {
    const label = (status + ":").padEnd(maxLabel + 1);
    const count = String(counts[status]).padStart(4);
    process.stdout.write(`  ${label} ${count}\n`);
  }
  process.stdout.write(`  ${"─".repeat(maxLabel + 6)}\n`);
  const totalLabel = ("total:").padEnd(maxLabel + 1);
  const totalCount = String(total).padStart(4);
  process.stdout.write(`  ${totalLabel} ${totalCount}\n`);
}

async function cmdClear(): Promise<void> {
  const store = await loadStore();
  const count = Object.keys(store.jobs).length;

  process.stderr.write(
    `⚠️  This will delete all ${count} tracked jobs. Type 'yes' to confirm: `
  );

  const answer = await new Promise<string>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
    });
    rl.once("line", (line) => {
      rl.close();
      resolve(line.trim());
    });
  });

  if (answer === "yes") {
    await saveStore({ version: 1, jobs: {} });
    process.stderr.write(`Cleared ${count} tracked jobs.\n`);
  } else {
    process.stderr.write("Aborted.\n");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv;

  switch (subcommand) {
    case "list":
      await cmdList(rest);
      break;
    case "set":
      await cmdSet(rest);
      break;
    case "stats":
      await cmdStats();
      break;
    case "clear":
      await cmdClear();
      break;
    default:
      process.stderr.write(
        [
          "Usage:",
          "  tsx scripts/track.ts list [--status <status>]",
          "  tsx scripts/track.ts set <url-prefix> <status> [--notes \"text\"]",
          "  tsx scripts/track.ts stats",
          "  tsx scripts/track.ts clear",
        ].join("\n") + "\n"
      );
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
