"""Authentication and Gemini API key validation router."""

from __future__ import annotations

import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.orm import Session

from app.agents import is_placeholder_gemini_key
from app.core import config as core_config
from app.core.config import (
    AVAILABLE_MODELS,
    EMAIL_CONFIRM_AUTO,
    SUPABASE_KEY,
    SUPABASE_URL,
    get_demo_trial_max_calls,
    resolve_gemini_model,
)
from app.core.rate_limit import limiter
from app.core.security import (
    CurrentUser,
    create_access_token,
    get_current_user,
    hash_password,
    is_supabase_auth_enabled,
    verify_password,
)
from app.db.models import Profile, RankedJob, SearchRun, TailoredOutput, TokenUsage, User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = ""


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class ValidateGeminiKeyRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    verify_live: bool = True


def _normalize_email(raw_email: str) -> str:
    cleaned = raw_email.strip().lower()
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please provide a valid email address.",
        )
    return cleaned


def _new_supabase_client() -> Any:
    """Create a fresh per-request Supabase client so user auth sessions never leak across requests."""
    from supabase import create_client

    return create_client(SUPABASE_URL.strip(), SUPABASE_KEY.strip())


def _extract_full_name(sb_user: Any) -> str:
    meta = getattr(sb_user, "user_metadata", None) or {}
    if isinstance(meta, dict):
        return str(meta.get("full_name") or "").strip()
    return ""


@router.post("/signup")
@limiter.limit("10/minute")
def signup(request: Request, req: SignupRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Create a new user account via Supabase Auth (or local fallback) and return a JWT."""
    email = _normalize_email(req.email)
    full_name = (req.full_name or "").strip()

    if is_supabase_auth_enabled():
        sb = _new_supabase_client()
        email_confirm = bool(core_config.EMAIL_CONFIRM_AUTO if core_config.EMAIL_CONFIRM_AUTO != EMAIL_CONFIRM_AUTO else EMAIL_CONFIRM_AUTO)
        try:
            sb.auth.admin.create_user(
                {
                    "email": email,
                    "password": req.password,
                    "email_confirm": email_confirm,
                    "user_metadata": {"full_name": full_name},
                }
            )
        except Exception as exc:
            msg = str(exc).lower()
            if "already" in msg or "exists" in msg or "registered" in msg:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not create account: {exc}",
            ) from exc

        try:
            session_resp = sb.auth.sign_in_with_password({"email": email, "password": req.password})
        except Exception as exc:
            if not email_confirm:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account created. Please check your email to confirm your address before signing in.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Account created, but automatic sign-in failed: {exc}",
            ) from exc

        session = getattr(session_resp, "session", None)
        sb_user = getattr(session_resp, "user", None)
        if not session or not getattr(session, "access_token", None) or not sb_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase Auth did not return an active session token.",
            )
        return {
            "access_token": session.access_token,
            "user": {
                "id": str(sb_user.id),
                "email": str(getattr(sb_user, "email", email) or email),
                "full_name": _extract_full_name(sb_user) or full_name,
            },
        }

    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        full_name=full_name,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email)
    return {
        "access_token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
    }


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Authenticate an existing user via Supabase Auth (or local fallback) and return a JWT."""
    email = _normalize_email(req.email)

    if is_supabase_auth_enabled():
        sb = _new_supabase_client()
        try:
            session_resp = sb.auth.sign_in_with_password({"email": email, "password": req.password})
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            ) from exc

        session = getattr(session_resp, "session", None)
        sb_user = getattr(session_resp, "user", None)
        if not session or not getattr(session, "access_token", None) or not sb_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        return {
            "access_token": session.access_token,
            "user": {
                "id": str(sb_user.id),
                "email": str(getattr(sb_user, "email", email) or email),
                "full_name": _extract_full_name(sb_user),
            },
        }

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token(user.id, user.email)
    return {
        "access_token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
    }


@router.get("/me")
def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return the authenticated user's identity and Starter trial quota status."""
    trial_calls_used = int(
        db.execute(
            select(func.count(TokenUsage.id)).where(TokenUsage.user_id == current_user.id)
        ).scalar()
        or 0
    )
    trial_fields = {
        "trial_available": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "trial_calls_used": trial_calls_used,
        "trial_calls_limit": get_demo_trial_max_calls(),
    }
    if is_supabase_auth_enabled():
        return {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": "",
            **trial_fields,
        }
    user = None
    if inspect(db.get_bind()).has_table(User.__tablename__):
        user = db.execute(select(User).where(User.id == current_user.id)).scalar_one_or_none()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": user.full_name if user else "",
        **trial_fields,
    }


