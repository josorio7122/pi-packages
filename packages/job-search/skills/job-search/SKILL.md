---
name: job-search
description: "Find job postings for any role using ATS site: search operators and Exa semantic search. Use when the user wants to find job openings, especially remote or LATAM positions, by searching across Greenhouse, Lever, Ashby, Workday, and other ATS platforms. Combines Boolean search techniques with semantic search for comprehensive results. Requires exa-search skill for semantic queries."
metadata:
  author: josorio7122
  version: "1.0"
---

# Job Search

Find job postings across ATS platforms using site: operators, Boolean search, and Exa semantic search.

## When to Use

- User wants to find job openings for a specific role
- User is looking for remote or LATAM-friendly positions
- User wants to search across multiple ATS platforms simultaneously
- User wants to discover companies hiring for their skillset

## Prerequisites

- **exa-search skill** — for semantic search queries (Exa API key required)
- Gather from user:
  1. **Target role** (e.g., "Senior Backend Engineer")
  2. **Key skills** (e.g., Python, AWS, Kubernetes)
  3. **Location preference** (remote, LATAM, specific country/city)
  4. **Experience level** (junior, mid, senior, lead, staff)
  5. **Exclusions** (e.g., no contract, no intern, no specific industry)

## Search Strategy

Use a 3-step approach: ATS Direct Search → Career Pages → Startup Discovery

**Important:** Search ATS platforms and company career pages directly — NOT job board aggregators (remoteok, remotive, weworkremotely, dynamitejobs). Aggregators have stale data. ATS platforms (Greenhouse, Lever, Ashby) serve live listings.

### Step 1: ATS Direct Search (Primary)

Search directly on ATS platforms where companies post live listings. These are always current.

**Note:** For Exa searches, use `includeDomains` to scope to ATS platforms — NOT `site:` operators.

```bash
# Search Greenhouse, Lever, Ashby simultaneously
tsx /path/to/exa-search/scripts/search.ts "[role] [skill] remote" '{"numResults": 25, "type": "auto", "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Add enterprise ATS for broader coverage
tsx /path/to/exa-search/scripts/search.ts "[role] [skill] remote" '{"numResults": 15, "type": "auto", "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["myworkdayjobs.com", "icims.com", "careers.smartrecruiters.com"], "includeText": ["remote"]}'
```

| ATS | Domain | Market |
|-----|--------|--------|
| Greenhouse | `boards.greenhouse.io` | ~35% of VC-backed startups |
| Lever | `jobs.lever.co` | ~25% of growth-stage startups |
| Ashby | `jobs.ashby.com` | Fast-growing, popular with AI companies |
| Workday | `*.myworkdayjobs.com` | Enterprise / Fortune 500 |
| iCIMS | `*.icims.com` | Enterprise, healthcare, finance |
| SmartRecruiters | `careers.smartrecruiters.com` | Mid-market |

### Step 2: Company Career Pages (Targeted)

When you know specific companies, extract their career pages directly:

```bash
# Extract a specific company's careers page (live-crawl for current listings)
tsx /path/to/exa-search/scripts/contents.ts "https://company.com/careers" '{"text": true, "livecrawl": "always"}'

# Search for career pages of known companies
tsx /path/to/exa-search/scripts/search.ts "[company name] careers jobs engineering" '{"numResults": 5, "livecrawl": "always", "subpages": 3, "subpageTarget": "careers"}'

# Find career pages for companies in a specific space
tsx /path/to/exa-search/scripts/search.ts "[industry] startup careers hiring remote engineers 2026" '{"numResults": 15, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "includeText": ["careers", "hiring"]}'
```

**Google fallback** (for manual search if Exa results are insufficient):
```
site:boards.greenhouse.io "[role]" [skill] (remote OR worldwide OR LATAM)
site:jobs.lever.co "[role]" [skill] (remote OR worldwide OR LATAM)
site:jobs.ashby.com "[role]" [skill] remote
```

### Step 3: Startup Discovery (Recently Funded)

Find recently funded startups and check their career pages:

```bash
# Find startups that recently raised funding
tsx /path/to/exa-search/scripts/search.ts "startup raised seed series A B funding 2026 hiring engineers" '{"numResults": 20, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "category": "news", "includeText": ["remote"]}'

# Research specific companies for open roles
tsx /path/to/exa-search/scripts/answer.ts "What startups raised funding in 2026 and are hiring senior engineers remotely?"

# Extract career page from a discovered company
tsx /path/to/exa-search/scripts/contents.ts "https://company.com/careers" '{"text": true, "livecrawl": "always"}'
```

For LATAM-specific startup discovery:
```bash
tsx /path/to/exa-search/scripts/search.ts "startup hiring engineers remote LATAM latin america" '{"numResults": 15, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["getonbrd.com", "boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"]}'
```

## Boolean Search Operators

| Operator | Function | Example |
|----------|----------|---------|
| AND | Both required | `"engineer" AND python AND remote` |
| OR | Either works | `"UX" OR "UI" OR "product designer"` |
| NOT | Exclude | `engineer NOT intern NOT junior` |
| `" "` | Exact phrase | `"machine learning"` |
| `( )` | Group | `(java OR python) AND aws` |

See [search-templates.md](references/search-templates.md) for ready-to-use Boolean queries by role.

### Common Role Templates (quick reference)

**Software Engineer:**
```bash
# Via Exa (preferred)
tsx /path/to/exa-search/scripts/search.ts "senior engineer backend python go typescript remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Via Google (fallback)
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("senior engineer" OR "staff engineer" OR "backend engineer") AND (python OR go OR typescript) AND (remote OR "worldwide" OR LATAM OR "latin america") NOT "US only" NOT contract NOT intern
```

