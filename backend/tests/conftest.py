"""Shared pytest fixtures for isolated DB, temp output directories, and auth helpers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Ensure fallback mode works fast and deterministically in test environments
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("GEMINI_API_KEY", "")

from app.core import config as core_config  # noqa: E402
from app.api import _tailor_helper, outputs as outputs_api  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[sessionmaker, None, None]:
    """Create an isolated SQLite database and temp outputs directory per test."""
    db_file = tmp_path / "test_hiring_mobile.db"
    outputs_dir = tmp_path / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)

    test_engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)
    Base.metadata.create_all(bind=test_engine)

    monkeypatch.setattr(db_session, "engine", test_engine)
    monkeypatch.setattr(db_session, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(core_config, "OUTPUTS_DIR", outputs_dir)
    monkeypatch.setattr(_tailor_helper, "OUTPUTS_DIR", outputs_dir)
    monkeypatch.setattr(outputs_api, "OUTPUTS_DIR", outputs_dir)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    def _override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestingSessionLocal
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()


@pytest.fixture()
def client(isolated_env) -> Generator[TestClient, None, None]:
    """Return a FastAPI TestClient wired to the isolated test DB."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client: TestClient) -> Dict[str, str]:
    """Sign up a fresh test user and return Authorization + X-Gemini-Api-Key headers."""
    resp = client.post(
        "/api/auth/signup",
        json={
            "email": "analyst@example.com",
            "password": "StrongPassword123!",
            "full_name": "Alex Mercer",
        },
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {
        "Authorization": f"Bearer {token}",
        "X-Gemini-Api-Key": "test-gemini-key-offline-123456",
        "X-Gemini-Model": "gemini-3.8-flash",
    }


@pytest.fixture()
def sample_wizard_payload() -> Dict:
    """Realistic Questionnaire Wizard profile creation payload."""
    return {
        "profile_name": "Data Analyst Master",
        "is_default": True,
        "full_name": "Alex Mercer",
        "email": "alex.mercer@example.com",
        "phone": "+44 7700 900123",
        "location": "London, UK",
        "linkedin_url": "https://linkedin.com/in/alexmercer",
        "github_url": "https://github.com/alexmercer",
        "portfolio_url": "https://alexmercer.dev",
        "summary": "Data Analyst with 5+ years delivering SQL, Python, and Tableau analytics at scale.",
        "skills": ["Python", "SQL", "PostgreSQL", "Tableau", "Pandas", "A/B Testing"],
        "experience": [
            {
                "title": "Senior Data Analyst",
                "company": "FinTech Insights Ltd",
                "duration": "2022 - Present",
                "location": "London, UK",
                "highlights": [
                    "Built automated SQL and Python reporting pipelines cutting weekly prep time by 45%.",
                    "Designed A/B experimentation frameworks lifting onboarding conversion by 14%.",
                ],
            }
        ],
        "projects": [
            {
                "name": "Customer Churn Prediction Engine",
                "description": "Trained gradient boosted churn models over 1.2M events with 89% AUC.",
                "technologies": ["Python", "Scikit-Learn", "SQL"],
                "url": "https://github.com/alexmercer/churn-engine",
            }
        ],
        "education": [
            {
                "degree": "MSc Data Science",
                "institution": "University College London",
                "year": "2020",
                "details": "Distinction",
            }
        ],
        "certifications": ["Google Data Analytics Professional Certificate"],
    }
