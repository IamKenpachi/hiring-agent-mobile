"""Core configuration, paths, and Gemini model registry."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
except ImportError:
    pass

# === Directory Paths ===
BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent  # backend/
DATA_DIR: Path = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
OUTPUTS_DIR: Path = Path(os.getenv("OUTPUTS_DIR", str(DATA_DIR / "outputs")))

DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# === Environment & Database ===
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
DATABASE_URL: str = os.getenv("DATABASE_URL") or "sqlite:///./data/hiring_mobile.db"

# === Supabase & Observability ===
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
SUPABASE_PUBLISHABLE_KEY: str = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

# === JWT Authentication ===
JWT_SECRET: str = os.getenv("JWT_SECRET", "hiring-agent-mobile-dev-jwt-secret-change-in-prod")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))

# === Gemini Model Registry & Pricing (USD per 1M tokens) ===
DEFAULT_MODEL: str = "gemini-3.8-flash"

MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "gemini-3.5-flash-lite": {
        "name": "Rapid Job Scanner",
        "description": "Fast & Lightweight • High-speed bulk job screening and quick keyword checks",
        "badge": "Fast Scan ⚡",
        "input_cost_per_m": 0.30,
        "output_cost_per_m": 2.50,
        "is_default": False,
    },
    "gemini-3.8-flash": {
        "name": "Daily Application Tailor",
        "description": "Balanced Default • Everyday role matching and full CV & cover letter tailoring",
        "badge": "Recommended ⭐",
        "input_cost_per_m": 0.75,
        "output_cost_per_m": 3.75,
        "is_default": True,
    },
    "gemini-4-hydrogen": {
        "name": "Career Strategist",
        "description": "Deep Alignment • Advanced role analysis, impact bullet rewriting, and positioning",
        "badge": "Deep Fit 🎯",
        "input_cost_per_m": 1.50,
        "output_cost_per_m": 7.50,
        "is_default": False,
    },
    "gemini-4-argon": {
        "name": "Executive Headhunter",
        "description": "Frontier Precision • Maximum depth for competitive, technical, and leadership roles",
        "badge": "Frontier 🏆",
        "input_cost_per_m": 2.00,
        "output_cost_per_m": 10.00,
        "is_default": False,
    },
}

LEGACY_MODEL_ALIASES: Dict[str, str] = {
    "gemini-3.7-flash": "gemini-3.8-flash",
    "gemini-3.6-flash": "gemini-3.8-flash",
    "gemini-3.5-flash": "gemini-3.8-flash",
    "gemini-2.5-flash": "gemini-3.8-flash",
    "gemini-3.1-pro-preview": "gemini-4-argon",
    "gemini-2.5-pro": "gemini-4-argon",
    "gemini-3.1-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
}

AVAILABLE_MODELS: List[Dict[str, Any]] = [
    {
        "id": model_id,
        "name": info["name"],
        "description": info["description"],
        "badge": info["badge"],
        "input_cost_per_m": info["input_cost_per_m"],
        "output_cost_per_m": info["output_cost_per_m"],
        "is_default": info.get("is_default", False),
    }
    for model_id, info in MODEL_REGISTRY.items()
]


def resolve_gemini_model(model_name: str | None) -> str:
    """Resolve and validate a Gemini model identifier against MODEL_REGISTRY."""
    if not model_name or not str(model_name).strip():
        return DEFAULT_MODEL

    cleaned = str(model_name).strip()
    for prefix in ("gemini/", "models/"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix) :]

    lowered = cleaned.lower()
    if lowered in MODEL_REGISTRY:
        return lowered
    if lowered in LEGACY_MODEL_ALIASES:
        return LEGACY_MODEL_ALIASES[lowered]

    for model_id, info in MODEL_REGISTRY.items():
        if info["name"].lower() == lowered:
            return model_id

    return DEFAULT_MODEL
