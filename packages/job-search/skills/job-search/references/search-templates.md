# Job Search Templates

Ready-to-use search templates by role. All templates search ATS platforms directly (not job board aggregators).

## How to Use

1. Replace `[role]`, `[skill]` with your specifics
2. Execute via Exa search scripts with `includeDomains` for ATS platforms
3. For multiple roles, run each template in a separate parallel agent
4. Always use `livecrawl: "preferred"` and `maxAgeHours: 720` for fresh results

**Primary ATS domains:** `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashby.com`
**Enterprise ATS domains:** `myworkdayjobs.com`, `icims.com`, `careers.smartrecruiters.com`

## Templates by Role

### Backend Engineer

```bash
# ATS Direct (Global Remote)
tsx /path/to/exa-search/scripts/search.ts "backend engineer senior python go java node remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# ATS Direct (LATAM)
tsx /path/to/exa-search/scripts/search.ts "backend engineer node python remote LATAM latin america" '{"numResults": 20, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com", "getonbrd.com"], "includeText": ["remote"]}'

# Google fallback
site:boards.greenhouse.io "backend engineer" (node OR python OR go) (remote OR worldwide OR LATAM) NOT "US only"
site:jobs.lever.co "backend engineer" (node OR python) (remote OR LATAM)
```

### Frontend Engineer

```bash
# ATS Direct (Global Remote)
tsx /path/to/exa-search/scripts/search.ts "frontend engineer senior react vue typescript remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# ATS Direct (LATAM)
tsx /path/to/exa-search/scripts/search.ts "frontend engineer react typescript remote LATAM" '{"numResults": 20, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com", "getonbrd.com"], "includeText": ["remote"]}'
```

### Full-Stack Engineer

```bash
# ATS Direct (Global Remote)
tsx /path/to/exa-search/scripts/search.ts "full-stack fullstack engineer react node typescript remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'

# ATS Direct (LATAM)
tsx /path/to/exa-search/scripts/search.ts "full stack engineer react node typescript remote LATAM latin america" '{"numResults": 20, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com", "getonbrd.com"], "includeText": ["remote"]}'
```

### Founding Engineer

```bash
# ATS Direct
tsx /path/to/exa-search/scripts/search.ts "founding engineer typescript react node remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"]}'

# YC / Startup-specific
tsx /path/to/exa-search/scripts/search.ts "founding engineer startup hiring remote" '{"numResults": 20, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["workatastartup.com", "ycombinator.com"], "includeText": ["remote"]}'

# Recently funded startups hiring
tsx /path/to/exa-search/scripts/search.ts "startup raised funding 2026 hiring founding engineer remote" '{"numResults": 15, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "category": "news"}'
```

### DevOps / SRE / Platform Engineer

```bash
tsx /path/to/exa-search/scripts/search.ts "devops SRE platform engineer kubernetes terraform aws remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Data Engineer

```bash
tsx /path/to/exa-search/scripts/search.ts "data engineer senior python spark dbt snowflake remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Data Scientist / ML Engineer

```bash
tsx /path/to/exa-search/scripts/search.ts "data scientist ml engineer machine learning python pytorch remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Product Manager

```bash
tsx /path/to/exa-search/scripts/search.ts "product manager senior saas b2b remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Product Designer

```bash
tsx /path/to/exa-search/scripts/search.ts "product designer UX designer figma design system remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

### Engineering Manager

```bash
tsx /path/to/exa-search/scripts/search.ts "engineering manager head of engineering remote" '{"numResults": 25, "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashby.com"], "includeText": ["remote"], "excludeText": ["US only", "United States only"]}'
```

## Startup Discovery Templates

### Recently Funded Startups

```bash
# Find startups that just raised (news category)
tsx /path/to/exa-search/scripts/search.ts "startup raised seed series A funding 2026 hiring remote engineers" '{"numResults": 20, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "category": "news"}'

# YC-backed companies
tsx /path/to/exa-search/scripts/search.ts "Y Combinator startup hiring remote engineers 2026" '{"numResults": 15, "type": "deep", "livecrawl": "preferred", "maxAgeHours": 720, "includeDomains": ["ycombinator.com", "workatastartup.com"]}'

# Extract a company's career page
tsx /path/to/exa-search/scripts/contents.ts "https://company.com/careers" '{"text": true, "livecrawl": "always"}'
```

### Company Research

```bash
# Research a specific company
tsx /path/to/exa-search/scripts/search.ts "[company] careers engineering culture remote" '{"numResults": 5, "livecrawl": "always"}'

# Salary research
tsx /path/to/exa-search/scripts/answer.ts "What is the typical salary for a remote [role] with [X] years experience in 2026?"
```

## LATAM-Specific Tips

1. **Time zone matters**: Many US companies hiring LATAM want overlap with US business hours (EST/PST)
2. **Search terms**: Use both "LATAM" and "Latin America" — companies use different terms
3. **Also try**: "Americas", "Western Hemisphere", "US time zones"
4. **Country-specific**: Some postings specify "Colombia", "Brazil", "Mexico", "Argentina" instead of "LATAM"
5. **GetOnBoard**: Largest LATAM tech board — include `getonbrd.com` in `includeDomains` for LATAM searches
6. **Default to global remote + LATAM** — exclude US-only and EU-only roles
7. **ATS over aggregators** — search Greenhouse/Lever/Ashby directly, not remoteok/remotive/weworkremotely
