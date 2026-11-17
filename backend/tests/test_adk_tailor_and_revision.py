"""Pytest coverage for Google ADK agents, Studio tailoring, Aggressive Keyword Injection, Revision Chat, and PDF downloads."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient
from google import genai
from google.adk.agents import LlmAgent, SequentialAgent
from google.genai import _transformers as genai_transformers
from pypdf import PdfReader

from app.agents import GeminiAuthError, adk_agents
from app.agents.adk_agents import (
    CVJsonOutput,
    CVTailorOutput,
    EducationSchema,
    ExperienceSchema,
    ProjectSchema,
    _extract_jd_keywords,
    _fallback_parse_profile,
    _fallback_tailor_pipeline,
    create_application_tailor_pipeline,
    create_jd_extractor_agent,
    create_job_matcher_agent,
    create_profile_parser_agent,
    create_revision_copilot_agent,
    run_application_tailor_pipeline,
)
from app.api import outputs as outputs_api
from app.api.profiles import _normalize_pdf_ligatures
from app.db.models import TailoredOutput
from app.services.pdf_service import (
    generate_pdf_file,
    render_cover_letter_html,
    render_cv_html,
)
from app.templates.cv_templates import (
    COVER_LETTER_TEMPLATE_MD,
    CV_DATA_ANALYST_TEMPLATE_MD,
    CV_GENERIC_TEMPLATE_MD,
)


def test_google_adk_agent_composition() -> None:
    """Confirm Google ADK LlmAgent and SequentialAgent hierarchy is wired properly."""
    parser_agent = create_profile_parser_agent(api_key="test-key-1234", model_name="gemini-3.7-flash")
    jd_agent = create_jd_extractor_agent(api_key="test-key-1234", model_name="gemini-3.7-flash")
    matcher_agent = create_job_matcher_agent(api_key="test-key-1234", model_name="gemini-3.5-flash")
    rev_agent = create_revision_copilot_agent(doc_type="cv", api_key="test-key-1234")
    pipeline = create_application_tailor_pipeline(tone="Technical & Direct", api_key="test-key-1234")

    assert isinstance(parser_agent, LlmAgent)
    assert isinstance(jd_agent, LlmAgent)
    assert isinstance(matcher_agent, LlmAgent)
    assert isinstance(rev_agent, LlmAgent)
    assert isinstance(pipeline, SequentialAgent)
    assert [a.name for a in pipeline.sub_agents] == ["CVStrategistAgent", "CoverLetterWriterAgent"]


def test_studio_extract_tailor_outputs_revision_and_pdf_flow(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict[str, Any],
) -> None:
    # 1. Create active Master Profile (note: lacks dbt, Snowflake, Looker, Airflow)
    prof_res = client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload)
    assert prof_res.status_code == 201

    sample_jd = """Senior Data Analyst at Monzo Bank
Location: London, UK
Salary: £80,000 - £95,000

