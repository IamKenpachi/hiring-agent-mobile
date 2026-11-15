"""Pytest coverage for JobSpy 8-board scraping, partial failure warnings, 4-score ranking, SSE & job tailoring."""

from __future__ import annotations

import json
from typing import Any, Dict

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.agents.adk_agents import rank_jobs_batch
from app.services import jobspy_service


def test_platforms_endpoint_exposes_all_8_jobspy_boards(client: TestClient) -> None:
    res = client.get("/api/hunt/platforms")
    assert res.status_code == 200
    data = res.json()
    assert data["primary"] == ["linkedin", "indeed", "glassdoor", "google", "zip_recruiter"]
    assert data["regional"] == ["bayt", "naukri", "bdjobs"]
    assert len(data["primary"]) + len(data["regional"]) == 8


def test_rank_jobs_batch_chunks_batches_of_ten_and_sorts_desc() -> None:
    jobs = [
        {
            "title": "Data Analyst" if i % 2 == 0 else "Office Clerk",
            "company": f"Company {i}",
            "location": "Remote",
            "salary": "",
            "source_platform": "indeed",
            "job_url": f"https://example.com/job/{i}",
            "description": (
                "Python, SQL, PostgreSQL, Tableau, Pandas, A/B Testing"
                if i % 2 == 0
                else "Filing paperwork and reception coverage."
            ),
        }
        for i in range(12)
    ]
    profile_md = "# Alex Mercer\n## CORE TECHNICAL SKILLS\n| Stack | Python, SQL, PostgreSQL, Tableau, Pandas, A/B Testing |"
    ranked, in_tok, out_tok = rank_jobs_batch(jobs, profile_md, api_key="test-key-123")
    assert len(ranked) == 12
    assert in_tok > 0 and out_tok > 0
    scores = [r["overall_fit_score"] for r in ranked]
    assert scores == sorted(scores, reverse=True)
    assert ranked[0]["title"] == "Data Analyst"


