#!/usr/bin/env tsx
/**
 * Exa answer — get AI-generated answers with citations.
 *
 * Usage:
 *   tsx scripts/answer.ts <query> [options-json]
 *   tsx scripts/answer.ts --help
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
 *   tsx scripts/answer.ts "What is the latest Next.js version?"
 *   tsx scripts/answer.ts "Compare React and Vue" '{"text":true}'
 *   tsx scripts/answer.ts "SpaceX valuation" '{"model":"exa","stream":true}'
 *   tsx scripts/answer.ts "List top 3 ORMs" '{"outputSchema":{"type":"object","properties":{"items":{"type":"array","items":{"type":"string"}}}}}'
 */

import { Exa } from "exa-js";
import { parseArgs, requireApiKey, handleError, filterOptions } from "./lib/common.js";

const { query, opts } = parseArgs(import.meta.url);
requireApiKey();

const exa = new Exa();

const answerOpts = filterOptions(opts, [
  "text",
  "model",
  "systemPrompt",
  "outputSchema",
  "userLocation",
]);

try {
  if (opts.stream) {
    // Streaming mode — write chunks as they arrive
    for await (const chunk of exa.streamAnswer(query, answerOpts)) {
      const typedChunk = chunk as { content?: string; citations?: unknown };
      if (typedChunk.content) process.stdout.write(typedChunk.content);
      if (typedChunk.citations) {
        process.stdout.write("\n");
        console.log(JSON.stringify({ citations: typedChunk.citations }, null, 2));
      }
    }
    process.stdout.write("\n");
  } else {
    const result = await exa.answer(query, answerOpts);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (err) {
  handleError(err);
}
