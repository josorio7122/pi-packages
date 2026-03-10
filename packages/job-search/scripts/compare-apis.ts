#!/usr/bin/env tsx
/**
 * compare-apis.ts — Compare Exa vs Firecrawl for job search use cases
 *
 * Usage: tsx scripts/compare-apis.ts
 *
 * Requires: EXA_API_KEY, FIRECRAWL_API_KEY environment variables
 *
 * Uses:
 *   - exa-js v2  — exa.search(), exa.getContents()
 *   - @mendable/firecrawl-js v4 (v2 client) — firecrawl.search(), firecrawl.scrape()
 *     - search() returns SearchData { web?: SearchResultWeb[] }
 *     - scrape() accepts formats: [{ type: 'json', schema, prompt }]
 */

import Exa from "exa-js";
import Firecrawl from "@mendable/firecrawl-js";

const exa = new Exa(process.env.EXA_API_KEY);
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

interface TestResult {
  provider: string;
  test: string;
  timeMs: number;
  resultCount: number;
  sample: unknown;
  error?: string;
}

async function timed<T>(
  fn: () => Promise<T>
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

// ─── Test 1: ATS Job Search ───────────────────────────────────────────────

async function test1Exa(): Promise<TestResult> {
  try {
    const { result, ms } = await timed(() =>
      exa.search("senior backend engineer node typescript remote", {
        numResults: 10,
        type: "auto",
        livecrawl: "preferred",
        maxAgeHours: 720,
        includeDomains: [
          "boards.greenhouse.io",
          "jobs.lever.co",
          "jobs.ashby.com",
        ],
        includeText: ["remote"],
        // excludeText supports max 1 phrase of up to 5 words
        excludeText: ["US residents only"],
      })
    );
    return {
      provider: "Exa",
      test: "ATS Job Search",
      timeMs: ms,
      resultCount: result.results.length,
      sample: result.results.slice(0, 3).map((r: any) => ({
        title: r.title,
        url: r.url,
      })),
    };
  } catch (e: any) {
    return {
      provider: "Exa",
      test: "ATS Job Search",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

async function test1Firecrawl(): Promise<TestResult> {
  try {
    // v2 search() — returns SearchData { web?: SearchResultWeb[] }
    const { result, ms } = await timed(() =>
      firecrawl.search(
        "senior backend engineer node typescript remote site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com",
        {
          limit: 10,
          tbs: "qdr:m",
        }
      )
    );
    const web = result.web ?? [];
    return {
      provider: "Firecrawl",
      test: "ATS Job Search",
      timeMs: ms,
      resultCount: web.length,
      sample: web.slice(0, 3).map((r: any) => ({
        title: r.title,
        url: r.url,
      })),
    };
  } catch (e: any) {
    return {
      provider: "Firecrawl",
      test: "ATS Job Search",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

// ─── Test 2: Funded Startup Discovery ─────────────────────────────────────

async function test2Exa(): Promise<TestResult> {
  try {
    const { result, ms } = await timed(() =>
      exa.search(
        "startup raised seed series A funding 2026 hiring engineers remote",
        {
          numResults: 10,
          type: "auto",
          livecrawl: "preferred",
          maxAgeHours: 720,
          category: "news",
        }
      )
    );
    return {
      provider: "Exa",
      test: "Funded Startup Discovery",
      timeMs: ms,
      resultCount: result.results.length,
      sample: result.results.slice(0, 3).map((r: any) => ({
        title: r.title,
        url: r.url,
        publishedDate: r.publishedDate,
      })),
    };
  } catch (e: any) {
    return {
      provider: "Exa",
      test: "Funded Startup Discovery",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

async function test2Firecrawl(): Promise<TestResult> {
  try {
    // v2 search() with news source for recency
    const { result, ms } = await timed(() =>
      firecrawl.search(
        "startup raised seed series A funding 2026 hiring engineers remote",
        {
          limit: 10,
          tbs: "qdr:m",
          sources: ["news"],
        }
      )
    );
    // news results land in result.news, web results in result.web
    const items = result.news ?? result.web ?? [];
    return {
      provider: "Firecrawl",
      test: "Funded Startup Discovery",
      timeMs: ms,
      resultCount: items.length,
      sample: items.slice(0, 3).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: (r.snippet ?? r.description ?? "").slice(0, 120),
        date: r.date,
      })),
    };
  } catch (e: any) {
    return {
      provider: "Firecrawl",
      test: "Funded Startup Discovery",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

// ─── Test 3: Job Page Extraction ──────────────────────────────────────────

const TEST_JOB_URL = "https://boards.greenhouse.io/ritual/jobs/4083940007";

async function test3Exa(): Promise<TestResult> {
  try {
    const { result, ms } = await timed(() =>
      exa.getContents([TEST_JOB_URL], {
        text: { maxCharacters: 3000 },
        livecrawl: "always",
      })
    );
    const page = result.results[0] as any;
    return {
      provider: "Exa",
      test: "Job Page Extraction",
      timeMs: ms,
      resultCount: 1,
      sample: {
        title: page?.title,
        textLength: page?.text?.length ?? 0,
        textPreview: page?.text?.slice(0, 300),
        structured: false,
      },
    };
  } catch (e: any) {
    return {
      provider: "Exa",
      test: "Job Page Extraction",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

async function test3Firecrawl(): Promise<TestResult> {
  try {
    // v2 scrape() — pass a JsonFormat object in formats[] with inline schema
    const { result, ms } = await timed(() =>
      firecrawl.scrape(TEST_JOB_URL, {
        formats: [
          {
            type: "json",
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                company: { type: "string" },
                location: { type: "string" },
                salary: { type: "string" },
                jobType: { type: "string" },
                remote: { type: "string" },
                description: { type: "string" },
                requirements: { type: "array", items: { type: "string" } },
                techStack: { type: "array", items: { type: "string" } },
                applyUrl: { type: "string" },
              },
              required: ["title", "company", "location"],
            },
          },
        ],
      })
    );
    return {
      provider: "Firecrawl",
      test: "Job Page Extraction",
      timeMs: ms,
      resultCount: 1,
      sample: {
        structured: true,
        json: (result as any).json ?? null,
      },
    };
  } catch (e: any) {
    return {
      provider: "Firecrawl",
      test: "Job Page Extraction",
      timeMs: 0,
      resultCount: 0,
      sample: null,
      error: e.message,
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.error("🔍 Running Exa vs Firecrawl comparison...\n");

  if (!process.env.EXA_API_KEY) {
    console.error("❌ EXA_API_KEY not set");
    process.exit(1);
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error("❌ FIRECRAWL_API_KEY not set");
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test 1
  console.error("── Test 1: ATS Job Search ──");
  console.error("  Running Exa...");
  results.push(await test1Exa());
  console.error(
    `  ✓ Exa: ${results.at(-1)!.timeMs}ms, ${results.at(-1)!.resultCount} results`
  );

  console.error("  Running Firecrawl...");
  results.push(await test1Firecrawl());
  console.error(
    `  ✓ Firecrawl: ${results.at(-1)!.timeMs}ms, ${results.at(-1)!.resultCount} results`
  );

  // Test 2
  console.error("\n── Test 2: Funded Startup Discovery ──");
  console.error("  Running Exa...");
  results.push(await test2Exa());
  console.error(
    `  ✓ Exa: ${results.at(-1)!.timeMs}ms, ${results.at(-1)!.resultCount} results`
  );

  console.error("  Running Firecrawl...");
  results.push(await test2Firecrawl());
  console.error(
    `  ✓ Firecrawl: ${results.at(-1)!.timeMs}ms, ${results.at(-1)!.resultCount} results`
  );

  // Test 3
  console.error("\n── Test 3: Job Page Extraction ──");
  console.error("  Running Exa...");
  results.push(await test3Exa());
  const exaSample = results.at(-1)!.sample as any;
  console.error(
    `  ✓ Exa: ${results.at(-1)!.timeMs}ms (raw text, ${exaSample?.textLength ?? 0} chars)`
  );

  console.error("  Running Firecrawl...");
  results.push(await test3Firecrawl());
  console.error(
    `  ✓ Firecrawl: ${results.at(-1)!.timeMs}ms (structured JSON)`
  );

  // Summary table
  console.error("\n── Summary ──");
  console.error(
    "┌─────────────────────────────┬──────────┬────────┬─────────┐"
  );
  console.error(
    "│ Test                        │ Provider │ Time   │ Results │"
  );
  console.error(
    "├─────────────────────────────┼──────────┼────────┼─────────┤"
  );
  for (const r of results) {
    const test = r.test.padEnd(27);
    const provider = r.provider.padEnd(8);
    const time = r.error ? "ERROR " : `${r.timeMs}ms`.padStart(6);
    const count = r.error ? r.error.slice(0, 7) : String(r.resultCount);
    console.error(
      `│ ${test} │ ${provider} │ ${time} │ ${count.padStart(7)} │`
    );
  }
  console.error(
    "└─────────────────────────────┴──────────┴────────┴─────────┘"
  );

  // Full output as JSON to stdout
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
