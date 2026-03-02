#!/usr/bin/env tsx
/**
 * Exa get contents — retrieve page contents by URL.
 *
 * Usage:
 *   tsx scripts/contents.ts <url-or-urls-json> [options-json]
 *   tsx scripts/contents.ts --help
 *
 * First argument: a single URL string, or a JSON array of URLs.
 *
 * Options JSON (all optional):
 *   {
 *     "text": true,                         // or { "maxCharacters": 5000, "includeHtmlTags": false }
 *     "highlights": true,                   // or { "query": "AI", "numSentences": 3 }
 *     "summary": true,                      // or { "query": "summarize pricing" }
 *     "maxAgeHours": 168,                   // 0 = always fresh, -1 = cache only
 *     "filterEmptyResults": true,
 *     "subpages": 3,
 *     "subpageTarget": "pricing"
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   tsx scripts/contents.ts "https://example.com/article"
 *   tsx scripts/contents.ts "https://example.com" '{"text":{"maxCharacters":2000}}'
 *   tsx scripts/contents.ts '["https://a.com","https://b.com"]' '{"text":true,"highlights":true}'
 */

import {
  showHelp,
  requireApiKey,
  filterOptions,
  createClient,
  executeAndPrint,
} from "./lib/common.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  showHelp(import.meta.url);
}

let urls: string | string[] = args[0];
try {
  urls = JSON.parse(urls) as string[];
} catch {
  // Single URL string — keep as-is
}

const opts: Record<string, unknown> = args[1]
  ? (JSON.parse(args[1]) as Record<string, unknown>)
  : { text: true };

requireApiKey();

const exa = createClient();

const contentsOpts = filterOptions(opts, [
  "text",
  "highlights",
  "summary",
  "maxAgeHours",
  "filterEmptyResults",
  "subpages",
  "subpageTarget",
]);

await executeAndPrint(async () => {
  return await exa.getContents(urls, contentsOpts);
});
