"""Core configuration, paths, and Gemini model registry."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
except ImportError:
    pass


def _parse_csv_list(raw: Optional[str], default: List[str]) -> List[str]:
    if raw is None:
        return list(default)
    items = [part.strip() for part in raw.split(",") if part.strip()]
    return items if items else list(default)


def _parse_bool(raw: Optional[str], default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes"}


# === Directory Paths ===
BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent  # backend/
DATA_DIR: Path = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
OUTPUTS_DIR: Path = Path(os.getenv("OUTPUTS_DIR", str(DATA_DIR / "outputs")))

DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# === Environment & Database ===
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
DATABASE_URL: str = os.getenv("DATABASE_URL") or "sqlite:///./data/hiring_mobile.db"

# === Security, CORS, Hosts & Scraping ===
CORS_ORIGINS: List[str] = _parse_csv_list(os.getenv("CORS_ORIGINS", "*"), ["*"])
ALLOWED_HOSTS: List[str] = _parse_csv_list(os.getenv("ALLOWED_HOSTS", "*"), ["*"])
JOBSPY_PROXY_URL: str = os.getenv("JOBSPY_PROXY_URL", "").strip()
EMAIL_CONFIRM_AUTO: bool = _parse_bool(os.getenv("EMAIL_CONFIRM_AUTO", "true"), True)
DEMO_TRIAL_MAX_CALLS_PER_USER: int = int(os.getenv("DEMO_TRIAL_MAX_CALLS_PER_USER", "15"))
PUBLIC_APP_NAME: str = os.getenv("PUBLIC_APP_NAME", "Hiring Agent").strip() or "Hiring Agent"
SUPPORT_EMAIL: str = os.getenv("SUPPORT_EMAIL", "support@hiringagent.app").strip() or "support@hiringagent.app"

# === Supabase & Observability ===
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
SUPABASE_PUBLISHABLE_KEY: str = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

# === JWT Authentication ===
DEFAULT_DEV_JWT_SECRET: str = "hiring-agent-mobile-dev-jwt-secret-change-in-prod"
JWT_SECRET: str = os.getenv("JWT_SECRET", DEFAULT_DEV_JWT_SECRET)
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))

# Track import-time baselines so monkeypatching either os.environ or module globals works cleanly in tests.
_INITIAL_ENVIRONMENT: str = ENVIRONMENT
_INITIAL_JWT_SECRET: str = JWT_SECRET
_INITIAL_CORS_ORIGINS: List[str] = list(CORS_ORIGINS)
_INITIAL_DEMO_TRIAL_MAX_CALLS: int = DEMO_TRIAL_MAX_CALLS_PER_USER
_INITIAL_ENV_JWT_SECRET: Optional[str] = os.getenv("JWT_SECRET")
_INITIAL_ENV_CORS_ORIGINS: Optional[str] = os.getenv("CORS_ORIGINS")


def get_environment() -> str:
    """Return active environment name, honoring both module-level and env-var overrides."""
    if ENVIRONMENT != _INITIAL_ENVIRONMENT:
        return ENVIRONMENT.strip().lower()
    return os.getenv("ENVIRONMENT", ENVIRONMENT).strip().lower()


def get_demo_trial_max_calls() -> int:
    """Return max Starter trial AI calls per user, honoring live env or module overrides."""
    if DEMO_TRIAL_MAX_CALLS_PER_USER != _INITIAL_DEMO_TRIAL_MAX_CALLS:
        return int(DEMO_TRIAL_MAX_CALLS_PER_USER)
    raw = os.getenv("DEMO_TRIAL_MAX_CALLS_PER_USER")
    if raw is not None and raw.strip():
        try:
            return int(raw.strip())
        except ValueError:
            pass
    return int(DEMO_TRIAL_MAX_CALLS_PER_USER)


def validate_production_config() -> None:
    """Fail fast on startup when ENVIRONMENT=production has insecure JWT_SECRET or wildcard CORS."""
    if get_environment() != "production":
        return

    if JWT_SECRET != _INITIAL_JWT_SECRET:
        effective_jwt = JWT_SECRET
    elif "JWT_SECRET" in os.environ and os.getenv("JWT_SECRET") != _INITIAL_ENV_JWT_SECRET:
        effective_jwt = os.getenv("JWT_SECRET", "")
    else:
        effective_jwt = os.getenv("JWT_SECRET", JWT_SECRET)

    if effective_jwt == DEFAULT_DEV_JWT_SECRET or len(effective_jwt.strip()) < 16:
        raise RuntimeError(
            "Production startup blocked: JWT_SECRET must be at least 16 characters and "
            "must not use the default development secret."
        )

    if CORS_ORIGINS != _INITIAL_CORS_ORIGINS:
        effective_cors = CORS_ORIGINS
    elif "CORS_ORIGINS" in os.environ and os.getenv("CORS_ORIGINS") != _INITIAL_ENV_CORS_ORIGINS:
        effective_cors = _parse_csv_list(os.getenv("CORS_ORIGINS"), ["*"])
    else:
        effective_cors = _parse_csv_list(os.getenv("CORS_ORIGINS"), CORS_ORIGINS)

    if "*" in effective_cors:
        raise RuntimeError(
            "Production startup blocked: CORS_ORIGINS must not contain '*' in production."
        )

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
