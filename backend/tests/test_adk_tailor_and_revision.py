"""Pytest coverage for Google ADK agents, Studio tailoring, Aggressive Keyword Injection, Revision Chat, and PDF downloads."""

from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient
from google.adk.agents import LlmAgent, SequentialAgent

from app.agents.adk_agents import (
    create_application_tailor_pipeline,
    create_jd_extractor_agent,
    create_job_matcher_agent,
    create_profile_parser_agent,
    create_revision_copilot_agent,
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

