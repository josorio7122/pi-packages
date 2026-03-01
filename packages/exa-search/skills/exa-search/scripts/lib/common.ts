import { readFileSync } from "node:fs";

/**
 * Show help text extracted from the JSDoc comment at the top of a script file.
 * Reads lines starting with " * " until " * /" is found.
 */
export function showHelp(scriptUrl: string): void {
  const lines: string[] = [];
  const src = readFileSync(new URL(scriptUrl), "utf8");
  for (const line of src.split("\n")) {
    if (line.startsWith(" * ") || line.startsWith(" */")) {
      if (line.startsWith(" */")) break;
      lines.push(line.slice(3));
    }
  }
  console.log(lines.join("\n"));
  process.exit(0);
}

/**
 * Ensure EXA_API_KEY is set. Exits with an error message if not.
 */
export function requireApiKey(): void {
  if (!process.env.EXA_API_KEY) {
    console.error("Error: EXA_API_KEY environment variable is required.");
    console.error("Get one at: https://dashboard.exa.ai/api-keys");
    process.exit(1);
  }
}

/**
 * Parse CLI args: show help if --help or no args, return query and options.
 */
export function parseArgs(scriptUrl: string): { query: string; opts: Record<string, unknown> } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    showHelp(scriptUrl);
  }

  const query = args[0];
  const opts: Record<string, unknown> = args[1]
    ? (JSON.parse(args[1]) as Record<string, unknown>)
    : {};

  return { query, opts };
}
