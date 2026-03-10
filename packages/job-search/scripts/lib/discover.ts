import { Exa } from 'exa-js';
import Firecrawl from '@mendable/firecrawl-js';
import type { SearchConfig, RawDiscovery } from './types.js';
import { BLACKLISTED_DOMAINS } from './blacklist.js';

const NEWS_DOMAINS = new Set([
  'techcrunch.com',
  'bloomberg.com',
  'prnewswire.com',
  'businesswire.com',
  'reuters.com',
  'cnbc.com',
  'forbes.com',
  'venturebeat.com',
  'wired.com',
  'theverge.com',
  'siliconangle.com',
  'crunchbase.com',
  'pitchbook.com',
  'theaiinsider.tech',
  'techfundingnews.com',
  'yahoo.com',
  'google.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'youtube.com',
  'tiktok.com',
  'medium.com',
]);

const CAREERS_PATH_PATTERNS = ['/jobs', '/careers', '/positions', '/openings'];
const CAREERS_DOMAIN_PATTERNS = ['greenhouse.io', 'lever.co', 'ashby.com'];

function isCareerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (CAREERS_PATH_PATTERNS.some((p) => path.includes(p))) return true;
    if (CAREERS_DOMAIN_PATTERNS.some((d) => parsed.hostname.includes(d))) return true;
  } catch {
    // invalid URL — ignore
  }
  return false;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Extract a URL string from a Firecrawl search result item (SearchResultWeb | Document | SearchResultNews). */
function itemUrl(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'url' in item) {
    return String((item as { url: unknown }).url ?? '');
  }
  return '';
}

/** Extract a snippet string from a Firecrawl search result item. */
function itemSnippet(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const obj = item as Record<string, unknown>;
  return typeof obj['snippet'] === 'string'
    ? obj['snippet']
    : typeof obj['description'] === 'string'
    ? obj['description']
    : undefined;
}

export async function discoverAts(
  config: SearchConfig,
  role: string,
): Promise<RawDiscovery[]> {
  try {
    const exa = new Exa(process.env.EXA_API_KEY);
    const query = `${role} ${config.stack.join(' ')} remote`;

    const result = await exa.search(query, {
      numResults: 40,
      type: 'auto',
      includeDomains: ['boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashby.com', 'jobs.ashbyhq.com'],
      includeText: ['remote'],
      excludeText: ['US residents only'],
      contents: {
        maxAgeHours: 720,
        text: true,
      },
    });

    return result.results.map((r) => ({
      url: r.url,
      strategy: 'ats' as const,
      role,
      snippet: r.text ?? undefined,
    }));
  } catch (err) {
    process.stderr.write(`[discoverAts] error: ${err}\n`);
    return [];
  }
}

export async function discoverFunded(
  config: SearchConfig,
  role: string,
): Promise<RawDiscovery[]> {
  try {
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });

    const newsResult = await firecrawl.search(
      `startup raised seed series A funding 2026 hiring ${role} remote`,
      { limit: 10, tbs: 'qdr:m' },
    );

    // SearchData = { web?: [...], news?: [...] }
    const items: unknown[] = [...(newsResult.web ?? []), ...(newsResult.news ?? [])];

    // Collect unique company domains (skip news/aggregator domains)
    const companyDomains: string[] = [];
    const seenDomains = new Set<string>();
    for (const item of items) {
      const url = itemUrl(item);
      if (!url) continue;
      const hostname = hostnameOf(url);
      if (!hostname) continue;
      if (NEWS_DOMAINS.has(hostname)) continue;
      if (seenDomains.has(hostname)) continue;
      seenDomains.add(hostname);
      companyDomains.push(hostname);
      if (companyDomains.length >= 3) break;
    }

    const discoveries: RawDiscovery[] = [];

    for (const domain of companyDomains) {
      try {
        const mapResult = await firecrawl.map(`https://${domain}`, {
          search: 'careers jobs hiring',
          limit: 30,
        });

        // MapData = { links: SearchResultWeb[] }, SearchResultWeb.url is string
        const careerUrls = mapResult.links
          .map((l) => l.url)
          .filter(isCareerUrl)
          .slice(0, 10);

        for (const url of careerUrls) {
          discoveries.push({ url, strategy: 'funded', role });
        }
      } catch (err) {
        process.stderr.write(`[discoverFunded] map failed for ${domain}: ${err}\n`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return discoveries;
  } catch (err) {
    process.stderr.write(`[discoverFunded] error: ${err}\n`);
    return [];
  }
}

export async function discoverGeneral(
  config: SearchConfig,
  role: string,
): Promise<RawDiscovery[]> {
  try {
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });
    const locationTerms = config.location.join(' ');
    const query = `${role} ${config.stack.join(' ')} ${locationTerms} hiring`;

    const result = await firecrawl.search(query, {
      limit: 25,
      tbs: 'qdr:m',
    });

    // SearchData = { web?: [...], news?: [...] }
    const items: unknown[] = [...(result.web ?? []), ...(result.news ?? [])];

    return items
      .filter((item) => {
        const url = itemUrl(item);
        const hostname = hostnameOf(url);
        return hostname !== null && !BLACKLISTED_DOMAINS.has(hostname);
      })
      .map((item) => ({
        url: itemUrl(item),
        strategy: 'general' as const,
        role,
        snippet: itemSnippet(item),
      }));
  } catch (err) {
    process.stderr.write(`[discoverGeneral] error: ${err}\n`);
    return [];
  }
}
