"""Shared helper for executing tailoring pipelines, persisting TailoredOutput, and generating A4 PDFs."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.agents.adk_agents import run_application_tailor_pipeline
from app.core.config import OUTPUTS_DIR, resolve_gemini_model
from app.core.security import (
    enforce_trial_quota_if_needed,
    get_supabase_client,
    is_supabase_auth_enabled,
)
from app.db.models import TailoredOutput
from app.services.pdf_service import (
    generate_pdf_file,
    render_cover_letter_html,
    render_cv_html,
)
from app.services.token_service import record_token_usage

logger = logging.getLogger(__name__)

OUTPUTS_STORAGE_BUCKET = "outputs-pdfs"
_UNSET_HEADER_KEY: Any = object()


def _storage_doc_name(doc_type: str) -> str:
    clean = (doc_type or "").strip().lower()
    if clean in {"cover_letter", "cl", "letter"}:
        return "cover_letter"
    return clean or "cv"


def upload_pdf_to_storage(
    user_id: str,
    output_id: str,
    doc_type: str,
    pdf_path: str | Path,
) -> bool:
    """Best-effort upload of a generated PDF to the private Supabase outputs-pdfs bucket."""
    if not is_supabase_auth_enabled():
        return False
    path = Path(pdf_path)
    if not path.is_file():
        return False
    object_path = f"{user_id}/{output_id}/{_storage_doc_name(doc_type)}.pdf"
    try:
        sb = get_supabase_client()
        sb.storage.from_(OUTPUTS_STORAGE_BUCKET).upload(
            path=object_path,
            file=path.read_bytes(),
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        return True
    except Exception as exc:
        logger.warning("Best-effort Supabase PDF upload failed for %s: %s", object_path, exc)
        return False


def download_pdf_from_storage(
    user_id: str,
    output_id: str,
    doc_type: str,
    target_path: str | Path,
) -> bool:
    """Best-effort download of a cached PDF from Supabase outputs-pdfs bucket to local disk."""
    if not is_supabase_auth_enabled():
        return False
    object_path = f"{user_id}/{output_id}/{_storage_doc_name(doc_type)}.pdf"
    try:
        sb = get_supabase_client()
        data = sb.storage.from_(OUTPUTS_STORAGE_BUCKET).download(object_path)
        if not data or not isinstance(data, (bytes, bytearray)):
            return False
        dest = Path(target_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(bytes(data))
        return dest.is_file() and dest.stat().st_size > 0
    except Exception as exc:
        logger.warning("Best-effort Supabase PDF download failed for %s: %s", object_path, exc)
        return False


def delete_output_storage_folder(user_id: str, output_id: str) -> bool:
    """Best-effort removal of stored PDFs for an output from Supabase outputs-pdfs bucket."""
    if not is_supabase_auth_enabled():
        return False
    prefix = f"{user_id}/{output_id}"
    try:
        sb = get_supabase_client()
        bucket = sb.storage.from_(OUTPUTS_STORAGE_BUCKET)
        paths: List[str] = []
        try:
            entries = bucket.list(prefix) or []
            for item in entries:
                if isinstance(item, dict) and item.get("name"):
                    paths.append(f"{prefix}/{item['name']}")
        except Exception:
            pass
        if not paths:
            paths = [f"{prefix}/cv.pdf", f"{prefix}/cover_letter.pdf"]
        bucket.remove(paths)
        return True
    except Exception as exc:
        logger.warning("Best-effort Supabase Storage cleanup failed for %s: %s", prefix, exc)
        return False


def _safe_json_loads(raw: Optional[str], fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def serialize_tailored_output_summary(row: TailoredOutput) -> Dict[str, Any]:
    """Serialize a TailoredOutput row for list endpoints."""
    return {
        "id": row.id,
        "job_title": row.job_title,
        "company": row.company,
        "job_url": row.job_url or "",
        "tone": row.tone,
        "model_used": row.model_used,
        "overall_fit_score": int(row.overall_fit_score or 0),
        "skills_match_score": int(row.skills_match_score or 0),
        "experience_fit_score": int(row.experience_fit_score or 0),
        "ats_keyword_score": int(row.ats_keyword_score or 0),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_tailored_output(row: TailoredOutput) -> Dict[str, Any]:
    """Serialize a complete TailoredOutput row with HTML previews, scores, keywords, and PDF URLs."""
    summary = serialize_tailored_output_summary(row)
    summary.update(
        {
            "user_id": row.user_id,
            "profile_id": row.profile_id,
            "ranked_job_id": row.ranked_job_id,
            "job_description": row.job_description or "",
            "custom_capabilities": row.custom_capabilities or "",
            "matched_skills": _safe_json_loads(row.matched_skills_json, []),
            "missing_skills": _safe_json_loads(row.missing_skills_json, []),
            "injected_keywords": _safe_json_loads(row.injected_keywords_json, []),
            "match_reason": row.match_reason or "",
            "recommendation": row.recommendation or "",
            "cv_json": _safe_json_loads(row.cv_json, {}),
            "cv_markdown": row.cv_markdown or "",
            "cv_html": row.cv_html or "",
            "cover_letter_markdown": row.cover_letter_markdown or "",
            "cover_letter_html": row.cover_letter_html or "",
            "chat_history": _safe_json_loads(row.chat_history_json, []),
            "cv_pdf_url": f"/api/outputs/{row.id}/pdf/cv",
            "cl_pdf_url": f"/api/outputs/{row.id}/pdf/cover_letter",
        }
    )
    return summary


def execute_and_save_tailoring(
    db: Session,
    *,
    user_id: str,
    profile_id: Optional[str],
    profile_markdown: str,
    job_title: str,
    company: str,
    job_url: str,
    job_description: str,
    custom_capabilities: str,
    tone: str,
    model_name: str,
    api_key: str,
    ranked_job_id: Optional[str] = None,
    provided_header_key: Any = _UNSET_HEADER_KEY,
) -> TailoredOutput:
    """Run ADK ApplicationTailorPipeline, render HTML + A4 PDFs, seed chat history, and persist."""
    if provided_header_key is not _UNSET_HEADER_KEY:
        enforce_trial_quota_if_needed(db, user_id, provided_header_key)
    resolved_model = resolve_gemini_model(model_name)
    effective_tone = (tone or "Executive & Formal").strip() or "Executive & Formal"

    result, in_tok, out_tok = run_application_tailor_pipeline(
        profile_markdown=profile_markdown,
        job_title=job_title,
        company=company,
        job_description=job_description,
        custom_capabilities=custom_capabilities,
        tone=effective_tone,
        api_key=api_key,
        model_name=resolved_model,
    )
    if in_tok + out_tok > 0:
        record_token_usage(db, user_id, resolved_model, "application_tailor", in_tok, out_tok)

    output_id = str(uuid.uuid4())
    cv_md = str(result.get("cv_markdown") or "").strip()
    cl_md = str(result.get("cover_letter_markdown") or "").strip()
    cv_json_obj = result.get("cv_json") or {}
    injected_keywords: List[str] = list(result.get("injected_keywords") or [])

    cv_html = render_cv_html(cv_md, cv_json_obj)
    cl_html = render_cover_letter_html(cl_md, job_title=job_title, company=company)

    output_dir = OUTPUTS_DIR / user_id / output_id
    output_dir.mkdir(parents=True, exist_ok=True)
    cv_pdf_path = generate_pdf_file(
        cv_md,
        str(output_dir / "tailored_cv.pdf"),
        doc_type="cv",
        title=f"{job_title} - {company}",
    )
    cl_pdf_path = generate_pdf_file(
        cl_md,
        str(output_dir / "cover_letter.pdf"),
        doc_type="cover_letter",
        title=str(cv_json_obj.get("full_name") or "Cover Letter"),
    )

    kw_summary = ", ".join(injected_keywords) if injected_keywords else "role-aligned terminology"
    initial_chat = [
        {
            "role": "assistant",
            "content": (
                f"Generated your tailored CV & Cover Letter for **{job_title}** at **{company}** "
                f"({effective_tone} tone).\n\n"
                f"**Aggressive Keyword Injection added:** {kw_summary}.\n"
                "Let me know if you want to remove any injected keywords you don't have hands-on experience with, "
                "tighten the summary, or emphasize quantifiable metrics."
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "doc_type": "cv",
        }
    ]

    row = TailoredOutput(
        id=output_id,
        user_id=user_id,
        profile_id=profile_id,
        ranked_job_id=ranked_job_id,
        job_title=job_title,
        company=company,
        job_url=job_url or "",
        job_description=job_description or "",
        custom_capabilities=custom_capabilities or "",
        tone=effective_tone,
        model_used=resolved_model,
        overall_fit_score=int(result.get("overall_fit_score") or 0),
        skills_match_score=int(result.get("skills_match_score") or 0),
        experience_fit_score=int(result.get("experience_fit_score") or 0),
        ats_keyword_score=int(result.get("ats_keyword_score") or 0),
        matched_skills_json=json.dumps(result.get("matched_skills") or []),
        missing_skills_json=json.dumps(result.get("missing_skills") or []),
        injected_keywords_json=json.dumps(injected_keywords),
        match_reason=str(result.get("match_reason") or ""),
        recommendation=str(result.get("recommendation") or ""),
        cv_json=json.dumps(cv_json_obj),
        cv_markdown=cv_md,
        cv_html=cv_html,
        cover_letter_markdown=cl_md,
        cover_letter_html=cl_html,
        cv_pdf_path=cv_pdf_path,
        cl_pdf_path=cl_pdf_path,
        chat_history_json=json.dumps(initial_chat),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    upload_pdf_to_storage(user_id, output_id, "cv", cv_pdf_path)
    upload_pdf_to_storage(user_id, output_id, "cover_letter", cl_pdf_path)
    return row
