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

import { Exa } from "exa-js";
import { readFileSync } from "fs";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  const lines: string[] = [];
  const src = readFileSync(new URL(import.meta.url), "utf8");
  for (const line of src.split("\n")) {
    if (line.startsWith(" * ") || line.startsWith(" */")) {
      if (line.startsWith(" */")) break;
      lines.push(line.slice(3));
    }
  }
  console.log(lines.join("\n"));
  process.exit(0);
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

if (!process.env.EXA_API_KEY) {
  console.error("Error: EXA_API_KEY environment variable is required.");
  console.error("Get one at: https://dashboard.exa.ai/api-keys");
  process.exit(1);
}

const exa = new Exa();

const contentsOpts: Record<string, unknown> = {};
for (const key of [
  "text",
  "highlights",
  "summary",
  "maxAgeHours",
  "filterEmptyResults",
  "subpages",
  "subpageTarget",
] as const) {
  if (opts[key] !== undefined) contentsOpts[key] = opts[key];
}

try {
  const result = await exa.getContents(urls, contentsOpts);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
}
