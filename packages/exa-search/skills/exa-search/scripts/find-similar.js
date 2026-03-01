#!/usr/bin/env node
/**
 * Exa find similar — find pages similar to a given URL.
 *
 * Usage:
 *   node scripts/find-similar.js <url> [options-json]
 *   node scripts/find-similar.js --help
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
 *   node scripts/find-similar.js "https://react.dev"
 *   node scripts/find-similar.js "https://react.dev" '{"numResults":5,"text":true,"excludeSourceDomain":true}'
 */

import Exa from "exa-js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  const lines = [];
  const src = await import("fs").then((fs) => fs.readFileSync(new URL(import.meta.url), "utf8"));
  for (const line of src.split("\n")) {
    if (line.startsWith(" * ") || line.startsWith(" */")) {
      if (line.startsWith(" */")) break;
      lines.push(line.slice(3));
    }
  }
  console.log(lines.join("\n"));
  process.exit(0);
}

const url = args[0];
const opts = args[1] ? JSON.parse(args[1]) : {};

if (!process.env.EXA_API_KEY) {
  console.error("Error: EXA_API_KEY environment variable is required.");
  console.error("Get one at: https://dashboard.exa.ai/api-keys");
  process.exit(1);
}

const exa = new Exa();

const wantContents = opts.contents || opts.text || opts.highlights || opts.summary;

let contentsOpts = {};
if (opts.text === true) contentsOpts.text = true;
else if (typeof opts.text === "object") contentsOpts.text = opts.text;
if (opts.highlights === true) contentsOpts.highlights = true;
else if (typeof opts.highlights === "object") contentsOpts.highlights = opts.highlights;
if (opts.summary === true) contentsOpts.summary = true;
else if (typeof opts.summary === "object") contentsOpts.summary = opts.summary;
if (typeof opts.contents === "object") contentsOpts = { ...contentsOpts, ...opts.contents };

const searchOpts = {};
for (const key of [
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
]) {
  if (opts[key] !== undefined) searchOpts[key] = opts[key];
}

try {
  let result;
  if (wantContents) {
    result = await exa.findSimilarAndContents(url, { ...searchOpts, ...contentsOpts });
  } else {
    result = await exa.findSimilar(url, searchOpts);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
