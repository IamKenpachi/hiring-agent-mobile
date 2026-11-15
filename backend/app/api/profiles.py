"""Candidate multi-profile management router (Questionnaire Wizard & PDF upload)."""

from __future__ import annotations

import io
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.agents.adk_agents import build_profile_markdown, parse_profile_from_text
from app.core.config import resolve_gemini_model
from app.core.security import CurrentUser, get_current_user, get_gemini_api_key
from app.db.models import Profile
from app.db.session import get_db
from app.services.token_service import record_token_usage

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


class ProfileCreateRequest(BaseModel):
    profile_name: str = Field(default="Default Profile", min_length=1)
    is_default: Optional[bool] = None
    full_name: str = Field(..., min_length=1)
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin_url: str = ""
    github_url: str = ""
    portfolio_url: str = ""
    summary: str = ""
    skills: List[str] = Field(default_factory=list)
    experience: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)


class ProfileUpdateRequest(BaseModel):
    profile_name: Optional[str] = None
    is_default: Optional[bool] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    projects: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[str]] = None
    raw_markdown: Optional[str] = None


def _load_json_list(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def _serialize_profile(prof: Profile) -> Dict[str, Any]:
    return {
        "id": prof.id,
        "user_id": prof.user_id,
        "profile_name": prof.profile_name,
        "is_default": bool(prof.is_default),
        "full_name": prof.full_name,
        "email": prof.email,
        "phone": prof.phone,
        "location": prof.location,
        "linkedin_url": prof.linkedin_url,
        "github_url": prof.github_url,
        "portfolio_url": prof.portfolio_url,
        "summary": prof.summary,
        "skills": _load_json_list(prof.skills_json),
        "experience": _load_json_list(prof.experience_json),
        "projects": _load_json_list(prof.projects_json),
        "education": _load_json_list(prof.education_json),
        "certifications": _load_json_list(prof.certifications_json),
        "raw_markdown": prof.raw_markdown,
        "created_at": prof.created_at.isoformat() if prof.created_at else None,
        "updated_at": prof.updated_at.isoformat() if prof.updated_at else None,
    }


def _extract_uploaded_resume_text(filename: str, content: bytes) -> str:
    """Extract readable text from an uploaded PDF, Markdown, or plain-text resume."""
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    lower_name = (filename or "").lower()
    is_pdf = lower_name.endswith(".pdf") or content.lstrip().startswith(b"%PDF")
    if is_pdf:
        try:
            reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            extracted = "\n".join(pages).strip()
            if extracted:
                return extracted
        except Exception as exc:
            # Allow plain-text fallback only if the file is valid UTF-8 text without PDF header
            if content.lstrip().startswith(b"%PDF"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unable to extract text from PDF: {exc}",
                ) from exc

    try:
        decoded = content.decode("utf-8").strip()
    except UnicodeDecodeError:
        decoded = content.decode("latin-1", errors="ignore").strip()

    if not decoded:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text content found in the uploaded CV file.",
        )
    return decoded


