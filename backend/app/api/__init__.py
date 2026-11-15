"""FastAPI routers package for Hiring Agent Mobile."""

from app.api.auth import router as auth_router
from app.api.hunt import router as hunt_router
from app.api.outputs import router as outputs_router
from app.api.profiles import router as profiles_router
from app.api.studio import router as studio_router
from app.api.telemetry import router as telemetry_router

__all__ = [
    "auth_router",
    "profiles_router",
    "hunt_router",
    "studio_router",
    "outputs_router",
    "telemetry_router",
]