About the Role:
We are seeking a Senior Data Analyst to partner with product teams in London.
Responsibilities:
- Build scalable dbt models and SQL pipelines in Snowflake.
- Orchestrate workflows using Airflow and Dagster.
- Build executive Looker dashboards and run statistical A/B Testing.
Requirements:
- 4+ years in Python, SQL, dbt, Snowflake, Looker, and Experimentation.
"""

    # 2. Extract JD metadata
    extract_res = client.post(
        "/api/studio/extract-jd",
        headers=auth_headers,
        json={"raw_text": sample_jd, "model": "gemini-3.6-flash"},
    )
    assert extract_res.status_code == 200, extract_res.text
    jd_meta = extract_res.json()
    assert "Data Analyst" in jd_meta["job_title"]
    assert jd_meta["company"]
    assert isinstance(jd_meta["core_requirements"], list) and len(jd_meta["core_requirements"]) >= 1
    assert jd_meta["summary"]

    # 3. Tailor via Studio with Aggressive Keyword Injection & explicit Tone
    tailor_res = client.post(
        "/api/studio/tailor",
        headers=auth_headers,
        json={
            "job_title": "Senior Data Analyst",
            "company": "Monzo Bank",
            "job_url": "https://monzo.com/careers/senior-data-analyst",
            "job_description": sample_jd,
            "custom_capabilities": "Mentored 3 junior analysts on SQL quality checks.",
            "tone": "Technical & Direct",
            "model": "gemini-3.7-flash",
        },
    )
    assert tailor_res.status_code == 200, tailor_res.text
    out = tailor_res.json()
    output_id = out["id"]

    # Verify 4 post-tailoring scores
    for score_key in (
        "overall_fit_score",
        "skills_match_score",
        "experience_fit_score",
        "ats_keyword_score",
    ):
        assert 50 <= out[score_key] <= 100

    # Verify Aggressive Keyword Injection captured missing JD tools & injected them into CV
    injected = out["injected_keywords"]
    assert len(injected) >= 1
    assert any(kw.lower() in out["cv_markdown"].lower() for kw in injected)
    assert any(kw.lower() in {"dbt", "snowflake", "airflow", "looker", "dagster"} for kw in injected)

    # Verify Cover Letter tone & company targeting
    assert "Monzo Bank" in out["cover_letter_markdown"]
    assert "<!DOCTYPE html>" in out["cv_html"]
    assert "<!DOCTYPE html>" in out["cover_letter_html"]

    # Verify initial chat message announces injected keywords
    assert len(out["chat_history"]) == 1
    assert out["chat_history"][0]["role"] == "assistant"
    assert any(kw.lower() in out["chat_history"][0]["content"].lower() for kw in injected)

    # 4. List & Get Saved Outputs
    list_res = client.get("/api/outputs", headers=auth_headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == output_id
    assert items[0]["job_title"] == "Senior Data Analyst"
    assert items[0]["company"] == "Monzo Bank"

    detail_res = client.get(f"/api/outputs/{output_id}", headers=auth_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["cv_pdf_url"] == f"/api/outputs/{output_id}/pdf/cv"
    assert detail_res.json()["cl_pdf_url"] == f"/api/outputs/{output_id}/pdf/cover_letter"

    # 5. Revise CV via AI Revision Chat (remove injected keywords user doesn't know)
    revise_cv_res = client.post(
        f"/api/outputs/{output_id}/revise",
        headers=auth_headers,
        json={
            "doc_type": "cv",
            "instruction": "Remove injected keywords I don't know",
            "model": "gemini-3.5-flash",
        },
    )
    assert revise_cv_res.status_code == 200, revise_cv_res.text
    rev_cv = revise_cv_res.json()
    assert rev_cv["explanation"]
    assert len(rev_cv["chat_history"]) == 3  # initial assistant + user + assistant
    assert rev_cv["chat_history"][-2]["role"] == "user"
    assert rev_cv["chat_history"][-1]["role"] == "assistant"

    # 6. Revise Cover Letter via AI Revision Chat
    revise_cl_res = client.post(
        f"/api/outputs/{output_id}/revise",
        headers=auth_headers,
        json={
            "doc_type": "cover_letter",
            "instruction": "Emphasize quantifiable metrics and onboarding impact",
        },
    )
    assert revise_cl_res.status_code == 200, revise_cl_res.text
    rev_cl = revise_cl_res.json()
    assert "35%" in rev_cl["cover_letter_markdown"] or "quantifiable" in rev_cl["explanation"].lower()
    assert len(rev_cl["chat_history"]) == 5

    # 7. Download A4 PDFs and validate %PDF- headers
    cv_pdf_res = client.get(f"/api/outputs/{output_id}/pdf/cv", headers=auth_headers)
    assert cv_pdf_res.status_code == 200
    assert cv_pdf_res.headers["content-type"].startswith("application/pdf")
    assert "attachment" in cv_pdf_res.headers.get("content-disposition", "")
    assert cv_pdf_res.content.startswith(b"%PDF-")
    assert len(cv_pdf_res.content) > 500

    cl_pdf_res = client.get(f"/api/outputs/{output_id}/pdf/cover_letter", headers=auth_headers)
    assert cl_pdf_res.status_code == 200
    assert cl_pdf_res.headers["content-type"].startswith("application/pdf")
    assert cl_pdf_res.content.startswith(b"%PDF-")

    # 8. Real-time Token & Cost Telemetry validation
    tel_res = client.get("/api/telemetry/tokens", headers=auth_headers)
    assert tel_res.status_code == 200
    tel = tel_res.json()
    assert tel["calls"] >= 4  # extract-jd + tailor + 2 revisions
    assert tel["input_tokens"] > 0
    assert tel["output_tokens"] > 0
    assert tel["total_tokens"] == tel["input_tokens"] + tel["output_tokens"]
    assert tel["est_cost_usd"] > 0
    assert tel["est_cost_formatted"].startswith("$")
    assert "gemini-3.7-flash" in tel["per_model"]
    assert len(tel["available_models"]) == 6


def test_studio_tailor_auto_extracts_missing_title_and_company(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict[str, Any],
) -> None:
    assert client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload).status_code == 201

    res = client.post(
        "/api/studio/tailor",
        headers=auth_headers,
        json={
            "job_description": (
                "Lead Analytics Engineer at Revolut\n"
                "Revolut is seeking a Lead Analytics Engineer skilled in dbt, BigQuery, Airflow, and SQL."
            ),
            "tone": "Conversational",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "Analytics Engineer" in data["job_title"]
    assert "Revolut" in data["company"]
    assert data["tone"] == "Conversational"


_FALLBACK_KARIM_PROFILE = """KARIM FAIQ
Portsmouth, UK | +44-07376411384 | karim.faiq@edu.uiz.ac.ma | linkedin.com/in/karimfaiq | github.com/karimfaiq

