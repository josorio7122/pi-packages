# Job Search Templates

Ready-to-use search templates by role. Copy, customize, execute.

## How to Use

1. Replace `[role]`, `[skill]`, `[location]` with your specifics
2. Execute via Exa search (preferred) or paste into Google (fallback)
3. Combine multiple queries for maximum coverage

**Note:** Exa queries use `includeDomains` — do not use `site:` operators with Exa scripts.

## Templates by Role

### Backend Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "backend engineer senior python go java node remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "backend engineer python go remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("backend engineer" OR "senior backend" OR "software engineer, backend") AND (python OR go OR java OR node) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT intern NOT contract
```

### Frontend Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "frontend engineer senior react vue typescript remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "frontend engineer react typescript remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("frontend engineer" OR "senior frontend" OR "react engineer") AND (react OR vue OR typescript) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT intern
```

### Full-Stack Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "full-stack engineer fullstack react next.js node remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "full-stack engineer react node remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("full-stack" OR "fullstack" OR "full stack") AND (react OR next.js OR node) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT intern NOT contract
```

### DevOps / SRE / Platform Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "devops SRE platform engineer kubernetes terraform aws remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "devops platform engineer kubernetes remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("devops" OR "SRE" OR "platform engineer" OR "infrastructure engineer") AND (kubernetes OR terraform OR aws) AND (remote OR worldwide OR LATAM) NOT "US only" NOT junior
```

### Data Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "data engineer senior python spark dbt snowflake remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "data engineer python dbt remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data engineer" OR "senior data engineer" OR "analytics engineer") AND (python OR spark OR dbt OR snowflake) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT intern
```

### Data Scientist / ML Engineer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "data scientist ml engineer machine learning python pytorch tensorflow remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "data scientist machine learning python remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data scientist" OR "ml engineer" OR "machine learning engineer") AND (python OR pytorch OR tensorflow) AND (remote OR worldwide OR LATAM) NOT "US only"
```

### Product Manager

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "product manager senior PM saas b2b remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "product manager saas remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product manager" OR "senior product manager" OR "group PM") AND (saas OR b2b OR marketplace) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT director NOT VP NOT chief
```

### Product Designer

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "product designer UX designer senior figma design system remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "product designer UX figma remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product designer" OR "senior product designer" OR "UX designer") AND (figma OR "design system") AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only"
```

### Engineering Manager

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "engineering manager head of engineering remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "engineering manager remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("engineering manager" OR "eng manager" OR "head of engineering") AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only" NOT VP NOT CTO
```

### Marketing

```bash
# Exa: Global Remote
tsx /path/to/exa-search/scripts/search.ts "marketing manager growth marketer demand gen saas b2b remote worldwide" '{"numResults": 20, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# Exa: LATAM
tsx /path/to/exa-search/scripts/search.ts "marketing manager growth saas remote LATAM latin america" '{"numResults": 15, "includeDomains": ["getonbrd.com", "torre.co", "remoteok.com", "weworkremotely.com", "remotive.com", "boards.greenhouse.io", "jobs.lever.co"], "includeText": ["LATAM", "remote"]}'

# Google fallback
(site:boards.greenhouse.io OR site:jobs.lever.co) ("marketing manager" OR "growth marketer" OR "demand gen") AND (saas OR b2b) AND (remote OR worldwide OR LATAM OR "latin america") NOT "US only"
```

## Exa Query Templates

### Broad Research
```bash
tsx /path/to/exa-search/scripts/answer.ts "What are the best companies hiring [role] with [skills] remotely worldwide or in LATAM in 2026?"
```

### Specific Search
```bash
tsx /path/to/exa-search/scripts/search.ts "[role] [skill] remote job openings 2026" '{"numResults": 20, "type": "auto", "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Company Research
```bash
tsx /path/to/exa-search/scripts/search.ts "[company name] engineering culture remote work" '{"numResults": 5}'
```

### Salary Research
```bash
tsx /path/to/exa-search/scripts/answer.ts "What is the typical salary range for a remote [role] with [X] years experience in 2026?"
```

## LATAM-Specific Tips

1. **Time zone matters**: Many US companies hiring LATAM want overlap with US business hours (EST/PST)
2. **Search terms**: Use both "LATAM" and "Latin America" — different companies use different terms
3. **Also try**: "Americas", "Western Hemisphere", "US time zones"
4. **Country-specific**: Some postings specify "Colombia", "Brazil", "Mexico", "Argentina" instead of "LATAM"
5. **Salary expectations**: LATAM remote roles typically pay 50-80% of US rates (still excellent locally)
6. **GetOnBoard advantage**: Largest LATAM-focused tech job board with 1.4M+ professionals and ATS integrations
7. **Default to global remote + LATAM** — always exclude US-only and EU-only roles unless the user explicitly says otherwise
8. **Post-filter every result** — check each listing for location restrictions before including in output
9. **Use Exa includeText/excludeText** — the most reliable way to filter location in Exa queries
