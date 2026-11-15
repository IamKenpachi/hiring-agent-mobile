"""Saved tailored outputs, AI revision chat copilot, and A4 PDF download router."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.adk_agents import run_revision_copilot
from app.api._tailor_helper import (
    _safe_json_loads,
    serialize_tailored_output,
    serialize_tailored_output_summary,
)
from app.core.config import OUTPUTS_DIR, resolve_gemini_model
from app.core.security import CurrentUser, get_current_user, get_gemini_api_key
from app.db.models import Profile, TailoredOutput
from app.db.session import get_db
from app.services.pdf_service import (
    generate_pdf_file,
    render_cover_letter_html,
    render_cv_html,
)
from app.services.token_service import record_token_usage

router = APIRouter(prefix="/api/outputs", tags=["outputs"])


class ReviseOutputRequest(BaseModel):
    doc_type: Literal["cv", "cover_letter"] = Field(..., description="Target document: 'cv' or 'cover_letter'")
    instruction: str = Field(..., min_length=2)
    model: Optional[str] = None


@router.get("")
def list_outputs(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List all saved tailored application outputs ordered newest first."""
    rows = (
        db.execute(
            select(TailoredOutput)
            .where(TailoredOutput.user_id == current_user.id)
            .order_by(TailoredOutput.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [serialize_tailored_output_summary(r) for r in rows]


@router.get("/{output_id}")
def get_output_detail(
    output_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Fetch complete TailoredOutput details, HTML previews, 4 scores, injected keywords, and chat history."""
    row = (
        db.execute(
            select(TailoredOutput).where(
                TailoredOutput.id == output_id,
                TailoredOutput.user_id == current_user.id,
            )
        )
        .scalar_one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tailored output not found.")
    return serialize_tailored_output(row)


@router.post("/{output_id}/revise")
def revise_output(
    output_id: str,
    req: ReviseOutputRequest,
    current_user: CurrentUser = Depends(get_current_user),
    gemini_api_key: str = Depends(get_gemini_api_key),
    x_gemini_model: Optional[str] = Header(None, alias="X-Gemini-Model"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Revise the CV or Cover Letter via ADK RevisionCopilotAgent and update HTML, PDF, and 4 scores."""
    row = (
        db.execute(
            select(TailoredOutput).where(
                TailoredOutput.id == output_id,
                TailoredOutput.user_id == current_user.id,
            )
        )
        .scalar_one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tailored output not found.")

    profile_md = ""
    if row.profile_id:
        prof = db.execute(select(Profile).where(Profile.id == row.profile_id)).scalar_one_or_none()
        if prof is not None:
            profile_md = prof.raw_markdown or ""

    active_model = resolve_gemini_model(req.model or x_gemini_model or row.model_used)
    chat_history: List[Dict[str, Any]] = _safe_json_loads(row.chat_history_json, [])

    revision, in_tok, out_tok = run_revision_copilot(
        doc_type=req.doc_type,
        current_cv_markdown=row.cv_markdown or "",
        current_cover_letter_markdown=row.cover_letter_markdown or "",
        instruction=req.instruction,
        job_title=row.job_title,
        company=row.company,
        job_description=row.job_description or "",
        profile_markdown=profile_md,
        chat_history=chat_history,
        api_key=gemini_api_key,
        model_name=active_model,
    )
    record_token_usage(db, current_user.id, active_model, "revision_copilot", in_tok, out_tok)

    modified_md = str(revision.get("modified_markdown") or "").strip()
    explanation = str(revision.get("explanation") or "Applied requested edits.").strip()
    output_dir = OUTPUTS_DIR / current_user.id / row.id
    output_dir.mkdir(parents=True, exist_ok=True)

    if req.doc_type == "cv":
        row.cv_markdown = modified_md
        cv_json_obj = _safe_json_loads(row.cv_json, {})
        row.cv_html = render_cv_html(modified_md, cv_json_obj)
        row.cv_pdf_path = generate_pdf_file(
            modified_md,
            row.cv_pdf_path or str(output_dir / "tailored_cv.pdf"),
            doc_type="cv",
            title=f"{row.job_title} - {row.company}",
        )
    else:
        row.cover_letter_markdown = modified_md
        row.cover_letter_html = render_cover_letter_html(
            modified_md,
            job_title=row.job_title,
            company=row.company,
        )
        row.cl_pdf_path = generate_pdf_file(
            modified_md,
            row.cl_pdf_path or str(output_dir / "cover_letter.pdf"),
            doc_type="cover_letter",
            title=row.job_title,
        )

    row.overall_fit_score = int(revision.get("overall_fit_score") or row.overall_fit_score or 0)
    row.skills_match_score = int(revision.get("skills_match_score") or row.skills_match_score or 0)
    row.experience_fit_score = int(revision.get("experience_fit_score") or row.experience_fit_score or 0)
    row.ats_keyword_score = int(revision.get("ats_keyword_score") or row.ats_keyword_score or 0)
    row.matched_skills_json = json.dumps(revision.get("matched_skills") or [])
    row.missing_skills_json = json.dumps(revision.get("missing_skills") or [])
    row.model_used = active_model

    now_iso = datetime.now(timezone.utc).isoformat()
    chat_history.append(
        {
            "role": "user",
            "content": req.instruction,
            "doc_type": req.doc_type,
            "timestamp": now_iso,
        }
    )
    chat_history.append(
        {
            "role": "assistant",
            "content": explanation,
            "doc_type": req.doc_type,
            "timestamp": now_iso,
        }
    )
    row.chat_history_json = json.dumps(chat_history)
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(row)

    serialized = serialize_tailored_output(row)
    serialized["explanation"] = explanation
    return serialized


@router.get("/{output_id}/pdf/{doc_type}")
def download_output_pdf(
    output_id: str,
    doc_type: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Serve the generated A4 PDF file for CV or Cover Letter."""
    clean_type = doc_type.strip().lower()
    if clean_type not in {"cv", "cover_letter"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doc_type must be 'cv' or 'cover_letter'.",
        )

    row = (
        db.execute(
            select(TailoredOutput).where(
                TailoredOutput.id == output_id,
                TailoredOutput.user_id == current_user.id,
            )
        )
        .scalar_one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tailored output not found.")

    pdf_path_str = row.cv_pdf_path if clean_type == "cv" else row.cl_pdf_path
    pdf_path = Path(pdf_path_str) if pdf_path_str else (OUTPUTS_DIR / current_user.id / row.id / f"{clean_type}.pdf")

    if not pdf_path.exists():
        markdown_src = row.cv_markdown if clean_type == "cv" else row.cover_letter_markdown
        generate_pdf_file(
            markdown_src or f"# {row.job_title}",
            str(pdf_path),
            doc_type=clean_type,
            title=row.job_title,
        )

    pdf_bytes = pdf_path.read_bytes()
    safe_company = "".join(c if c.isalnum() else "_" for c in (row.company or "Company")).strip("_") or "Company"
    filename = f"{safe_company}_{clean_type}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Content-Length": str(len(pdf_bytes)),
        },
    )
