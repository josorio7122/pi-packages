# ATS Formatting Guide (2025-2026)

Detailed reference for resume-ats skill. Contains comprehensive formatting rules.

## ATS-Killing Formatting Mistakes

### Multi-Column Layouts
- ATS parsers read across columns unpredictably, merging unrelated sections
- Skills get mixed with job descriptions
- Modern ATS: only 80% confident handling columns; legacy systems fail completely
- **Fix**: Use single-column layout exclusively

### Tables & Nested Tables
- Parser reads grids as single unstructured text blocks
- Columns may be skipped entirely
- ~15% of resumes fail here
- **Fix**: Use pipe-separated lists or simple bullets instead

### Text Boxes & Sidebars
- Floating text boxes are invisible to ATS
- Sidebar content often disappears completely
- **Fix**: All content in main document flow

### Graphics, Icons, Logos, Photos
- 100% invisible to ATS
- Embedded images are skipped entirely
- Can corrupt adjacent text during parsing
- **Fix**: Remove all visual elements; use text only

### Skill Rating Graphics (Bars/Stars/Circles)
- ATS cannot parse visual ratings
- The skill name might be read, but the proficiency level is lost
- **Fix**: List skills as plain text without ratings

### Header/Footer Contact Info
- ~25% of ATS skip headers/footers entirely
- Recruiter can't reach you even if resume passes
- **Fix**: Place ALL contact info in the main document body (first few lines)

### Custom/Fancy Fonts
- Custom fonts cause character encoding errors
- "Project Manager" can become "P®@j£ç+ M@|\@g£¶"
- **Safe fonts**: Arial, Calibri, Garamond, Times New Roman, Helvetica, Georgia, Verdana, Open Sans
- **Font size**: 10-12pt body, 14-18pt headers

### Non-Standard Date Formats
- "Summer 2023", "'23-Present", "2023-2024" confuse date parsers
- ATS can't calculate employment tenure
- **Fix**: Use MM/YYYY ("03/2023") or Month Year ("March 2023") consistently

### Scanned/Image PDFs
- PDFs from scanning are image files — ATS reads 0% of content
- **Fix**: Always export directly from Word/Google Docs to PDF
- **Test**: Open PDF, try to highlight text — if you can select text, it's readable

### Creative Section Headers
- "My Journey", "Where I've Worked", "My Toolkit" confuse section identification
- ATS expects exact or close matches to standard headers
- **Standard headers**: Professional Summary, Work Experience, Education, Skills, Certifications, Contact

### Special Characters & Symbols
- Arrow bullets (➢), checkmarks, Wingdings render as garbage (&%$#)
- Decorative dividers can cause lines to be skipped
- **Safe characters**: •, -, *, |, standard punctuation

### ALL CAPS Text
- Some older parsers struggle with all-caps
- Especially problematic for certification names
- **Fix**: Use title case or sentence case; bold for emphasis

## Typography Standards

| Element | Font | Size | Style |
|---------|------|------|-------|
| Name | Arial/Calibri | 14-18pt | Bold |
| Section headers | Arial/Calibri | 12-14pt | Bold |
| Body text | Arial/Calibri | 10-12pt | Regular |
| Line spacing | — | 1.0-1.15 | — |
| Margins | — | 0.5-1 inch | — |
| Colors | Black on white | — | One accent for headers OK |

## Optimal Section Order

```
1. HEADER: Full Name (14-18pt, bold)
2. CONTACT: Email | Phone | LinkedIn | City, State
3. PROFESSIONAL SUMMARY (3-5 sentences, keyword-rich)
4. CORE SKILLS / TECHNICAL SKILLS (flat list, 15-25 skills)
5. WORK EXPERIENCE (reverse chronological)
6. EDUCATION (full degree names)
7. CERTIFICATIONS (full official names + body + year)
8. (Optional) Awards, Publications, Languages
```

## Professional Summary Formula

```
[Job Title] with [X] years of experience in [industry/domain].
Expert in [Tool 1], [Tool 2], and [Methodology/Skill].
[Key achievement with quantifiable result].
[Certification or notable credential].
```

Example:
"Marketing Manager with 8 years in B2B SaaS. Expert in HubSpot, Google Analytics 4, and paid digital campaigns. Increased organic traffic 150%+ and managed $500K+ budgets. Google Ads certified."

## Work Experience Bullet Formula (CAR Format)

```
[Action Verb] [skill/keyword] to [achieve result], resulting in [quantifiable outcome]
```

Examples:
- "Developed Python ETL pipelines processing 2M+ records daily, reducing data latency by 40%"
- "Led cross-functional team of 8 engineers to deliver payment platform, increasing transaction throughput by 3x"
- "Implemented Kubernetes-based CI/CD pipeline, cutting deployment time from 4 hours to 15 minutes"

## ATS Testing Tools

| Tool | Free Tier | Best For | URL |
|------|-----------|----------|-----|
| Jobscan | 5 scans/month | Most accurate | jobscan.co |
| Teal HQ | Unlimited basic | All-in-one suite | tealhq.com |
| ResumeWorded | Unlimited basic | Beginners | resumeworded.com |
| SkillSyncer | Unlimited | Budget-friendly | skillsyncer.com |
| BeatATS | Unlimited | Free alternative | beatats.com |

## ATS Score Benchmarks

- **0-50%**: Likely filtered out
- **50-74%**: May pass but ranks poorly
- **75-85%**: Good — likely gets human review
- **85%+**: Excellent — prioritized for review
- **Target: 85%+ for competitive roles**
