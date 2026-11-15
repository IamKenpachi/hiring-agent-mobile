"""Authentication and Gemini API key validation router."""

from __future__ import annotations

import os
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AVAILABLE_MODELS, SUPABASE_KEY, SUPABASE_URL, resolve_gemini_model
from app.core.security import (
    CurrentUser,
    create_access_token,
    get_current_user,
    hash_password,
    is_supabase_auth_enabled,
    verify_password,
)
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)
    full_name: Optional[str] = ""


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class ValidateGeminiKeyRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    verify_live: bool = False


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
def signup(req: SignupRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Create a new user account via Supabase Auth (or local fallback) and return a JWT."""
    email = _normalize_email(req.email)
    full_name = (req.full_name or "").strip()

    if is_supabase_auth_enabled():
        sb = _new_supabase_client()
        try:
            sb.auth.admin.create_user(
                {
                    "email": email,
                    "password": req.password,
                    "email_confirm": True,
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
def login(req: LoginRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
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
    """Return the authenticated user's identity."""
    if is_supabase_auth_enabled():
        return {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": "",
        }
    user = db.execute(select(User).where(User.id == current_user.id)).scalar_one_or_none()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": user.full_name if user else "",
    }


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
            "models": AVAILABLE_MODELS,
            "active_model": active_model,
        }

    is_valid = True
    if req and req.verify_live and not candidate_key.lower().startswith(("test-", "dummy", "mock")):
        try:
            from google import genai

            client = genai.Client(api_key=candidate_key)
            next(iter(client.models.list(config={"page_size": 1})), None)
        except Exception:
            is_valid = False

    return {
        "valid": is_valid,
        "models": AVAILABLE_MODELS,
        "active_model": active_model,
    }
