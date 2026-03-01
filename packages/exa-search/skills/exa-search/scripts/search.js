#!/usr/bin/env node
/**
 * Exa search — semantic search and search with contents.
 *
 * Usage:
 *   node scripts/search.js <query> [options-json]
 *   node scripts/search.js --help
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
 *     "maxAgeHours": 168
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   node scripts/search.js "latest AI research"
 *   node scripts/search.js "AI startups" '{"numResults":5,"type":"deep","contents":true}'
 *   node scripts/search.js "React best practices" '{"text":true,"highlights":true,"includeDomains":["react.dev"]}'
 */

import Exa from "exa-js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  const lines = [];
  const src = await import("fs").then(fs => fs.readFileSync(new URL(import.meta.url), "utf8"));
  for (const line of src.split("\n")) {
    if (line.startsWith(" * ") || line.startsWith(" */")) {
      if (line.startsWith(" */")) break;
      lines.push(line.slice(3));
    }
  }
  console.log(lines.join("\n"));
  process.exit(0);
}

const query = args[0];
const opts = args[1] ? JSON.parse(args[1]) : {};

if (!process.env.EXA_API_KEY) {
  console.error("Error: EXA_API_KEY environment variable is required.");
  console.error("Get one at: https://dashboard.exa.ai/api-keys");
  process.exit(1);
}

const exa = new Exa();

// Determine if we need contents
const wantContents = opts.contents || opts.text || opts.highlights || opts.summary;

// Build contents options
let contentsOpts = {};
if (opts.text === true) contentsOpts.text = true;
else if (typeof opts.text === "object") contentsOpts.text = opts.text;
if (opts.highlights === true) contentsOpts.highlights = true;
else if (typeof opts.highlights === "object") contentsOpts.highlights = opts.highlights;
if (opts.summary === true) contentsOpts.summary = true;
else if (typeof opts.summary === "object") contentsOpts.summary = opts.summary;
if (typeof opts.contents === "object") contentsOpts = { ...contentsOpts, ...opts.contents };

// Build search options
const searchOpts = {};
for (const key of [
  "numResults", "type", "includeDomains", "excludeDomains",
  "startCrawlDate", "endCrawlDate", "startPublishedDate", "endPublishedDate",
  "category", "includeText", "excludeText", "useAutoprompt", "moderation",
  "userLocation", "additionalQueries", "outputSchema",
  "subpages", "subpageTarget", "maxAgeHours", "filterEmptyResults"
]) {
  if (opts[key] !== undefined) searchOpts[key] = opts[key];
}

try {
  let result;
  if (wantContents) {
    result = await exa.searchAndContents(query, { ...searchOpts, ...contentsOpts });
  } else {
    result = await exa.search(query, searchOpts);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
