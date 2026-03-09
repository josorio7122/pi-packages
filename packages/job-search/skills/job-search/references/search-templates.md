# Job Search Templates

Ready-to-use search templates by role. Copy, customize, execute.

## How to Use

1. Replace `[role]`, `[skill]`, `[location]` with your specifics
2. Execute via Exa search or paste into Google
3. Combine multiple queries for maximum coverage

## Templates by Role

### Backend Engineer
```
# Startup ATS
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("backend engineer" OR "senior backend" OR "software engineer, backend") AND (python OR go OR java OR node) AND (remote OR LATAM) NOT intern NOT contract

# Remote boards
site:weworkremotely.com "backend" (python OR go)
site:remoteok.com backend engineer
site:getonbrd.com backend remote
```

### Frontend Engineer
```
# Startup ATS
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("frontend engineer" OR "senior frontend" OR "react engineer") AND (react OR vue OR typescript) AND (remote OR LATAM) NOT intern

# Remote boards
site:weworkremotely.com frontend react
site:remoteok.com frontend engineer
```

### Full-Stack Engineer
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("full-stack" OR "fullstack" OR "full stack") AND (react OR next.js OR node) AND (remote OR LATAM) NOT intern NOT contract
```

### DevOps / SRE / Platform Engineer
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("devops" OR "SRE" OR "platform engineer" OR "infrastructure engineer") AND (kubernetes OR terraform OR aws) AND remote NOT junior
```

### Data Engineer
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data engineer" OR "senior data engineer" OR "analytics engineer") AND (python OR spark OR dbt OR snowflake) AND remote NOT intern
```

### Data Scientist / ML Engineer
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("data scientist" OR "ml engineer" OR "machine learning engineer") AND (python OR pytorch OR tensorflow) AND remote
```

### Product Manager
```
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product manager" OR "senior product manager" OR "group PM") AND (saas OR b2b OR marketplace) AND remote NOT director NOT VP NOT chief
```

### Product Designer
```
(site:boards.greenhouse.io OR site:jobs.lever.co) ("product designer" OR "senior product designer" OR "UX designer") AND (figma OR "design system") AND remote
```

### Engineering Manager
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) ("engineering manager" OR "eng manager" OR "head of engineering") AND (remote OR LATAM) NOT VP NOT CTO
```

### Marketing
```
(site:boards.greenhouse.io OR site:jobs.lever.co) ("marketing manager" OR "growth marketer" OR "demand gen") AND (saas OR b2b) AND (remote OR LATAM)
```

## Exa Query Templates

### Broad Research
```bash
tsx scripts/answer.ts "What are the best companies hiring [role] with [skills] remotely in 2026?"
```

### Specific Search
```bash
tsx scripts/search.ts "[role] [skill] remote job openings 2026" '{"numResults": 20, "type": "auto"}'
```

### Company Research
```bash
tsx scripts/search.ts "[company name] engineering culture remote work" '{"numResults": 5}'
```

### Salary Research
```bash
tsx scripts/answer.ts "What is the typical salary range for a remote [role] with [X] years experience in 2026?"
```

## LATAM-Specific Tips

1. **Time zone matters**: Many US companies hiring LATAM want overlap with US business hours (EST/PST)
2. **Search terms**: Use both "LATAM" and "Latin America" — different companies use different terms
3. **Also try**: "Americas", "Western Hemisphere", "US time zones"
4. **Country-specific**: Some postings specify "Colombia", "Brazil", "Mexico", "Argentina" instead of "LATAM"
5. **Salary expectations**: LATAM remote roles typically pay 50-80% of US rates (still excellent locally)
6. **GetOnBoard advantage**: Largest LATAM-focused tech job board with 1.4M+ professionals and ATS integrations
