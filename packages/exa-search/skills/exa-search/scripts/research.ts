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

import { Exa } from "exa-js";
import { showHelp, requireApiKey, handleError } from "./lib/common.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  showHelp(import.meta.url);
}

const subcommand = args[0];
const arg1 = args[1];

requireApiKey();

const exa = new Exa();

try {
  switch (subcommand) {
    case "create": {
      if (!arg1) {
        console.error("Error: instructions required.");
        process.exit(1);
      }
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const result = await exa.research.create({
        instructions: arg1,
        model:
          (opts.model as "exa-research-fast" | "exa-research" | "exa-research-pro") ?? undefined,
        outputSchema: (opts.outputSchema as Record<string, unknown>) ?? undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get": {
      if (!arg1) {
        console.error("Error: research-id required.");
        process.exit(1);
      }
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      if (opts.stream) {
        const streamResult = await exa.research.get(arg1, { stream: true, ...opts });
        for await (const event of streamResult) {
          console.log(JSON.stringify(event));
        }
      } else {
        const result = await exa.research.get(arg1, opts);
        console.log(JSON.stringify(result, null, 2));
      }
      break;
    }

    case "poll": {
      if (!arg1) {
        console.error("Error: research-id required.");
        process.exit(1);
      }
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const result = await exa.research.pollUntilFinished(arg1, opts);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "run": {
      if (!arg1) {
        console.error("Error: instructions required.");
        process.exit(1);
      }
      const opts: Record<string, unknown> = args[2]
        ? (JSON.parse(args[2]) as Record<string, unknown>)
        : {};
      const created = await exa.research.create({
        instructions: arg1,
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
