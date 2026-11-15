"""FastAPI application entrypoint for Hiring Agent Mobile."""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.agents import GeminiAuthError
from app.api import (
    auth_router,
    hunt_router,
    outputs_router,
    profiles_router,
    studio_router,
    telemetry_router,
)
from app.core.config import ENVIRONMENT, SENTRY_DSN
from app.db.session import init_db

logger = logging.getLogger(__name__)

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
    """Initialize SQLite/PostgreSQL schema and directories on application startup."""
    init_db()
    yield


app = FastAPI(
    title="Hiring Agent Mobile API",
    version="1.0.0",
    description="Google ADK multi-agent job hunting, CV tailoring, and AI revision copilot backend.",
    lifespan=lifespan,
)

class CatchAllExceptionMiddleware:
    """Catch unhandled HTTP exceptions inside CORSMiddleware so browsers still receive CORS headers."""

    def __init__(self, asgi_app: ASGIApp) -> None:
        self.app = asgi_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:
            logger.exception("Unhandled error on %s %s", scope.get("method"), scope.get("path"))
            if response_started:
                raise
            response = JSONResponse(
                status_code=500,
                content={"detail": f"Internal server error: {exc}"},
            )
            await response(scope, receive, send)


# Registered before CORSMiddleware so CORSMiddleware sits outermost and decorates all error responses.
app.add_middleware(CatchAllExceptionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


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


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check endpoint used for mobile cold-start warm-up and container healthchecks."""
    return {"status": "ok", "service": "hiring-agent-mobile-api"}
