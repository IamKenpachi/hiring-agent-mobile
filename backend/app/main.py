"""FastAPI application entrypoint for Hiring Agent Mobile."""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.agents import GeminiAuthError
from app.api import (
    auth_router,
    hunt_router,
    legal_router,
    outputs_router,
    profiles_router,
    studio_router,
    telemetry_router,
)
from app.core.config import (
    ALLOWED_HOSTS,
    CORS_ORIGINS,
    ENVIRONMENT,
    SENTRY_DSN,
    get_environment,
    validate_production_config,
)
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.db import session as db_session
from app.db.models import SearchRun

logger = logging.getLogger(__name__)
_INITIAL_MAIN_ENV: str = ENVIRONMENT

if SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=ENVIRONMENT,
            traces_sample_rate=0.2,
        )
    except Exception as exc:  # pragma: no cover - optional Sentry initialization
        logger.warning("Sentry initialization skipped: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Validate prod config, initialize DB schema, and recover interrupted SearchRuns on startup."""
    validate_production_config()
    db_session.init_db()
    db = db_session.SessionLocal()
    try:
        stale_runs = (
            db.execute(
                select(SearchRun).where(
                    SearchRun.status.in_(
                        ("pending", "running", "scraping", "deduplicating", "ranking", "finalizing")
                    )
                )
            )
            .scalars()
            .all()
        )
        if stale_runs:
            for run in stale_runs:
                run.status = "failed"
                run.progress_pct = 100.0
                run.status_detail = "Search interrupted by server restart. Please retry your hunt."
            db.commit()
            logger.warning("Recovered %d stale in-flight SearchRun(s) on startup.", len(stale_runs))
    finally:
        db.close()
    yield


app = FastAPI(
    title="Hiring Agent Mobile API",
    version="1.0.0",
    description="Google ADK multi-agent job hunting, CV tailoring, and AI revision copilot backend.",
    lifespan=lifespan,
)
app.state.limiter = limiter


def _is_production_env() -> bool:
    if ENVIRONMENT != _INITIAL_MAIN_ENV:
        return ENVIRONMENT.strip().lower() == "production"
    return get_environment() == "production"


class CatchAllExceptionMiddleware:
    """Catch unhandled HTTP exceptions inside CORSMiddleware and attach security headers."""

    def __init__(self, asgi_app: ASGIApp) -> None:
        self.app = asgi_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        req_headers = Headers(scope=scope)
        request_id = (req_headers.get("x-request-id") or "").strip()[:64] or uuid.uuid4().hex[:12]
        scope.setdefault("state", {})
        if isinstance(scope["state"], dict):
            scope["state"]["request_id"] = request_id

        response_started = False

        def _apply_security_headers(headers: MutableHeaders) -> None:
            headers.setdefault("X-Content-Type-Options", "nosniff")
            headers.setdefault("X-Frame-Options", "DENY")
            headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            headers["X-Request-ID"] = request_id

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                _apply_security_headers(MutableHeaders(scope=message))
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:
            logger.exception(
                "Unhandled error [ref=%s] on %s %s",
                request_id,
                scope.get("method"),
                scope.get("path"),
            )
            if response_started:
                raise
            detail = (
                f"Internal server error (ref: {request_id})"
                if _is_production_env()
                else f"Internal server error (ref: {request_id}): {exc}"
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": detail},
            )
            _apply_security_headers(response.headers)
            await response(scope, receive, send)


# Middleware registration order (last registered = outermost):
# SlowAPIMiddleware (innermost) -> CatchAllExceptionMiddleware -> CORSMiddleware -> TrustedHostMiddleware (optional)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CatchAllExceptionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
if "*" not in ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(GeminiAuthError)
async def gemini_auth_error_handler(_request, exc: GeminiAuthError) -> JSONResponse:
    """Return 401 when Google Gemini rejects the user's API key."""
    return JSONResponse(status_code=401, content={"detail": str(exc)})


app.include_router(auth_router)
app.include_router(profiles_router)
app.include_router(hunt_router)
app.include_router(studio_router)
app.include_router(outputs_router)
app.include_router(telemetry_router)
app.include_router(legal_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check endpoint used for mobile cold-start warm-up and container healthchecks."""
    return {"status": "ok", "service": "hiring-agent-mobile-api"}
