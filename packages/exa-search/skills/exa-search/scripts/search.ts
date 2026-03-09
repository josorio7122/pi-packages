#!/usr/bin/env tsx
/**
 * Exa search — semantic search and search with contents.
 *
 * Usage:
 *   tsx scripts/search.ts <query> [options-json]
 *   tsx scripts/search.ts --help
 *
 * Options JSON (all optional):
 *   {
 *     "numResults": 10,
 *     "type": "auto",                  // "auto"|"fast"|"deep"|"deep-reasoning"|"deep-max"|"instant"
 *     "contents": true,                // true = text+highlights, or object for fine control
 *     "text": true,                    // shorthand: include text in results
 *     "highlights": true,              // shorthand: include highlights
 *     "summary": true,                 // shorthand: include summary
 *     "includeDomains": ["example.com"],
 *     "excludeDomains": ["spam.com"],
 *     "startPublishedDate": "2024-01-01T00:00:00.000Z",
 *     "endPublishedDate": "2025-01-01T00:00:00.000Z",
 *     "startCrawlDate": "2024-01-01T00:00:00.000Z",
 *     "endCrawlDate": "2025-01-01T00:00:00.000Z",
 *     "category": "news",             // "company"|"research paper"|"news"|"pdf"|"tweet"|"personal site"|"financial report"|"people"
 *     "includeText": ["must contain"],
 *     "excludeText": ["must not contain"],
 *     "useAutoprompt": true,
 *     "moderation": false,
 *     "userLocation": "US",
 *     "additionalQueries": ["alt query 1"],  // deep search only, max 5
 *     "outputSchema": {},              // deep search structured output
 *     "subpages": 0,
 *     "subpageTarget": "pricing",
 *     "livecrawl": "auto",              // "never"|"fallback"|"always"|"auto"|"preferred" - live-crawl pages for fresh data
 *     "livecrawlTimeout": 10000,         // timeout in ms for live crawl
 *     "maxAgeHours": 168
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   tsx scripts/search.ts "latest AI research"
 *   tsx scripts/search.ts "AI startups" '{"numResults":5,"type":"deep","contents":true}'
 *   tsx scripts/search.ts "React best practices" '{"text":true,"highlights":true,"includeDomains":["react.dev"]}'
 */

import {
  parseArgs,
  requireApiKey,
  filterOptions,
  buildContentsOptions,
  createClient,
  executeAndPrint,
} from "./lib/common.js";

const { query, opts } = parseArgs(import.meta.url);
requireApiKey();

const exa = createClient();

// Determine if we need contents
const wantContents = opts.contents || opts.text || opts.highlights || opts.summary;

// Build contents options
const contentsOpts = buildContentsOptions(opts);

// Build search options
const searchKeys = [
  "numResults",
  "type",
  "includeDomains",
  "excludeDomains",
  "startCrawlDate",
  "endCrawlDate",
  "startPublishedDate",
  "endPublishedDate",
  "category",
  "includeText",
  "excludeText",
  "useAutoprompt",
  "moderation",
  "userLocation",
  "additionalQueries",
  "outputSchema",
  "subpages",
  "subpageTarget",
  "livecrawl",
  "livecrawlTimeout",
  "maxAgeHours",
  "filterEmptyResults",
] as const;

const searchOpts = filterOptions(opts, searchKeys);

await executeAndPrint(async () => {
  if (wantContents) {
    return await exa.searchAndContents(query, { ...searchOpts, ...contentsOpts });
  } else {
    return await exa.search(query, searchOpts);
  }
});
