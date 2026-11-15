"""Core configuration, paths, and Gemini model registry."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

try:
    from dotenv import load_dotenv

    load_dotenv()
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
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

# === JWT Authentication ===
JWT_SECRET: str = os.getenv("JWT_SECRET", "hiring-agent-mobile-dev-jwt-secret-change-in-prod")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))

# === Gemini Model Registry & Pricing (USD per 1M tokens) ===
DEFAULT_MODEL: str = "gemini-3.7-flash"

MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "gemini-3.7-flash": {
        "name": "Gemini 3.7 Flash",
        "description": "Latest Flagship • Maximum intelligence for agentic loops & structured scoring",
        "badge": "Flagship ⚡",
        "input_cost_per_m": 0.075,
        "output_cost_per_m": 0.30,
        "is_default": True,
    },
    "gemini-3.6-flash": {
        "name": "Gemini 3.6 Flash",
        "description": "High Performance • Optimized for multi-step agentic workflows & code",
        "badge": "Agentic 🚀",
        "input_cost_per_m": 0.075,
        "output_cost_per_m": 0.30,
        "is_default": False,
    },
    "gemini-3.5-flash": {
        "name": "Gemini 3.5 Flash",
        "description": "Fast & Efficient • High-throughput execution and fast extraction",
        "badge": "Fast ⚡",
        "input_cost_per_m": 0.075,
        "output_cost_per_m": 0.30,
        "is_default": False,
    },
    "gemini-3.5-flash-lite": {
        "name": "Gemini 3.5 Flash-Lite",
        "description": "Ultra Low Cost • Designed for high-frequency sub-agent scoring",
        "badge": "Budget 💡",
        "input_cost_per_m": 0.0375,
        "output_cost_per_m": 0.15,
        "is_default": False,
    },
    "gemini-3.1-pro-preview": {
        "name": "Gemini 3.1 Pro Preview",
        "description": "Frontier Reasoning • Deep context synthesis for executive CV tailoring",
        "badge": "Frontier 🧠",
        "input_cost_per_m": 1.25,
        "output_cost_per_m": 5.00,
        "is_default": False,
    },
    "gemini-2.5-flash": {
        "name": "Gemini 2.5 Flash",
        "description": "Balanced Workhorse • High rate-limit stability & reliable throughput",
        "badge": "Stable 🛡️",
        "input_cost_per_m": 0.075,
        "output_cost_per_m": 0.30,
        "is_default": False,
    },
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

    for model_id, info in MODEL_REGISTRY.items():
        if info["name"].lower() == lowered:
            return model_id

    return DEFAULT_MODEL
