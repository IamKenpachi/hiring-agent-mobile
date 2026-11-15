"""Real-time Gemini token usage and USD cost telemetry router."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import AVAILABLE_MODELS
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.services.token_service import get_user_token_telemetry

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/tokens")
def get_tokens_telemetry(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return real-time token consumption, estimated cost, and available Gemini models."""
    telemetry = get_user_token_telemetry(db, current_user.id)
    telemetry["available_models"] = AVAILABLE_MODELS
    telemetry["models"] = AVAILABLE_MODELS
    return telemetry
