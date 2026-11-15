"""Executive Modern A4 HTML preview and FPDF2 PDF generation service."""

from __future__ import annotations

import html
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from fpdf import FPDF
from fpdf.enums import XPos, YPos

SVG_ICONS: Dict[str, str] = {
    "location": (
        '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px;fill:#2563eb;" '
        'viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 '
        '7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 '
        '1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
    ),
    "phone": (
        '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px;fill:#2563eb;" '
        'viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.'
        '67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-'
        '7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 '
        '1.02l-2.2 2.2z"/></svg>'
    ),
    "email": (
        '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px;fill:#2563eb;" '
        'viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 '
        '2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>'
    ),
    "linkedin": (
        '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px;fill:#2563eb;" '
        'viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 '
        '2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 '
        '1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75'
        'M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/></svg>'
    ),
    "github": (
        '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:4px;fill:#2563eb;" '
        'viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-'
        '.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-'
        '.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22'
        '-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 '
        '1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.'
        '2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V'
        '21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>'
    ),
}

_LATIN1_REPLACEMENTS = str.maketrans(
    {
        "\u2014": "--",  # em dash
        "\u2013": "-",   # en dash
        "\u2018": "'",   # left single quote
        "\u2019": "'",   # right single quote
        "\u201c": '"',   # left double quote
        "\u201d": '"',   # right double quote
        "\u2022": "-",   # bullet
        "\u2026": "...", # ellipsis
        "\u00a0": " ",   # nbsp
        "\u2192": "->",  # right arrow
        "\u20ac": "EUR ",
    }
)


def _escape_and_bold(text: str) -> str:
    """Escape HTML entities before converting markdown **bold** to <strong>."""
    escaped = html.escape(text, quote=True)
    return re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", escaped)


def _sanitize_pdf_text(text: str) -> str:
    """Normalize Unicode punctuation so built-in FPDF Latin-1 fonts never fail."""
    cleaned = (text or "").translate(_LATIN1_REPLACEMENTS)
    return cleaned.encode("latin-1", errors="ignore").decode("latin-1")


def _strip_markdown_markers(text: str) -> str:
    return re.sub(r"\*\*(.*?)\*\*", r"\1", text).replace("`", "").strip()


def _cv_json_to_markdown(cv_json: Dict[str, Any]) -> str:
    """Synthesize clean Markdown CV from structured cv_json when raw markdown is absent."""
    lines: List[str] = []
    full_name = str(cv_json.get("full_name") or "Candidate Resume").strip()
    lines.append(f"# {full_name}")

    contact_parts = [
        str(cv_json.get(k) or "").strip()
        for k in ("email", "phone", "location", "linkedin_url", "github_url", "portfolio_url")
        if str(cv_json.get(k) or "").strip()
    ]
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    lines.append("")

    summary = str(cv_json.get("summary") or "").strip()
    if summary:
        lines.append("## Professional Summary")
        lines.append(summary)
        lines.append("")

    skills = cv_json.get("skills") or []
    if skills:
        lines.append("## Core Skills")
        if isinstance(skills, dict):
            lines.append("| Category | Skills |")
            lines.append("| --- | --- |")
            for cat, items in skills.items():
                val = ", ".join(str(x) for x in items) if isinstance(items, list) else str(items)
                lines.append(f"| {cat} | {val} |")
        elif isinstance(skills, list):
            lines.append("- " + ", ".join(str(s) for s in skills))
        lines.append("")

    for section_key, section_title in (
        ("experience", "Professional Experience"),
        ("projects", "Key Projects"),
        ("education", "Education"),
    ):
        entries = cv_json.get(section_key) or []
        if not entries:
            continue
        lines.append(f"## {section_title}")
        for entry in entries:
            if isinstance(entry, str):
                lines.append(f"- {entry}")
                continue
            if not isinstance(entry, dict):
                continue
            role = str(entry.get("title") or entry.get("role") or entry.get("degree") or entry.get("name") or "").strip()
            org = str(entry.get("company") or entry.get("institution") or entry.get("organization") or "").strip()
            dates = str(entry.get("dates") or entry.get("date") or entry.get("period") or "").strip()
            header = f"**{role}**" if role else "**Role**"
            if org:
                header += f" — {org}"
            if dates:
                header += f" | {dates}"
            lines.append(header)
            for bullet in entry.get("bullets") or entry.get("highlights") or []:
                lines.append(f"- {bullet}")
            desc = str(entry.get("description") or "").strip()
            if desc:
                lines.append(f"- {desc}")
            lines.append("")

    certs = cv_json.get("certifications") or []
    if certs:
        lines.append("## Certifications")
        for c in certs:
            lines.append(f"- {c}")

    return "\n".join(lines).strip()


