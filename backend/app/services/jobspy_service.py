"""Resilient multi-board JobSpy scraping service."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

try:
    import jobspy as _jobspy_module
    from jobspy import scrape_jobs as _orig_scrape_jobs

    scrape_jobs = _orig_scrape_jobs
except ImportError:  # pragma: no cover - handled gracefully at runtime
    _jobspy_module = None
    _orig_scrape_jobs = None
    scrape_jobs = None

logger = logging.getLogger(__name__)

SUPPORTED_JOBSPY_SITES: List[str] = [
    "linkedin",
    "indeed",
    "glassdoor",
    "google",
    "zip_recruiter",
    "bayt",
    "naukri",
    "bdjobs",
]

PRIMARY_JOBSPY_SITES: List[str] = [
    "linkedin",
    "indeed",
    "glassdoor",
    "google",
    "zip_recruiter",
]

REGIONAL_JOBSPY_SITES: List[str] = [
    "bayt",
    "naukri",
    "bdjobs",
]

_CURRENCY_SYMBOLS: Dict[str, str] = {
    "USD": "$",
    "GBP": "£",
    "EUR": "€",
    "CAD": "CA$",
    "AUD": "A$",
    "INR": "INR ",
    "AED": "AED ",
    "SAR": "SAR ",
}


def _clean_cell(value: Any, default: str = "") -> str:
    """Convert DataFrame cell values safely into trimmed strings."""
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null", "nat", ""}:
        return default
    return text


def _format_salary(row: Dict[str, Any]) -> str:
    """Build a human-readable salary string from JobSpy fields."""
    explicit_salary = _clean_cell(row.get("salary"))
    if explicit_salary:
        return explicit_salary

    min_amt = row.get("min_amount")
    max_amt = row.get("max_amount")
    has_min = min_amt is not None and not pd.isna(min_amt)
    has_max = max_amt is not None and not pd.isna(max_amt)

    if not has_min and not has_max:
        return ""

    raw_currency = _clean_cell(row.get("currency"), "$")
    currency = _CURRENCY_SYMBOLS.get(raw_currency.upper(), raw_currency)
    interval = _clean_cell(row.get("interval"))
    suffix = f" / {interval}" if interval and interval.lower() not in {"yearly", "annual"} else ""

    try:
        if has_min and has_max and float(min_amt) != float(max_amt):
            return f"{currency}{int(float(min_amt)):,} - {currency}{int(float(max_amt)):,}{suffix}"
        if has_min:
            return f"{currency}{int(float(min_amt)):,}+{suffix}"
        return f"Up to {currency}{int(float(max_amt)):,}{suffix}"
    except (TypeError, ValueError):
        return ""


def _infer_country_indeed(location: str) -> str:
    loc_lower = (location or "").lower()
    if any(k in loc_lower for k in ("uk", "united kingdom", "london", "manchester", "birmingham", "edinburgh")):
        return "uk"
    if any(k in loc_lower for k in ("india", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune")):
        return "india"
    if any(k in loc_lower for k in ("uae", "dubai", "abu dhabi", "sharjah")):
        return "united arab emirates"
    if any(k in loc_lower for k in ("canada", "toronto", "vancouver", "montreal")):
        return "canada"
    if any(k in loc_lower for k in ("germany", "berlin", "munich", "frankfurt")):
        return "germany"
    if any(k in loc_lower for k in ("australia", "sydney", "melbourne")):
        return "australia"
    return "usa"


def _resolve_jobspy_proxies() -> List[str]:
    """Read optional JOBSPY_PROXY_URL from env or config and parse comma-separated entries."""
    cfg_val = ""
    try:
        from app.core import config as core_config

        cfg_val = str(getattr(core_config, "JOBSPY_PROXY_URL", "") or "").strip()
    except Exception:
        cfg_val = ""
    env_val = os.getenv("JOBSPY_PROXY_URL", "").strip()
    raw_proxy = env_val or cfg_val
    if not raw_proxy:
        return []
    return [proxy.strip() for proxy in raw_proxy.split(",") if proxy.strip()]


def _invoke_jobspy(**kwargs: Any) -> Any:
    """Invoke JobSpy scrape_jobs while respecting either module or package monkeypatches."""
    fn = scrape_jobs
    if fn is _orig_scrape_jobs and _jobspy_module is not None and hasattr(_jobspy_module, "scrape_jobs"):
        fn = _jobspy_module.scrape_jobs
    if fn is None:
        raise RuntimeError("python-jobspy is not installed in the active environment.")
    return fn(**kwargs)


def scrape_jobspy_boards(
    query: str,
    location: str = "Remote",
    radius: int = 25,
    site_names: Optional[List[str]] = None,
    hours_old: int = 168,
    work_type: str = "Any",
    requested_top_n: int = 10,
) -> Tuple[List[Dict[str, str]], List[str]]:
    """
    Scrape jobs across selected JobSpy boards with per-board fault isolation.

    If one board fails (e.g. HTTP 429 rate limit or network error), a human-readable
    warning is appended and remaining boards continue executing.
    """
    warnings: List[str] = []
    clean_query = (query or "").strip()
    if not clean_query:
        return [], ["Search query cannot be empty."]

    loc_clean = (location or "Remote").strip() or "Remote"
    if loc_clean.upper() == "UK":
        loc_clean = "London, UK"

    selected_sites: List[str] = []
    if site_names:
        for raw_site in site_names:
            site = str(raw_site).strip().lower()
            if site in SUPPORTED_JOBSPY_SITES:
                if site not in selected_sites:
                    selected_sites.append(site)
            elif site:
                warnings.append(f"Unsupported JobSpy board '{site}' was skipped.")
    else:
        selected_sites = list(PRIMARY_JOBSPY_SITES)

    if not selected_sites:
        selected_sites = list(PRIMARY_JOBSPY_SITES)

    try:
        top_n = max(1, min(int(requested_top_n or 10), 50))
    except (TypeError, ValueError):
        top_n = 10

    per_site_results = max(5, min(top_n, 25))
    distance = int(radius) if radius and int(radius) > 0 else 25
    country_indeed = _infer_country_indeed(loc_clean)

    work_type_norm = (work_type or "Any").strip().lower()
    is_remote = "remote" in work_type_norm or loc_clean.lower() == "remote"
    job_type_val: Optional[str] = None
    if work_type_norm in {"full-time", "fulltime", "permanent"}:
        job_type_val = "fulltime"
    elif work_type_norm in {"part-time", "parttime"}:
        job_type_val = "parttime"
    elif work_type_norm in {"contract", "temporary"}:
        job_type_val = "contract"
    elif work_type_norm in {"internship", "intern", "graduate"}:
        job_type_val = "internship"

    jobs_list: List[Dict[str, str]] = []
    seen_keys: set[str] = set()
    proxies = _resolve_jobspy_proxies()

    for site in selected_sites:
        kwargs: Dict[str, Any] = {
            "site_name": [site],
            "search_term": clean_query,
            "location": loc_clean,
            "distance": distance,
            "results_wanted": per_site_results,
            "country_indeed": country_indeed,
            "description_format": "markdown",
            "verbose": 0,
        }
        if proxies:
            kwargs["proxies"] = list(proxies)
        if hours_old and int(hours_old) > 0:
            kwargs["hours_old"] = int(hours_old)
        if is_remote:
            kwargs["is_remote"] = True
        if job_type_val:
            kwargs["job_type"] = job_type_val
        if site == "linkedin":
            kwargs["linkedin_fetch_description"] = True
        if site == "google":
            kwargs["google_search_term"] = f"{clean_query} jobs in {loc_clean}".strip()

        try:
            raw_result = _invoke_jobspy(**kwargs)
        except Exception as exc:
            err_msg = str(exc)
            lowered = err_msg.lower()
            if "429" in lowered or "rate" in lowered or "too many" in lowered:
                warning_msg = f"{site.title()} was rate-limited (HTTP 429) and skipped: {err_msg}"
            else:
                warning_msg = f"{site.title()} board failed and was skipped: {err_msg}"
            logger.warning(warning_msg)
            warnings.append(warning_msg)
            continue

        if raw_result is None:
            continue

        if isinstance(raw_result, pd.DataFrame):
            if raw_result.empty:
                continue
            records = raw_result.to_dict(orient="records")
        elif isinstance(raw_result, list):
            records = raw_result
        else:
            continue

        for row in records:
            if not isinstance(row, dict):
                continue
            title = _clean_cell(row.get("title") or row.get("job_title"))
            if not title:
                continue

            company = _clean_cell(row.get("company") or row.get("company_name"), "Confidential")
            job_url = _clean_cell(row.get("job_url") or row.get("job_url_direct") or row.get("url"))
            job_loc = _clean_cell(row.get("location"), loc_clean)
            salary = _format_salary(row)
            platform = _clean_cell(row.get("site") or row.get("source_platform"), site).lower()
            description = _clean_cell(row.get("description"))[:6000]

            dedupe_key = job_url.lower() if job_url else f"{title.lower()}::{company.lower()}::{platform}"
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            jobs_list.append(
                {
                    "title": title,
                    "company": company,
                    "location": job_loc,
                    "salary": salary,
                    "source_platform": platform,
                    "job_url": job_url,
                    "description": description,
                }
            )

    return jobs_list, warnings
