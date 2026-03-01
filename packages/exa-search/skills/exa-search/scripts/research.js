#!/usr/bin/env node
/**
 * Exa research — create and manage deep research tasks.
 *
 * Usage:
 *   node scripts/research.js create <instructions> [options-json]
 *   node scripts/research.js get <research-id> [options-json]
 *   node scripts/research.js poll <research-id> [options-json]
 *   node scripts/research.js list [options-json]
 *   node scripts/research.js run <instructions> [options-json]
 *   node scripts/research.js --help
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
 *   node scripts/research.js create "Research the latest AI developments"
 *   node scripts/research.js get "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *   node scripts/research.js run "What is SpaceX's latest valuation?" '{"model":"exa-research-pro"}'
 *   node scripts/research.js list '{"limit":5}'
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

const subcommand = args[0];
const arg1 = args[1];
const optsArg = args[2] || args[1]; // For 'list', opts is the second arg

if (!process.env.EXA_API_KEY) {
  console.error("Error: EXA_API_KEY environment variable is required.");
  console.error("Get one at: https://dashboard.exa.ai/api-keys");
  process.exit(1);
}

const exa = new Exa();

try {
  switch (subcommand) {
    case "create": {
      if (!arg1) { console.error("Error: instructions required."); process.exit(1); }
      const opts = args[2] ? JSON.parse(args[2]) : {};
      const result = await exa.research.create({
        instructions: arg1,
        ...(opts.model && { model: opts.model }),
        ...(opts.outputSchema && { outputSchema: opts.outputSchema }),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "get": {
      if (!arg1) { console.error("Error: research-id required."); process.exit(1); }
      const opts = args[2] ? JSON.parse(args[2]) : {};
      if (opts.stream) {
        for await (const event of exa.research.get(arg1, { stream: true, ...opts })) {
          console.log(JSON.stringify(event));
        }
      } else {
        const result = await exa.research.get(arg1, opts);
        console.log(JSON.stringify(result, null, 2));
      }
      break;
    }

    case "poll": {
      if (!arg1) { console.error("Error: research-id required."); process.exit(1); }
      const opts = args[2] ? JSON.parse(args[2]) : {};
      const result = await exa.research.pollUntilFinished(arg1, opts);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "run": {
      if (!arg1) { console.error("Error: instructions required."); process.exit(1); }
      const opts = args[2] ? JSON.parse(args[2]) : {};
      const created = await exa.research.create({
        instructions: arg1,
        ...(opts.model && { model: opts.model }),
        ...(opts.outputSchema && { outputSchema: opts.outputSchema }),
      });
      console.error(`Research task created: ${created.researchId} — polling...`);
      const result = await exa.research.pollUntilFinished(created.researchId, {
        pollInterval: opts.pollInterval || 2000,
        timeoutMs: opts.timeoutMs || 600000,
        events: opts.events,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "list": {
      const opts = arg1 ? JSON.parse(arg1) : {};
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
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
