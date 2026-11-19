"""Pytest coverage for production hardening, security, legal routes, pooling, and account deletion."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.api import auth as auth_api
from app.api import profiles as profiles_api
from app.api import studio as studio_api
from app.core import config as core_config
from app.core import security as core_security
from app.core.rate_limit import limiter
from app.db import session as db_session
from app.db.models import Profile, RankedJob, SearchRun, TailoredOutput, TokenUsage, User
from app.main import app


def test_validate_production_config_blocks_insecure_and_allows_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Default JWT_SECRET in production must fail
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", core_config.DEFAULT_DEV_JWT_SECRET)
    monkeypatch.setenv("CORS_ORIGINS", "https://hiringagent.app")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        core_config.validate_production_config()

    # Short JWT_SECRET (< 16 chars) in production must fail
    monkeypatch.setenv("JWT_SECRET", "too-short-123")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        core_config.validate_production_config()

    # Wildcard CORS_ORIGINS in production must fail
    monkeypatch.setenv("JWT_SECRET", "super-secure-production-jwt-secret-64-chars-long")
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        core_config.validate_production_config()

    # Valid production config passes cleanly
    monkeypatch.setenv("CORS_ORIGINS", "https://hiringagent.app, https://api.hiringagent.app")
    core_config.validate_production_config()

    # Non-production skips strict validation
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("JWT_SECRET", core_config.DEFAULT_DEV_JWT_SECRET)
    monkeypatch.setenv("CORS_ORIGINS", "*")
    core_config.validate_production_config()


def test_delete_account_cascades_all_data_and_pdfs(
    isolated_env,
    client: TestClient,
    sample_wizard_payload: Dict[str, Any],
) -> None:
    # Sign up User A and User B
    signup_a = client.post(
        "/api/auth/signup",
        json={
            "email": "delete.me@example.com",
            "password": "StrongPassword123!",
            "full_name": "Delete Me",
        },
    )
    assert signup_a.status_code == 200, signup_a.text
    user_a_id = signup_a.json()["user"]["id"]
    headers_a = {
        "Authorization": f"Bearer {signup_a.json()['access_token']}",
        "X-Gemini-Api-Key": "test-gemini-key-offline-123456",
        "X-Gemini-Model": "gemini-3.8-flash",
    }

    signup_b = client.post(
        "/api/auth/signup",
        json={
            "email": "keep.me@example.com",
            "password": "StrongPassword123!",
            "full_name": "Keep Me",
        },
    )
    assert signup_b.status_code == 200, signup_b.text
    user_b_id = signup_b.json()["user"]["id"]
    headers_b = {
        "Authorization": f"Bearer {signup_b.json()['access_token']}",
        "X-Gemini-Api-Key": "test-gemini-key-offline-123456",
        "X-Gemini-Model": "gemini-3.8-flash",
    }

    # Create Profile + TailoredOutput (which generates PDFs & TokenUsage) for both users
    prof_a = client.post("/api/profiles", headers=headers_a, json=sample_wizard_payload)
    assert prof_a.status_code == 201
    prof_b = client.post("/api/profiles", headers=headers_b, json=sample_wizard_payload)
    assert prof_b.status_code == 201

    tailor_payload = {
        "job_title": "Data Analyst",
        "company": "Cascade Co",
        "job_description": "Seeking a Data Analyst with Python, SQL, and Tableau.",
        "tone": "Executive & Formal",
    }
    out_a = client.post("/api/studio/tailor", headers=headers_a, json=tailor_payload)
    assert out_a.status_code == 200, out_a.text
    out_b = client.post("/api/studio/tailor", headers=headers_b, json=tailor_payload)
    assert out_b.status_code == 200, out_b.text

    # Seed SearchRun + RankedJob + TokenUsage for User A
    with isolated_env() as db:
        run_a = SearchRun(
            id="run-a-1",
            user_id=user_a_id,
            profile_id=prof_a.json()["id"],
            query="Data Analyst",
            status="completed",
        )
        job_a = RankedJob(
            id="job-a-1",
            search_run_id="run-a-1",
            user_id=user_a_id,
            title="Data Analyst",
            company="Cascade Co",
        )
        usage_a = TokenUsage(
            id="tok-a-1",
            user_id=user_a_id,
            model_name="gemini-3.8-flash",
            operation_type="job_ranking",
            input_tokens=100,
            output_tokens=50,
            estimated_cost_usd=0.001,
        )
        db.add_all([run_a, job_a, usage_a])
        db.commit()

    user_a_dir = core_config.OUTPUTS_DIR / user_a_id
    user_b_dir = core_config.OUTPUTS_DIR / user_b_id
    assert user_a_dir.is_dir()
    assert user_b_dir.is_dir()

    # Delete User A's account
    del_res = client.delete("/api/auth/account", headers=headers_a)
    assert del_res.status_code == 200, del_res.text
    assert del_res.json() == {"deleted": True, "user_id": user_a_id}

    # All User A DB rows & PDF dirs are gone, while User B remains completely intact
    with isolated_env() as db:
        assert db.execute(select(User).where(User.id == user_a_id)).scalars().all() == []
        assert db.execute(select(Profile).where(Profile.user_id == user_a_id)).scalars().all() == []
        assert db.execute(select(SearchRun).where(SearchRun.user_id == user_a_id)).scalars().all() == []
        assert db.execute(select(RankedJob).where(RankedJob.user_id == user_a_id)).scalars().all() == []
        assert db.execute(select(TailoredOutput).where(TailoredOutput.user_id == user_a_id)).scalars().all() == []
        assert db.execute(select(TokenUsage).where(TokenUsage.user_id == user_a_id)).scalars().all() == []

        assert len(db.execute(select(User).where(User.id == user_b_id)).scalars().all()) == 1
        assert len(db.execute(select(Profile).where(Profile.user_id == user_b_id)).scalars().all()) == 1
        assert len(db.execute(select(TailoredOutput).where(TailoredOutput.user_id == user_b_id)).scalars().all()) == 1

    assert not user_a_dir.exists()
    assert user_b_dir.is_dir()

    # Deleted user can no longer log in
    relogin = client.post(
        "/api/auth/login",
        json={"email": "delete.me@example.com", "password": "StrongPassword123!"},
    )
    assert relogin.status_code == 401


def test_delete_account_cleans_supabase_storage_and_auth_when_enabled(
    isolated_env,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    signup = client.post(
        "/api/auth/signup",
        json={"email": "sb.delete@example.com", "password": "Password123!"},
    )
    assert signup.status_code == 200
    uid = signup.json()["user"]["id"]
    token = signup.json()["access_token"]

    removed_paths: List[str] = []
    deleted_users: List[str] = []

    class _FakeBucket:
        def list(self, path: str):
            if path == uid:
                return [{"name": "out-1", "id": None}]
            if path == f"{uid}/out-1":
                return [{"name": "cv.pdf", "id": "file-1"}]
            return []

        def remove(self, paths: List[str]):
            removed_paths.extend(paths)
            return []

    class _FakeSupabase:
        def __init__(self) -> None:
            self.storage = SimpleNamespace(from_=lambda _bucket: _FakeBucket())
            self.auth = SimpleNamespace(
                admin=SimpleNamespace(delete_user=lambda user_id: deleted_users.append(user_id))
            )

    monkeypatch.setattr(auth_api, "is_supabase_auth_enabled", lambda: True)
    monkeypatch.setattr(auth_api, "_new_supabase_client", lambda: _FakeSupabase())

    res = client.delete("/api/auth/account", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == {"deleted": True, "user_id": uid}
    assert f"{uid}/out-1/cv.pdf" in removed_paths
    assert deleted_users == [uid]


def test_legal_html_pages_return_200(client: TestClient) -> None:
    privacy = client.get("/legal/privacy")
    assert privacy.status_code == 200
    assert privacy.headers["content-type"].startswith("text/html")
    assert "Privacy Policy" in privacy.text
    assert "Google Gemini" in privacy.text
    assert "Sentry" in privacy.text
    assert core_config.SUPPORT_EMAIL in privacy.text

    deletion = client.get("/legal/account-deletion")
    assert deletion.status_code == 200
    assert deletion.headers["content-type"].startswith("text/html")
    assert "Delete Account" in deletion.text
    assert core_config.SUPPORT_EMAIL in deletion.text


def test_es256_jwks_verification_and_production_auth_guard(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Generate ephemeral ES256 EC keypair
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    es256_token = jwt.encode(
        {"sub": "sb-user-es256-123", "email": "es256@example.com"},
        private_key,
        algorithm="ES256",
        headers={"kid": "test-ec-kid"},
    )

    constructed_urls: List[str] = []

    class _FakePyJWKClient:
        def __init__(self, uri: str, cache_keys: bool = True, lifespan: int = 3600) -> None:
            constructed_urls.append(uri)
            assert cache_keys is True
            assert lifespan == 3600

        def get_signing_key_from_jwt(self, _token: str):
            return SimpleNamespace(key=public_key)

    monkeypatch.setattr(jwt, "PyJWKClient", _FakePyJWKClient)
    monkeypatch.setattr(core_security, "_jwks_client", None)
    monkeypatch.setattr(core_security, "_jwks_client_url", "")
    monkeypatch.setattr(core_security, "SUPABASE_URL", "https://example-proj.supabase.co")

    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {es256_token}"})
    assert me_res.status_code == 200, me_res.text
    assert me_res.json()["id"] == "sb-user-es256-123"
    assert me_res.json()["email"] == "es256@example.com"
    assert constructed_urls == ["https://example-proj.supabase.co/auth/v1/.well-known/jwks.json"]

    # In production, unauthenticated calls are NEVER allowed dev fallback (even if ALLOW_DEV_AUTH_FALLBACK=true)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_DEV_AUTH_FALLBACK", "true")
    with pytest.raises(HTTPException) as exc_info:
        core_security.get_current_user(None)
    assert exc_info.value.status_code == 401

    unauth_me = client.get("/api/auth/me")
    assert unauth_me.status_code == 401


def test_starter_trial_quota_enforced_outside_test_env(
    isolated_env,
    client: TestClient,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    me = client.get("/api/auth/me", headers={"Authorization": auth_headers["Authorization"]}).json()
    user_id = me["id"]

    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSyServerStarterTrialKey1234567")
    monkeypatch.setenv("DEMO_TRIAL_MAX_CALLS_PER_USER", "2")

    with isolated_env() as db:
        for i in range(2):
            db.add(
                TokenUsage(
                    id=f"trial-tok-{i}",
                    user_id=user_id,
                    model_name="gemini-3.8-flash",
                    operation_type="jd_extract",
                    input_tokens=10,
                    output_tokens=10,
                    estimated_cost_usd=0.0001,
                )
            )
        db.commit()

    # Without X-Gemini-Api-Key, trial quota exhaustion raises HTTP 402
    quota_res = client.post(
        "/api/studio/extract-jd",
        headers={"Authorization": auth_headers["Authorization"]},
        json={"raw_text": "Senior Data Analyst at Monzo Bank requiring Python, SQL, and dbt."},
    )
    assert quota_res.status_code == 402
    assert "Starter trial quota reached" in quota_res.json()["detail"]

    # Supplying personal X-Gemini-Api-Key bypasses trial quota cleanly
    monkeypatch.setattr(
        studio_api,
        "extract_jd_metadata",
        lambda **_kwargs: (
            {
                "job_title": "Senior Data Analyst",
                "company": "Monzo Bank",
                "location": "London",
                "salary": "",
                "core_requirements": ["SQL", "Python"],
                "summary": "Analytics role",
            },
            0,
            0,
        ),
    )
    byok_res = client.post(
        "/api/studio/extract-jd",
        headers={
            "Authorization": auth_headers["Authorization"],
            "X-Gemini-Api-Key": "AIzaSyPersonalUserKeyBypass1234567",
        },
        json={"raw_text": "Senior Data Analyst at Monzo Bank requiring Python, SQL, and dbt."},
    )
    assert byok_res.status_code == 200


def test_security_headers_prod_error_sanitization_and_rate_limit_429(
    isolated_env,
    client: TestClient,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    health_res = client.get("/health", headers={"X-Request-ID": "req-abc-123"})
    assert health_res.status_code == 200
    assert health_res.headers.get("x-content-type-options") == "nosniff"
    assert health_res.headers.get("x-frame-options") == "DENY"
    assert health_res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert health_res.headers.get("x-request-id") == "req-abc-123"

    # Production 500 responses must hide raw exception trace/message
    monkeypatch.setenv("ENVIRONMENT", "production")

    def _boom(*_args, **_kwargs):
        raise RuntimeError("sensitive internal db connection string leaked")

    monkeypatch.setattr(profiles_api, "parse_profile_from_text", _boom)
    err_client = TestClient(app, raise_server_exceptions=False)
    err_res = err_client.post(
        "/api/profiles/upload-pdf",
        headers=auth_headers,
        files={"file": ("cv.txt", b"Candidate Resume SQL Python", "text/plain")},
    )
    assert err_res.status_code == 500
    detail = err_res.json()["detail"]
    assert detail.startswith("Internal server error (ref: ")
    assert "sensitive internal db connection string leaked" not in detail
    assert err_res.headers.get("x-content-type-options") == "nosniff"
    assert err_res.headers.get("x-request-id")

    # Rate limiter returns HTTP 429 when enabled=True
    monkeypatch.setenv("ENVIRONMENT", "test")
    try:
        limiter._storage.reset()
        monkeypatch.setattr(limiter, "enabled", True)
        statuses = [
            client.post(
                "/api/auth/login",
                json={"email": "ratelimit@example.com", "password": "wrong"},
            ).status_code
            for _ in range(10)
        ]
        assert statuses == [401] * 10
        throttled = client.post(
            "/api/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrong"},
        )
        assert throttled.status_code == 429
        assert "rate limit exceeded" in throttled.json()["detail"].lower()
    finally:
        limiter._storage.reset()
        limiter.enabled = False


def test_stale_search_runs_recovered_on_startup_and_model_and_pooler_defaults(
    isolated_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 1. ORM default check
    assert TailoredOutput.model_used.default.arg == "gemini-3.8-flash"

    # 2. PostgreSQL Supavisor/PgBouncer prepare_threshold=None check
    captured: Dict[str, Any] = {}

    def _fake_create_engine(url: str, **kwargs: Any):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    monkeypatch.setattr(db_session, "create_engine", _fake_create_engine)
    db_session._build_engine("postgres://user:pass@aws-0-eu-west-2.pooler.supabase.com:6543/postgres")
    assert captured["url"].startswith("postgresql+psycopg://")
    assert captured["kwargs"]["connect_args"]["prepare_threshold"] is None

    # 3. Lifespan startup marks stale pending/running SearchRuns as failed
    with isolated_env() as db:
        db.add_all(
            [
                SearchRun(
                    id="stale-pending",
                    user_id="u-1",
                    query="Data Analyst",
                    status="pending",
                    progress_pct=5.0,
                ),
                SearchRun(
                    id="stale-running",
                    user_id="u-1",
                    query="Analytics Engineer",
                    status="running",
                    progress_pct=45.0,
                ),
                SearchRun(
                    id="done-run",
                    user_id="u-1",
                    query="BI Developer",
                    status="completed",
                    progress_pct=100.0,
                ),
            ]
        )
        db.commit()

    with TestClient(app) as startup_client:
        assert startup_client.get("/health").status_code == 200

    with isolated_env() as db:
        pending_row = db.get(SearchRun, "stale-pending")
        running_row = db.get(SearchRun, "stale-running")
        done_row = db.get(SearchRun, "done-run")
        assert pending_row is not None and pending_row.status == "failed"
        assert pending_row.status_detail == "Search interrupted by server restart. Please retry your hunt."
        assert running_row is not None and running_row.status == "failed"
        assert running_row.status_detail == "Search interrupted by server restart. Please retry your hunt."
        assert done_row is not None and done_row.status == "completed"
