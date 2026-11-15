"""SQLAlchemy 2.0 ORM models for Hiring Agent Mobile."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.types import TypeDecorator

Base = declarative_base()


class UUIDString(TypeDecorator):
    """Store UUID strings as native UUID on PostgreSQL and String on SQLite."""

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=False))
        return dialect.type_descriptor(String())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    """Local user table for standalone JWT authentication fallback alongside Supabase Auth."""

    __tablename__ = "users"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False, default="")
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


class Profile(Base):
    """Candidate career profile supporting multi-profile selection."""

    __tablename__ = "profiles"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    user_id = Column(UUIDString, nullable=False, index=True)
    profile_name = Column(String, nullable=False, default="Default Profile")
    is_default = Column(Boolean, nullable=False, default=False)
    full_name = Column(String, nullable=False, default="")
    email = Column(String, nullable=False, default="")
    phone = Column(String, nullable=False, default="")
    location = Column(String, nullable=False, default="")
    linkedin_url = Column(String, nullable=False, default="")
    github_url = Column(String, nullable=False, default="")
    portfolio_url = Column(String, nullable=False, default="")
    summary = Column(Text, nullable=False, default="")
    skills_json = Column(Text, nullable=False, default="[]")
    experience_json = Column(Text, nullable=False, default="[]")
    projects_json = Column(Text, nullable=False, default="[]")
    education_json = Column(Text, nullable=False, default="[]")
    certifications_json = Column(Text, nullable=False, default="[]")
    raw_markdown = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)


class SearchRun(Base):
    """JobSpy multi-board scrape + AI ranking execution run."""

    __tablename__ = "search_runs"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    user_id = Column(UUIDString, nullable=False, index=True)
    profile_id = Column(UUIDString, nullable=True)
    query = Column(String, nullable=False)
    location = Column(String, nullable=False, default="Remote")
    radius = Column(Integer, nullable=False, default=25)
    platforms_json = Column(Text, nullable=False, default="[]")
    hours_old = Column(Integer, nullable=False, default=168)
    work_type = Column(String, nullable=False, default="Any")
    requested_top_n = Column(Integer, nullable=False, default=10)
    status = Column(String, nullable=False, default="pending")
    progress_pct = Column(Float, nullable=False, default=0.0)
    status_detail = Column(String, nullable=False, default="")
    warnings_json = Column(Text, nullable=False, default="[]")
    total_scraped = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    ranked_jobs = relationship(
        "RankedJob",
        back_populates="search_run",
        cascade="all, delete-orphan",
    )


class RankedJob(Base):
    """Job scraped by JobSpy and scored across 4 dimensions by JobMatcherAgent."""

    __tablename__ = "ranked_jobs"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    search_run_id = Column(UUIDString, ForeignKey("search_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUIDString, nullable=False, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False, default="")
    location = Column(String, nullable=False, default="")
    salary = Column(String, nullable=False, default="")
    source_platform = Column(String, nullable=False, default="")
    job_url = Column(String, nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    overall_fit_score = Column(Integer, nullable=False, default=0)
    skills_match_score = Column(Integer, nullable=False, default=0)
    experience_fit_score = Column(Integer, nullable=False, default=0)
    ats_keyword_score = Column(Integer, nullable=False, default=0)
    matched_skills_json = Column(Text, nullable=False, default="[]")
    missing_skills_json = Column(Text, nullable=False, default="[]")
    match_reason = Column(Text, nullable=False, default="")
    recommendation = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    search_run = relationship("SearchRun", back_populates="ranked_jobs")


class TailoredOutput(Base):
    """Saved tailored CV + Cover Letter application bundle with revision chat history."""

    __tablename__ = "tailored_outputs"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    user_id = Column(UUIDString, nullable=False, index=True)
    profile_id = Column(UUIDString, nullable=True)
    ranked_job_id = Column(UUIDString, nullable=True, index=True)
    job_title = Column(String, nullable=False)
    company = Column(String, nullable=False, default="")
    job_url = Column(String, nullable=False, default="")
    job_description = Column(Text, nullable=False, default="")
    custom_capabilities = Column(Text, nullable=False, default="")
    tone = Column(String, nullable=False, default="Executive & Formal")
    model_used = Column(String, nullable=False, default="gemini-3.7-flash")
    overall_fit_score = Column(Integer, nullable=False, default=0)
    skills_match_score = Column(Integer, nullable=False, default=0)
    experience_fit_score = Column(Integer, nullable=False, default=0)
    ats_keyword_score = Column(Integer, nullable=False, default=0)
    matched_skills_json = Column(Text, nullable=False, default="[]")
    missing_skills_json = Column(Text, nullable=False, default="[]")
    injected_keywords_json = Column(Text, nullable=False, default="[]")
    match_reason = Column(Text, nullable=False, default="")
    recommendation = Column(Text, nullable=False, default="")
    cv_json = Column(Text, nullable=False, default="{}")
    cv_markdown = Column(Text, nullable=False, default="")
    cv_html = Column(Text, nullable=False, default="")
    cover_letter_markdown = Column(Text, nullable=False, default="")
    cover_letter_html = Column(Text, nullable=False, default="")
    cv_pdf_path = Column(String, nullable=False, default="")
    cl_pdf_path = Column(String, nullable=False, default="")
    chat_history_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)


class TokenUsage(Base):
    """Per-operation Gemini token and estimated USD cost telemetry record."""

    __tablename__ = "token_usage"

    id = Column(UUIDString, primary_key=True, default=_uuid_str)
    user_id = Column(UUIDString, nullable=False, index=True)
    model_name = Column(String, nullable=False)
    operation_type = Column(String, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
