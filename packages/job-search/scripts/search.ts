#!/usr/bin/env tsx
/**
 * search.ts — Job search CLI
 *
 * Usage:
 *   tsx scripts/search.ts --roles "founding engineer, senior backend" --stack "node typescript" --location "remote,latam,co"
 *   tsx scripts/search.ts --roles "senior fullstack" --stack "node typescript react" --new-only
 *
 * Requires: EXA_API_KEY, FIRECRAWL_API_KEY
 */

import type { SearchConfig, RawDiscovery, Store } from './lib/types.js';
import { discoverAts, discoverFunded, discoverGeneral } from './lib/discover.js';
import { extractJobs } from './lib/extract.js';
import { filterJobs } from './lib/filters.js';
import { loadStore, saveStore, upsertJobs, normalizeUrl } from './lib/store.js';

function printUsage(): void {
  process.stderr.write(
    [
      'Usage: tsx scripts/search.ts --roles "role1, role2" --stack "tech1 tech2" [options]',
      '',
      'Required:',
      '  --roles "role1, role2"         Comma-separated list of job roles',
      '  --stack "tech1 tech2"          Space-separated list of technologies',
      '',
      'Options:',
      '  --location "remote,latam,co"   Comma-separated locations (default: remote,latam)',
      '  --new-only                     Only output jobs not previously seen',
      '  --limit N                      Max results to output (default: 30)',
      '',
    ].join('\n'),
  );
}

export function parseArgs(argv: string[]): SearchConfig {
  let roles: string[] | null = null;
  let stack: string[] | null = null;
  let location: string[] = ['remote', 'latam'];
  let newOnly = false;
  let limit = 30;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--roles') {
      const val = argv[++i];
      roles = val.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--stack') {
      const val = argv[++i];
      stack = val.split(' ').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--location') {
      const val = argv[++i];
      location = val.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--new-only') {
      newOnly = true;
    } else if (arg === '--limit') {
      const val = parseInt(argv[++i], 10);
      if (!isNaN(val) && val > 0) limit = val;
    }
  }

  if (!roles || roles.length === 0) {
    printUsage();
    process.stderr.write('❌ --roles is required\n');
    process.exit(1);
  }

  if (!stack || stack.length === 0) {
    printUsage();
    process.stderr.write('❌ --stack is required\n');
    process.exit(1);
  }

  return { roles, stack, location, newOnly, limit };
}

function preFilterDiscoveries(discoveries: RawDiscovery[], store: Store): RawDiscovery[] {
  const existingUrls = new Set(Object.keys(store.jobs));

  // Location patterns to reject based on snippet text
  const REJECT_PATTERNS = [
    'us only', 'united states only', 'usa only', 'u.s. only',
    'us residents only', 'us citizens only',
    'must be authorized to work in the united states',
    'must be authorized to work in the us',
    'us work authorization required',
  ];

  // Consultancy patterns in snippets
  const CONSULTANCY_PATTERNS = [
    'staff augmentation', 'nearshore', 'outsourcing partner',
    'our clients', 'client projects', 'talent marketplace',
  ];

  const seen = new Set<string>();
  const filtered: RawDiscovery[] = [];
  let skippedStore = 0;
  let skippedLocation = 0;
  let skippedConsultancy = 0;
  let skippedDupe = 0;

  for (const d of discoveries) {
    const normalized = normalizeUrl(d.url);

    // Skip duplicates within this batch
    if (seen.has(normalized)) { skippedDupe++; continue; }
    seen.add(normalized);

    // Skip URLs already in the store
    if (existingUrls.has(normalized)) { skippedStore++; continue; }

    // Check snippet for location restrictions
    const snippet = (d.snippet || '').toLowerCase();
    if (snippet && REJECT_PATTERNS.some((p) => snippet.includes(p))) {
      skippedLocation++;
      continue;
    }

    // Check snippet for consultancy signals
    if (snippet && CONSULTANCY_PATTERNS.some((p) => snippet.includes(p))) {
      skippedConsultancy++;
      continue;
    }

    filtered.push(d);
  }

  if (skippedStore > 0) process.stderr.write(`   ↳ ${skippedStore} already tracked\n`);
  if (skippedDupe > 0) process.stderr.write(`   ↳ ${skippedDupe} duplicates\n`);
  if (skippedLocation > 0) process.stderr.write(`   ↳ ${skippedLocation} US-only (from snippet)\n`);
  if (skippedConsultancy > 0) process.stderr.write(`   ↳ ${skippedConsultancy} consultancy (from snippet)\n`);

  return filtered;
}

async function main(): Promise<void> {
  if (!process.env.EXA_API_KEY) {
    process.stderr.write('❌ EXA_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  if (!process.env.FIRECRAWL_API_KEY) {
    process.stderr.write('❌ FIRECRAWL_API_KEY environment variable is not set\n');
    process.exit(1);
  }

  const config = parseArgs(process.argv.slice(2));

  process.stderr.write(
    `🔍 Searching for ${config.roles.length} role(s): ${config.roles.join(', ')}\n`,
  );

  // Load store before discovery to know which jobs existed before this run
  const store = await loadStore();
  const preExistingKeys = new Set(Object.keys(store.jobs));

  // For each role, run all 3 strategies in parallel
  const allDiscoveries: RawDiscovery[] = [];

  await Promise.all(
    config.roles.map(async (role) => {
      const [ats, funded, general] = await Promise.allSettled([
        discoverAts(config, role),
        discoverFunded(config, role),
        discoverGeneral(config, role),
      ]);

      for (const result of [ats, funded, general]) {
        if (result.status === 'fulfilled') allDiscoveries.push(...result.value);
      }
    }),
  );

  process.stderr.write(`📡 Discovered ${allDiscoveries.length} candidate URLs\n`);

  // Pre-filter: remove already-tracked URLs and obvious mismatches BEFORE extraction
  const preFiltered = preFilterDiscoveries(allDiscoveries, store);
  process.stderr.write(`🧹 ${allDiscoveries.length} → ${preFiltered.length} after pre-filtering (${allDiscoveries.length - preFiltered.length} skipped)\n`);

  const jobs = await extractJobs(preFiltered);
  process.stderr.write(`🔍 Extracted ${jobs.length} jobs\n`);

  // Filter
  const filtered = filterJobs(jobs, config);
  process.stderr.write(`✅ ${filtered.length} jobs after filtering\n`);

  // Upsert into store and save
  upsertJobs(store, filtered);
  await saveStore(store);

  // Determine output — apply --new-only if requested
  let output = filtered;
  let newCount = 0;

  if (config.newOnly) {
    output = filtered.filter((job) => !preExistingKeys.has(job.id));
  }

  // Count how many are actually new (regardless of --new-only)
  newCount = filtered.filter((job) => !preExistingKeys.has(job.id)).length;

  // Slice to limit
  output = output.slice(0, config.limit);

  // Output results to stdout
  console.log(JSON.stringify(output, null, 2));

  const estimatedCredits = filtered.length * 5 + config.roles.length * 4; // 5 per scrape + ~4 per search/map
  process.stderr.write(`📊 ${output.length} results output (${newCount} new) | ~${estimatedCredits} Firecrawl credits used\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
