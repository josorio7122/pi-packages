# ATS URL Patterns Reference

Complete reference for ATS platform URLs and search patterns. Loaded on-demand.

## Major ATS Platforms

### Greenhouse (Most Popular for Startups)
- **Job board domain**: `boards.greenhouse.io`
- **URL pattern**: `https://boards.greenhouse.io/{org-slug}/jobs/{job-id}`
- **API endpoint**: `https://boards-api.greenhouse.io/v1/boards/{org}/jobs`
- **Market share**: ~35% of VC-backed startups
- **Search tip**: Greenhouse boards are very well indexed by Google

### Lever
- **Job board domain**: `jobs.lever.co`
- **URL pattern**: `https://jobs.lever.co/{company}/{job-id}`
- **Market share**: ~25% of growth-stage startups
- **Search tip**: Lever pages include full JD text, excellent for keyword matching

### Ashby
- **Job board domain**: `jobs.ashby.com`
- **URL pattern**: `https://jobs.ashby.com/{org}/{job-id}`
- **Market share**: Growing fast in 2025-2026, popular with AI companies
- **Search tip**: Ashby boards are newer, less indexed — use Exa for better discovery

### Workday
- **Job board domain**: `*.myworkdayjobs.com` or company-specific
- **URL pattern**: `https://{company}.wd{n}.myworkdayjobs.com/en-US/{board}/{job-id}`
- **Market share**: Dominant in enterprise (Fortune 500)
- **Search tip**: Workday URLs are complex; use broader site: queries

### BambooHR
- **Job board domain**: `{company}.bamboohr.com`
- **URL pattern**: `https://{company}.bamboohr.com/careers/{job-id}`
- **Market share**: Common in SMBs
- **Search tip**: Must search by company subdomain or use `site:bamboohr.com`

### iCIMS
- **Job board domain**: `careers-{company}.icims.com`
- **URL pattern**: `https://careers-{company}.icims.com/jobs/{job-id}/job`
- **Market share**: Enterprise, healthcare, finance
- **Search tip**: Use `site:icims.com` for broad search

### SmartRecruiters
- **Job board domain**: `careers.smartrecruiters.com`
- **URL pattern**: `https://careers.smartrecruiters.com/{company}/{job-id}`
- **Search tip**: Good indexing, similar pattern to Greenhouse

### Rippling
- **Job board domain**: `app.rippling.com`
- **URL pattern**: Company career pages via Rippling
- **Search tip**: Newer ATS, growing in startups; use `site:app.rippling.com` for jobs

## Combined Search Queries

### Maximum Coverage (All Major ATS)
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com OR site:myworkdayjobs.com OR site:icims.com OR site:careers.smartrecruiters.com) "[role]" [skill]
```

### Startup-Focused
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) "[role]" [skill] (remote OR "anywhere")
```

### Enterprise-Focused
```
(site:myworkdayjobs.com OR site:icims.com OR site:careers.smartrecruiters.com) "[role]" [skill]
```

### LATAM Remote
```
(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashby.com) "[role]" [skill] ("latin america" OR LATAM OR "south america" OR "remote" OR "anywhere")
```

### Additional LATAM Queries
```
site:getonbrd.com "[role]" remote
site:torre.co "[role]" remote
site:latam.jobs "[role]"
site:weworkremotely.com "[role]" [skill]
site:remoteok.com "[role]" [skill]
```
