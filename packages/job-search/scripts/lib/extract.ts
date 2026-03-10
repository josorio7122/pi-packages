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

  // Deduplicate by normalized URL — keep first occurrence
  const seen = new Set<string>();
  const deduped: RawDiscovery[] = [];
  for (const d of discoveries) {
    const key = normalizeUrl(d.url);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(d);
    }
  }

  process.stderr.write(`📄 Extracting ${deduped.length} URLs (concurrency 5)...\n`);

  const tasks = deduped.map((discovery) => async (): Promise<Job> => {
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
    jobs.push(job);
  }

  return jobs;
}