@router.get("")
def list_profiles(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return all saved career profiles for the current user."""
    rows = (
        db.execute(
            select(Profile)
            .where(Profile.user_id == current_user.id)
            .order_by(Profile.is_default.desc(), Profile.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_serialize_profile(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_profile(
    req: ProfileCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Create a new candidate profile from the Mobile Questionnaire Wizard JSON payload."""
    existing_count = (
        db.execute(select(Profile).where(Profile.user_id == current_user.id)).scalars().all()
    )
    should_be_default = bool(req.is_default) if req.is_default is not None else (len(existing_count) == 0)

    if should_be_default:
        db.execute(
            update(Profile).where(Profile.user_id == current_user.id).values(is_default=False)
        )

    payload_dict = req.model_dump()
    raw_md = build_profile_markdown(payload_dict)

    prof = Profile(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        profile_name=req.profile_name.strip(),
        is_default=should_be_default,
        full_name=req.full_name.strip(),
        email=req.email.strip(),
        phone=req.phone.strip(),
        location=req.location.strip(),
        linkedin_url=req.linkedin_url.strip(),
        github_url=req.github_url.strip(),
        portfolio_url=req.portfolio_url.strip(),
        summary=req.summary.strip(),
        skills_json=json.dumps(req.skills),
        experience_json=json.dumps(req.experience),
        projects_json=json.dumps(req.projects),
        education_json=json.dumps(req.education),
        certifications_json=json.dumps(req.certifications),
        raw_markdown=raw_md,
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return _serialize_profile(prof)


@router.post("/upload-pdf", status_code=status.HTTP_201_CREATED)
async def upload_profile_pdf(
    file: UploadFile = File(...),
    profile_name: Optional[str] = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Upload a PDF/Markdown/Text CV, extract structured data via ADK ProfileParserAgent, and save."""
    content = await file.read()
    raw_text = _extract_uploaded_resume_text(file.filename or "resume.pdf", content)
    active_model = resolve_gemini_model(x_gemini_model)

    parsed, in_tok, out_tok = parse_profile_from_text(
        raw_text=raw_text,
        api_key=gemini_api_key,
        model_name=active_model,
    )
    record_token_usage(db, current_user.id, active_model, "profile_parse", in_tok, out_tok)

    existing = db.execute(select(Profile).where(Profile.user_id == current_user.id)).scalars().all()
    is_default = len(existing) == 0
    resolved_name = (profile_name or "").strip() or f"{parsed.get('full_name') or 'Imported'} CV"

    prof = Profile(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        profile_name=resolved_name,
        is_default=is_default,
        full_name=str(parsed.get("full_name") or "Candidate").strip(),
        email=str(parsed.get("email") or "").strip(),
        phone=str(parsed.get("phone") or "").strip(),
        location=str(parsed.get("location") or "").strip(),
        linkedin_url=str(parsed.get("linkedin_url") or "").strip(),
        github_url=str(parsed.get("github_url") or "").strip(),
        portfolio_url=str(parsed.get("portfolio_url") or "").strip(),
        summary=str(parsed.get("summary") or "").strip(),
        skills_json=json.dumps(parsed.get("skills") or []),
        experience_json=json.dumps(parsed.get("experience") or []),
        projects_json=json.dumps(parsed.get("projects") or []),
        education_json=json.dumps(parsed.get("education") or []),
        certifications_json=json.dumps(parsed.get("certifications") or []),
        raw_markdown=str(parsed.get("raw_markdown") or build_profile_markdown(parsed)),
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return _serialize_profile(prof)


@router.put("/{profile_id}")
def update_profile(
    profile_id: str,
    req: ProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update profile fields and rebuild canonical raw_markdown."""
    prof = (
        db.execute(
            select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    if req.is_default is True:
        db.execute(
            update(Profile).where(Profile.user_id == current_user.id).values(is_default=False)
        )
        prof.is_default = True
    elif req.is_default is False:
        prof.is_default = False

    for field in (
        "profile_name",
        "full_name",
        "email",
        "phone",
        "location",
        "linkedin_url",
        "github_url",
        "portfolio_url",
        "summary",
    ):
        val = getattr(req, field)
        if val is not None:
            setattr(prof, field, val.strip())

    if req.skills is not None:
        prof.skills_json = json.dumps(req.skills)
    if req.experience is not None:
        prof.experience_json = json.dumps(req.experience)
    if req.projects is not None:
        prof.projects_json = json.dumps(req.projects)
    if req.education is not None:
        prof.education_json = json.dumps(req.education)
    if req.certifications is not None:
        prof.certifications_json = json.dumps(req.certifications)

    if req.raw_markdown is not None:
        prof.raw_markdown = req.raw_markdown
    else:
        prof.raw_markdown = build_profile_markdown(_serialize_profile(prof))

    prof.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(prof)
    return _serialize_profile(prof)


@router.post("/{profile_id}/activate")
def activate_profile(
    profile_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Set the chosen profile as active default and deactivate all other user profiles."""
    prof = (
        db.execute(
            select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    db.execute(
        update(Profile).where(Profile.user_id == current_user.id).values(is_default=False)
    )
    prof.is_default = True
    prof.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(prof)
    return _serialize_profile(prof)


@router.delete("/{profile_id}")
def delete_profile(
    profile_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a candidate profile, promoting another profile to default if needed."""
    prof = (
        db.execute(
            select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if prof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    was_default = bool(prof.is_default)
    db.delete(prof)
    db.commit()

    if was_default:
        replacement = (
            db.execute(
                select(Profile)
                .where(Profile.user_id == current_user.id)
                .order_by(Profile.created_at.desc())
            )
            .scalars()
            .first()
        )
        if replacement is not None:
            replacement.is_default = True
            db.commit()

    return {"deleted": True, "id": profile_id}
