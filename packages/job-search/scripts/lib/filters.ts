import type { Job, SearchConfig } from './types.js';
import { isNotConsultancy } from './blacklist.js';
import { normalizeUrl } from './store.js';

const GEO_ALWAYS_DISCARD: string[] = [
  'us only',
  'united states only',
  'remote - us',
  'remote (us)',
  'us residents',
  'us citizens',
  'must be authorized to work in the us',
  'must be authorized to work in the united states',
  'us work authorization',
  'u.s. only',
  'usa only',
  'apac only',
  'remote - apac',
];

const GEO_EU: string[] = ['eu only', 'remote - eu', 'remote (eu)', 'europe only'];
const GEO_UK: string[] = ['uk only', 'remote - uk', 'remote (uk)'];

function isGeoAllowed(job: Job, config: SearchConfig): boolean {
  const haystack = (
    job.location +
    ' ' +
    (job.remote ?? '') +
    ' ' +
    job.description
  ).toLowerCase();

  for (const pattern of GEO_ALWAYS_DISCARD) {
    if (haystack.includes(pattern)) return false;
  }

  const wantsEu = config.location.some((l) => l.toLowerCase().includes('eu'));
  if (!wantsEu) {
    for (const pattern of GEO_EU) {
      if (haystack.includes(pattern)) return false;
    }
  }

  const wantsUk = config.location.some((l) => l.toLowerCase().includes('uk'));
  if (!wantsUk) {
    for (const pattern of GEO_UK) {
      if (haystack.includes(pattern)) return false;
    }
  }

  return true;
}

const CONSULTANCY_DESCRIPTION_PATTERNS: string[] = [
  'staff augmentation',
  'nearshore',
  'outsourcing partner',
  'we place engineers',
  'our clients',
  'client projects',
  'assigned to client',
  'work with our clients',
  'talent marketplace',
  'freelance marketplace',
  'contract staffing',
];

function isNotConsultancyByDescription(job: Job): boolean {
  const desc = job.description.toLowerCase();
  return !CONSULTANCY_DESCRIPTION_PATTERNS.some((p) => desc.includes(p));
}

export function filterJobs(jobs: Job[], config: SearchConfig): Job[] {
  // Step 1: Blacklist — remove consultancies by name/domain
  const afterBlacklist = jobs.filter(isNotConsultancy);

  // Step 1b: Remove consultancies detected by description
  const afterDescCheck = afterBlacklist.filter(isNotConsultancyByDescription);

  // Step 2: Location — remove geo-restricted roles
  const afterLocation = afterDescCheck.filter((job) => isGeoAllowed(job, config));

  // Step 3: Dedup — remove duplicate URLs, keep first occurrence (ats > funded > general)
  const seen = new Set<string>();
  const afterDedup = afterLocation.filter((job) => {
    const key = normalizeUrl(job.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return afterDedup;
}
