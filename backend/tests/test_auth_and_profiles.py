"""Pytest coverage for /health, Auth, Gemini Key validation, and Multi-Profile management."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.api import profiles as profiles_api
from app.core.config import DEFAULT_MODEL, resolve_gemini_model
from app.db.models import Profile, TokenUsage
from app.main import app
from app.services.pdf_service import generate_pdf_file


def test_health_endpoint(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "hiring-agent-mobile-api"}


def test_auth_signup_login_me_and_invalid_token(client: TestClient) -> None:
    signup_res = client.post(
        "/api/auth/signup",
        json={
            "email": "CareerUser@Example.com",
            "password": "MyPassword99!",
            "full_name": "Jordan Blake",
        },
    )
    assert signup_res.status_code == 200, signup_res.text
    signup_data = signup_res.json()
    assert "access_token" in signup_data
    assert signup_data["user"]["email"] == "careeruser@example.com"
    assert signup_data["user"]["full_name"] == "Jordan Blake"

    # Duplicate email returns 409
    dup_res = client.post(
        "/api/auth/signup",
        json={"email": "careeruser@example.com", "password": "MyPassword99!"},
    )
    assert dup_res.status_code == 409

    # Wrong password returns 401
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "careeruser@example.com", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401

    # Valid login returns JWT working on /api/auth/me
    login_res = client.post(
        "/api/auth/login",
        json={"email": "careeruser@example.com", "password": "MyPassword99!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "careeruser@example.com"

    # Explicitly invalid token returns 401
    bad_me = client.get("/api/auth/me", headers={"Authorization": "Bearer totally.invalid.jwt"})
    assert bad_me.status_code == 401


def test_validate_gemini_key_and_missing_key_guard(
    client: TestClient, auth_headers: Dict[str, str]
) -> None:
    assert DEFAULT_MODEL == "gemini-3.8-flash"
    assert resolve_gemini_model(None) == "gemini-3.8-flash"
    assert resolve_gemini_model("gemini-3.7-flash") == "gemini-3.8-flash"
    assert resolve_gemini_model("models/gemini-3.6-flash") == "gemini-3.8-flash"
    assert resolve_gemini_model("gemini-3.5-flash") == "gemini-3.8-flash"
    assert resolve_gemini_model("gemini-2.5-flash") == "gemini-3.8-flash"
    assert resolve_gemini_model("gemini-3.1-pro-preview") == "gemini-4-argon"
    assert resolve_gemini_model("gemini-2.5-pro") == "gemini-4-argon"
    assert resolve_gemini_model("gemini-3.1-flash-lite") == "gemini-3.5-flash-lite"
    assert resolve_gemini_model("gemini-2.5-flash-lite") == "gemini-3.5-flash-lite"
    assert resolve_gemini_model("Career Strategist") == "gemini-4-hydrogen"
    assert resolve_gemini_model("Executive Headhunter") == "gemini-4-argon"

    valid_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "test-valid-gemini-key-98765", "model": "gemini-4-hydrogen"},
    )
    assert valid_res.status_code == 200
    payload = valid_res.json()
    assert payload["valid"] is True
    assert payload["active_model"] == "gemini-4-hydrogen"
    model_ids = [m["id"] for m in payload["models"]]
    assert model_ids == [
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-4-hydrogen",
        "gemini-4-argon",
    ]

    legacy_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "test-valid-gemini-key-98765", "model": "gemini-3.7-flash"},
    )
    assert legacy_res.status_code == 200
    assert legacy_res.json()["active_model"] == "gemini-3.8-flash"

    invalid_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "bad"},
    )
    assert invalid_res.status_code == 200
    assert invalid_res.json()["valid"] is False

    # Missing X-Gemini-Api-Key on AI endpoints raises 400
    auth_only = {"Authorization": auth_headers["Authorization"]}
    extract_res = client.post(
        "/api/studio/extract-jd",
        headers=auth_only,
        json={"raw_text": "Senior Data Analyst at Monzo Bank requiring Python, SQL, and dbt."},
    )
    assert extract_res.status_code == 400


def test_profile_wizard_crud_activation_and_isolation(
    client: TestClient,
    auth_headers: Dict[str, str],
    sample_wizard_payload: Dict,
) -> None:
    # Create first profile via Questionnaire Wizard JSON -> automatically default
    create_1 = client.post("/api/profiles", headers=auth_headers, json=sample_wizard_payload)
    assert create_1.status_code == 201, create_1.text
    prof_1 = create_1.json()
    assert prof_1["is_default"] is True
    assert "ALEX MERCER" in prof_1["raw_markdown"]
    assert "FinTech Insights Ltd" in prof_1["raw_markdown"]

    # Create second profile
    second_payload = dict(sample_wizard_payload)
    second_payload["profile_name"] = "Analytics Engineering Track"
    second_payload["is_default"] = False
    second_payload["skills"] = ["Python", "SQL", "dbt", "Snowflake", "Airflow"]
    create_2 = client.post("/api/profiles", headers=auth_headers, json=second_payload)
    assert create_2.status_code == 201
    prof_2 = create_2.json()
    assert prof_2["is_default"] is False

    # Update profile 2 and confirm raw_markdown rebuilds
    upd_res = client.put(
        f"/api/profiles/{prof_2['id']}",
        headers=auth_headers,
        json={"summary": "Lead Analytics Engineer specializing in dbt and Snowflake."},
    )
    assert upd_res.status_code == 200
    assert "Lead Analytics Engineer" in upd_res.json()["raw_markdown"]

    # Activate profile 2 -> only profile 2 should have is_default=True
    act_res = client.post(f"/api/profiles/{prof_2['id']}/activate", headers=auth_headers)
    assert act_res.status_code == 200
    assert act_res.json()["is_default"] is True

    listed = client.get("/api/profiles", headers=auth_headers).json()
    assert len(listed) == 2
    defaults = [p["id"] for p in listed if p["is_default"]]
    assert defaults == [prof_2["id"]]

    # User isolation: another user cannot access/delete profile 1
    user_b = client.post(
        "/api/auth/signup",
        json={"email": "other@example.com", "password": "Password123!"},
    ).json()
    user_b_headers = {"Authorization": f"Bearer {user_b['access_token']}"}
    assert client.get("/api/profiles", headers=user_b_headers).json() == []
    assert client.delete(f"/api/profiles/{prof_1['id']}", headers=user_b_headers).status_code == 404

    # Delete default profile 2 -> profile 1 becomes default
    del_res = client.delete(f"/api/profiles/{prof_2['id']}", headers=auth_headers)
    assert del_res.status_code == 200
    remaining = client.get("/api/profiles", headers=auth_headers).json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == prof_1["id"]
    assert remaining[0]["is_default"] is True


def test_profile_pdf_and_markdown_upload(
    client: TestClient, auth_headers: Dict[str, str], tmp_path: Path
) -> None:
    resume_md = """# Priya Nair
