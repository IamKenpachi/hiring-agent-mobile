"""SlowAPI rate limiter configuration and JSON 429 response handler."""

from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import ENVIRONMENT


def is_rate_limit_enabled() -> bool:
    """Return True when rate limiting is enabled (disabled automatically in test env)."""
    return os.getenv("ENVIRONMENT", ENVIRONMENT).strip().lower() != "test"


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
    enabled=is_rate_limit_enabled(),
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clean synchronous JSON 429 response (works in both SlowAPIMiddleware and routes)."""
    detail = getattr(exc, "detail", None) or "Too many requests"
    response = JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded ({detail}). Please wait a moment and try again."},
    )
    limiter_instance = getattr(request.app.state, "limiter", None)
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if limiter_instance is not None and view_rate_limit is not None:
        response = limiter_instance._inject_headers(response, view_rate_limit)
    return response
