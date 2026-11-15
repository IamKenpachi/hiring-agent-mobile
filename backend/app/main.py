"""FastAPI application entrypoint for Hiring Agent Mobile."""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

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