London, UK | +44 7700 900555 | priya.nair@example.com | linkedin.com/in/priyanair

## PROFESSIONAL SUMMARY
Senior Analytics Engineer with 6 years building dbt, Snowflake, SQL, and Python pipelines.

## CORE TECHNICAL SKILLS
| Category | Tools |
| --- | --- |
| Stack | Python, SQL, dbt, Snowflake, Airflow, Looker |

## PROFESSIONAL EXPERIENCE
**Senior Analytics Engineer** — Nimbus Data | 2021 - Present
- Reduced Snowflake warehouse compute costs by 32% through incremental dbt modeling.

## EDUCATION
**BSc Computer Science** — University of Manchester | 2018
"""
    pdf_path = tmp_path / "priya_cv.pdf"
    generate_pdf_file(resume_md, str(pdf_path), doc_type="cv")
    pdf_bytes = pdf_path.read_bytes()
    assert pdf_bytes.startswith(b"%PDF-")

    upload_res = client.post(
        "/api/profiles/upload-pdf",
        headers=auth_headers,
        files={"file": ("priya_cv.pdf", pdf_bytes, "application/pdf")},
        data={"profile_name": "Priya Uploaded PDF"},
    )
    assert upload_res.status_code == 201, upload_res.text
    prof = upload_res.json()
    assert prof["profile_name"] == "Priya Uploaded PDF"
    assert "priya.nair@example.com" in prof["email"].lower()
    assert len(prof["skills"]) >= 3

    # Also test UTF-8 Markdown upload
    md_upload = client.post(
        "/api/profiles/upload-pdf",
        headers=auth_headers,
        files={"file": ("cv.md", resume_md.encode("utf-8"), "text/markdown")},
        data={"profile_name": "Priya Markdown CV"},
    )
    assert md_upload.status_code == 201

    # Verify token usage telemetry was recorded for profile parsing
    telemetry = client.get("/api/telemetry/tokens", headers=auth_headers).json()
    assert telemetry["calls"] >= 2
    assert telemetry["input_tokens"] > 0
    assert telemetry["output_tokens"] > 0
    assert telemetry["est_cost_usd"] > 0


def test_parse_profile_preview_pre_auth(client: TestClient, tmp_path: Path) -> None:
    resume_md = """# Karim Faiq
