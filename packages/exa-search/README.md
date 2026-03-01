# exa-search

Semantic web search, content extraction, and AI-powered answers via the [Exa API](https://exa.ai) for [pi](https://github.com/mariozechner/pi).

## Prerequisites

- Node.js 18+
- `EXA_API_KEY` environment variable

## Scripts

| Script            | Purpose                                            | Example                                             |
| ----------------- | -------------------------------------------------- | --------------------------------------------------- |
| `search.ts`       | Semantic search across the web                     | "How to configure Drizzle ORM with PostgreSQL"      |
| `answer.ts`       | AI-generated answers with source citations         | "What are the valid Stripe PaymentElement options?" |
| `contents.ts`     | Extract text, highlights, or summaries from URLs   | Fetch a docs page you already know the URL for      |
| `find-similar.ts` | Find pages similar to a given URL                  | Discover alternatives to a library                  |
| `research.ts`     | Async deep research tasks (create, poll, retrieve) | Multi-source investigation before a project         |

## Common Patterns

**Look up docs before using a library:**

```
Search for "Next.js 15 app router middleware configuration" using exa-search
```

**Get an answer with citations:**

```
Use exa-search answer to find: "What changed in TypeScript 5.8 decorators?"
```

**Fetch a specific docs page:**

```
Use exa-search contents to extract text from https://turbo.build/repo/docs/getting-started
```

**Research before starting a project:**

```
Use exa-search research to investigate "best practices for real-time sync in collaborative editors"
```

## Full Reference

See the [SKILL.md](./skills/exa-search/SKILL.md) for complete option documentation, search types, filtering, and advanced usage.

## License

MIT
