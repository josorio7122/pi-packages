#!/usr/bin/env tsx
/**
 * Exa find similar — find pages similar to a given URL.
 *
 * Usage:
 *   tsx scripts/find-similar.ts <url> [options-json]
 *   tsx scripts/find-similar.ts --help
 *
 * Options JSON (all optional):
 *   {
 *     "numResults": 10,
 *     "contents": true,               // true = text+highlights, or object for fine control
 *     "text": true,                    // shorthand: include text in results
 *     "highlights": true,              // shorthand: include highlights
 *     "summary": true,                 // shorthand: include summary
 *     "excludeSourceDomain": true,     // exclude the source domain from results
 *     "includeDomains": ["example.com"],
 *     "excludeDomains": ["spam.com"],
 *     "startPublishedDate": "2024-01-01T00:00:00.000Z",
 *     "endPublishedDate": "2025-01-01T00:00:00.000Z",
 *     "startCrawlDate": "2024-01-01T00:00:00.000Z",
 *     "endCrawlDate": "2025-01-01T00:00:00.000Z",
 *     "category": "news",
 *     "includeText": ["must contain"],
 *     "excludeText": ["must not contain"]
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   tsx scripts/find-similar.ts "https://react.dev"
 *   tsx scripts/find-similar.ts "https://react.dev" '{"numResults":5,"text":true,"excludeSourceDomain":true}'
 */

import { Exa } from "exa-js";
import {
  parseArgs,
  requireApiKey,
  handleError,
  filterOptions,
  buildContentsOptions,
} from "./lib/common.js";

const { query: url, opts } = parseArgs(import.meta.url);
requireApiKey();

const exa = new Exa();

const wantContents = opts.contents || opts.text || opts.highlights || opts.summary;

const contentsOpts = buildContentsOptions(opts);

const findSimilarKeys = [
  "numResults",
  "excludeSourceDomain",
  "includeDomains",
  "excludeDomains",
  "startCrawlDate",
  "endCrawlDate",
  "startPublishedDate",
  "endPublishedDate",
  "category",
  "includeText",
  "excludeText",
] as const;

const searchOpts = filterOptions(opts, findSimilarKeys);

try {
  let result;
  if (wantContents) {
    result = await exa.findSimilarAndContents(url, { ...searchOpts, ...contentsOpts });
  } else {
    result = await exa.findSimilar(url, searchOpts);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  handleError(err);
}