London, UK | +44 7700 900111 | karim.faiq@example.com | linkedin.com/in/karimfaiq

## PROFESSIONAL SUMMARY
Senior Data Analyst building scalable dbt pipelines and executive KPI dashboards.

## CORE TECHNICAL SKILLS
Python, SQL, Snowflake, dbt, Tableau, Airflow

## PROFESSIONAL EXPERIENCE
**Senior Data Analyst** — FinTech Corp | 2023 - Present
- Built 15+ dbt models in Snowflake reducing query latency by 40%.

## EDUCATION
**B.Sc. Computer Science** — University of London | 2020
"""
    pdf_path = tmp_path / "karim_cv.pdf"
    generate_pdf_file(resume_md, str(pdf_path), doc_type="cv")
    pdf_bytes = pdf_path.read_bytes()

    preview_res = client.post(
        "/api/profiles/parse-preview",
        headers={"X-Gemini-Api-Key": "test-dummy-key-123456"},
        files={"file": ("Karim_Data_Analyst_CV.pdf", pdf_bytes, "application/pdf")},
    )
    assert preview_res.status_code == 200, preview_res.text
    preview = preview_res.json()
    assert preview["filename"] == "Karim_Data_Analyst_CV.pdf"
    assert preview["file_size_bytes"] == len(pdf_bytes)
    assert "karim.faiq@example.com" in preview["email"].lower()
    assert len(preview["skills"]) >= 3


def test_upload_profile_pdf_strips_nul_bytes(
    isolated_env,
    client: TestClient,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_raw_texts = []

    def _fake_parse(raw_text: str, api_key: str, model_name: str):
        captured_raw_texts.append(raw_text)
        return (
            {
                "full_name": "Nadia\x00 Vance",
                "email": "nadia\x00@example.com",
                "phone": "+44 7700\x00 900111",
                "location": "London\x00, UK",
                "linkedin_url": "",
                "github_url": "",
                "portfolio_url": "",
                "summary": "Data\x00 Analyst focused on SQL.",
                "skills": ["Python\x00", "SQL"],
                "experience": [{"role": "Junior\x00 Data Analyst", "company": "Acme\x00"}],
                "projects": [],
                "education": [],
                "certifications": [],
                "raw_markdown": "# Nadia\x00 Vance\nData\x00 Analyst",
            },
            851,
            360,
        )

    monkeypatch.setattr(profiles_api, "parse_profile_from_text", _fake_parse)

    # Pure NUL-byte payload is rejected cleanly as unreadable
    empty_res = client.post(
        "/api/profiles/upload-pdf",
        headers=auth_headers,
        files={"file": ("empty.txt", b"\x00\x00\x00", "text/plain")},
    )
    assert empty_res.status_code == 400

    upload_res = client.post(
        "/api/profiles/upload-pdf",
        headers=auth_headers,
        data={"profile_name": "Junior\x00 Data Analyst"},
        files={"file": ("cv\x00.txt", b"Nadia\x00 Vance\nJunior Data Analyst\nPython\x00 SQL", "text/plain")},
    )
    assert upload_res.status_code == 201, upload_res.text
    assert "\x00" not in captured_raw_texts[0]

    body = upload_res.json()
    assert body["profile_name"] == "Junior Data Analyst"
    assert body["full_name"] == "Nadia Vance"
    assert body["skills"] == ["Python", "SQL"]
    assert "\x00" not in body["raw_markdown"]

    with isolated_env() as verify_db:
        profiles = verify_db.execute(select(Profile)).scalars().all()
        usages = verify_db.execute(select(TokenUsage)).scalars().all()
        assert len(profiles) == 1
        assert len(usages) == 1
        assert usages[0].operation_type == "profile_parse"
        assert usages[0].input_tokens == 851
        assert usages[0].output_tokens == 360


def test_unhandled_exception_preserves_cors_and_rolls_back_token_usage(
    isolated_env,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _fake_parse(raw_text: str, api_key: str, model_name: str):
        return (
            {
                "full_name": "Junior Candidate",
                "email": "junior@example.com",
                "summary": "Data Analyst",
                "skills": ["SQL", "Python"],
            },
            500,
            200,
        )

    monkeypatch.setattr(profiles_api, "parse_profile_from_text", _fake_parse)

    fail_next_commit = True

    def _fail_once(session) -> None:
        nonlocal fail_next_commit
        if fail_next_commit:
            fail_next_commit = False
            raise RuntimeError("simulated DB commit failure")

    event.listen(isolated_env, "before_commit", _fail_once)
    try:
        err_client = TestClient(app, raise_server_exceptions=False)
        err_res = err_client.post(
            "/api/profiles/upload-pdf",
            headers={**auth_headers, "Origin": "http://localhost:8081"},
            data={"profile_name": "Junior Data Analyst"},
            files={"file": ("cv.txt", b"Junior Candidate\nData Analyst", "text/plain")},
        )
    finally:
        event.remove(isolated_env, "before_commit", _fail_once)

    assert err_res.status_code == 500
    assert err_res.headers.get("access-control-allow-origin") == "*"
    assert "simulated DB commit failure" in err_res.json()["detail"]

    with isolated_env() as verify_db:
        assert verify_db.execute(select(Profile)).scalars().all() == []
        assert verify_db.execute(select(TokenUsage)).scalars().all() == []


def test_validate_gemini_key_live_verification_and_placeholder_rejection(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from google import genai

    monkeypatch.setenv("ENVIRONMENT", "development")

    # Placeholder keys are rejected outside test environment without contacting Google
    placeholder_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "test-valid-gemini-key-98765"},
    )
    assert placeholder_res.status_code == 200
    assert placeholder_res.json()["valid"] is False
    assert "placeholder" in (placeholder_res.json()["detail"] or "").lower()

    # Invalid Google AI Studio keys fail live models.list() check by default
    class _FailingModels:
        def list(self, **_kwargs):
            raise RuntimeError("400 INVALID_ARGUMENT: API_KEY_INVALID")

    class _FailingClient:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.models = _FailingModels()

    monkeypatch.setattr(genai, "Client", _FailingClient)
    bad_live_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "AIzaSyInvalidKeyForTesting123456"},
    )
    assert bad_live_res.status_code == 200
    assert bad_live_res.json()["valid"] is False
    assert "API_KEY_INVALID" in (bad_live_res.json()["detail"] or "")

    # Working live key passes verification cleanly
    class _OkModels:
        def list(self, **_kwargs):
            return iter([{"name": "models/gemini-2.5-flash"}])

    class _OkClient:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.models = _OkModels()

    monkeypatch.setattr(genai, "Client", _OkClient)
    ok_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "AIzaSyValidKeyForTesting1234567"},
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["valid"] is True
    assert ok_res.json()["detail"] is None


def test_gemini_auth_error_returns_401_with_cors_and_zero_tokens(
    isolated_env,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.agents import adk_agents

    monkeypatch.setenv("ENVIRONMENT", "development")

    async def _fail_auth(*_args, **_kwargs):
        raise RuntimeError(
            "400 INVALID_ARGUMENT. {'error': {'code': 400, 'message': 'API key not valid.', "
            "'details': [{'reason': 'API_KEY_INVALID'}]}}"
        )

    monkeypatch.setattr(adk_agents, "_execute_adk_agent_async", _fail_auth)

    err_client = TestClient(app, raise_server_exceptions=False)
    res = err_client.post(
        "/api/profiles/upload-pdf",
        headers={
            **auth_headers,
            "X-Gemini-Api-Key": "AIzaSyRevokedKey123456789012345",
            "Origin": "http://localhost:8081",
        },
        data={"profile_name": "Junior Data Analyst"},
        files={"file": ("cv.txt", b"Junior Candidate\nData Analyst", "text/plain")},
    )

    assert res.status_code == 401
    assert res.headers.get("access-control-allow-origin") == "*"
    assert "rejected your api key" in res.json()["detail"].lower()

    with isolated_env() as verify_db:
        assert verify_db.execute(select(Profile)).scalars().all() == []
        assert verify_db.execute(select(TokenUsage)).scalars().all() == []
