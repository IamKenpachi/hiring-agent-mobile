"""Real-time Gemini token usage persistence and cost telemetry service."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import DEFAULT_MODEL, MODEL_REGISTRY, resolve_gemini_model
from app.db.models import TokenUsage


def estimate_token_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Compute estimated USD cost for a single Gemini operation."""
    resolved = resolve_gemini_model(model_name)
    pricing = MODEL_REGISTRY.get(resolved, MODEL_REGISTRY[DEFAULT_MODEL])
    in_cost = (max(0, int(input_tokens)) / 1_000_000) * float(pricing.get("input_cost_per_m", 0.075))
    out_cost = (max(0, int(output_tokens)) / 1_000_000) * float(pricing.get("output_cost_per_m", 0.30))
    return round(in_cost + out_cost, 6)


def record_token_usage(
    db: Session,
    user_id: str,
    model_name: str,
    operation_type: str,
    input_tokens: int,
    output_tokens: int,
) -> Dict[str, Any]:
    """Persist a TokenUsage record to the database and return serialized telemetry."""
    resolved_model = resolve_gemini_model(model_name)
    in_tok = max(0, int(input_tokens or 0))
    out_tok = max(0, int(output_tokens or 0))
    est_cost = estimate_token_cost(resolved_model, in_tok, out_tok)

    row = TokenUsage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        model_name=resolved_model,
        operation_type=operation_type or "llm_call",
        input_tokens=in_tok,
        output_tokens=out_tok,
        estimated_cost_usd=est_cost,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "user_id": row.user_id,
        "model_name": row.model_name,
        "operation_type": row.operation_type,
        "input_tokens": row.input_tokens,
        "output_tokens": row.output_tokens,
        "total_tokens": row.input_tokens + row.output_tokens,
        "estimated_cost_usd": row.estimated_cost_usd,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def get_user_token_telemetry(db: Session, user_id: str) -> Dict[str, Any]:
    """Aggregate lifetime token counts, cost, per-model breakdown, and recent operations for a user."""
    rows: List[TokenUsage] = (
        db.execute(
            select(TokenUsage)
            .where(TokenUsage.user_id == user_id)
            .order_by(TokenUsage.created_at.desc())
        )
        .scalars()
        .all()
    )

    total_input = 0
    total_output = 0
    total_cost = 0.0
    per_model: Dict[str, Dict[str, Any]] = {}
    recent_operations: List[Dict[str, Any]] = []

    for idx, row in enumerate(rows):
        in_tok = int(row.input_tokens or 0)
        out_tok = int(row.output_tokens or 0)
        cost = float(row.estimated_cost_usd or 0.0)
        model_key = row.model_name or DEFAULT_MODEL

        total_input += in_tok
        total_output += out_tok
        total_cost += cost

        if model_key not in per_model:
            per_model[model_key] = {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "calls": 0,
                "est_cost_usd": 0.0,
            }

        per_model[model_key]["input_tokens"] += in_tok
        per_model[model_key]["output_tokens"] += out_tok
        per_model[model_key]["total_tokens"] += in_tok + out_tok
        per_model[model_key]["calls"] += 1
        per_model[model_key]["est_cost_usd"] = round(per_model[model_key]["est_cost_usd"] + cost, 6)

        if idx < 20:
            recent_operations.append(
                {
                    "id": row.id,
                    "model_name": model_key,
                    "operation_type": row.operation_type,
                    "input_tokens": in_tok,
                    "output_tokens": out_tok,
                    "total_tokens": in_tok + out_tok,
                    "estimated_cost_usd": round(cost, 6),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
            )

    rounded_cost = round(total_cost, 6)
    est_cost_formatted = f"${rounded_cost:.4f}" if rounded_cost < 1.0 else f"${rounded_cost:.2f}"

    return {
        "input_tokens": total_input,
        "output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "calls": len(rows),
        "est_cost_usd": rounded_cost,
        "est_cost_formatted": est_cost_formatted,
        "per_model": per_model,
        "recent_operations": recent_operations,
    }
