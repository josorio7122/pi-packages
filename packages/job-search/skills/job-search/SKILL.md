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

Use a 3-step approach: Research → Discover → Refine

### Step 1: Exa Research (Broad Discovery)

Use exa-search to identify companies and trends. Resolve the exa-search skill path first,
then run its scripts:

```bash
# Find companies hiring for the role
tsx /path/to/exa-search/scripts/search.ts "companies hiring [role] [skill] remote 2026" '{"numResults": 20, "type": "auto"}'

# Get AI-powered answer about market
tsx /path/to/exa-search/scripts/answer.ts "What companies are actively hiring [role] with [skills] remotely in 2026?"

# Deep research on job market
tsx /path/to/exa-search/scripts/research.ts run "Top remote [role] opportunities for [skills] professionals in LATAM 2026"
```

### Step 2: ATS Site: Search (Precision Discovery)

Search directly across ATS platforms. See [ATS URL patterns](references/ats-url-patterns.md) for full domain reference.

| ATS | Domain | Site: Query |
|-----|--------|-------------|
| Greenhouse | `boards.greenhouse.io` | `site:boards.greenhouse.io "[role]" [skill] remote` |
| Lever | `jobs.lever.co` | `site:jobs.lever.co "[role]" [skill] remote` |
| Ashby | `jobs.ashby.com` | `site:jobs.ashby.com "[role]" [skill]` |
| Workday | `*.myworkdayjobs.com` | `site:myworkdayjobs.com "[role]" [skill]` |

**Combined multi-ATS search:**
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) "[role]" [skill] (remote OR "latin america" OR LATAM)
```

Execute these via Exa:
```bash
tsx /path/to/exa-search/scripts/search.ts '(site:boards.greenhouse.io OR site:jobs.lever.co) "senior engineer" python remote' '{"numResults": 20}'
```

Or extract a specific job page:
```bash
tsx /path/to/exa-search/scripts/contents.ts "https://boards.greenhouse.io/company/jobs/12345"
```

### Step 3: LATAM & Remote Job Boards

Search these specialized boards:

| Board | Domain | Focus |
|-------|--------|-------|
| GetOnBoard | `getonbrd.com` | LATAM tech (1.4M+ professionals) |
| LATAM Jobs | `latam.jobs` | Remote LATAM-only |
| LatHire | `lathire.com` | LATAM ↔ US bridge |
| Torre | `torre.co` | Global remote + LATAM |
| WeWorkRemotely | `weworkremotely.com` | Global remote |
| RemoteOK | `remoteok.com` | Global remote (100K+ jobs) |
| Remotive | `remotive.com` | Global remote with LATAM section |

**Site: queries for these boards:**
```
site:getonbrd.com "[role]" remote
site:weworkremotely.com "[role]" [skill]
site:remoteok.com "[role]"
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
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("senior engineer" OR "staff engineer" OR "backend engineer") AND (python OR go OR typescript) AND (remote OR "latin america") NOT contract NOT intern
```

**Product Manager:**
```
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product manager" OR "senior PM") AND (saas OR b2b) AND (remote OR "latin america") NOT director NOT VP
```

**Data Scientist:**
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data scientist" OR "ml engineer" OR "machine learning") AND (pytorch OR tensorflow OR python) AND remote NOT entry-level
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

## Workflow Integration

1. **job-search** → Find relevant postings
2. **resume-ats** → Optimize resume for the specific JD
3. **cold-email** → Craft outreach to hiring manager/CEO
4. **pdf-tools** → Generate optimized resume PDF

## Rules

- ALWAYS ask user for role, skills, and location preference before searching
- ALWAYS search multiple ATS platforms (at least Greenhouse + Lever)
- ALWAYS include LATAM-specific boards when user indicates LATAM interest
- ALWAYS present results in the structured output format above
- NEVER fabricate job listings — only report what search actually returns
- When using Exa, resolve the exa-search skill path and use its scripts
- Combine site: operator searches with Exa semantic search for best coverage
- For each result, try to extract key requirements from the job description
- Suggest related searches based on results found
