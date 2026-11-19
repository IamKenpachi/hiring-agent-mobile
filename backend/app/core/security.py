"""Authentication, JWT verification, and Gemini API key resolution."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import config as core_config
from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ENVIRONMENT,
    JWT_ALGORITHM,
    JWT_SECRET,
    SUPABASE_JWT_SECRET,
    SUPABASE_KEY,
    SUPABASE_URL,
    get_demo_trial_max_calls,
)
from app.db.models import TokenUsage
from app.db.session import get_db

_INITIAL_SECURITY_ENV: str = ENVIRONMENT
_INITIAL_SUPABASE_URL: str = SUPABASE_URL
_jwks_client: Optional[jwt.PyJWKClient] = None
_jwks_client_url: str = ""


def _effective_environment() -> str:
    if ENVIRONMENT != _INITIAL_SECURITY_ENV:
        return ENVIRONMENT.strip().lower()
    return core_config.get_environment()


def _effective_supabase_url() -> str:
    if SUPABASE_URL != _INITIAL_SUPABASE_URL:
        return SUPABASE_URL.strip().rstrip("/")
    if core_config.SUPABASE_URL != _INITIAL_SUPABASE_URL:
        return core_config.SUPABASE_URL.strip().rstrip("/")
    return os.getenv("SUPABASE_URL", SUPABASE_URL).strip().rstrip("/")


def is_supabase_auth_enabled() -> bool:
    """Return True when Supabase Auth credentials are configured outside unit tests."""
    return bool(
        _effective_supabase_url()
        and SUPABASE_KEY.strip()
        and _effective_environment() != "test"
    )


def _get_jwks_client() -> Optional[jwt.PyJWKClient]:
    """Return a cached PyJWKClient for Supabase Auth asymmetric (ES256/RS256) JWT verification."""
    global _jwks_client, _jwks_client_url
    sb_url = _effective_supabase_url()
    expected_url = f"{sb_url}/auth/v1/.well-known/jwks.json" if sb_url else ""
    if _jwks_client is not None and (
        not expected_url or not _jwks_client_url or _jwks_client_url == expected_url
    ):
        return _jwks_client
    if not expected_url:
        return None
    _jwks_client = jwt.PyJWKClient(expected_url, cache_keys=True, lifespan=3600)
    _jwks_client_url = expected_url
    return _jwks_client


@lru_cache(maxsize=2)
def _cached_supabase_client(url: str, key: str) -> Any:
    from supabase import create_client

    return create_client(url, key)


def get_supabase_client() -> Any:
    """Return a cached Supabase client configured with project URL and secret/service key."""
    return _cached_supabase_client(_effective_supabase_url(), SUPABASE_KEY.strip())

DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_DEV_USER_EMAIL = "dev@hiringagent.local"


class CurrentUser(BaseModel):
    """Authenticated user context extracted from JWT or dev fallback."""

    id: str
    email: str


def hash_password(password: str) -> str:
    """Hash a plaintext password using PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a PBKDF2-HMAC-SHA256 hash."""
    if not password_hash or "$" not in password_hash:
        return False
    try:
        scheme, salt, expected_hex = password_hash.split("$", 2)
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
        return hmac.compare_digest(digest.hex(), expected_hex)
    except ValueError:
        return False


def create_access_token(
    user_id: str,
    email: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed local JWT access token for the given user."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": "hiring-agent-mobile",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _build_current_user_from_payload(payload: dict[str, Any]) -> CurrentUser:
    user_id = str(payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim.",
        )
    user_meta = payload.get("user_metadata")
    meta_email = user_meta.get("email") if isinstance(user_meta, dict) else ""
    email = str(payload.get("email") or meta_email or "")
    return CurrentUser(id=user_id, email=email)


def _decode_jwt_token(token: str) -> CurrentUser:
    """Validate a local HS256 JWT or Supabase ES256/RS256/HS256 JWT and return CurrentUser."""
    secrets_to_try = [JWT_SECRET]
    if SUPABASE_JWT_SECRET and SUPABASE_JWT_SECRET not in secrets_to_try:
        secrets_to_try.append(SUPABASE_JWT_SECRET)

    last_error: Optional[Exception] = None
    for secret in secrets_to_try:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=[JWT_ALGORITHM],
                options={"verify_aud": False},
            )
            return _build_current_user_from_payload(payload)
        except HTTPException:
            raise
        except jwt.PyJWTError as exc:
            last_error = exc

    try:
        unverified_header = jwt.get_unverified_header(token)
        token_alg = str(unverified_header.get("alg") or "").upper()
    except jwt.PyJWTError:
        token_alg = ""

    if token_alg in {"ES256", "RS256"}:
        jwks_client = _get_jwks_client()
        if jwks_client is not None:
            try:
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256", "RS256"],
                    options={"verify_aud": False},
                )
                return _build_current_user_from_payload(payload)
            except HTTPException:
                raise
            except Exception as exc:
                last_error = exc

    if is_supabase_auth_enabled():
        try:
            sb = get_supabase_client()
            user_resp = sb.auth.get_user(token)
            sb_user = getattr(user_resp, "user", None)
            if sb_user and getattr(sb_user, "id", None):
                return CurrentUser(
                    id=str(sb_user.id),
                    email=str(getattr(sb_user, "email", "") or ""),
                )
        except Exception as exc:
            last_error = exc

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid or expired authentication token: {last_error}",
    )


def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentUser:
    """
    Resolve the authenticated user from the Authorization Bearer token.
    Raises 401 when an invalid token or malformed Authorization header is passed.
    Falls back to a deterministic dev user ONLY when ENVIRONMENT != 'production'.
    """
    auth_header = authorization if isinstance(authorization, str) else None
    if auth_header is not None and auth_header.strip() != "":
        parts = auth_header.strip().split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization header format. Expected 'Bearer <token>'.",
            )
        return _decode_jwt_token(parts[1].strip())

    if _effective_environment() != "production":
        return CurrentUser(id=DEFAULT_DEV_USER_ID, email=DEFAULT_DEV_USER_EMAIL)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials were not provided.",
    )


def enforce_trial_quota_if_needed(
    db: Session,
    user_id: str,
    provided_header_key: Optional[str],
) -> None:
    """Enforce per-user Starter trial quota when client omits X-Gemini-Api-Key outside test env."""
    if isinstance(provided_header_key, str) and provided_header_key.strip():
        return
    if _effective_environment() == "test":
        return

    used_calls = int(
        db.execute(
            select(func.count(TokenUsage.id)).where(TokenUsage.user_id == user_id)
        ).scalar()
        or 0
    )
    if used_calls >= get_demo_trial_max_calls():
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Starter trial quota reached. Please add your Gemini API key in Profiles & Settings to continue.",
        )


def get_gemini_api_key(
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
    authorization: Optional[str] = Header(None),
    db: Optional[Session] = Depends(get_db),
) -> str:
    """
    Retrieve the user's Gemini API key from X-Gemini-Api-Key header or GEMINI_API_KEY env var.
    Enforces Starter trial quota when falling back to server GEMINI_API_KEY outside test env.
    Raises HTTP 400 if both are empty, or HTTP 402 if Starter trial quota is reached.
    """
    header_key = x_gemini_api_key.strip() if isinstance(x_gemini_api_key, str) else ""
    if header_key:
        return header_key

    server_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not server_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gemini API key is required. Pass X-Gemini-Api-Key header or set GEMINI_API_KEY.",
        )

    if isinstance(db, Session) and _effective_environment() != "test":
        auth_str = authorization if isinstance(authorization, str) else ""
        if auth_str.strip():
            user = get_current_user(auth_str)
            enforce_trial_quota_if_needed(db, user.id, header_key)
        elif _effective_environment() != "production":
            user = get_current_user(None)
            enforce_trial_quota_if_needed(db, user.id, header_key)

    return server_key