def test_jobspy_partial_board_failure_and_four_score_ranking(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Create active Master Profile first
    prof_res = client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload)
    assert prof_res.status_code == 201

    def fake_scrape_jobs(**kwargs: Any):
        sites = kwargs.get("site_name") or []
        site = sites[0] if sites else "linkedin"
        if site == "glassdoor":
            raise RuntimeError("HTTP 429 Too Many Requests from Glassdoor")
        if site == "linkedin":
            return pd.DataFrame(
                [
                    {
                        "title": "Senior Data Analyst",
                        "company": "Monzo Bank",
                        "location": "London, UK",
                        "min_amount": 75000,
                        "max_amount": 90000,
                        "currency": "GBP",
                        "interval": "yearly",
                        "site": "linkedin",
                        "job_url": "https://linkedin.com/jobs/view/101",
                        "description": (
                            "Seeking Senior Data Analyst with Python, SQL, PostgreSQL, Tableau, "
                            "A/B Testing, Pandas, and Snowflake dbt experience."
                        ),
                    },
                    {
                        "title": "BI Reporting Analyst",
                        "company": "Starling Bank",
                        "location": "London, UK",
                        "salary": "£60,000",
                        "site": "linkedin",
                        "job_url": "https://linkedin.com/jobs/view/102",
                        "description": "SQL, Tableau, KPI Reporting, and stakeholder dashboards.",
                    },
                ]
            )
        if site == "bayt":
            return pd.DataFrame(
                [
                    {
                        "title": "Junior Supply Coordinator",
                        "company": "Desert Logistics",
                        "location": "Dubai, UAE",
                        "salary": "AED 12,000",
                        "site": "bayt",
                        "job_url": "https://bayt.com/jobs/202",
                        "description": "Coordinate warehouse freight manifests and Excel schedules.",
                    }
                ]
            )
        return pd.DataFrame(
            [
                {
                    "title": "Product Data Analyst",
                    "company": "Revolut",
                    "location": "London, UK",
                    "salary": "£70,000 - £82,000",
                    "site": site,
                    "job_url": f"https://{site}.com/jobs/303",
                    "description": "Python, SQL, Tableau, Experimentation, Looker, and Cohort Analysis.",
                }
            ]
        )

    monkeypatch.setattr(jobspy_service, "scrape_jobs", fake_scrape_jobs)

    # Start synchronous hunt across primary + regional boards including failing glassdoor
    start_res = client.post(
        "/api/hunt/start",
        headers=auth_headers,
        json={
            "query": "Data Analyst",
            "location": "London, UK",
            "radius": 25,
            "platforms": ["linkedin", "glassdoor", "bayt", "naukri"],
            "hours_old": 168,
            "work_type": "Any",
            "requested_top_n": 3,
            "run_sync": True,
        },
    )
    assert start_res.status_code == 200, start_res.text
    start_data = start_res.json()
    assert start_data["status"] == "completed"
    run_id = start_data["run_id"]

    # Fetch run details + ranked jobs
    run_res = client.get(f"/api/hunt/runs/{run_id}", headers=auth_headers)
    assert run_res.status_code == 200
    payload = run_res.json()
    run = payload["run"]
    jobs = payload["jobs"]

    assert run["status"] == "completed"
    assert run["progress_pct"] == 100.0
    assert run["total_scraped"] == 4
    # Graceful non-blocking warning recorded for rate-limited Glassdoor
    assert any("glassdoor" in w.lower() and "429" in w for w in run["warnings"])

    # Respects requested_top_n=3 and sorted descending by overall_fit_score
    assert len(jobs) == 3
    scores = [j["overall_fit_score"] for j in jobs]
    assert scores == sorted(scores, reverse=True)
    assert jobs[0]["company"] == "Monzo Bank"

    # All 4 scores present on every RankedJob
    for j in jobs:
        for field in (
            "overall_fit_score",
            "skills_match_score",
            "experience_fit_score",
            "ats_keyword_score",
        ):
            assert 0 <= j[field] <= 100
        assert isinstance(j["matched_skills"], list)
        assert isinstance(j["missing_skills"], list)
        assert j["match_reason"]
        assert j["recommendation"]

    # SSE stream returns completed event
    with client.stream("GET", f"/api/hunt/runs/{run_id}/stream", headers=auth_headers) as sse:
        assert sse.status_code == 200
        raw_stream = "".join(sse.iter_text())
        assert "completed" in raw_stream
        data_lines = [ln[5:].strip() for ln in raw_stream.splitlines() if ln.startswith("data:")]
        assert data_lines
        last_evt = json.loads(data_lines[-1])
        assert last_evt["status"] == "completed"

    # Job detail + One-tap tailoring from hunted job
    top_job_id = jobs[0]["id"]
    detail_res = client.get(f"/api/hunt/jobs/{top_job_id}", headers=auth_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["title"] == "Senior Data Analyst"

    tailor_res = client.post(
        f"/api/hunt/jobs/{top_job_id}/tailor",
        headers=auth_headers,
        json={"tone": "Modern & Impactful", "custom_capabilities": "Led Snowflake migration."},
    )
    assert tailor_res.status_code == 200, tailor_res.text
    tailored = tailor_res.json()
    assert tailored["ranked_job_id"] == top_job_id
    assert tailored["tone"] == "Modern & Impactful"
    assert len(tailored["injected_keywords"]) >= 1
    assert tailored["chat_history"][0]["role"] == "assistant"


def test_hunt_background_task_execution(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload).status_code == 201

    def fake_scrape_jobs(**kwargs: Any):
        return pd.DataFrame(
            [
                {
                    "title": "Analytics Engineer",
                    "company": "Stripe",
                    "location": "Remote",
                    "salary": "$160,000",
                    "site": "indeed",
                    "job_url": "https://indeed.com/view/999",
                    "description": "Python, SQL, dbt, Airflow, Snowflake.",
                }
            ]
        )

    monkeypatch.setattr(jobspy_service, "scrape_jobs", fake_scrape_jobs)
    start_res = client.post(
        "/api/hunt/start",
        headers=auth_headers,
        json={
            "query": "Analytics Engineer",
            "location": "Remote",
            "platforms": ["indeed"],
            "requested_top_n": 5,
            "run_sync": False,
        },
    )
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]

    # Starlette TestClient runs BackgroundTasks before returning response
    run_res = client.get(f"/api/hunt/runs/{run_id}", headers=auth_headers)
    assert run_res.status_code == 200
    assert run_res.json()["run"]["status"] == "completed"
    assert len(run_res.json()["jobs"]) == 1
