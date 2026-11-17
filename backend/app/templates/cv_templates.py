"""Strict Markdown templates for CV and Cover Letter generation (ported from hiring agent final)."""

from __future__ import annotations

CV_DATA_ANALYST_TEMPLATE_MD = """# CV Structure Template — Data Analyst
# ⚠️ AGENT INSTRUCTION: Output your CV in EXACTLY this markdown format. Do NOT deviate. Every rule below is mandatory.

---

## FORMATTING RULES (MANDATORY)
1. Name: use `# FULL NAME` (H1, ALL CAPS)
2. Contact line: use a single pipe-separated line immediately after name (no blank line between)
3. Section headers: use `## SECTION NAME` (H2, ALL CAPS) with a blank line before and after
4. Role / Project entries: ALWAYS use this exact format (two lines, no variation):
   `**Title** — Organization / Tech Stack | Start – End`
   then immediately bullet points starting with `- `
5. Bullet points: use `- ` (dash + space). NO asterisks. NO sub-headers inside bullets.
6. Skills: use `| Category | Tools |` table format
7. Projects: Include 2-3 relevant projects under `## KEY PROJECTS`
8. Education: `**Degree** — University | Year`
9. NO extra blank lines between bullets in the same role
10. ONE blank line between roles / projects
11. TWO blank lines between major sections

---

## REQUIRED SECTIONS (in this order)

# FULL NAME
City, Country | phone | email | linkedin | github

## PROFESSIONAL SUMMARY
2-3 sentences. Lead with years of experience + core stack. Use XYZ formula: "Accomplished [X] as measured by [Y] by doing [Z]." End with what you bring to THIS specific company/role.

## CORE TECHNICAL SKILLS
| Category | Tools |
|---|---|
| Programming & Databases | Python (pandas, numpy, scikit-learn), SQL (PostgreSQL, MySQL), Git |
| BI & Visualization | Power BI, Tableau, Advanced Excel |
| Cloud & Engineering | ETL Pipelines, Data Modeling, Jupyter Notebooks |
| Analytical Methods | Statistical Modeling, A/B Testing, Predictive Analytics |

## PROFESSIONAL EXPERIENCE

**Job Title** — Company Name | Start Year – End Year
- [Metric-driven bullet: action verb + what you did + number/% outcome]
- [Metric-driven bullet: action verb + what you did + number/% outcome]
- [Metric-driven bullet: action verb + what you did + number/% outcome]

(Repeat for each role. Minimum 3 bullets per role. Every bullet MUST have a number or metric.)

## KEY PROJECTS

**Project Name** — Tech Stack | Year
- [Metric-driven bullet: action verb + what you built/analyzed + dataset size/% outcome]
- [Metric-driven bullet: technical methodology + business impact/recommendation]

**Project Name** — Tech Stack | Year
- [Metric-driven bullet: action verb + what you built/analyzed + dataset size/% outcome]
- [Metric-driven bullet: technical methodology + business impact/recommendation]

## EDUCATION

**Degree Name** — University Name | Year

## CERTIFICATIONS

- Certification Name (Issuer, Year)

## LANGUAGES

- Language: Level"""

CV_GENERIC_TEMPLATE_MD = """# CV Structure Template — Generic Professional
# ⚠️ AGENT INSTRUCTION: Output your CV in EXACTLY this markdown format. Do NOT deviate.

---

## FORMATTING RULES (MANDATORY)
1. Name: `# FULL NAME` (H1, ALL CAPS)
2. Contact: single pipe-separated line immediately after name
3. Section headers: `## SECTION NAME` (H2, ALL CAPS)
4. Role / Project entries: `**Job Title** — Company / Stack | Start – End` followed by `- ` bullets
5. Bullet points: `- ` only. No asterisks. No inline bold sub-headers.
6. ONE blank line between roles. TWO blank lines between sections.

---

# FULL NAME
City, Country | phone | email | linkedin | github

## PROFESSIONAL SUMMARY
2-3 sentences. Quantified achievement. Core value proposition. Why this role.

## CORE SKILLS
| Category | Tools/Skills |
|---|---|
| [Category] | [Skills] |

## PROFESSIONAL EXPERIENCE

**Job Title** — Company Name | Start – End
- [Achievement with metric]
- [Achievement with metric]

## KEY PROJECTS

**Project Name** — Tech Stack | Year
- [Achievement with metric]
- [Achievement with metric]

## EDUCATION

**Degree** — University | Year

## CERTIFICATIONS

- Certification (Issuer, Year)

## LANGUAGES

- Language: Level"""

COVER_LETTER_TEMPLATE_MD = """# Cover Letter Format Template
# ⚠️ AGENT INSTRUCTION: Output your cover letter in EXACTLY this format. Do NOT add extra sections.

---

FULL NAME
Address Line | City, Country
Phone | Email | LinkedIn

Date (format: DD Month YYYY)

Hiring Manager
Company Name
Company Address (if known, otherwise omit)

**Re: [Job Title] Application**

Dear [Hiring Manager's Name / Hiring Team],

[PARAGRAPH 1 — Hook + Why this company]
2-3 sentences. Lead with a specific reason you want THIS company (not generic "I am writing to apply"). Reference something specific from the JD.

[PARAGRAPH 2 — Your strongest relevant achievement]
3-4 sentences. One story: situation → action → result with a number. Tie it directly to a requirement from the JD.

[PARAGRAPH 3 — Second achievement or broader fit]
3-4 sentences. Reinforce cultural fit and a second key skill. Reference the tone keywords from the ToneProfile.

[PARAGRAPH 4 — Close]
2 sentences. Thank them. State you look forward to discussing further. Professional but confident.

Sincerely,

FULL NAME"""


def get_cv_template(jd_text: str) -> str:
    """Return the appropriate CV markdown template based on JD content."""
    jd_lower = (jd_text or "").lower()
    data_keywords = (
        "analyst",
        "sql",
        "power bi",
        "tableau",
        "python",
        "data engineer",
        "business intelligence",
        "analytics",
        "snowflake",
        "bigquery",
        "dbt",
        "looker",
    )
    if any(kw in jd_lower for kw in data_keywords):
        return CV_DATA_ANALYST_TEMPLATE_MD
    return CV_GENERIC_TEMPLATE_MD


def get_cover_letter_template() -> str:
    """Return the cover letter markdown template."""
    return COVER_LETTER_TEMPLATE_MD
