"""JobSpy multi-board hunting, SSE progress streaming, and 4-score ranking router."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.agents.adk_agents import _should_use_fallback_directly, rank_jobs_batch
from app.api._tailor_helper import (
    _safe_json_loads,
    execute_and_save_tailoring,
    serialize_tailored_output,
)
from app.core.config import resolve_gemini_model
from app.core.rate_limit import limiter
from app.core.security import (
    CurrentUser,
    enforce_trial_quota_if_needed,
    get_current_user,
    get_gemini_api_key,
)
from app.db import session as db_session
from app.db.models import Profile, RankedJob, SearchRun
from app.db.session import get_db
from app.services.jobspy_service import (
    PRIMARY_JOBSPY_SITES,
    REGIONAL_JOBSPY_SITES,
    scrape_jobspy_boards,
)
from app.services.token_service import record_token_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hunt", tags=["hunt"])


class HuntStartRequest(BaseModel):
    query: str = Field(..., min_length=1)
    location: str = "Remote"
    radius: int = Field(default=25, ge=1, le=500)
    platforms: List[str] = Field(default_factory=lambda: ["linkedin", "indeed", "glassdoor"])
    hours_old: int = Field(default=168, ge=0)
    work_type: str = "Any"
    requested_top_n: int = Field(default=10, ge=1, le=50)
    profile_id: Optional[str] = None
    model: Optional[str] = None
    run_sync: bool = False


class JobTailorRequest(BaseModel):
    tone: Optional[str] = "Executive & Formal"
    custom_capabilities: Optional[str] = ""
    model: Optional[str] = None


def _serialize_search_run(run: SearchRun) -> Dict[str, Any]:
    return {
        "id": run.id,
        "user_id": run.user_id,
        "profile_id": run.profile_id,
        "query": run.query,
        "location": run.location,
        "radius": int(run.radius or 25),
        "platforms": _safe_json_loads(run.platforms_json, []),
        "hours_old": int(run.hours_old or 168),
        "work_type": run.work_type,
        "requested_top_n": int(run.requested_top_n or 10),
        "status": run.status,
        "progress_pct": float(run.progress_pct or 0.0),
        "status_detail": run.status_detail or "",
        "warnings": _safe_json_loads(run.warnings_json, []),
        "total_scraped": int(run.total_scraped or 0),
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def _serialize_ranked_job(job: RankedJob) -> Dict[str, Any]:
    return {
        "id": job.id,
        "search_run_id": job.search_run_id,
        "user_id": job.user_id,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "salary": job.salary,
        "source_platform": job.source_platform,
        "job_url": job.job_url,
        "description": job.description,
        "overall_fit_score": int(job.overall_fit_score or 0),
        "skills_match_score": int(job.skills_match_score or 0),
        "experience_fit_score": int(job.experience_fit_score or 0),
        "ats_keyword_score": int(job.ats_keyword_score or 0),
        "matched_skills": _safe_json_loads(job.matched_skills_json, []),
        "missing_skills": _safe_json_loads(job.missing_skills_json, []),
        "match_reason": job.match_reason or "",
        "recommendation": job.recommendation or "",
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def _resolve_profile_for_user(
    db: Session,
    user_id: str,
    profile_id: Optional[str] = None,
) -> Profile:
    if profile_id:
        prof = (
            db.execute(select(Profile).where(Profile.id == profile_id, Profile.user_id == user_id))
            .scalar_one_or_none()
        )
        if prof is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected profile not found.")
        return prof

    prof = (
        db.execute(
            select(Profile)
            .where(Profile.user_id == user_id)
            .order_by(Profile.is_default.desc(), Profile.created_at.desc())
        )
        .scalars()
        .first()
    )
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Master CV Profile found. Please create or upload a profile first.",
        )
    return prof


def _execute_hunt_run(
    *,
    run_id: str,
    user_id: str,
    profile_markdown: str,
    query: str,
    location: str,
    radius: int,
    platforms: List[str],
    hours_old: int,
    work_type: str,
    requested_top_n: int,
    api_key: str,
    model_name: str,
    db: Optional[Session] = None,
) -> str:
    """Execute JobSpy multi-board scraping + ADK 4-score ranking and persist top-N results."""
    owns_session = db is None
    session = db if db is not None else db_session.SessionLocal()
    try:
        run = session.execute(select(SearchRun).where(SearchRun.id == run_id)).scalar_one_or_none()
        if run is None:
            return "failed"

        run.status = "scraping"
        run.progress_pct = 20.0
        run.status_detail = f"Scraping {len(platforms)} JobSpy board(s) for '{query}'..."
        session.commit()

        raw_jobs, warnings = scrape_jobspy_boards(
            query=query,
            location=location,
            radius=radius,
            site_names=platforms,
            hours_old=hours_old,
            work_type=work_type,
            requested_top_n=requested_top_n,
        )

        run.warnings_json = json.dumps(warnings)
        run.total_scraped = len(raw_jobs)
        run.status = "deduplicating"
        run.progress_pct = 45.0
        run.status_detail = f"Cleaned and verified {len(raw_jobs)} unique job descriptions."
        session.commit()

        run.status = "ranking"
        run.progress_pct = 65.0
        run.status_detail = f"Scoring {len(raw_jobs)} scraped listings across 4 fit dimensions..."
        session.commit()

        scored_jobs, in_tok, out_tok = rank_jobs_batch(
            jobs=raw_jobs,
            profile_markdown=profile_markdown,
            api_key=api_key,
            model_name=model_name,
        )
        if raw_jobs and in_tok + out_tok == 0 and not _should_use_fallback_directly(api_key):
            warnings.append(
                "Live ranking fell back to local keyword scoring; 0 API tokens were billed."
            )
            run.warnings_json = json.dumps(warnings)
        if in_tok + out_tok > 0:
            record_token_usage(session, user_id, model_name, "job_ranking", in_tok, out_tok)

        top_jobs = scored_jobs[:requested_top_n]
        run.status = "finalizing"
        run.progress_pct = 90.0
        run.status_detail = f"Sorting top {len(top_jobs)} highest-fit matches..."
        session.commit()
        for item in top_jobs:
            ranked = RankedJob(
                id=str(uuid.uuid4()),
                search_run_id=run.id,
                user_id=user_id,
                title=str(item.get("title") or "Untitled Role"),
                company=str(item.get("company") or ""),
                location=str(item.get("location") or ""),
                salary=str(item.get("salary") or ""),
                source_platform=str(item.get("source_platform") or ""),
                job_url=str(item.get("job_url") or ""),
                description=str(item.get("description") or ""),
                overall_fit_score=int(item.get("overall_fit_score") or 0),
                skills_match_score=int(item.get("skills_match_score") or 0),
                experience_fit_score=int(item.get("experience_fit_score") or 0),
                ats_keyword_score=int(item.get("ats_keyword_score") or 0),
                matched_skills_json=json.dumps(item.get("matched_skills") or []),
                missing_skills_json=json.dumps(item.get("missing_skills") or []),
                match_reason=str(item.get("match_reason") or ""),
                recommendation=str(item.get("recommendation") or ""),
            )
            session.add(ranked)

        run.status = "completed"
        run.progress_pct = 100.0
        run.status_detail = (
            f"Completed: ranked top {len(top_jobs)} of {len(raw_jobs)} scraped jobs."
            if raw_jobs
            else "Completed: no matching jobs returned from selected boards."
        )
        session.commit()
        return "completed"
    except Exception as exc:
        logger.exception("SearchRun %s failed: %s", run_id, exc)
        session.rollback()
        run = session.execute(select(SearchRun).where(SearchRun.id == run_id)).scalar_one_or_none()
        if run is not None:
            run.status = "failed"
            run.progress_pct = 100.0
            run.status_detail = f"Hunt failed: {exc}"
            session.commit()
        return "failed"
    finally:
        if owns_session:
            session.close()


@router.get("/platforms")
def get_platforms() -> Dict[str, List[str]]:
    """Return all 8 supported JobSpy platforms grouped into primary and regional tiers."""
    return {
        "primary": list(PRIMARY_JOBSPY_SITES),
        "regional": list(REGIONAL_JOBSPY_SITES),
    }


@router.post("/start")
@limiter.limit("15/hour")
def start_hunt(
    request: Request,
    req: HuntStartRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Create a JobSpy SearchRun and execute scraping + 4-score ranking (sync or background)."""
    _ = request
    enforce_trial_quota_if_needed(db, current_user.id, x_gemini_api_key)
    profile = _resolve_profile_for_user(db, current_user.id, req.profile_id)
    active_model = resolve_gemini_model(req.model or x_gemini_model)
    platforms = [p.strip().lower() for p in (req.platforms or []) if p.strip()] or list(PRIMARY_JOBSPY_SITES)

    run = SearchRun(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        profile_id=profile.id,
        query=req.query.strip(),
        location=(req.location or "Remote").strip(),
        radius=req.radius,
        platforms_json=json.dumps(platforms),
        hours_old=req.hours_old,
        work_type=(req.work_type or "Any").strip(),
        requested_top_n=req.requested_top_n,
        status="pending",
        progress_pct=5.0,
        status_detail="Search run queued.",
        warnings_json="[]",
        total_scraped=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    run_kwargs = dict(
        run_id=run.id,
        user_id=current_user.id,
        profile_markdown=profile.raw_markdown or profile.summary or profile.full_name,
        query=run.query,
        location=run.location,
        radius=run.radius,
        platforms=platforms,
        hours_old=run.hours_old,
        work_type=run.work_type,
        requested_top_n=run.requested_top_n,
        api_key=gemini_api_key,
        model_name=active_model,
    )

    if req.run_sync:
        final_status = _execute_hunt_run(**run_kwargs, db=db)
        return {"run_id": run.id, "status": final_status}

    background_tasks.add_task(_execute_hunt_run, **run_kwargs)
    return {"run_id": run.id, "status": "pending"}


@router.get("/runs/{run_id}")
def get_hunt_run(
    run_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return SearchRun metadata, warnings, and ranked jobs sorted descending by overall_fit_score."""
    run = (
        db.execute(
            select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found.")

    jobs = (
        db.execute(
            select(RankedJob)
            .where(RankedJob.search_run_id == run_id, RankedJob.user_id == current_user.id)
            .order_by(RankedJob.overall_fit_score.desc(), RankedJob.ats_keyword_score.desc())
        )
        .scalars()
        .all()
    )

    return {
        "run": _serialize_search_run(run),
        "jobs": [_serialize_ranked_job(j) for j in jobs],
    }


@router.get("/runs/{run_id}/stream")
async def stream_hunt_run(
    run_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventSourceResponse:
    """SSE endpoint streaming live SearchRun progress updates to mobile and web clients."""
    initial_run = (
        db.execute(
            select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if initial_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found.")

    async def event_generator():
        last_signature: Optional[tuple] = None
        for _ in range(300):
            session = db_session.SessionLocal()
            try:
                current = (
                    session.execute(
                        select(SearchRun).where(
                            SearchRun.id == run_id, SearchRun.user_id == current_user.id
                        )
                    )
                    .scalar_one_or_none()
                )
                if current is None:
                    break
                payload = _serialize_search_run(current)
                sig = (
                    payload["status"],
                    payload["progress_pct"],
                    payload["status_detail"],
                    payload["total_scraped"],
                )
                if sig != last_signature:
                    last_signature = sig
                    yield {"data": json.dumps(payload)}
                if payload["status"] in {"completed", "failed"}:
                    break
            finally:
                session.close()
            await asyncio.sleep(0.35)

    return EventSourceResponse(event_generator())


@router.get("/jobs/{job_id}")
def get_ranked_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return full details and 4 fit/ATS scores for a single ranked job."""
    job = (
        db.execute(
            select(RankedJob).where(RankedJob.id == job_id, RankedJob.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ranked job not found.")
    return _serialize_ranked_job(job)


@router.post("/jobs/{job_id}/tailor")
def tailor_ranked_job(
    job_id: str,
    req: Optional[JobTailorRequest] = None,
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_api_key: Optional[str] = Header(None, alias="X-Gemini-Api-Key"),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Run ADK ApplicationTailorPipeline for a hunted job and save the TailoredOutput."""
    enforce_trial_quota_if_needed(db, current_user.id, x_gemini_api_key)
    job = (
        db.execute(
            select(RankedJob).where(RankedJob.id == job_id, RankedJob.user_id == current_user.id)
        )
        .scalar_one_or_none()
    )
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ranked job not found.")

    run = db.execute(select(SearchRun).where(SearchRun.id == job.search_run_id)).scalar_one_or_none()
    profile = _resolve_profile_for_user(
        db, current_user.id, run.profile_id if run else None
    )

    body = req or JobTailorRequest()
    active_model = resolve_gemini_model(body.model or x_gemini_model)

    output_row = execute_and_save_tailoring(
        db,
        user_id=current_user.id,
        profile_id=profile.id,
        profile_markdown=profile.raw_markdown or profile.summary or profile.full_name,
        job_title=job.title,
        company=job.company or "Target Company",
        job_url=job.job_url or "",
        job_description=job.description or f"{job.title} at {job.company}",
        custom_capabilities=(body.custom_capabilities or "").strip(),
        tone=(body.tone or "Executive & Formal").strip(),
        model_name=active_model,
        api_key=gemini_api_key,
        ranked_job_id=job.id,
        provided_header_key=x_gemini_api_key,
    )
    return serialize_tailored_output(output_row)
