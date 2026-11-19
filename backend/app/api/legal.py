"""Public legal compliance HTML pages for Play Store and App Store review."""

from __future__ import annotations

import html

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.core.config import PUBLIC_APP_NAME, SUPPORT_EMAIL

router = APIRouter(prefix="/legal", tags=["legal"])


def _render_legal_page(title: str, subtitle: str, body_html: str) -> str:
    app_name = html.escape(PUBLIC_APP_NAME)
    support_email = html.escape(SUPPORT_EMAIL)
    safe_title = html.escape(title)
    safe_subtitle = html.escape(subtitle)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title} — {app_name}</title>
  <style>
    :root {{
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #475569;
      --accent: #4f46e5;
      --accent-soft: #eef2ff;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #070a12;
        --surface: #0f1524;
        --border: #1e293b;
        --text: #f8fafc;
        --muted: #94a3b8;
        --accent: #818cf8;
        --accent-soft: rgba(99, 102, 241, 0.14);
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
      padding: 24px 16px 48px;
    }}
    .container {{
      max-width: 760px;
      margin: 0 auto;
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }}
    .badge {{
      display: inline-block;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 26px;
      line-height: 1.25;
    }}
    .subtitle {{
      margin: 0 0 24px;
      color: var(--muted);
      font-size: 15px;
    }}
    h2 {{
      margin: 24px 0 8px;
      font-size: 18px;
    }}
    p, li {{
      color: var(--muted);
      font-size: 15px;
    }}
    ul, ol {{
      padding-left: 20px;
      margin: 8px 0 16px;
    }}
    a {{
      color: var(--accent);
      text-decoration: none;
    }}
    a:hover {{
      text-decoration: underline;
    }}
    .footer {{
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
    }}
  </style>
</head>
<body>
  <main class="container">
    <article class="card">
      <div class="badge">{app_name}</div>
      <h1>{safe_title}</h1>
      <p class="subtitle">{safe_subtitle}</p>
      {body_html}
      <footer class="footer">
        <span>Support: <a href="mailto:{support_email}">{support_email}</a></span>
        <span>
          <a href="/legal/privacy">Privacy Policy</a> &middot;
          <a href="/legal/account-deletion">Account Deletion</a>
        </span>
      </footer>
    </article>
  </main>
</body>
</html>"""


@router.get("/privacy", response_class=HTMLResponse)
def privacy_policy() -> HTMLResponse:
    """Serve mobile-responsive Privacy Policy for App Store and Google Play compliance."""
    app_name = html.escape(PUBLIC_APP_NAME)
    support_email = html.escape(SUPPORT_EMAIL)
    body = f"""
      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account &amp; Authentication Data:</strong> Your email address, optional full name, and authentication identifiers managed via email/password or Google OAuth sign-in.</li>
        <li><strong>Candidate Career Profiles &amp; Job Searches:</strong> Resume details (summary, skills, experience, projects, education, certifications) that you upload or enter, along with job search queries, ranked job listings, and tailored CV/cover letter outputs you choose to save.</li>
        <li><strong>Usage &amp; Diagnostics:</strong> Token usage counters (to display cost estimates and enforce Starter trial limits) and crash diagnostics via Sentry. We do not log or sell your personal Gemini API key.</li>
      </ul>

      <h2>2. Google Gemini API Processing Disclosure</h2>
      <p>
        When you trigger resume parsing, job match scoring, CV/cover letter tailoring, or document revisions,
        {app_name} transmits the relevant resume text and job description securely to the <strong>Google Gemini API</strong>
        to generate your tailored documents. You may provide your own Gemini API key (stored locally on your device)
        or use the optional rate-limited Starter Mode.
      </p>

      <h2>3. Data Storage &amp; Security</h2>
      <ul>
        <li><strong>Database &amp; File Storage:</strong> Your saved profiles, job search runs, and tailored documents are stored in our secured PostgreSQL / local application database, and generated A4 PDF documents are stored locally or in private encrypted Supabase Storage (<code>outputs-pdfs</code>) scoped to your user account.</li>
        <li><strong>Observability:</strong> Error telemetry collected by Sentry is used solely to diagnose crashes and improve stability.</li>
      </ul>

      <h2>4. Your Rights &amp; Account Deletion</h2>
      <p>
        You may delete individual profiles, tailored outputs, or your entire account at any time inside the app
        under <strong>Settings &rarr; Delete Account</strong>, or by reviewing our
        <a href="/legal/account-deletion">Account &amp; Data Deletion instructions</a>.
      </p>

      <h2>5. Contact Us</h2>
      <p>
        For privacy questions or data requests, email us at
        <a href="mailto:{support_email}">{support_email}</a>.
      </p>
    """
    return HTMLResponse(
        content=_render_legal_page(
            "Privacy Policy",
            f"How {PUBLIC_APP_NAME} handles authentication, career profiles, Google Gemini processing, and storage.",
            body,
        )
    )


@router.get("/account-deletion", response_class=HTMLResponse)
def account_deletion() -> HTMLResponse:
    """Serve Google Play and Apple App Store compliant Account & Data Deletion instructions."""
    app_name = html.escape(PUBLIC_APP_NAME)
    support_email = html.escape(SUPPORT_EMAIL)
    body = f"""
      <h2>Option 1: Delete Your Account Immediately In-App</h2>
      <ol>
        <li>Open the <strong>{app_name}</strong> mobile app and sign in to your account.</li>
        <li>Navigate to the <strong>Settings</strong> tab.</li>
        <li>Scroll to the <strong>Account</strong> section and tap <strong>Delete Account</strong>.</li>
        <li>Confirm deletion in the confirmation modal. Your account and all associated data are deleted immediately.</li>
      </ol>

      <h2>Option 2: Request Deletion via Support Email</h2>
      <p>
        If you no longer have access to the app, send an email to
        <a href="mailto:{support_email}?subject=Account%20Deletion%20Request">{support_email}</a>
        from your registered email address with the subject line <strong>Account Deletion Request</strong>.
        We verify account ownership and complete deletion within 7 business days.
      </p>

      <h2>Data Removed Upon Account Deletion</h2>
      <ul>
        <li>Your authentication user record (email and login credentials).</li>
        <li>All saved candidate career profiles and uploaded CV extractions.</li>
        <li>All job search runs, scraped/ranked job listings, and match scores.</li>
        <li>All tailored CVs, cover letters, revision chat history, and generated PDF files (both local and cloud storage).</li>
        <li>All per-user token usage history.</li>
      </ul>
    """
    return HTMLResponse(
        content=_render_legal_page(
            "Account & Data Deletion",
            f"How to permanently delete your {PUBLIC_APP_NAME} account and all associated career data.",
            body,
        )
    )
