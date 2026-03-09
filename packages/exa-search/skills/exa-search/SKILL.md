---
name: exa-search
description: Semantic web search, content extraction, AI-powered answers, and deep research via the Exa API (exa-js SDK). Use when searching documentation, facts, web content, finding similar pages, extracting page text, getting AI answers with citations, or running deep research tasks. Requires EXA_API_KEY environment variable.
compatibility: "Requires Node.js 18+, tsx, and EXA_API_KEY environment variable set"
metadata:
  author: josorio7122
  version: "1.0"
---

# Exa Search

Semantic search, content extraction, AI answers with citations, and deep research — all via the [Exa API](https://exa.ai).

## Prerequisites

```bash
# Verify Node.js
node --version  # Must be 18+

# Verify API key is set
echo $EXA_API_KEY
```

If deps are not installed:

```bash
cd skills/exa-search && npm install
```

Get an API key at: https://dashboard.exa.ai/api-keys

## Scripts

All scripts output JSON to stdout. Pass options as a JSON string argument. Run any script with `--help` for full usage.

| Script                    | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `scripts/search.ts`       | Semantic search + search with contents  |
| `scripts/find-similar.ts` | Find pages similar to a URL             |
| `scripts/contents.ts`     | Extract contents from URLs              |
| `scripts/answer.ts`       | AI-generated answers with citations     |
| `scripts/research.ts`     | Deep research tasks (create, poll, run) |

## Search

Semantic search across the web. Supports six search types: `auto` (default), `fast`, `deep`, `deep-reasoning`, `deep-max`, `instant`.

```bash
# Basic search
tsx scripts/search.ts "latest AI research"

# Search with contents (text + highlights)
tsx scripts/search.ts "React best practices" '{"text":true,"highlights":true,"numResults":5}'

# Deep search with structured output
tsx scripts/search.ts "AI startups 2025" '{"type":"deep","numResults":10,"contents":true}'

# Filter by domain and date
tsx scripts/search.ts "Next.js app router" '{"includeDomains":["nextjs.org","vercel.com"],"startPublishedDate":"2025-01-01T00:00:00.000Z"}'

# Category search (news, research paper, company, pdf, tweet, personal site, financial report, people)
tsx scripts/search.ts "OpenAI" '{"category":"news","numResults":5,"text":true}'

# Text filtering
tsx scripts/search.ts "machine learning" '{"includeText":["transformer"],"excludeText":["beginner"]}'

# Deep search with additional query formulations
tsx scripts/search.ts "quantum computing breakthroughs" '{"type":"deep","additionalQueries":["recent quantum computing papers","quantum advantage experiments"]}'
```

### Key Options

| Option               | Type        | Description                                                                 |
| -------------------- | ----------- | --------------------------------------------------------------------------- |
| `numResults`         | number      | Number of results (default 10)                                              |
| `type`               | string      | `"auto"`, `"fast"`, `"deep"`, `"deep-reasoning"`, `"deep-max"`, `"instant"` |
| `text`               | bool/object | Include page text. Object: `{"maxCharacters":5000}`                         |
| `highlights`         | bool/object | Include highlights. Object: `{"query":"...", "numSentences":3}`             |
| `summary`            | bool/object | Include summary. Object: `{"query":"summarize pricing"}`                    |
| `includeDomains`     | string[]    | Only search these domains                                                   |
| `excludeDomains`     | string[]    | Exclude these domains                                                       |
| `category`           | string      | Filter by content category                                                  |
| `startPublishedDate` | string      | ISO date — results published after this                                     |
| `endPublishedDate`   | string      | ISO date — results published before this                                    |
| `includeText`        | string[]    | Page must contain these strings (max 1, up to 5 words)                      |
| `excludeText`        | string[]    | Page must not contain these strings                                         |
| `useAutoprompt`      | bool        | Enhance query automatically                                                 |
| `subpages`           | number      | Number of subpages per result                                               |
| `subpageTarget`      | string      | Text to match subpages against                                              |
| `livecrawl`          | string      | `"never"`, `"fallback"`, `"auto"`, `"preferred"`, `"always"` — live-crawl for fresh data |
| `livecrawlTimeout`   | number      | Timeout in ms for live crawl (default: 10000)                               |
| `additionalQueries`  | string[]    | Alt queries for deep search (max 5)                                         |
| `outputSchema`       | object      | JSON Schema for deep search structured output                               |

## Find Similar

Find pages similar to a given URL.

```bash
# Basic
tsx scripts/find-similar.ts "https://react.dev"

# With contents, excluding source domain
tsx scripts/find-similar.ts "https://react.dev" '{"text":true,"excludeSourceDomain":true,"numResults":5}'

# Filter by domain
tsx scripts/find-similar.ts "https://nextjs.org/blog" '{"includeDomains":["vercel.com","remix.run"],"text":true}'
```

## Get Contents

Extract text, highlights, or summaries from specific URLs.

```bash
# Get text from a single URL
tsx scripts/contents.ts "https://example.com/article"

# Get text with character limit
tsx scripts/contents.ts "https://example.com" '{"text":{"maxCharacters":2000}}'

# Multiple URLs with highlights
tsx scripts/contents.ts '["https://a.com","https://b.com"]' '{"text":true,"highlights":true}'

# Get subpages
tsx scripts/contents.ts "https://docs.example.com" '{"text":true,"subpages":3,"subpageTarget":"API reference"}'

# Force fresh content (ignore cache)
tsx scripts/contents.ts "https://example.com" '{"text":true,"maxAgeHours":0}'

# Live-crawl for real-time data (always fetches fresh)
tsx scripts/contents.ts "https://example.com" '{"text":true,"livecrawl":"always"}'
```

## Answer

Get AI-generated answers with citations from Exa's search index.

```bash
# Basic question
tsx scripts/answer.ts "What is the latest Next.js version?"

# With full source text
tsx scripts/answer.ts "Compare React and Vue" '{"text":true}'

# With system prompt
tsx scripts/answer.ts "Best ORMs for Node.js" '{"systemPrompt":"Be concise. List only the top 3 with one sentence each."}'

# Structured output
tsx scripts/answer.ts "Top 3 JS frameworks" '{"outputSchema":{"type":"object","properties":{"frameworks":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"}}}}}}}'

# Streaming
tsx scripts/answer.ts "Explain quantum computing" '{"stream":true}'
```

## Research

Deep research tasks that run asynchronously. Three models available: `exa-research-fast`, `exa-research`, `exa-research-pro`.

```bash
# One-step: create + poll until done
tsx scripts/research.ts run "What is SpaceX's latest valuation?"

# With pro model
tsx scripts/research.ts run "Comprehensive analysis of AI chip market 2025" '{"model":"exa-research-pro"}'

# With structured output
tsx scripts/research.ts run "Top 5 YC companies by valuation" '{"outputSchema":{"type":"object","properties":{"companies":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"valuation":{"type":"string"}}}}}}}'

# Manual workflow: create, then poll separately
tsx scripts/research.ts create "Research quantum computing startups"
tsx scripts/research.ts get "RESEARCH_ID_HERE"
tsx scripts/research.ts poll "RESEARCH_ID_HERE" '{"pollInterval":2000,"timeoutMs":300000}'

# List past research tasks
tsx scripts/research.ts list '{"limit":10}'
```

## Common Patterns

### Documentation Lookup (Preferred)

```bash
# Search official docs
tsx scripts/search.ts "drizzle ORM configuration" '{"includeDomains":["orm.drizzle.team"],"text":true,"numResults":3}'

# Or get a direct answer
tsx scripts/answer.ts "How do I configure drizzle ORM with PostgreSQL?"
```

### Fetch a Specific Page

```bash
tsx scripts/contents.ts "https://nextjs.org/docs/app/building-your-application/routing" '{"text":true}'
```

### Research Before a Project

```bash
tsx scripts/research.ts run "Best practices for building a CLI tool in Node.js in 2025, including testing, argument parsing, and distribution"
```

### Find Alternatives

```bash
tsx scripts/find-similar.ts "https://tailwindcss.com" '{"text":true,"excludeSourceDomain":true,"numResults":5}'
```

## Rules

- Always check `EXA_API_KEY` is set before running scripts
- Prefer `answer.ts` for direct questions — it returns citations
- Prefer `search.ts` with `text:true` for browsing/exploring
- Use `contents.ts` to fetch specific known URLs
- Use `research.js run` for complex multi-step research
- Output is always JSON — pipe through `jq` for filtering if needed
- Be mindful of API costs — use `numResults` to limit when exploring
