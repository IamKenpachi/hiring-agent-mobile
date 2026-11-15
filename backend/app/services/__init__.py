"""Backend domain services (JobSpy scraping, PDF/HTML rendering, token telemetry)."""

from app.services.jobspy_service import (
    PRIMARY_JOBSPY_SITES,
    REGIONAL_JOBSPY_SITES,
    SUPPORTED_JOBSPY_SITES,
    scrape_jobspy_boards,
)
from app.services.pdf_service import (
    generate_pdf_file,
    render_cover_letter_html,
    render_cv_html,
)
from app.services.token_service import (
    estimate_token_cost,
    get_user_token_telemetry,
    record_token_usage,
)

__all__ = [
    "SUPPORTED_JOBSPY_SITES",
    "PRIMARY_JOBSPY_SITES",
    "REGIONAL_JOBSPY_SITES",
    "scrape_jobspy_boards",
    "render_cv_html",
    "render_cover_letter_html",
    "generate_pdf_file",
    "estimate_token_cost",
    "record_token_usage",
    "get_user_token_telemetry",
]