SUMMARY
Highly analytical Master's candidate in Data Analytics with 2 years of prior professional experience as a Financial Auditor. Proven track record in interpreting complex financial datasets, identifying risk discrepancies, building automated ETL pipelines, and communicating actionable business insights. Highly skilled in Python (Pandas, NumPy, Scikit-Learn), SQL (PostgreSQL, MySQL), Power BI, Tableau, and statistical modeling.

EDUCATION
Masters in Data Analytics — University of Portsmouth, Portsmouth, United Kingdom | Sept 2024 – Sept 2025
Masters in Audit and Management Control — National School of Commerce and Management, Agadir, Morocco | Sept 2014 – July 2021

CORE TECHNICAL SKILLS
- Programming & Databases: Python (pandas, NumPy, scikit-learn, Matplotlib, Seaborn), SQL (PostgreSQL, MySQL), Git, GitHub
- Business Intelligence & Visualization: Power BI, Tableau, Advanced Excel (Pivot Tables, Power Query, VBA)
- Data Engineering & Modeling: Data Modeling Concepts, ETL Pipeline Automation, Data Quality & Governance, Jupyter Notebooks
- Analytical Methodologies: Statistical Analysis, A/B Testing, Predictive Modeling, Financial Reconciliation, Time-Series Forecasting

WORK EXPERIENCE
Auditor — Icomptes Conseil, Casablanca, Morocco | August 2021 – September 2023
- Conducted comprehensive financial audits for 15+ corporate clients across diverse industries, ensuring strict compliance with accounting standards and regulations.
- Analyzed complex financial statement datasets to identify discrepancies, internal control risks, and operational inefficiencies.
- Prepared detailed audit reports with data-backed actionable recommendations, improving client financial accuracy and reconciliation efficiency by 25%.
- Collaborated effectively with cross-functional audit teams and mentored junior associates on audit workflows and risk assessment techniques.
- Developed and delivered executive financial summaries and key variance insights to C-suite stakeholders and management.

KEY PROJECTS
Automated Financial Audit & ETL Pipeline (Python, PostgreSQL, Pandas)
- Engineered an automated data extraction and transformation pipeline for multi-client financial records, reducing manual audit reconciliation time by 40%.
- Implemented anomaly detection and variance reconciliation scripts to automatically flag financial discrepancies >5%, improving auditing accuracy across 15+ engagements.

