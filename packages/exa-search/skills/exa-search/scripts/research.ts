#!/usr/bin/env tsx
/**
 * Exa research — create and manage deep research tasks.
 *
 * Usage:
 *   tsx scripts/research.ts create <instructions> [options-json]
 *   tsx scripts/research.ts get <research-id> [options-json]
 *   tsx scripts/research.ts poll <research-id> [options-json]
 *   tsx scripts/research.ts list [options-json]
 *   tsx scripts/research.ts run <instructions> [options-json]
 *   tsx scripts/research.ts --help
 *
 * Subcommands:
 *   create   — Start a new research task (returns immediately with researchId)
 *   get      — Get the current status/result of a research task
 *   poll     — Create and poll until finished (blocks until complete)
 *   list     — List research tasks
 *   run      — Create + poll in one step (convenience)
 *
 * Options JSON for create/run:
 *   {
 *     "model": "exa-research-fast",   // "exa-research-fast"|"exa-research"|"exa-research-pro"
 *     "outputSchema": {}              // JSON Schema for structured output
 *   }
 *
 * Options JSON for get:
 *   {
 *     "stream": false,                // stream SSE events
 *     "events": false                 // include event log
 *   }
 *
 * Options JSON for poll:
 *   {
 *     "pollInterval": 1000,           // ms between polls (default 1000)
 *     "timeoutMs": 600000,            // max wait time (default 10 min)
 *     "events": false
 *   }
 *
 * Options JSON for list:
 *   {
 *     "limit": 10,
 *     "cursor": "..."
 *   }
 *
 * Environment:
 *   EXA_API_KEY — required
 *
 * Examples:
 *   tsx scripts/research.ts create "Research the latest AI developments"
 *   tsx scripts/research.ts get "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *   tsx scripts/research.ts run "What is SpaceX's latest valuation?" '{"model":"exa-research-pro"}'
 *   tsx scripts/research.ts list '{"limit":5}'
 */

import {
  showHelp,
  requireApiKey,
  handleError,
  requireArg,
  createClient,
} from "./lib/common.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  showHelp(import.meta.url);
}

const subcommand = args[0];
const arg1 = args[1];

requireApiKey();

const exa = createClient();

try {
  switch (subcommand) {
    case "create": {
      const instructions = requireArg(arg1, "instructions");
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const result = await exa.research.create({
        instructions,
        model:
          (opts.model as "exa-research-fast" | "exa-research" | "exa-research-pro") ?? undefined,
        outputSchema: (opts.outputSchema as Record<string, unknown>) ?? undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get": {
      const researchId = requireArg(arg1, "research-id");
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      if (opts.stream) {
        const streamResult = await exa.research.get(researchId, { stream: true, ...opts });
        for await (const event of streamResult) {
          console.log(JSON.stringify(event));
        }
      } else {
        const result = await exa.research.get(researchId, opts);
        console.log(JSON.stringify(result, null, 2));
      }
      break;
    }

    case "poll": {
      const researchId = requireArg(arg1, "research-id");
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const result = await exa.research.pollUntilFinished(researchId, opts);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "run": {
      const instructions = requireArg(arg1, "instructions");
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const created = await exa.research.create({
        instructions,
        model:
          (opts.model as "exa-research-fast" | "exa-research" | "exa-research-pro") ?? undefined,
        outputSchema: (opts.outputSchema as Record<string, unknown>) ?? undefined,
      });
      const createdTyped = created as { researchId: string };
      console.error(`Research task created: ${createdTyped.researchId} — polling...`);
      const result = await exa.research.pollUntilFinished(createdTyped.researchId, {
        pollInterval: (opts.pollInterval as number) || 2000,
        timeoutMs: (opts.timeoutMs as number) || 600000,
        events: opts.events as boolean | undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "list": {
      const opts: Record<string, unknown> = arg1
        ? (JSON.parse(arg1) as Record<string, unknown>)
        : {};
      const result = await exa.research.list(opts);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Error: Unknown subcommand "${subcommand}".`);
      console.error("Valid subcommands: create, get, poll, list, run");
      process.exit(1);
  }
} catch (err) {
  handleError(err);
}
