import Firecrawl from '@mendable/firecrawl-js';
import type { RawDiscovery, Job } from './types.js';
import { normalizeUrl } from './store.js';

const JOB_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const },
    company: { type: 'string' as const },
    location: { type: 'string' as const },
    remote: { type: 'string' as const },
    salary: { type: 'string' as const },
    jobType: { type: 'string' as const },
    description: { type: 'string' as const },
    requirements: { type: 'array' as const, items: { type: 'string' as const } },
    techStack: { type: 'array' as const, items: { type: 'string' as const } },
    applyUrl: { type: 'string' as const },
  },
  required: ['title', 'company', 'location'] as const,
};

// compare-apis.ts confirmed: firecrawl.scrape() with formats as array of
// { type: 'json', schema } objects. Result has .json directly on the result.

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let index = 0;

  async function next(): Promise<void> {
    const i = index++;
    if (i >= tasks.length) return;
    try {
      const value = await tasks[i]();
      results[i] = { status: 'fulfilled', value };
    } catch (reason) {
      results[i] = { status: 'rejected', reason };
    }
    return next();
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
  return results;
}

export async function extractJobs(discoveries: RawDiscovery[]): Promise<Job[]> {
  const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });

  // Discoveries are already deduped and pre-filtered by search.ts
  const deduped = discoveries;

  // Pre-filter: skip URLs that are clearly not individual job listings
  // This saves ~5 Firecrawl credits per skipped URL (1 scrape + 4 JSON extraction)
  const JUNK_DOMAINS = new Set([
    'indeed.com', 'glassdoor.com', 'jooble.org', 'linkedin.com',
    'dailyremote.com', 'remoterocketship.com', 'remotefront.com',
    'careervault.io', 'tallo.com', 'jaabz.com', 'dynamitejobs.com',
    'lensa.com', 'talent.com', 'ziprecruiter.com', 'whoishiring.jobs',
    'hnhiring.com', 'workingnomads.com', 'nchelluri.github.io',
    'remoteok.com', 'weworkremotely.com', 'flexjobs.com',
    'freelancer.com', 'upwork.com', 'fiverr.com',
    'stackoverflow.com', 'wellfound.com', 'angel.co',
    'simplyhired.com', 'monster.com', 'careerbuilder.com',
    'dice.com', 'hired.com', 'triplebyte.com',
    'toptal.com', 'andela.com', 'bairesdev.com', 'turing.com',
    'crossover.com', 'arc.dev', 'workana.com', 'gun.io',
    'jobgether.com', 'truelogic.io', 'globant.com',
  ]);

  const JUNK_PATH_PATTERNS = [
    '/jobs?', '/search?', '/q-', '/tag/', '/technologies/',
    '/country/', '/location/', '/category/',
  ];

  const filtered: RawDiscovery[] = [];
  let skippedCount = 0;
  for (const d of deduped) {
    try {
      const parsed = new URL(d.url);
      const hostname = parsed.hostname.replace(/^www\./, '');
      // Skip junk aggregator domains
      if (JUNK_DOMAINS.has(hostname)) { skippedCount++; continue; }
      // Skip if any parent domain matches (e.g., co.jooble.org)
      const parts = hostname.split('.');
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(i).join('.');
        if (JUNK_DOMAINS.has(parent)) { skippedCount++; continue; }
      }
      // Skip directory/search pages (not individual job listings)
      const path = parsed.pathname + parsed.search;
      if (JUNK_PATH_PATTERNS.some((p) => path.includes(p))) { skippedCount++; continue; }
      // Skip YC directory pages (not individual company job pages)
      if (hostname === 'ycombinator.com' || hostname === 'www.ycombinator.com') {
        if (!parsed.pathname.includes('/companies/') || !parsed.pathname.includes('/jobs')) {
          skippedCount++;
          continue;
        }
      }
      filtered.push(d);
    } catch {
      filtered.push(d); // keep if URL can't be parsed
    }
  }

  // Cap total extractions to save credits (5 credits per URL)
  const MAX_EXTRACTIONS = 40;
  const toExtract = filtered.slice(0, MAX_EXTRACTIONS);
  const cappedCount = filtered.length - toExtract.length;

  if (skippedCount > 0) {
    process.stderr.write(`⏭️  Skipped ${skippedCount} junk/aggregator URLs (saved ~${skippedCount * 5} credits)\n`);
  }
  if (cappedCount > 0) {
    process.stderr.write(`⚠️  Capped at ${MAX_EXTRACTIONS} extractions (${cappedCount} deferred)\n`);
  }
  process.stderr.write(`📄 Extracting ${toExtract.length} URLs (concurrency 5)...\n`);

  const tasks = toExtract.map((discovery) => async (): Promise<Job> => {
    const { url, strategy, role } = discovery;

    const result = await firecrawl.scrape(url, {
      formats: [
        {
          type: 'json',
          schema: JOB_SCHEMA,
        },
      ],
    });

    // Response has .json directly on the result (confirmed by compare-apis.ts)
    const data = (result as unknown as { json?: Record<string, unknown>; data?: { json?: Record<string, unknown> } }).json
      ?? (result as unknown as { data?: { json?: Record<string, unknown> } }).data?.json
      ?? {};

    process.stderr.write('.');

    const job: Job = {
      id: normalizeUrl(url),
      url,
      title: String(data['title'] ?? ''),
      company: String(data['company'] ?? ''),
      location: String(data['location'] ?? ''),
      remote: data['remote'] != null ? String(data['remote']) : null,
      salary: data['salary'] != null ? String(data['salary']) : null,
      jobType: data['jobType'] != null ? String(data['jobType']) : null,
      description: String(data['description'] ?? ''),
      requirements: Array.isArray(data['requirements'])
        ? (data['requirements'] as unknown[]).map(String)
        : [],
      techStack: Array.isArray(data['techStack'])
        ? (data['techStack'] as unknown[]).map(String)
        : [],
      applyUrl: data['applyUrl'] != null ? String(data['applyUrl']) : null,
      strategy,
      role,
      discoveredAt: new Date().toISOString(),
    };

    return job;
  });

  const settled = await runWithConcurrency(tasks, 5);

  // Newline after dots
  process.stderr.write('\n');

  const jobs: Job[] = [];
  for (const result of settled) {
    if (result.status === 'rejected') continue;
    const job = result.value;
    // Discard results where both title and company are falsy
    if (!job.title && !job.company) continue;
    // Discard junk: "Not Found" pages, directory/index pages, non-job pages
    const titleLower = job.title.toLowerCase();
    if (titleLower.includes('not found') || titleLower.includes('page not found')) continue;
    if (titleLower.includes('not applicable')) continue;
    if (titleLower.startsWith('jobs at ') && !titleLower.includes('engineer')) continue;
    if (titleLower.startsWith('find the best') || titleLower.startsWith('remote jobs in')) continue;
    if (titleLower.startsWith('remote entry-level')) continue;
    // Discard YC directory pages
    if (job.url.includes('ycombinator.com/jobs') && !job.url.includes('/companies/')) continue;
    if (job.url.includes('ycombinator.com/careers')) continue;
    jobs.push(job);
  }

  return jobs;
}
