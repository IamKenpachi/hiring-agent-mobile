"""Authentication, JWT verification, and Gemini API key resolution."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ENVIRONMENT,
    JWT_ALGORITHM,
    JWT_SECRET,
    SUPABASE_JWT_SECRET,
)

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


def _decode_jwt_token(token: str) -> CurrentUser:
    """Validate a local JWT or Supabase JWT and return CurrentUser."""
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
            user_id = str(payload.get("sub") or "").strip()
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing subject claim.",
                )
            email = str(payload.get("email") or payload.get("user_metadata", {}).get("email") or "")
            return CurrentUser(id=user_id, email=email)
        except HTTPException:
            raise
        except jwt.PyJWTError as exc:
            last_error = exc

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid or expired authentication token: {last_error}",
    )


def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentUser:
    """
    Resolve the authenticated user from the Authorization Bearer token.
    Raises 401 when an invalid token or malformed Authorization header is passed.
    Falls back to a deterministic dev user when Authorization is omitted in non-production.
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

    allow_dev_fallback = (
        ENVIRONMENT.lower() != "production"
        or os.getenv("ALLOW_DEV_AUTH_FALLBACK", "false").lower() == "true"
    )
    if allow_dev_fallback:
        return CurrentUser(id=DEFAULT_DEV_USER_ID, email=DEFAULT_DEV_USER_EMAIL)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials were not provided.",
    )


def get_gemini_api_key(
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
) -> str:
    """
    Retrieve the user's Gemini API key from X-Gemini-Api-Key header or GEMINI_API_KEY env var.
    Raises HTTP 400 if both are empty.
    """
    header_key = x_gemini_api_key if isinstance(x_gemini_api_key, str) else ""
    key = header_key.strip() or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gemini API key is required. Pass X-Gemini-Api-Key header or set GEMINI_API_KEY.",
        )
    return key
