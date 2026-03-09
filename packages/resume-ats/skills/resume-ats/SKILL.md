---
name: resume-ats
description: Evaluate and optimize resumes for ATS (Applicant Tracking Systems). Use when the user wants to review their resume for ATS compatibility, optimize keywords for a specific job description, fix formatting issues that cause ATS rejection, or restructure their resume following 2025-2026 best practices. Works with the pdf-tools skill for reading PDF resumes.
metadata:
  author: josorio7122
  version: "1.0"
---

# Resume ATS Optimizer

Evaluate and optimize resumes for Applicant Tracking Systems following 2025-2026 best practices.

75% of resumes are rejected by ATS before a human ever sees them. This skill helps ensure resumes pass ATS parsing and ranking.

## When to Use

- User wants their resume reviewed for ATS compatibility
- User wants to optimize their resume for a specific job description
- User wants to fix formatting that causes ATS rejection
- User needs to restructure their resume for modern ATS systems
- User wants keyword optimization against a job posting

## Prerequisites

1. **User's resume** — as PDF (use pdf-tools skill to read) or pasted text
2. **Target job description** (optional but recommended) — for keyword matching
3. **Target role/industry** — to calibrate expectations

## Evaluation Process

When evaluating a resume, check ALL of the following in order:

### Phase 1: Formatting Compliance (Pass/Fail)

These are binary — if any fail, the resume may not parse at all:

| Check | Pass | Fail |
|-------|------|------|
| Single-column layout | ✅ Linear top-to-bottom flow | ❌ Multi-column, sidebars, text boxes |
| No graphics/images | ✅ Text only | ❌ Photos, logos, icons, skill bars |
| No tables | ✅ Plain text lists | ❌ Tables for layout or skills |
| Standard fonts | ✅ Arial, Calibri, Helvetica, Garamond, Georgia, Times New Roman | ❌ Custom/decorative fonts |
| Contact in body | ✅ In main document text | ❌ In header/footer (25% of ATS skip headers) |
| Standard section headers | ✅ Experience, Education, Skills, Contact | ❌ Creative headers ("My Journey", "Where I've Worked") |
| Standard bullets | ✅ •, -, * | ❌ Arrows (➢), checkmarks, Wingdings |
| Standard date format | ✅ MM/YYYY or Month Year | ❌ "Summer 2023", "'23-Present" |
| Text-based PDF | ✅ Text is selectable | ❌ Scanned/image PDF |
| Margins | ✅ 0.5-1 inch all sides | ❌ <0.4 inch (text may be cut) |

### Phase 2: Structure Evaluation

Check for required sections in this order:

1. **Contact Information** — Full name, email, phone, LinkedIn, city/state (NO full street address)
2. **Professional Summary** — 3-5 sentences, opens with title + years, contains 5-7 keywords
3. **Core Skills / Technical Skills** — 15-25 skills, flat list (pipe-separated or bullet list), NO ratings/bars
4. **Work Experience** — Reverse chronological, format: `Job Title | Company, City, State | MM/YYYY – MM/YYYY`, 3-6 bullets per role using CAR format (Challenge-Action-Result)
5. **Education** — Full degree names spelled out, institution, year
6. **Certifications** — Full official names with certifying body and year
7. (Optional) Awards, Publications, Languages

### Phase 3: Keyword Optimization (if job description provided)

1. Extract top 20 keywords from job description
2. Categorize:
   - **Hard skills** (60-70% weight): tools, certifications, technical competencies
   - **Job scope** (20-30% weight): team size, P&L, years in role
   - **Soft skills** (5-10% weight): leadership, communication (only if explicitly in JD)
3. Check resume for each keyword — exact match or semantic equivalent
4. Calculate match score: count matched keywords / total keywords × 100
5. Target: **75%+ minimum, 85%+ for competitive roles**
6. Flag missing keywords with suggestions for where to add them

### Phase 4: Content Quality

- Every bullet should use an **action verb** + **skill/keyword** + **quantifiable result**
- Check for buzzwords to replace with specific metrics
- Verify job titles match industry standard titles
- Spell out abbreviations at first use: "Search Engine Optimization (SEO)"
- Check keyword density: optimal is 1-2% (overdoing causes penalties)

## Output Format

Present the evaluation as:

```
## Resume ATS Evaluation

### Overall Score: [X/100]

### Phase 1: Formatting ✅/❌
- [List each check with pass/fail]
- [Specific issues and how to fix them]

### Phase 2: Structure ✅/❌
- [List each section: present/missing/needs improvement]
- [Specific recommendations]

### Phase 3: Keyword Match [X%]
- Missing keywords: [list]
- Where to add them: [specific suggestions]

### Phase 4: Content Quality
- Weak bullets to strengthen: [list with rewrites]
- Buzzwords to replace: [list with alternatives]

### Priority Fixes (Top 3)
1. [Most impactful fix]
2. [Second most impactful]
3. [Third most impactful]
```

## File Format Recommendations

- **Default: PDF** (text-based, exported from Word/Docs — NOT scanned)
- **Use DOCX only if** job posting explicitly requests Word
- **Filename**: `FirstName_LastName_Resume.pdf`
- **File size**: Under 5MB
- **Never use**: .pages, scanned PDFs, image-based documents

## Page Length Guidelines

- **<7 years experience**: 1 page (keeps keyword density high)
- **7-15 years**: 2 pages (standard expectation)
- **15+ years / executive**: 2-3 pages

## Integration with Other Skills

- Use **pdf-tools** to read the user's PDF resume
- Use **cold-email** to help craft outreach after optimizing the resume
- Use **job-search** to find target job descriptions for keyword optimization

## Reference

See [ATS Formatting Guide](references/ats-formatting-guide.md) for detailed formatting rules, typography standards, and ATS testing tools.

See [ATS Keyword Optimization Guide](references/ats-keyword-optimization.md) for keyword tiers, extraction process, placement strategy, and emerging 2025-2026 keywords.

## Rules

- ALWAYS run all 4 phases — never skip phases
- ALWAYS provide specific, actionable fixes (not vague advice)
- ALWAYS show the keyword match score when a JD is provided
- NEVER suggest adding skills the user doesn't actually have
- NEVER recommend graphics, tables, columns, or fancy formatting
- NEVER suggest creative section headers — use standard ones only
- If reading a PDF resume, use pdf-tools skill first to extract the text
- Present results in the structured output format above
- Prioritize fixes by impact — formatting issues before keyword optimization