Customer Churn Analysis & Retention Dashboard (Tableau, Power BI, Python, Scikit-Learn)
- Built an interactive Power BI dashboard tracking KPI trends, churn drivers, and customer lifetime value (LTV) across 50,000+ customer transaction records.
- Trained a logistic regression and decision tree model identifying top 3 churn risk factors, delivering actionable retention strategies that projected a 12% decrease in churn rate.

E-Commerce Sales Performance & Market Basket Analytics (MySQL, Python, Matplotlib)
- Extracted and cleaned 200,000+ transactional rows using complex SQL CTEs, window functions, and indexing to optimize query latency by 35%.
- Applied Association Rule Mining (Apriori algorithm) to discover high-affinity product combinations, identifying cross-selling bundling opportunities to boost average order value (AOV).
"""


def _load_karim_profile_text() -> str:
    umbrella_profile = Path(__file__).resolve().parents[3] / "hiring agent final" / "data" / "profile.txt"
    if umbrella_profile.exists():
        return umbrella_profile.read_text(encoding="utf-8")
    return _FALLBACK_KARIM_PROFILE


def _assert_valid_a4_pdf(pdf_path: Path) -> str:
    pdf_bytes = pdf_path.read_bytes()
    assert pdf_bytes.startswith(b"%PDF-")
    reader = PdfReader(str(pdf_path))
    assert len(reader.pages) >= 1
    first_page = reader.pages[0]
    width_pt = float(first_page.mediabox.width)
    height_pt = float(first_page.mediabox.height)
    assert 590.0 <= width_pt <= 600.0
    assert 835.0 <= height_pt <= 850.0
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_cv_json_output_schema_and_template_injection() -> None:
    """CVJsonOutput uses typed Pydantic models compatible with Gemini response_schema."""
    assert CVJsonOutput.model_fields["experience"].annotation == List[ExperienceSchema]
    assert CVJsonOutput.model_fields["projects"].annotation == List[ProjectSchema]
    assert CVJsonOutput.model_fields["education"].annotation == List[EducationSchema]

    raw_schema = CVJsonOutput.model_json_schema()
    defs = raw_schema.get("$defs", {})
    assert {"ExperienceSchema", "ProjectSchema", "EducationSchema"}.issubset(defs.keys())
    for schema_def in defs.values():
        assert schema_def.get("type") == "object"
        assert schema_def.get("properties")

    # Verify Google GenAI schema conversion accepts CVTailorOutput with zero untyped Dict objects
    genai_schema = genai_transformers.t_schema(None, CVTailorOutput)
    cv_props = genai_schema.properties["cv_json"].properties
    for field_name in ("experience", "projects", "education"):
        item_schema = cv_props[field_name].items
        assert str(item_schema.type).endswith("OBJECT")
        assert item_schema.properties

    data_pipeline = create_application_tailor_pipeline(
        tone="Executive & Formal",
        api_key="test-key-1234",
        job_description="Senior Data Analyst with SQL and Power BI.",
    )
    cv_agent, cl_agent = data_pipeline.sub_agents
    assert CV_DATA_ANALYST_TEMPLATE_MD in str(cv_agent.instruction)
    assert COVER_LETTER_TEMPLATE_MD in str(cl_agent.instruction)
    assert "{tailored_cv_bundle}" not in str(cl_agent.instruction)

    generic_pipeline = create_application_tailor_pipeline(
        tone="Executive & Formal",
        api_key="test-key-1234",
        job_description="Operations Program Manager overseeing regional logistics.",
    )
    assert CV_GENERIC_TEMPLATE_MD in str(generic_pipeline.sub_agents[0].instruction)


def test_fallback_parser_and_tailor_preserve_multi_section_karim_profile_without_noise() -> None:
    """Section-aware parsing & tailoring preserve roles, 3 projects, and 2 degrees without JD noise."""
    profile_text = _load_karim_profile_text()
    parsed = _fallback_parse_profile(profile_text)

    assert parsed["full_name"] == "KARIM FAIQ"
    assert "Portsmouth" in parsed["location"]
    assert parsed["email"] == "karim.faiq@edu.uiz.ac.ma"

    assert len(parsed["education"]) == 2
    degrees = [edu["degree"] for edu in parsed["education"]]
    assert any("Data Analytics" in d for d in degrees)
    assert any("Audit and Management Control" in d for d in degrees)
    assert parsed["education"][0]["year"] == "Sept 2024 – Sept 2025"
    assert parsed["education"][1]["year"] == "Sept 2014 – July 2021"

    assert len(parsed["experience"]) == 1
    assert parsed["experience"][0]["title"] == "Auditor"
    assert "Icomptes Conseil" in parsed["experience"][0]["company"]
    assert parsed["experience"][0]["duration"] == "August 2021 – September 2023"
    assert len(parsed["experience"][0]["highlights"]) == 5

    assert len(parsed["projects"]) == 3
    project_names = [proj["name"] for proj in parsed["projects"]]
    assert project_names == [
        "Automated Financial Audit & ETL Pipeline",
        "Customer Churn Analysis & Retention Dashboard",
        "E-Commerce Sales Performance & Market Basket Analytics",
    ]
    assert all(len(proj["highlights"]) == 2 for proj in parsed["projects"])

    # Noise-only JD words must never be extracted as keywords
    noise_only_jd = (
        "Hello team in London! Manage racing, sports, betting, affiliates, and weekly stakeholder updates."
    )
    assert _extract_jd_keywords("Data Analyst", noise_only_jd) == []

    pulse_jd = (
        "Data Analyst at Pulse Group\n"
        "Hello! We are looking for a Data Analyst in London for our racing, sports, betting, and affiliates team.\n"
        "Requirements:\n"
        "- Strong SQL, Python, Power BI, dbt, Looker, and Snowflake experience.\n"
    )
    extracted_kw = _extract_jd_keywords("Data Analyst", pulse_jd)
    for noise_word in ("racing", "sports", "betting", "affiliates", "hello", "pulse", "group", "london"):
        assert noise_word not in [k.lower() for k in extracted_kw]
    assert {"SQL", "Python", "Power BI", "dbt", "Looker", "Snowflake"}.issubset(set(extracted_kw))

    tailored = _fallback_tailor_pipeline(
        profile_markdown=profile_text,
        job_title="Data Analyst",
        company="Pulse Group",
        job_description=pulse_jd,
        custom_capabilities="",
        tone="Executive & Formal",
    )
    for noise_word in ("racing", "sports", "betting", "affiliates"):
        assert noise_word not in [k.lower() for k in tailored["injected_keywords"]]
        assert noise_word not in tailored["cv_markdown"].lower()

    assert set(tailored["injected_keywords"]).issubset({"dbt", "Looker", "Snowflake"})
    assert len(tailored["cv_json"]["experience"]) == 1
    assert tailored["cv_json"]["experience"][0]["title"] == "Auditor"
    assert len(tailored["cv_json"]["projects"]) == 3
    assert len(tailored["cv_json"]["education"]) == 2
    assert "| Programming & Databases |" in tailored["cv_markdown"]
    assert "| BI & Visualization |" in tailored["cv_markdown"]
    assert "## KEY PROJECTS" in tailored["cv_markdown"]
    assert "## EDUCATION" in tailored["cv_markdown"]

    cl_lines = tailored["cover_letter_markdown"].splitlines()
    assert cl_lines[0] == "KARIM FAIQ"
    assert "**Re: Data Analyst Application**" in tailored["cover_letter_markdown"]
    assert "Dear Pulse Group Hiring Team," in tailored["cover_letter_markdown"]
    assert tailored["cover_letter_markdown"].rstrip().endswith("Sincerely,\n\nKARIM FAIQ")


def test_direct_gemini_tailor_fallback_and_auth_error_propagation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ADK fails in live mode, direct Gemini fallback runs cleanly and auth errors propagate."""
    profile_text = _load_karim_profile_text()
    monkeypatch.setenv("ENVIRONMENT", "development")

    async def _fail_adk(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("400 INVALID_ARGUMENT: simulated ADK error")

    monkeypatch.setattr(adk_agents, "_execute_adk_agent_async", _fail_adk)

    sample_cv_md = """```markdown
# KARIM FAIQ
Portsmouth, UK | +44-07376411384 | karim.faiq@edu.uiz.ac.ma

## PROFESSIONAL SUMMARY
Data Analyst with 2 years of audit experience skilled in Python, SQL, and dbt.

## CORE TECHNICAL SKILLS
| Category | Tools |
| --- | --- |
| Programming & Databases | Python, SQL, PostgreSQL |
| Cloud & Engineering | dbt, ETL Pipelines |

## PROFESSIONAL EXPERIENCE
**Auditor** — Icomptes Conseil, Casablanca, Morocco | August 2021 – September 2023
- Reduced reconciliation time by **25%** across 15+ corporate audits.

## KEY PROJECTS
**Automated Financial Audit & ETL Pipeline** — Python, PostgreSQL | 2024
- Cut manual audit effort by **40%** using automated SQL checks.

## EDUCATION
**Masters in Data Analytics** — University of Portsmouth | Sept 2024 – Sept 2025
```"""
    sample_cl_md = """KARIM FAIQ
Portsmouth, UK | karim.faiq@edu.uiz.ac.ma

17 November 2026

Hiring Manager
Monzo

**Re: Data Analyst Application**

Dear Monzo Hiring Team,

Paragraph 1 with measurable results.

Sincerely,

KARIM FAIQ"""

    calls: List[str] = []

    class _FakeModels:
        def generate_content(self, model: str, contents: str) -> Any:
            calls.append(model)
            text = sample_cv_md if len(calls) == 1 else sample_cl_md
            return SimpleNamespace(
                text=text,
                usage_metadata=SimpleNamespace(prompt_token_count=320, candidates_token_count=210),
            )

    class _FakeClient:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key
            self.models = _FakeModels()

    monkeypatch.setattr(genai, "Client", _FakeClient)

    result, in_tok, out_tok = run_application_tailor_pipeline(
        profile_markdown=profile_text,
        job_title="Data Analyst",
        company="Monzo",
        job_description="Seeking Data Analyst with SQL, Python, and dbt.",
        api_key="AIzaSyFakeLiveKeyForDirectFallbackTest12345",
        model_name="gemini-3.7-flash",
    )
    assert len(calls) == 2
    assert in_tok == 640 and out_tok == 420
    assert not result["cv_markdown"].startswith("```")
    assert "dbt" in result["injected_keywords"]
    assert result["cover_letter_markdown"].startswith("KARIM FAIQ")

    class _AuthFailModels:
        def generate_content(self, **_kwargs: Any) -> Any:
            raise RuntimeError("400 INVALID_ARGUMENT: API_KEY_INVALID")

    class _AuthFailClient:
        def __init__(self, api_key: str) -> None:
            self.models = _AuthFailModels()

    monkeypatch.setattr(genai, "Client", _AuthFailClient)
    with pytest.raises(GeminiAuthError):
        run_application_tailor_pipeline(
            profile_markdown=profile_text,
            job_title="Data Analyst",
            company="Monzo",
            job_description="SQL, Python, dbt",
            api_key="AIzaSyRevokedLiveKeyForDirectFallbackTest12345",
        )


def test_pdf_ligature_normalization_restores_broken_fi_fl_words() -> None:
    """Uploaded PDF ligature artifacts (fi/fl/ffi) are normalized cleanly."""
    corrupted = (
        "\ufb01nancial analyses improving e\ufb03ciency, work\ufb02ow, and "
        "nancial reconciliation eciency with procient specic certications."
    )
    cleaned = _normalize_pdf_ligatures(corrupted)
    assert "financial analyses improving efficiency, workflow" in cleaned
    assert "financial reconciliation efficiency with proficient specific certifications." in cleaned


def test_generate_pdf_file_playwright_and_fpdf2_fallback_no_stray_markers_or_overlap(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Playwright primary and FPDF2 fallback render valid A4 PDFs with no stray ** or overlaps."""
    cv_md = """# KARIM FAIQ
Portsmouth, UK | +44-07376411384 | karim.faiq@edu.uiz.ac.ma | linkedin.com/in/karimfaiq | github.com/karimfaiq

## PROFESSIONAL SUMMARY
Data Analyst with **2 years** of financial audit experience and **40%** ETL speedup.

## CORE TECHNICAL SKILLS
| Category | Tools |
| --- | --- |
| Programming & Databases | Python, SQL, PostgreSQL |
| BI & Visualization | Power BI, Tableau |

## PROFESSIONAL EXPERIENCE
**Principal Financial Infrastructure & Enterprise Risk Quantitative Analytics Architect** — Global Multi-Region Clearing Corp | August 2021 – September 2023
- Improved reconciliation accuracy by **25%** across **15+** engagements without stray ** markers.

**Auditor** -- Icomptes Conseil | 2019 - 2021
- Audited financial statements across corporate clients.

## KEY PROJECTS
**Automated Financial Audit & ETL Pipeline** — Python, PostgreSQL | 2024
- Reduced manual reconciliation time by **40%**.

## EDUCATION
**Masters in Data Analytics** — University of Portsmouth | Sept 2024 – Sept 2025
**Masters in Audit and Management Control** — National School of Commerce and Management | Sept 2014 – July 2021
"""
    cl_md = """KARIM FAIQ
Portsmouth, UK | +44-07376411384 | karim.faiq@edu.uiz.ac.ma

17 November 2026

Hiring Manager
Pulse Group

**Re: Data Analyst Application**

Dear Pulse Group Hiring Team,

I delivered **40%** faster reconciliation through automated ETL pipelines.

Sincerely,

KARIM FAIQ"""

    # 1. Verify HTML styling parity & stray marker removal
    cv_html = render_cv_html(cv_md)
    assert "Plus Jakarta Sans" in cv_html
    assert "#2563eb" in cv_html and "<svg" in cv_html
    assert "grid-template-columns: 180px 1fr" in cv_html
    assert "<strong>25%</strong>" in cv_html
    assert "text-align: justify" in cv_html
    assert "**" not in cv_html

    cl_html = render_cover_letter_html(cl_md, job_title="Data Analyst", company="Pulse Group")
    assert "Plus Jakarta Sans" in cl_html
    assert '<h1 class="sender-name">KARIM FAIQ</h1>' in cl_html
    assert '<div class="subject-line"><strong>Re: Data Analyst Application</strong></div>' in cl_html
    assert "<strong>40%</strong>" in cl_html
    assert "**" not in cl_html

    # 2. Playwright Chromium primary renderer (including inside an active asyncio loop)
    pw_cv_pdf = tmp_path / "karim_pw_cv.pdf"
    pw_cl_pdf = tmp_path / "karim_pw_cl.pdf"
    generate_pdf_file(cv_md, str(pw_cv_pdf), doc_type="cv")
    asyncio.run(asyncio.to_thread(lambda: None))

    async def _render_inside_loop() -> None:
        generate_pdf_file(cl_md, str(pw_cl_pdf), doc_type="cover_letter")

    asyncio.run(_render_inside_loop())

    pw_cv_text = _assert_valid_a4_pdf(pw_cv_pdf)
    pw_cl_text = _assert_valid_a4_pdf(pw_cl_pdf)
    assert "KARIM FAIQ" in pw_cv_text
    assert "PROFESSIONAL EXPERIENCE" in pw_cv_text
    assert "KEY PROJECTS" in pw_cv_text
    assert "EDUCATION" in pw_cv_text
    assert "**" not in pw_cv_text
    assert "KARIM FAIQ" in pw_cl_text
    assert "Re: Data Analyst Application" in pw_cl_text
    assert "**" not in pw_cl_text

    # 3. Fixed FPDF2 secondary fallback: verify no stray ** and monotonically descending y-coords
    monkeypatch.setenv("DISABLE_PLAYWRIGHT_PDF", "1")
    fpdf_cv_pdf = tmp_path / "karim_fpdf_cv.pdf"
    fpdf_cl_pdf = tmp_path / "karim_fpdf_cl.pdf"
    generate_pdf_file(cv_md, str(fpdf_cv_pdf), doc_type="cv")
    generate_pdf_file(cl_md, str(fpdf_cl_pdf), doc_type="cover_letter")

    fpdf_cv_text = _assert_valid_a4_pdf(fpdf_cv_pdf)
    fpdf_cl_text = _assert_valid_a4_pdf(fpdf_cl_pdf)
    assert "**" not in fpdf_cv_text
    assert "**" not in fpdf_cl_text

    page = PdfReader(str(fpdf_cv_pdf)).pages[0]
    positioned_lines: List[Tuple[float, str]] = []

    def _visitor(text: str, _cm: Any, tm: Any, _font_dict: Any, _font_size: Any) -> None:
        if text.strip():
            positioned_lines.append((round(float(tm[5]), 2), text.strip()))

    page.extract_text(visitor_text=_visitor)

    def _find_y(snippet: str) -> float:
        for y_val, line_txt in positioned_lines:
            if snippet in line_txt:
                return y_val
        raise AssertionError(f"Missing expected PDF text snippet: {snippet!r}")

    y_header_line1 = _find_y("Principal Financial Infrastructure")
    y_header_line2 = _find_y("Global Multi-Region Clearing Corp")
    y_bullet1 = _find_y("Improved reconciliation accuracy")
    y_second_entry = _find_y("Auditor -- Icomptes Conseil")

    # PDF y-origin is bottom-left: lower text must have strictly smaller y coordinates
    assert y_header_line1 > y_header_line2 > y_bullet1 > y_second_entry


def test_delete_tailored_output_and_cross_user_isolation(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict[str, Any],
    isolated_env: Any,
) -> None:
    """DELETE /api/outputs/{id} removes DB row and PDF artifacts while enforcing user ownership."""
    assert client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload).status_code == 201

    tailor_res = client.post(
        "/api/studio/tailor",
        headers=auth_headers,
        json={
            "job_title": "Senior Data Analyst",
            "company": "DeleteTarget Co",
            "job_description": "Seeking a Senior Data Analyst skilled in Python, SQL, and Tableau.",
            "tone": "Executive & Formal",
        },
    )
    assert tailor_res.status_code == 200, tailor_res.text
    output_id = tailor_res.json()["id"]

    with isolated_env() as session:
        row = session.get(TailoredOutput, output_id)
        assert row is not None
        cv_pdf_path = Path(row.cv_pdf_path)
        cl_pdf_path = Path(row.cl_pdf_path)
        output_dir = (outputs_api.OUTPUTS_DIR / row.user_id / row.id).resolve()

    assert cv_pdf_path.is_file()
    assert cl_pdf_path.is_file()
    assert output_dir.is_dir()

    # Cross-user DELETE must return 404 and leave owner's record and PDFs untouched
    other_signup = client.post(
        "/api/auth/signup",
        json={
            "email": "other.analyst@example.com",
            "password": "StrongPassword123!",
            "full_name": "Other User",
        },
    )
    assert other_signup.status_code == 200, other_signup.text
    other_headers = {"Authorization": f"Bearer {other_signup.json()['access_token']}"}

    cross_del = client.delete(f"/api/outputs/{output_id}", headers=other_headers)
    assert cross_del.status_code == 404

    assert client.get(f"/api/outputs/{output_id}", headers=auth_headers).status_code == 200
    assert cv_pdf_path.is_file()
    assert cl_pdf_path.is_file()
    assert output_dir.is_dir()

    # Owner DELETE returns 200, cleans PDFs/directory, and removes from list & detail endpoints
    del_res = client.delete(f"/api/outputs/{output_id}", headers=auth_headers)
    assert del_res.status_code == 200, del_res.text
    assert del_res.json() == {"deleted": True, "id": output_id}

    assert not cv_pdf_path.exists()
    assert not cl_pdf_path.exists()
    assert not output_dir.exists()
    assert outputs_api.OUTPUTS_DIR.is_dir()

    list_res = client.get("/api/outputs", headers=auth_headers)
    assert list_res.status_code == 200
    assert all(item["id"] != output_id for item in list_res.json())
    assert list_res.json() == []

    assert client.get(f"/api/outputs/{output_id}", headers=auth_headers).status_code == 404
    assert client.delete(f"/api/outputs/{output_id}", headers=auth_headers).status_code == 404

