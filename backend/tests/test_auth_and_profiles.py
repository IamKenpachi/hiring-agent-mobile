"""Pytest coverage for /health, Auth, Gemini Key validation, and Multi-Profile management."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from fastapi.testclient import TestClient

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
    valid_res = client.post(
        "/api/auth/validate-gemini-key",
        json={"api_key": "test-valid-gemini-key-98765", "model": "gemini-3.5-flash"},
    )
    assert valid_res.status_code == 200
    payload = valid_res.json()
    assert payload["valid"] is True
    assert payload["active_model"] == "gemini-3.5-flash"
    model_ids = {m["id"] for m in payload["models"]}
    assert {
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-2.5-flash",
    }.issubset(model_ids)

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
