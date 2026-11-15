"""Instant Tailor Studio router (JD metadata extraction & direct tailoring)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.adk_agents import extract_jd_metadata
from app.api._tailor_helper import execute_and_save_tailoring, serialize_tailored_output
from app.core.config import resolve_gemini_model
from app.core.security import CurrentUser, get_current_user, get_gemini_api_key
from app.db.models import Profile
from app.db.session import get_db
from app.services.token_service import record_token_usage

router = APIRouter(prefix="/api/studio", tags=["studio"])


class ExtractJDRequest(BaseModel):
    raw_text: str = Field(..., min_length=10)
    model: Optional[str] = None


class StudioTailorRequest(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_url: Optional[str] = ""
    job_description: str = Field(..., min_length=10)
    custom_capabilities: Optional[str] = ""
    tone: Optional[str] = "Executive & Formal"
    profile_id: Optional[str] = None
    model: Optional[str] = None


@router.post("/extract-jd")
def extract_jd(
    req: ExtractJDRequest,
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Extract job_title, company, location, salary, core_requirements, and summary from raw JD text."""
    active_model = resolve_gemini_model(req.model or x_gemini_model)
    extracted, in_tok, out_tok = extract_jd_metadata(
        raw_text=req.raw_text,
        api_key=gemini_api_key,
        model_name=active_model,
    )
    if in_tok + out_tok > 0:
        record_token_usage(db, current_user.id, active_model, "jd_extract", in_tok, out_tok)
    return extracted


@router.post("/tailor")
def tailor_from_studio(
    req: StudioTailorRequest,
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Run ADK ApplicationTailorPipeline directly on a pasted job description."""
    active_model = resolve_gemini_model(req.model or x_gemini_model)

    profile: Optional[Profile] = None
    if req.profile_id:
        profile = (
            db.execute(
                select(Profile).where(
                    Profile.id == req.profile_id, Profile.user_id == current_user.id
                )
            )
            .scalar_one_or_none()
        )
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Selected profile not found."
            )
    else:
        profile = (
            db.execute(
                select(Profile)
                .where(Profile.user_id == current_user.id)
                .order_by(Profile.is_default.desc(), Profile.created_at.desc())
            )
            .scalars()
            .first()
        )

    custom_caps = (req.custom_capabilities or "").strip()
    if profile is not None:
        profile_md = profile.raw_markdown or profile.summary or profile.full_name
        profile_id = profile.id
    elif custom_caps:
        profile_md = custom_caps
        profile_id = None
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Master CV Profile found. Please create a profile or provide candidate capabilities.",
        )

    job_title = (req.job_title or "").strip()
    company = (req.company or "").strip()
    if not job_title or not company:
        extracted, in_tok, out_tok = extract_jd_metadata(
            raw_text=req.job_description,
            api_key=gemini_api_key,
            model_name=active_model,
        )
        if in_tok + out_tok > 0:
            record_token_usage(db, current_user.id, active_model, "jd_extract", in_tok, out_tok)
        job_title = job_title or str(extracted.get("job_title") or "Target Role")
        company = company or str(extracted.get("company") or "Target Company")

    row = execute_and_save_tailoring(
        db,
        user_id=current_user.id,
        profile_id=profile_id,
        profile_markdown=profile_md,
        job_title=job_title,
        company=company,
        job_url=(req.job_url or "").strip(),
        job_description=req.job_description,
        custom_capabilities=custom_caps,
        tone=(req.tone or "Executive & Formal").strip(),
        model_name=active_model,
        api_key=gemini_api_key,
    )
    return serialize_tailored_output(row)
