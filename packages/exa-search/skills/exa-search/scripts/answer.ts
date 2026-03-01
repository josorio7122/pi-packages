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

const query = args[0];
const opts: Record<string, unknown> = args[1]
  ? (JSON.parse(args[1]) as Record<string, unknown>)
  : {};

if (!process.env.EXA_API_KEY) {
  console.error("Error: EXA_API_KEY environment variable is required.");
  console.error("Get one at: https://dashboard.exa.ai/api-keys");
  process.exit(1);
}

const exa = new Exa();

const answerOpts: Record<string, unknown> = {};
for (const key of ["text", "model", "systemPrompt", "outputSchema", "userLocation"] as const) {
  if (opts[key] !== undefined) answerOpts[key] = opts[key];
}

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
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
}