**Product Manager:**
```bash
# Via Exa (preferred)
tsx /path/to/exa-search/scripts/search.ts "product manager senior PM saas b2b remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Via Google (fallback)
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product manager" OR "senior PM") AND (saas OR b2b) AND (remote OR "worldwide" OR LATAM OR "latin america") NOT "US only" NOT director NOT VP
```

**Data Scientist:**
```bash
# Via Exa (preferred)
tsx /path/to/exa-search/scripts/search.ts "data scientist ml engineer machine learning python pytorch tensorflow remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Via Google (fallback)
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data scientist" OR "ml engineer" OR "machine learning") AND (pytorch OR tensorflow OR python) AND (remote OR "worldwide" OR LATAM) NOT "US only" NOT entry-level
```

## Output Format

Present results as:

```
## Job Search Results: [Role] — [Location]

### Search Parameters
- Role: [target role]
- Skills: [skills list]
- Location: [preference]
- Exclusions: [exclusions]

### Results ([N] positions found)

1. **[Job Title]** at **[Company]**
   - Location: [Remote / City / LATAM]
   - Source: [ATS platform]
   - Link: [URL]
   - Key requirements: [top 3-5 from JD]

2. ...

### LATAM-Specific Results ([N] positions)

1. ...

### Suggested Next Steps
- [Companies to research further]
- [Related roles to also search]
- [Keywords to add/remove for better results]
```

## Location Filtering

By default, scope all searches to **global remote** or **LATAM** positions. Exclude location-restricted roles.

### Default Search Behavior

- ALWAYS use `"livecrawl": "preferred"` and `"maxAgeHours": 720` to get fresh, current job listings
- ALWAYS search ATS platforms directly (Greenhouse, Lever, Ashby) as primary source — job board aggregators have stale data
- For startup discovery, search for recently funded companies and extract their career pages
- ALWAYS include location terms in every query: `(remote OR "worldwide" OR "anywhere" OR LATAM OR "latin america")`
- ALWAYS use `includeText` in Exa options to require location signals:
  ```json
  {"includeText": ["remote"], "excludeText": ["US only", "United States only", "must be located in the US", "must be authorized to work in the United States", "UK only", "EU only"]}
  ```
- For LATAM-specific searches, use:
  ```json
  {"includeText": ["LATAM", "Latin America", "remote"], "excludeText": ["US only", "United States only"]}
  ```

### Post-Search Filtering

After receiving results, **discard** any listing that:
- Says "US only", "United States only", "must be authorized to work in the US/United States"
- Says "Remote - US", "Remote - United States", "Remote (US)", "US citizens or permanent residents only"
- Says "UK only", "EU only", "Remote - EU", "Remote (EU)" (unless user is in EU)
- Says "must be authorized to work in the United States", "US work authorization required"
- Requires specific country citizenship, visa, or work authorization (unless it matches user's location)
- Has no remote/location info AND is clearly tied to one office
- **IMPORTANT: Never assume a role is location-restricted without verifying.** If the listing doesn't explicitly state a restriction, include it. When in doubt, use `contents.ts` with `livecrawl: always` to extract the full job page and check.

**Keep** listings that say:
- "Remote", "Worldwide", "Anywhere", "Global"
- "LATAM", "Latin America", "South America", "Central America"
- Specific LATAM countries: Colombia, Argentina, Brazil, Mexico, Chile, Peru, Costa Rica, Guatemala, Uruguay, Ecuador
- "Americas", "Western Hemisphere", "US time zones" (these usually accept LATAM)

## Workflow Integration

1. **job-search** → Find relevant postings
2. **resume-ats** → Optimize resume for the specific JD
3. **cold-email** → Craft outreach to hiring manager/CEO
4. **pdf-tools** → Generate optimized resume PDF

## Parallel Search by Role

When searching for multiple roles (e.g., "senior full-stack, founding engineer, senior backend"), dispatch **one sub-agent per role** in parallel. Each agent runs the full 3-step strategy independently for its role.

Example: if user asks for 3 roles, dispatch 3 parallel scouts — one for "senior full-stack engineer", one for "founding engineer", one for "senior backend engineer". Merge and deduplicate results before presenting.

Never search for all roles in a single query — it dilutes results.

## Rules

- ALWAYS ask user for role, skills, and location preference before searching
- ALWAYS search multiple ATS platforms (at least Greenhouse + Lever)
- ALWAYS include LATAM-specific boards when user indicates LATAM interest
- ALWAYS present results in the structured output format above
- ALWAYS scope searches to global remote or LATAM by default — never return US-only or EU-only roles unless user explicitly requests them
- ALWAYS search ATS platforms directly (Greenhouse, Lever, Ashby) — never rely on job board aggregators (remoteok, remotive, weworkremotely, dynamitejobs) as primary sources
- ALWAYS dispatch one sub-agent per role when searching for multiple roles — never combine roles in a single search query
- ALWAYS use livecrawl: preferred and maxAgeHours: 720 for fresh results
- ALWAYS use Exa includeDomains option instead of site: operators when searching via Exa scripts
- ALWAYS post-filter results to discard location-restricted roles (US only, US remote, EU only, EU remote, UK only) before presenting to user
- NEVER assume a role is location-restricted without checking the actual listing — use contents.ts with livecrawl to verify when unsure
- ALWAYS use includeText/excludeText in Exa options to filter by location signals
- NEVER fabricate job listings — only report what search actually returns
- When using Exa, resolve the exa-search skill path and use its scripts
- Combine site: operator searches with Exa semantic search for best coverage
- For each result, try to extract key requirements from the job description
- Suggest related searches based on results found