def render_cv_html(cv_markdown: str, cv_json: Optional[Dict[str, Any]] = None) -> str:
    """Render a tailored CV Markdown document into Executive Modern A4 HTML."""
    source_md = (cv_markdown or "").strip()
    if not source_md and cv_json:
        source_md = _cv_json_to_markdown(cv_json)
    if not source_md:
        source_md = "# Candidate Resume\n\n## Summary\nNo CV content generated yet."

    lines = source_md.split("\n")
    name = ""
    contact_parts: List[str] = []
    sections: List[Dict[str, Any]] = []
    current_section: Optional[Dict[str, Any]] = None

    i = 0
    while i < len(lines):
        clean = lines[i].strip()
        if not clean or clean.startswith("<!--") or (clean.startswith("---") and len(clean) == 3):
            i += 1
            continue
        if clean.startswith("#") and "AGENT INSTRUCTION" in clean:
            i += 1
            continue

        if clean.startswith("# ") and not clean.startswith("## "):
            name = clean[2:].strip()
            i += 1
            while i < len(lines):
                c_line = lines[i].strip()
                if c_line and not c_line.startswith("#") and not c_line.startswith("---"):
                    contact_parts = [p.strip() for p in c_line.split("|") if p.strip()]
                    i += 1
                    break
                if c_line.startswith("#"):
                    break
                i += 1
            continue

        if clean.startswith("## "):
            sec_title = clean[3:].strip().upper()
            current_section = {
                "title": sec_title,
                "items": [],
            }
            sections.append(current_section)
            i += 1
            continue

        if current_section is None:
            current_section = {"title": "SUMMARY", "items": []}
            sections.append(current_section)

        if clean.startswith("|"):
            cells = [c.strip() for c in clean.split("|") if c.strip()]
            if cells and not all(
                c.replace("-", "").replace(":", "") == "" or c.lower() in {"category", "tools", "skills", "tools/skills"}
                for c in cells
            ):
                current_section["items"].append({"type": "table_row", "cells": cells})
            i += 1
            continue

        if clean.startswith("### ") or clean.startswith("**") or ("—" in clean and ("|" in clean or "20" in clean)):
            title_clean = clean[4:].strip() if clean.startswith("### ") else clean
            title_clean = title_clean.replace("**", "")
            date_part = ""
            main_part = title_clean
            if " | " in title_clean:
                main_part, date_part = [p.strip() for p in title_clean.rsplit(" | ", 1)]
            elif " |" in title_clean:
                main_part, date_part = [p.strip() for p in title_clean.rsplit(" |", 1)]

            current_section["items"].append(
                {
                    "type": "entry",
                    "title": main_part,
                    "date": date_part,
                    "bullets": [],
                }
            )
            i += 1
            continue

        if clean.startswith("- ") or clean.startswith("* ") or clean.startswith("• "):
            bullet_text = clean[2:].strip()
            if current_section["items"] and current_section["items"][-1].get("type") == "entry":
                current_section["items"][-1]["bullets"].append(bullet_text)
            else:
                current_section["items"].append({"type": "bullet", "text": bullet_text})
            i += 1
            continue

        current_section["items"].append({"type": "paragraph", "text": clean})
        i += 1

    contact_html_items: List[str] = []
    for cp in contact_parts:
        cp_lower = cp.lower()
        safe_cp = html.escape(cp, quote=True)
        if "@" in cp:
            contact_html_items.append(
                f'<span class="contact-item">{SVG_ICONS["email"]}<a href="mailto:{safe_cp}">{safe_cp}</a></span>'
            )
        elif "linkedin" in cp_lower:
            url = html.escape(cp if cp.startswith("http") else f"https://{cp}", quote=True)
            display = html.escape(cp.replace("https://", "").replace("http://", "").replace("www.", ""), quote=True)
            contact_html_items.append(
                f'<span class="contact-item">{SVG_ICONS["linkedin"]}<a href="{url}" target="_blank">{display}</a></span>'
            )
        elif "github" in cp_lower:
            url = html.escape(cp if cp.startswith("http") else f"https://{cp}", quote=True)
            display = html.escape(cp.replace("https://", "").replace("http://", "").replace("www.", ""), quote=True)
            contact_html_items.append(
                f'<span class="contact-item">{SVG_ICONS["github"]}<a href="{url}" target="_blank">{display}</a></span>'
            )
        elif any(c.isdigit() for c in cp) and len(cp) >= 7 and ("+" in cp or "-" in cp or cp.startswith("0")):
            contact_html_items.append(f'<span class="contact-item">{SVG_ICONS["phone"]}{safe_cp}</span>')
        else:
            contact_html_items.append(f'<span class="contact-item">{SVG_ICONS["location"]}{safe_cp}</span>')

    contact_bar = (
        '<div class="contact-bar">' + ' <span class="dot">&bull;</span> '.join(contact_html_items) + "</div>"
        if contact_html_items
        else ""
    )

    body_html: List[str] = []
    for sec in sections:
        if not sec["items"]:
            continue
        body_html.append('<div class="section-block avoid-break">')
        body_html.append(f'<h2 class="section-title">{html.escape(sec["title"])}</h2>')

        table_rows = [it for it in sec["items"] if it.get("type") == "table_row"]
        if table_rows:
            body_html.append('<div class="skills-grid">')
            for tr in table_rows:
                cells = tr["cells"]
                if len(cells) >= 2:
                    cat = html.escape(cells[0].replace("**", ""))
                    tools = html.escape(cells[1].replace("**", ""))
                    body_html.append(f'<div class="skill-category">{cat}</div>')
                    body_html.append(f'<div class="skill-tools">{tools}</div>')
                elif len(cells) == 1:
                    body_html.append(
                        f'<div class="skill-category" style="grid-column: span 2;">{html.escape(cells[0])}</div>'
                    )
            body_html.append("</div>")

        for it in sec["items"]:
            itype = it.get("type")
            if itype == "paragraph":
                body_html.append(f'<p class="section-text">{_escape_and_bold(it["text"])}</p>')
            elif itype == "entry":
                body_html.append('<div class="entry-block avoid-break">')
                body_html.append('<div class="entry-header">')
                body_html.append(f'<span class="entry-title">{html.escape(it["title"])}</span>')
                if it["date"]:
                    body_html.append(f'<span class="entry-date">{html.escape(it["date"])}</span>')
                body_html.append("</div>")
                if it["bullets"]:
                    body_html.append('<ul class="bullet-list">')
                    for b in it["bullets"]:
                        body_html.append(f'<li>{_escape_and_bold(b)}</li>')
                    body_html.append("</ul>")
                body_html.append("</div>")
            elif itype == "bullet":
                body_html.append(f'<ul class="bullet-list"><li>{_escape_and_bold(it["text"])}</li></ul>')

        body_html.append("</div>")

    display_name = name or (str((cv_json or {}).get("full_name") or "").strip()) or "Candidate Resume"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(display_name)} - Executive Resume</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 12mm 15mm;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    font-size: 9.5pt;
    line-height: 1.45;
    padding: 18px 20px;
    -webkit-font-smoothing: antialiased;
  }}
  .cv-container {{ max-width: 794px; margin: 0 auto; }}
  .header-block {{
    text-align: center;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid #2563eb;
  }}
  .candidate-name {{
    font-size: 19pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #0f172a;
    text-transform: uppercase;
    margin-bottom: 6px;
  }}
  .contact-bar {{
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 6px 10px;
    font-size: 8.5pt;
    color: #475569;
    font-weight: 500;
  }}
  .contact-item {{ display: inline-flex; align-items: center; }}
  .contact-item a {{ color: #475569; text-decoration: none; }}
  .dot {{ color: #94a3b8; font-size: 8pt; }}
  .section-block {{ margin-bottom: 11px; }}
  .section-title {{
    font-size: 9.6pt;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 2px;
    margin-bottom: 6px;
    margin-top: 8px;
  }}
  .section-text {{
    font-size: 9pt;
    color: #334155;
    line-height: 1.45;
    margin-bottom: 4px;
  }}
  .skills-grid {{
    display: grid;
    grid-template-columns: 165px 1fr;
    gap: 4px 12px;
    font-size: 8.8pt;
    margin-bottom: 4px;
  }}
  .skill-category {{ font-weight: 600; color: #1e293b; }}
  .skill-tools {{ color: #334155; word-break: break-word; line-height: 1.35; }}
  .entry-block {{ margin-bottom: 8px; }}
  .entry-header {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 2px;
  }}
  .entry-title {{ font-size: 9.3pt; font-weight: 700; color: #0f172a; }}
  .entry-date {{ font-size: 8.4pt; font-weight: 500; color: #64748b; white-space: nowrap; }}
  .bullet-list {{ list-style-type: none; padding-left: 14px; margin-top: 2px; }}
  .bullet-list li {{
    position: relative;
    font-size: 8.8pt;
    color: #334155;
    line-height: 1.4;
    margin-bottom: 3px;
  }}
  .bullet-list li::before {{
    content: "\\2022";
    position: absolute;
    left: -12px;
    top: 0;
    color: #2563eb;
    font-weight: bold;
  }}
  .bullet-list strong {{ color: #0f172a; font-weight: 600; }}
  .avoid-break {{ break-inside: avoid; page-break-inside: avoid; }}
</style>
</head>
<body>
<div class="cv-container">
  <div class="header-block">
    <h1 class="candidate-name">{html.escape(display_name)}</h1>
    {contact_bar}
  </div>
  {"".join(body_html)}
</div>
</body>
</html>"""


def render_cover_letter_html(cl_markdown: str, job_title: str = "", company: str = "") -> str:
    """Render a tailored Cover Letter Markdown string into Executive Modern A4 letterhead HTML."""
    lines = (cl_markdown or "").strip().split("\n")
    formatted_body: List[str] = []
    has_subject = False

    for raw_line in lines:
        c = raw_line.strip()
        if not c or c.startswith("<!--") or (c.startswith("---") and len(c) == 3):
            continue
        if c.startswith("#") and "AGENT INSTRUCTION" in c:
            continue
        if c.startswith("# ") and not c.startswith("## "):
            formatted_body.append(f'<h1 class="sender-name">{html.escape(c[2:].strip())}</h1>')
        elif c.startswith("## "):
            formatted_body.append(f'<h2 class="section-sub">{html.escape(c[3:].strip())}</h2>')
        elif c.startswith("**Re:") or c.startswith("Re:"):
            has_subject = True
            clean_re = c.replace("**", "")
            formatted_body.append(f'<div class="subject-line"><strong>{html.escape(clean_re)}</strong></div>')
        elif c.startswith("Dear ") or c.startswith("Sincerely,") or c.startswith("Best regards,"):
            formatted_body.append(f'<p class="salutation"><strong>{html.escape(c)}</strong></p>')
        elif c.startswith("- ") or c.startswith("* "):
            formatted_body.append(f'<ul class="letter-list"><li>{_escape_and_bold(c[2:].strip())}</li></ul>')
        else:
            formatted_body.append(f'<p class="letter-para">{_escape_and_bold(c)}</p>')

    subject_banner = ""
    if not has_subject and (job_title or company):
        role_desc = " at ".join(part for part in (job_title.strip(), company.strip()) if part)
        subject_banner = f'<div class="subject-line"><strong>Re: Application for {html.escape(role_desc)}</strong></div>'

    if not formatted_body:
        formatted_body.append('<p class="letter-para">Cover letter content pending generation.</p>')

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cover Letter - {html.escape(job_title or "Application")}</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 20mm 22mm;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1e293b;
    background: #ffffff;
    font-size: 10pt;
    line-height: 1.6;
    padding: 24px 26px;
    max-width: 794px;
    margin: 0 auto;
  }}
  .sender-name {{
    font-size: 16pt;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 2px solid #2563eb;
    padding-bottom: 6px;
    margin-bottom: 16px;
  }}
  .section-sub {{
    font-size: 11pt;
    font-weight: 700;
    color: #1e293b;
    margin: 12px 0 6px;
  }}
  .subject-line {{
    margin: 14px 0;
    padding: 8px 12px;
    background: #f8fafc;
    border-left: 3px solid #2563eb;
    font-size: 10.2pt;
    color: #0f172a;
  }}
  .salutation {{ margin: 14px 0 10px 0; color: #0f172a; }}
  .letter-para {{ margin-bottom: 12px; color: #334155; }}
  .letter-list {{ margin: 6px 0 10px 18px; color: #334155; }}
  .letter-list li {{ margin-bottom: 4px; }}
</style>
</head>
<body>
  {subject_banner}
  {"".join(formatted_body)}
</body>
</html>"""


class _ExecutivePDF(FPDF):
    """A4 FPDF2 document with subtle footer page numbering."""

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 8, f"Page {self.page_no()}", align="R")


def generate_pdf_file(
    markdown_text: str,
    output_path: str,
    doc_type: str = "cv",
    title: str = "",
) -> str:
    """
    Render Markdown CV or Cover Letter text into a valid A4 PDF file using fpdf2.
    Creates parent directories if needed and returns output_path.
    """
    target_path = Path(output_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = _ExecutivePDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    margin_x = 15 if doc_type == "cv" else 20
    pdf.set_margins(margin_x, 15, margin_x)
    pdf.add_page()

    usable_w = pdf.w - 2 * margin_x
    lines = (markdown_text or "").strip().split("\n")
    is_cover_letter = (doc_type or "").lower() in {"cover_letter", "cl", "letter"}

    rendered_any = False
    if title and is_cover_letter and not any(line.strip().startswith("# ") for line in lines[:3]):
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(15, 23, 42)
        pdf.multi_cell(usable_w, 7, _sanitize_pdf_text(title.upper()), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_draw_color(37, 99, 235)
        pdf.set_line_width(0.6)
        pdf.line(margin_x, pdf.get_y() + 1, pdf.w - margin_x, pdf.get_y() + 1)
        pdf.ln(5)
        rendered_any = True

    idx = 0
    while idx < len(lines):
        raw = lines[idx].strip()
        if not raw or raw.startswith("<!--") or (raw.startswith("---") and len(raw) == 3):
            idx += 1
            continue
        if raw.startswith("#") and "AGENT INSTRUCTION" in raw:
            idx += 1
            continue

        # Document Name / Top Header
        if raw.startswith("# ") and not raw.startswith("## "):
            heading = _sanitize_pdf_text(_strip_markdown_markers(raw[2:]))
            pdf.set_font("Helvetica", "B", 16)
            pdf.set_text_color(15, 23, 42)
            pdf.multi_cell(
                usable_w,
                7.5,
                heading.upper(),
                align="L" if is_cover_letter else "C",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
            rendered_any = True
            # Look ahead for contact bar on CV
            if not is_cover_letter and idx + 1 < len(lines):
                nxt = lines[idx + 1].strip()
                if nxt and not nxt.startswith("#") and not nxt.startswith("---"):
                    pdf.set_font("Helvetica", "", 9)
                    pdf.set_text_color(71, 85, 105)
                    pdf.multi_cell(
                        usable_w,
                        4.8,
                        _sanitize_pdf_text(_strip_markdown_markers(nxt)),
                        align="C",
                        new_x=XPos.LMARGIN,
                        new_y=YPos.NEXT,
                    )
                    idx += 1

            pdf.set_draw_color(37, 99, 235)
            pdf.set_line_width(0.6)
            y_line = pdf.get_y() + 1.5
            pdf.line(margin_x, y_line, pdf.w - margin_x, y_line)
            pdf.ln(4.5)
            idx += 1
            continue

        # Section Heading (## )
        if raw.startswith("## "):
            sec_heading = _sanitize_pdf_text(_strip_markdown_markers(raw[3:])).upper()
            pdf.ln(2.5)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(15, 23, 42)
            pdf.multi_cell(usable_w, 5.5, sec_heading, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_draw_color(203, 213, 225)
            pdf.set_line_width(0.3)
            y_line = pdf.get_y() + 0.5
            pdf.line(margin_x, y_line, pdf.w - margin_x, y_line)
            pdf.ln(2.5)
            rendered_any = True
            idx += 1
            continue

        # Markdown Table Row (Skills)
        if raw.startswith("|"):
            cells = [_strip_markdown_markers(c.strip()) for c in raw.split("|") if c.strip()]
            if cells and not all(
                c.replace("-", "").replace(":", "") == "" or c.lower() in {"category", "tools", "skills", "tools/skills"}
                for c in cells
            ):
                row_text = f"{cells[0]}: {cells[1]}" if len(cells) >= 2 else cells[0]
                pdf.set_font("Helvetica", "", 9.2)
                pdf.set_text_color(51, 65, 85)
                pdf.multi_cell(usable_w, 4.8, _sanitize_pdf_text(row_text), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                rendered_any = True
            idx += 1
            continue

        # Entry header (### Title or **Role** — Company | Date)
        if raw.startswith("### ") or (not is_cover_letter and (raw.startswith("**") or ("—" in raw and "|" in raw))):
            clean_entry = _strip_markdown_markers(raw[4:] if raw.startswith("### ") else raw)
            main_part, date_part = clean_entry, ""
            if " | " in clean_entry:
                main_part, date_part = [p.strip() for p in clean_entry.rsplit(" | ", 1)]
            pdf.ln(1.5)
            pdf.set_font("Helvetica", "B", 9.8)
            pdf.set_text_color(15, 23, 42)
            if date_part:
                date_w = 42
                title_w = usable_w - date_w
                y_before = pdf.get_y()
                pdf.multi_cell(title_w, 5.0, _sanitize_pdf_text(main_part), align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
                y_after_title = pdf.get_y()
                pdf.set_xy(margin_x + title_w, y_before)
                pdf.set_font("Helvetica", "", 8.8)
                pdf.set_text_color(100, 116, 139)
                pdf.cell(date_w, 5.0, _sanitize_pdf_text(date_part), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                if y_after_title > pdf.get_y():
                    pdf.set_y(y_after_title)
            else:
                pdf.multi_cell(usable_w, 5.0, _sanitize_pdf_text(main_part), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            rendered_any = True
            idx += 1
            continue

        # Bullet point
        if raw.startswith("- ") or raw.startswith("* ") or raw.startswith("• "):
            bullet_body = _sanitize_pdf_text(_strip_markdown_markers(raw[2:].strip()))
            pdf.set_font("Helvetica", "", 9.2)
            pdf.set_text_color(51, 65, 85)
            pdf.set_x(margin_x + 3)
            pdf.multi_cell(usable_w - 3, 4.6, f"- {bullet_body}", align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(0.5)
            rendered_any = True
            idx += 1
            continue

        # Standard paragraph
        para_text = _sanitize_pdf_text(_strip_markdown_markers(raw))
        is_salutation = raw.startswith("**Re:") or raw.startswith("Re:") or raw.startswith("Dear ") or raw.startswith("Sincerely,")
        pdf.set_font("Helvetica", "B" if is_salutation else "", 9.8 if is_cover_letter else 9.2)
        pdf.set_text_color(15, 23, 42) if is_salutation else pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(usable_w, 5.2 if is_cover_letter else 4.8, para_text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2.2 if is_cover_letter else 1.0)
        rendered_any = True
        idx += 1

    if not rendered_any:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(usable_w, 5.5, _sanitize_pdf_text(title or "Generated Document"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.output(str(target_path))
    return str(target_path)
