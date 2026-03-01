#!/usr/bin/env node
/**
 * Exa answer — get AI-generated answers with citations.
 *
 * Usage:
 *   node scripts/answer.js <query> [options-json]
 *   node scripts/answer.js --help
 *
 * Options JSON (all optional):
 *   {
 *     "text": true,              // include full text in citation results
 *     "model": "exa",            // "exa" (default)
 *     "systemPrompt": "...",     // guide the LLM behavior
 *     "outputSchema": {},        // JSON Schema for structured output
 *     "stream": false,           // stream chunks to stdout
 *     "userLocation": "US"
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   node scripts/answer.js "What is the latest Next.js version?"
 *   node scripts/answer.js "Compare React and Vue" '{"text":true}'
 *   node scripts/answer.js "SpaceX valuation" '{"model":"exa","stream":true}'
 *   node scripts/answer.js "List top 3 ORMs" '{"outputSchema":{"type":"object","properties":{"items":{"type":"array","items":{"type":"string"}}}}}'
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

const answerOpts = {};
for (const key of ["text", "model", "systemPrompt", "outputSchema", "userLocation"]) {
  if (opts[key] !== undefined) answerOpts[key] = opts[key];
}

try {
  if (opts.stream) {
    // Streaming mode — write chunks as they arrive
    for await (const chunk of exa.streamAnswer(query, answerOpts)) {
      if (chunk.content) process.stdout.write(chunk.content);
      if (chunk.citations) {
        process.stdout.write("\n");
        console.log(JSON.stringify({ citations: chunk.citations }, null, 2));
      }
    }
    process.stdout.write("\n");
  } else {
    const result = await exa.answer(query, answerOpts);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