def _delete_user_storage_files(sb: Any, user_id: str, output_ids: List[str]) -> None:
    """Best-effort cleanup of a user's stored PDF files in the private outputs-pdfs bucket."""
    try:
        bucket = sb.storage.from_("outputs-pdfs")
        paths_to_remove: List[str] = []
        try:
            entries = bucket.list(user_id) or []
        except Exception:
            entries = []

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            if entry.get("id") is None:
                try:
                    nested = bucket.list(f"{user_id}/{name}") or []
                except Exception:
                    nested = []
                for item in nested:
                    if isinstance(item, dict) and item.get("name"):
                        paths_to_remove.append(f"{user_id}/{name}/{item['name']}")
            else:
                paths_to_remove.append(f"{user_id}/{name}")

        for oid in output_ids:
            for fname in ("cv.pdf", "cover_letter.pdf", "tailored_cv.pdf"):
                paths_to_remove.append(f"{user_id}/{oid}/{fname}")

        unique_paths = list(dict.fromkeys(paths_to_remove))
        if unique_paths:
            bucket.remove(unique_paths)
    except Exception as exc:
        logger.warning("Supabase Storage cleanup failed for user %s: %s", user_id, exc)


@router.delete("/account")
def delete_account(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Permanently delete the authenticated user's account, DB rows, local/cloud PDFs, and auth identity."""
    output_rows = (
        db.execute(select(TailoredOutput).where(TailoredOutput.user_id == current_user.id))
        .scalars()
        .all()
    )
    pdf_paths = [p for row in output_rows for p in (row.cv_pdf_path, row.cl_pdf_path) if p]
    output_ids = [row.id for row in output_rows]

    db.execute(delete(TokenUsage).where(TokenUsage.user_id == current_user.id))
    db.execute(delete(TailoredOutput).where(TailoredOutput.user_id == current_user.id))
    db.execute(delete(RankedJob).where(RankedJob.user_id == current_user.id))
    db.execute(delete(SearchRun).where(SearchRun.user_id == current_user.id))
    db.execute(delete(Profile).where(Profile.user_id == current_user.id))
    if inspect(db.get_bind()).has_table(User.__tablename__):
        db.execute(delete(User).where(User.id == current_user.id))
    db.commit()

    outputs_root = core_config.OUTPUTS_DIR.resolve()
    user_outputs_dir = (outputs_root / current_user.id).resolve()
    for raw_pdf_path in pdf_paths:
        pdf_path = Path(raw_pdf_path)
        try:
            resolved_pdf = pdf_path.resolve()
        except OSError:
            continue
        if (
            resolved_pdf != outputs_root
            and resolved_pdf.is_relative_to(outputs_root)
            and not resolved_pdf.is_dir()
        ):
            resolved_pdf.unlink(missing_ok=True)

    if user_outputs_dir != outputs_root and user_outputs_dir.is_relative_to(outputs_root):
        shutil.rmtree(user_outputs_dir, ignore_errors=True)

    if is_supabase_auth_enabled():
        sb = _new_supabase_client()
        _delete_user_storage_files(sb, current_user.id, output_ids)
        try:
            sb.auth.admin.delete_user(current_user.id)
        except Exception as exc:
            logger.warning("Supabase auth admin.delete_user failed for %s: %s", current_user.id, exc)

    return {"deleted": True, "user_id": current_user.id}


@router.post("/validate-gemini-key")
def validate_gemini_key(
    req: Optional[ValidateGeminiKeyRequest] = None,
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
) -> Dict[str, Any]:
    """Validate the user's Gemini API key and return supported models plus active model."""
    body_key = (req.api_key if req else None) or ""
    candidate_key = body_key.strip() or (x_gemini_api_key or "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    active_model = resolve_gemini_model((req.model if req else None) or x_gemini_model)

    if not candidate_key or len(candidate_key) < 8 or any(ch.isspace() for ch in candidate_key):
        return {
            "valid": False,
            "detail": "Gemini API key must be at least 8 characters with no spaces.",
            "models": AVAILABLE_MODELS,
            "active_model": active_model,
        }

    is_test_env = os.getenv("ENVIRONMENT", "development").lower() == "test"
    is_placeholder = is_placeholder_gemini_key(candidate_key)
    if not is_test_env and is_placeholder:
        return {
            "valid": False,
            "detail": "Placeholder or test keys cannot be used. Enter a valid Google AI Studio key starting with AIza...",
            "models": AVAILABLE_MODELS,
            "active_model": active_model,
        }

    is_valid = True
    detail: Optional[str] = None
    should_verify_live = True if req is None else bool(req.verify_live)
    if should_verify_live and not (is_test_env and is_placeholder):
        try:
            from google import genai

            client = genai.Client(api_key=candidate_key)
            next(iter(client.models.list(config={"page_size": 1})), None)
        except Exception as exc:
            is_valid = False
            exc_msg = str(exc)
            if "API_KEY_INVALID" in exc_msg.upper() or "api key not valid" in exc_msg.lower():
                detail = (
                    "Google Gemini rejected this API key (API_KEY_INVALID). "
                    "Verify or regenerate your key in Google AI Studio."
                )
            else:
                detail = f"Unable to verify Gemini API key: {exc_msg[:180]}"

    return {
        "valid": is_valid,
        "detail": detail,
        "models": AVAILABLE_MODELS,
        "active_model": active_model,
    }
