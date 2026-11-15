"""Google ADK multi-agent orchestration with deterministic offline/rate-limit fallbacks."""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import os
import re
import uuid
from typing import Any, Coroutine, Dict, List, Optional, Tuple, Type, TypeVar

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.models.google_llm import Gemini
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import DEFAULT_MODEL, resolve_gemini_model

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_PLACEHOLDER_KEY_PREFIXES = (
    "test-",
    "dummy",
    "fake",
    "mock",
    "invalid",
    "placeholder",
    "sk-test",
)


class GeminiAuthError(RuntimeError):
    """Raised when Google Gemini rejects the supplied API key (e.g. API_KEY_INVALID)."""


def is_placeholder_gemini_key(api_key: Optional[str]) -> bool:
    """Return True if the API key is empty, implausibly short, or an explicit test placeholder."""
    cleaned = (api_key or "").strip()
    if not cleaned or len(cleaned) < 12:
        return True
    return cleaned.lower().startswith(_PLACEHOLDER_KEY_PREFIXES)


def _is_gemini_auth_error(exc: Exception) -> bool:
    """Detect API-key or credential rejections from Google GenAI without matching transient 429/5xx."""
    upper = str(exc).upper()
    if any(
        marker in upper
        for marker in (
            "API_KEY_INVALID",
            "API KEY NOT VALID",
            "API_KEY_EXPIRED",
            "API KEY EXPIRED",
            "API_KEY_SERVICE_BLOCKED",
            "PERMISSION_DENIED",
        )
    ):
        return True
    return getattr(exc, "code", None) in (401, 403)


def _raise_if_gemini_auth_error(exc: Exception) -> None:
    """Re-raise invalid/expired key failures as GeminiAuthError instead of falling back silently."""
    if _is_gemini_auth_error(exc):
        raise GeminiAuthError(
            "Google Gemini rejected your API key (invalid, expired, or unauthorized). "
            "Please update a valid Google AI Studio key in Settings."
        ) from exc

# Known technical and domain terms prioritized during deterministic skill/keyword extraction.
_CURATED_SKILLS_CATALOG: List[str] = [
    "Python",
    "SQL",
    "PostgreSQL",
    "MySQL",
    "Snowflake",
    "BigQuery",
    "Redshift",
    "dbt",
    "Airflow",
    "Dagster",
    "Spark",
    "PySpark",
    "Kafka",
    "Pandas",
    "NumPy",
    "Scikit-Learn",
    "PyTorch",
    "TensorFlow",
    "Statsmodels",
    "Tableau",
    "Power BI",
    "Looker",
    "Metabase",
    "Excel",
    "A/B Testing",
    "Experimentation",
    "Statistical Modeling",
    "Causal Inference",
    "ETL",
    "ELT",
    "Data Modeling",
    "Dimensional Modeling",
    "Data Governance",
    "Great Expectations",
    "CI/CD",
    "Git",
    "GitHub Actions",
    "Docker",
    "Kubernetes",
    "Terraform",
    "AWS",
    "GCP",
    "Azure",
    "FastAPI",
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "GraphQL",
    "REST API",
    "Machine Learning",
    "Generative AI",
    "LLM",
    "RAG",
    "Prompt Engineering",
    "Stakeholder Management",
    "Product Analytics",
    "Financial Modeling",
    "Forecasting",
    "Cohort Analysis",
    "KPI Reporting",
]

_STOPWORDS = {
    "about",
    "above",
    "across",
    "after",
    "against",
    "already",
    "also",
    "among",
    "and",
    "any",
    "are",
    "around",
    "because",
    "been",
    "before",
    "being",
    "between",
    "both",
    "build",
    "building",
    "built",
    "business",
    "candidate",
    "candidates",
    "company",
    "could",
    "cross",
    "data",
    "deliver",
    "description",
    "design",
    "develop",
    "drive",
    "during",
    "each",
    "enable",
    "ensure",
    "environment",
    "experience",
    "experienced",
    "for",
    "from",
    "functional",
    "have",
    "having",
    "high",
    "hiring",
    "impact",
    "implement",
    "including",
    "into",
    "join",
    "just",
    "key",
    "knowledge",
    "lead",
    "leading",
    "like",
    "looking",
    "maintain",
    "make",
    "management",
    "more",
    "most",
    "must",
    "need",
    "other",
    "our",
    "over",
    "own",
    "partner",
    "people",
    "position",
    "preferred",
    "problem",
    "problems",
    "process",
    "product",
    "products",
    "proficiency",
    "proven",
    "qualifications",
    "quality",
    "related",
    "relevant",
    "required",
    "requirements",
    "responsibilities",
    "results",
    "role",
    "scalable",
    "seeking",
    "senior",
    "should",
    "skills",
    "solutions",
    "some",
    "stakeholders",
    "strong",
    "such",
    "support",
    "systems",
    "team",
    "teams",
    "technical",
    "technologies",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "tools",
    "translate",
    "understanding",
    "using",
    "very",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "will",
    "with",
    "within",
    "work",
    "working",
    "years",
    "you",
    "your",
}


# =============================================================================
# Pydantic Structured Output Schemas for Google ADK LlmAgents
# =============================================================================


class ExperienceSchema(BaseModel):
    title: str = Field(default="")
    company: str = Field(default="")
    duration: str = Field(default="")
    location: str = Field(default="")
    highlights: List[str] = Field(default_factory=list)


class ProjectSchema(BaseModel):
    name: str = Field(default="")
    description: str = Field(default="")
    technologies: List[str] = Field(default_factory=list)
    url: str = Field(default="")


class EducationSchema(BaseModel):
    degree: str = Field(default="")
    institution: str = Field(default="")
    year: str = Field(default="")
    details: str = Field(default="")


class ProfileParsedOutput(BaseModel):
    full_name: str = Field(default="Candidate")
    email: str = Field(default="")
    phone: str = Field(default="")
    location: str = Field(default="")
    linkedin_url: str = Field(default="")
    github_url: str = Field(default="")
    portfolio_url: str = Field(default="")
    summary: str = Field(default="")
    skills: List[str] = Field(default_factory=list)
    experience: List[ExperienceSchema] = Field(default_factory=list)
    projects: List[ProjectSchema] = Field(default_factory=list)
    education: List[EducationSchema] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    raw_markdown: str = Field(default="")


class JDMetadataOutput(BaseModel):
    job_title: str = Field(default="Target Role")
    company: str = Field(default="Target Company")
    location: str = Field(default="Remote")
    salary: str = Field(default="Competitive")
    core_requirements: List[str] = Field(default_factory=list)
    summary: str = Field(default="")


class JobScoreItemOutput(BaseModel):
    job_index: int = Field(description="0-based index of the job in the input batch")
    overall_fit_score: int = Field(ge=0, le=100)
    skills_match_score: int = Field(ge=0, le=100)
    experience_fit_score: int = Field(ge=0, le=100)
    ats_keyword_score: int = Field(ge=0, le=100)
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    match_reason: str = Field(default="")
    recommendation: str = Field(default="")


class JobMatchBatchOutput(BaseModel):
    scores: List[JobScoreItemOutput] = Field(default_factory=list)


class CVJsonOutput(BaseModel):
    full_name: str = Field(default="Candidate")
    email: str = Field(default="")
    phone: str = Field(default="")
    location: str = Field(default="")
    linkedin_url: str = Field(default="")
    github_url: str = Field(default="")
    portfolio_url: str = Field(default="")
    summary: str = Field(default="")
    skills: List[str] = Field(default_factory=list)
    experience: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)


class CVTailorOutput(BaseModel):
    cv_markdown: str = Field(default="")
    cv_json: CVJsonOutput = Field(default_factory=CVJsonOutput)
    injected_keywords: List[str] = Field(default_factory=list)
    overall_fit_score: int = Field(default=85, ge=0, le=100)
    skills_match_score: int = Field(default=86, ge=0, le=100)
    experience_fit_score: int = Field(default=82, ge=0, le=100)
    ats_keyword_score: int = Field(default=90, ge=0, le=100)
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    match_reason: str = Field(default="")
    recommendation: str = Field(default="")


class CoverLetterOutput(BaseModel):
    cover_letter_markdown: str = Field(default="")


class RevisionOutput(BaseModel):
    modified_markdown: str = Field(default="")
    explanation: str = Field(default="")
    overall_fit_score: int = Field(default=85, ge=0, le=100)
    skills_match_score: int = Field(default=86, ge=0, le=100)
    experience_fit_score: int = Field(default=82, ge=0, le=100)
    ats_keyword_score: int = Field(default=90, ge=0, le=100)
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)


# =============================================================================
# ADK Runtime & Agent Builders
# =============================================================================


def _build_adk_model(model_name: Optional[str], api_key: Optional[str]) -> Gemini:
    """Create a per-request ADK Gemini model instance bound to the user's API key."""
    resolved = resolve_gemini_model(model_name)
    client_kwargs: Dict[str, Any] = {}
    if api_key and api_key.strip():
        client_kwargs["api_key"] = api_key.strip()
    return Gemini(
        model=resolved,
        retry_options=types.HttpRetryOptions(attempts=2),
        client_kwargs=client_kwargs or None,
    )


def create_profile_parser_agent(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> LlmAgent:
    """Build the Google ADK ProfileParserAgent."""
    return LlmAgent(
        name="ProfileParserAgent",
        model=_build_adk_model(model_name, api_key),
        description="Extracts structured career profile data and clean Markdown CV from raw resume text.",
        instruction=(
            "You are an expert executive resume parser. Extract structured candidate profile details "
            "from the provided raw resume text accurately without fabricating credentials. "
            "Populate full_name, email, phone, location, linkedin_url, github_url, portfolio_url, "
            "summary, skills, experience, projects, education, certifications, and a clean structured "
            "raw_markdown representation using H1 name, pipe-separated contact bar, and H2 sections."
        ),
        output_schema=ProfileParsedOutput,
        output_key="parsed_profile",
    )


def create_jd_extractor_agent(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> LlmAgent:
    """Build the Google ADK JDExtractorAgent."""
    return LlmAgent(
        name="JDExtractorAgent",
        model=_build_adk_model(model_name, api_key),
        description="Extracts structured job metadata and core requirements from pasted job postings.",
        instruction=(
            "You are an expert technical recruiter. Extract the job_title, company, location, salary, "
            "up to 6 concise core_requirements, and a sharp 2-sentence summary from the job posting text."
        ),
        output_schema=JDMetadataOutput,
        output_key="extracted_jd",
    )


def create_job_matcher_agent(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> LlmAgent:
    """Build the Google ADK JobMatcherAgent."""
    return LlmAgent(
        name="JobMatcherAgent",
        model=_build_adk_model(model_name, api_key),
        description="Evaluates batches of up to 10 scraped jobs across 4 fit and ATS dimensions.",
        instruction=(
            "You are an expert technical recruiter and ATS simulation engine. Score every job in the "
            "provided batch against the candidate profile across 4 dimensions (0-100): "
            "overall_fit_score, skills_match_score, experience_fit_score, and ats_keyword_score. "
            "Return matched_skills, missing_skills, concise match_reason, and strategic recommendation "
            "for each job_index."
        ),
        output_schema=JobMatchBatchOutput,
        output_key="ranked_batch",
    )


def create_application_tailor_pipeline(
    tone: str = "Executive & Formal",
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> SequentialAgent:
    """Build the Google ADK SequentialAgent combining CVStrategistAgent and CoverLetterWriterAgent."""
    adk_model = _build_adk_model(model_name, api_key)

    cv_strategist = LlmAgent(
        name="CVStrategistAgent",
        model=adk_model,
        description="Tailors candidate CV with Aggressive Keyword Injection and computes 4 post-tailoring scores.",
        instruction=(
            "You are a Senior Executive CV Strategist. Tailor the candidate's CV for the target job.\n"
            "CRITICAL — AGGRESSIVE KEYWORD INJECTION:\n"
            "Identify high-value technical, domain, and tool keywords present in the job description "
            "that are missing from the base candidate profile. Naturally inject them into the tailored "
            "CV's Skills table and Experience / Project bullet points to maximize ATS keyword alignment, "
            "and list every newly injected keyword in `injected_keywords` (exact strings not in base profile).\n"
            "Format `cv_markdown` strictly using:\n"
            "- `# FULL NAME`\n"
            "- Single pipe-separated contact line\n"
            "- `## PROFESSIONAL SUMMARY`\n"
            "- `## CORE TECHNICAL SKILLS` with `| Category | Tools |` rows\n"
            "- `## PROFESSIONAL EXPERIENCE` with `**Role** — Company | Dates` and `- ` metric bullets\n"
            "- `## KEY PROJECTS`, `## EDUCATION`, `## CERTIFICATIONS`\n"
            "Also populate `cv_json` and evaluate the 4 post-tailoring scores (0-100): "
            "overall_fit_score, skills_match_score, experience_fit_score, ats_keyword_score, plus "
            "matched_skills, missing_skills, match_reason, and recommendation."
        ),
        output_schema=CVTailorOutput,
        output_key="tailored_cv_bundle",
    )

    cover_letter_writer = LlmAgent(
        name="CoverLetterWriterAgent",
        model=adk_model,
        description="Writes a tailored cover letter informed by CVStrategistAgent output.",
        instruction=(
            f"You are an Expert Executive Cover Letter Writer using the requested tone: '{tone}'.\n"
            "Review the tailored CV output produced in the previous step: {tailored_cv_bundle}\n"
            "Write a persuasive, well-structured Markdown cover letter addressed to the Hiring Team "
            "with a `# Candidate Name` header, `**Re: [Job Title] Application**`, opening hook, "
            "two quantified achievement paragraphs aligned with the target JD, and confident close."
        ),
        output_schema=CoverLetterOutput,
        output_key="tailored_cover_letter",
    )

    return SequentialAgent(
        name="ApplicationTailorPipeline",
        description="Sequential multi-agent pipeline executing CVStrategistAgent then CoverLetterWriterAgent.",
        sub_agents=[cv_strategist, cover_letter_writer],
    )


def create_revision_copilot_agent(
    doc_type: str = "cv",
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> LlmAgent:
    """Build the Google ADK RevisionCopilotAgent."""
    target_label = "CV" if doc_type == "cv" else "Cover Letter"
    return LlmAgent(
        name="RevisionCopilotAgent",
        model=_build_adk_model(model_name, api_key),
        description=f"Applies user chat revision instructions to the tailored {target_label} and re-scores ATS fit.",
        instruction=(
            f"You are an interactive AI Career Copilot revising a tailored {target_label}. "
            "Apply the user's instruction accurately while preserving valid Markdown structure "
            "(H1 header, contact bar, H2 sections, pipe tables, and `- ` bullets for CV; letterhead "
            "and paragraphs for Cover Letter). Return the complete updated Markdown in `modified_markdown`, "
            "a clear 1-2 sentence `explanation`, and updated 4 scores: overall_fit_score, "
            "skills_match_score, experience_fit_score, ats_keyword_score, matched_skills, missing_skills."
        ),
        output_schema=RevisionOutput,
        output_key="revision_result",
    )


def _should_use_fallback_directly(api_key: Optional[str]) -> bool:
    """Return True only when explicit offline/test fallback mode is active."""
    if os.getenv("HIRING_AGENT_FORCE_FALLBACK", "").lower() in {"1", "true", "yes"}:
        return True
    if os.getenv("ENVIRONMENT", "development").lower() == "test" and is_placeholder_gemini_key(api_key):
        return True
    return False


def _is_stub_fallback_or_validate_key(api_key: Optional[str]) -> bool:
    """Return True for offline test/forced fallback; reject placeholder keys in live environments."""
    if _should_use_fallback_directly(api_key):
        return True
    if is_placeholder_gemini_key(api_key):
        raise GeminiAuthError(
            "Your Gemini API key appears invalid or is a placeholder. "
            "Please enter a valid Google AI Studio key in Settings."
        )
    return False


def _run_coro_sync(coro: Coroutine[Any, Any, Any]) -> Any:
    """Execute an async coroutine safely whether or not an event loop is already running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _parse_json_payload(raw_val: Any, schema_cls: Type[T]) -> Optional[T]:
    """Coerce ADK session state or event text into the target Pydantic schema."""
    if raw_val is None:
        return None
    if isinstance(raw_val, schema_cls):
        return raw_val
    if isinstance(raw_val, dict):
        return schema_cls.model_validate(raw_val)
    if isinstance(raw_val, str):
        cleaned = raw_val.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        if not cleaned:
            return None
        try:
            return schema_cls.model_validate_json(cleaned)
        except Exception:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if match:
                return schema_cls.model_validate(json.loads(match.group(0)))
    return None


async def _execute_adk_agent_async(
    agent: LlmAgent | SequentialAgent,
    prompt_text: str,
    state_keys: List[str],
) -> Tuple[Dict[str, Any], int, int]:
    """Run an ADK LlmAgent or SequentialAgent via Runner + InMemorySessionService."""
    session_service = InMemorySessionService()
    app_name = "hiring_agent_mobile"
    user_id = "adk_user"
    session_id = f"sess_{uuid.uuid4().hex}"

    await session_service.create_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
        state={},
    )

    runner = Runner(
        app_name=app_name,
        agent=agent,
        session_service=session_service,
        auto_create_session=True,
    )

    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt_text)],
    )

    in_tokens = 0
    out_tokens = 0
    author_texts: Dict[str, str] = {}

    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=message,
    ):
        usage = getattr(event, "usage_metadata", None)
        if usage is not None:
            in_tokens += int(getattr(usage, "prompt_token_count", 0) or 0)
            out_tokens += int(getattr(usage, "candidates_token_count", 0) or 0)

        content = getattr(event, "content", None)
        if content and getattr(content, "parts", None):
            text_chunks = [getattr(p, "text", "") or "" for p in content.parts if getattr(p, "text", None)]
            if text_chunks:
                author_texts[str(getattr(event, "author", "agent"))] = "\n".join(text_chunks)

    session = await session_service.get_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
    )
    state_data: Dict[str, Any] = dict(getattr(session, "state", {}) or {})
    results: Dict[str, Any] = {}
    for key in state_keys:
        if key in state_data:
            results[key] = state_data[key]
    results["_author_texts"] = author_texts
    return results, in_tokens, out_tokens


# =============================================================================
# Deterministic Profile / Skill / Scoring Helpers (Used for Normalization & Fallback)
# =============================================================================


def _estimate_tokens(input_text: str, output_text: str) -> Tuple[int, int]:
    """Estimate deterministic token usage for offline/fallback execution telemetry."""
    in_tok = max(40, len((input_text or "").strip()) // 4)
    out_tok = max(40, len((output_text or "").strip()) // 4)
    return in_tok, out_tok


def _extract_known_skills(text: str) -> List[str]:
    """Extract canonical technical & domain skills mentioned in text, preserving discovery order."""
    lowered = (text or "").lower()
    found: List[str] = []
    seen_lower: set[str] = set()

    for skill in _CURATED_SKILLS_CATALOG:
        escaped = re.escape(skill.lower())
        if re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", lowered):
            if skill.lower() not in seen_lower:
                found.append(skill)
                seen_lower.add(skill.lower())

    return found


def _extract_jd_keywords(job_title: str, job_description: str, limit: int = 24) -> List[str]:
    """Extract prioritized technical skills and salient domain keywords from a job posting."""
    combined = f"{job_title or ''}\n{job_description or ''}"
    skills = _extract_known_skills(combined)
    seen = {s.lower() for s in skills}

    # Supplement with domain keywords / capitalized technologies if catalog didn't cover everything
    tokens = re.findall(r"\b[A-Za-z][A-Za-z0-9+#.-]{2,}\b", combined)
    for tok in tokens:
        low = tok.lower().strip(".,")
        if len(low) < 3 or low in _STOPWORDS or low in seen:
            continue
        if any(c.isupper() for c in tok[1:]) or "+" in tok or "#" in tok or tok.isupper():
            skills.append(tok.strip(".,"))
            seen.add(low)
        if len(skills) >= limit:
            break

    if len(skills) < 8:
        for tok in tokens:
            low = tok.lower().strip(".,")
            if len(low) >= 4 and low not in _STOPWORDS and low not in seen:
                skills.append(low)
                seen.add(low)
            if len(skills) >= limit:
                break

    return skills[:limit]


def _clamp_score(val: Any, default: int = 75) -> int:
    try:
        return max(0, min(100, int(round(float(val)))))
    except (TypeError, ValueError):
        return default


def _compute_four_scores(
    candidate_text: str,
    job_title: str,
    job_description: str,
) -> Dict[str, Any]:
    """Deterministically evaluate candidate document against a job across 4 fit/ATS scores."""
    cand_lower = (candidate_text or "").lower()
    jd_text = f"{job_title or ''}\n{job_description or ''}"
    jd_keywords = _extract_jd_keywords(job_title, job_description, limit=20)

    if not jd_keywords:
        return {
            "overall_fit_score": 76,
            "skills_match_score": 78,
            "experience_fit_score": 74,
            "ats_keyword_score": 75,
            "matched_skills": [],
            "missing_skills": [],
            "match_reason": "Evaluated candidate background alignment against the target role title and core duties.",
            "recommendation": "Highlight quantified business impact and role-aligned tools in your top summary.",
        }

    matched: List[str] = []
    missing: List[str] = []
    for kw in jd_keywords:
        pattern = rf"(?<![a-z0-9]){re.escape(kw.lower())}(?![a-z0-9])"
        if re.search(pattern, cand_lower):
            matched.append(kw)
        else:
            missing.append(kw)

    skill_ratio = len(matched) / max(1, len(jd_keywords))
    skills_match_score = _clamp_score(38 + skill_ratio * 60)

    # ATS score weighs both curated skill match and literal token overlap
    raw_jd_tokens = [
        t for t in dict.fromkeys(re.findall(r"[a-z0-9+#.-]{3,}", jd_text.lower())) if t not in _STOPWORDS
    ][:30]
    literal_hits = sum(1 for t in raw_jd_tokens if t in cand_lower)
    literal_ratio = literal_hits / max(1, len(raw_jd_tokens))
    ats_keyword_score = _clamp_score(36 + (skill_ratio * 0.65 + literal_ratio * 0.35) * 62)

    # Experience fit considers seniority words, years mentioned, and role title alignment
    title_words = [w for w in re.findall(r"[a-z0-9]+", (job_title or "").lower()) if len(w) > 2 and w not in _STOPWORDS]
    title_hits = sum(1 for w in title_words if w in cand_lower)
    title_bonus = (title_hits / max(1, len(title_words))) * 18 if title_words else 10
    has_metrics = bool(re.search(r"\d+%|\$\d+|\d+\+?\s*years", cand_lower))
    experience_fit_score = _clamp_score(52 + skill_ratio * 26 + title_bonus + (7 if has_metrics else 0))

    overall_fit_score = _clamp_score(
        0.40 * skills_match_score + 0.32 * experience_fit_score + 0.28 * ats_keyword_score
    )

    reason = (
        f"Matched {len(matched)} of {len(jd_keywords)} priority role keywords "
        f"({', '.join(matched[:4]) if matched else 'core transferable foundations'}). "
        f"{'Strong alignment on technical stack and role scope.' if overall_fit_score >= 75 else 'Moderate overlap with opportunity to strengthen targeted domain terminology.'}"
    )
    recommendation = (
        f"Emphasize quantified outcomes and integrate missing keywords such as {', '.join(missing[:4])}."
        if missing
        else "All core JD keywords are represented; prioritize measurable leadership impact."
    )

    return {
        "overall_fit_score": overall_fit_score,
        "skills_match_score": skills_match_score,
        "experience_fit_score": experience_fit_score,
        "ats_keyword_score": ats_keyword_score,
        "matched_skills": matched[:12],
        "missing_skills": missing[:10],
        "match_reason": reason,
        "recommendation": recommendation,
    }


def build_profile_markdown(profile_data: Dict[str, Any]) -> str:
    """Build clean canonical CV Markdown from structured profile fields."""
    full_name = str(profile_data.get("full_name") or "Candidate Name").strip()
    email = str(profile_data.get("email") or "").strip()
    phone = str(profile_data.get("phone") or "").strip()
    location = str(profile_data.get("location") or "").strip()
    linkedin_url = str(profile_data.get("linkedin_url") or "").strip()
    github_url = str(profile_data.get("github_url") or "").strip()
    portfolio_url = str(profile_data.get("portfolio_url") or "").strip()
    summary = str(profile_data.get("summary") or "").strip()

    lines: List[str] = [f"# {full_name.upper()}"]
    contact_parts = [p for p in (location, phone, email, linkedin_url, github_url, portfolio_url) if p]
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    lines.append("")

    if summary:
        lines.append("## PROFESSIONAL SUMMARY")
        lines.append(summary)
        lines.append("")

    skills = profile_data.get("skills") or []
    if skills:
        lines.append("## CORE TECHNICAL SKILLS")
        lines.append("| Category | Tools |")
        lines.append("| --- | --- |")
        lines.append(f"| Core Stack | {', '.join(str(s).strip() for s in skills if str(s).strip())} |")
        lines.append("")

    experience = profile_data.get("experience") or []
    if experience:
        lines.append("## PROFESSIONAL EXPERIENCE")
        for exp in experience:
            if isinstance(exp, str):
                lines.append(f"- {exp}")
                continue
            if not isinstance(exp, dict):
                continue
            title = str(exp.get("title") or exp.get("role") or "Specialist").strip()
            company = str(exp.get("company") or exp.get("organization") or "").strip()
            duration = str(exp.get("duration") or exp.get("dates") or exp.get("date") or "").strip()
            header = f"**{title}**"
            if company:
                header += f" — {company}"
            if duration:
                header += f" | {duration}"
            lines.append(header)
            highlights = exp.get("highlights") or exp.get("bullets") or []
            if isinstance(highlights, str):
                highlights = [h.strip() for h in highlights.splitlines() if h.strip()]
            for h in highlights:
                lines.append(f"- {str(h).lstrip('-* ').strip()}")
            desc = str(exp.get("description") or "").strip()
            if desc and not highlights:
                lines.append(f"- {desc}")
            lines.append("")

    projects = profile_data.get("projects") or []
    if projects:
        lines.append("## KEY PROJECTS")
        for proj in projects:
            if isinstance(proj, str):
                lines.append(f"- {proj}")
                continue
            if not isinstance(proj, dict):
                continue
            name = str(proj.get("name") or proj.get("title") or "Project").strip()
            techs = proj.get("technologies") or proj.get("tech_stack") or []
            if isinstance(techs, list):
                tech_str = ", ".join(str(t).strip() for t in techs if str(t).strip())
            else:
                tech_str = str(techs).strip()
            header = f"**{name}**" + (f" — {tech_str}" if tech_str else "")
            lines.append(header)
            desc = str(proj.get("description") or "").strip()
            if desc:
                lines.append(f"- {desc}")
            lines.append("")

    education = profile_data.get("education") or []
    if education:
        lines.append("## EDUCATION")
        for edu in education:
            if isinstance(edu, str):
                lines.append(f"- {edu}")
                continue
            if not isinstance(edu, dict):
                continue
            degree = str(edu.get("degree") or "Degree").strip()
            inst = str(edu.get("institution") or edu.get("school") or "").strip()
            year = str(edu.get("year") or edu.get("dates") or "").strip()
            header = f"**{degree}**" + (f" — {inst}" if inst else "") + (f" | {year}" if year else "")
            lines.append(header)
            details = str(edu.get("details") or "").strip()
            if details:
                lines.append(f"- {details}")
        lines.append("")

    certs = profile_data.get("certifications") or []
    if certs:
        lines.append("## CERTIFICATIONS")
        for c in certs:
            if str(c).strip():
                lines.append(f"- {str(c).strip()}")
        lines.append("")

    return "\n".join(lines).strip()


def _fallback_parse_profile(raw_text: str) -> Dict[str, Any]:
    """Deterministic resume parser extracting structured profile fields from raw text."""
    text = (raw_text or "").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text)
    linkedin_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_-]+/?", text, re.I)
    github_match = re.search(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_-]+/?", text, re.I)
    portfolio_match = re.search(r"https?://(?!(?:www\.)?(?:linkedin|github)\.com)[^\s|]+", text, re.I)

    full_name = "Candidate Profile"
    for ln in lines[:5]:
        cleaned = re.sub(r"^#+\s*", "", ln).strip()
        if cleaned and "@" not in cleaned and "http" not in cleaned.lower() and "|" not in cleaned:
            if len(cleaned.split()) <= 6:
                full_name = cleaned
                break

    location = ""
    loc_match = re.search(
        r"\b(London|Manchester|New York|San Francisco|Remote|Berlin|Toronto|Dubai|Bengaluru|UK|USA)\b(?:,\s*[A-Za-z ]+)?",
        text,
        re.I,
    )
    if loc_match:
        location = loc_match.group(0).strip()

    skills = _extract_known_skills(text)
    if not skills:
        skills = ["SQL", "Python", "Data Analysis", "Communication"]

    # Extract summary paragraph if present
    summary = ""
    sec_summary = re.search(
        r"(?:summary|profile|about)\s*[:\n]+(.+?)(?:\n\s*(?:#|skills|experience|work|education|projects)|$)",
        text,
        re.I | re.S,
    )
    if sec_summary:
        summary = " ".join(sec_summary.group(1).strip().splitlines())[:500]
    elif lines:
        summary = f"Experienced professional specializing in {', '.join(skills[:5])}."

    # Extract role experience lines accurately without matching emails or hyphenated words
    experience: List[Dict[str, Any]] = []
    exp_line_re = re.compile(
        r"^([A-Za-z0-9 /&+]{3,50}?)\s+(?:—|–|-|\bat\b)\s+([A-Za-z0-9 .&,'-]{2,50}?)(?:\s*\|\s*(.+))?$"
    )
    all_bullets = [ln.lstrip("-*• ").strip() for ln in lines if ln.startswith(("-", "*", "•"))]
    for ln in lines:
        ln_clean = re.sub(r"^(?:#+\s*|[-*•]\s*)", "", ln).replace("**", "").strip()
        if not ln_clean or "@" in ln_clean or "http" in ln_clean.lower() or "linkedin.com" in ln_clean.lower():
            continue
        low = ln_clean.lower()
        if any(k in low for k in ("university", "college", "b.sc", "bsc", "m.sc", "msc", "b.a.", "m.a.", "ph.d", "phd", "bachelor", "master")):
            continue
        m = exp_line_re.match(ln_clean)
        if m:
            title, comp, dates = m.group(1), m.group(2), m.group(3)
            experience.append(
                {
                    "title": title.strip(),
                    "company": comp.strip(),
                    "duration": (dates or "Recent").strip(),
                    "location": location,
                    "highlights": all_bullets[:3]
                    or [f"Delivered measurable analytics and engineering outcomes using {', '.join(skills[:3])}."],
                }
            )
            if len(experience) >= 4:
                break

    if not experience:
        experience.append(
            {
                "title": "Data & Analytics Specialist",
                "company": "Enterprise Delivery",
                "duration": "2021 - Present",
                "location": location,
                "highlights": all_bullets[:4] or [f"Applied {', '.join(skills[:4])} to drive business KPIs."],
            }
        )

    education: List[Dict[str, Any]] = []
    edu_line_re = re.compile(
        r"\b((?:B\.?Sc\.?|M\.?Sc\.?|B\.?Eng\.?|M\.?Eng\.?|Ph\.?D\.?|Bachelor(?:'s)?|Master(?:'s)?|Doctorate|B\.A\.?|M\.A\.?)\b[^|\n—–]{1,65}?)(?:\s+(?:—|–|-|\bat\b|,)\s+([^|\n•]{2,60}?))?(?:\s*(?:\||•)\s*([^\n]+))?$",
        re.I,
    )
    edu_abbrev_re = re.compile(
        r"\b((?:BA|MA|BS|MS)\s+(?:in|of)\s+[^|\n—–]{2,55}?)(?:\s+(?:—|–|-|\bat\b|,)\s+([^|\n•]{2,60}?))?(?:\s*(?:\||•)\s*([^\n]+))?$"
    )
    for ln in lines:
        ln_clean = re.sub(r"^(?:#+\s*|[-*•]\s*)", "", ln).replace("**", "").strip()
        if not ln_clean or "@" in ln_clean or "http" in ln_clean.lower():
            continue
        if any(bad in ln_clean.lower() for bad in ("summary", "master profile", "master resume")):
            continue
        # Guard against bare two-letter words like "ma" unless written "B.A."/"M.A." or uppercase BA/MA
        edu_match = None
        if re.search(r"\b(?:b\.?sc|m\.?sc|b\.?eng|m\.?eng|ph\.?d|bachelor|master|doctorate|b\.a\.|m\.a\.)\b", ln_clean, re.I):
            edu_match = edu_line_re.search(ln_clean)
        elif re.search(r"\b(?:BA|MA|BS|MS)\s+(?:in|of)\b", ln_clean):
            edu_match = edu_abbrev_re.search(ln_clean)
        if edu_match:
            tail = (edu_match.group(3) or "").strip()
            year_match = re.search(r"\b((?:19|20)\d{2})\b", tail or ln_clean)
            education.append(
                {
                    "degree": edu_match.group(1).strip(" ,-|—–"),
                    "institution": (edu_match.group(2) or "University").strip(" ,-|—–"),
                    "year": year_match.group(1) if year_match else "2020",
                    "details": "",
                }
            )
            break

    profile_dict: Dict[str, Any] = {
        "full_name": full_name,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0).strip() if phone_match else "",
        "location": location,
        "linkedin_url": linkedin_match.group(0) if linkedin_match else "",
        "github_url": github_match.group(0) if github_match else "",
        "portfolio_url": portfolio_match.group(0) if portfolio_match else "",
        "summary": summary,
        "skills": skills,
        "experience": experience,
        "projects": [
            {
                "name": "End-to-End Analytics & Automation Suite",
                "description": f"Built reproducible workflows leveraging {', '.join(skills[:4])}.",
                "technologies": skills[:4],
                "url": "",
            }
        ],
        "education": education,
        "certifications": [],
    }
    profile_dict["raw_markdown"] = text if text.startswith("# ") else build_profile_markdown(profile_dict)
    return profile_dict


def _fallback_extract_jd(raw_text: str) -> Dict[str, Any]:
    """Deterministic job description metadata extractor."""
    text = (raw_text or "").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    job_title = "Senior Data Analyst"
    company = "Target Company"
    location = "Remote"
    salary = "Competitive"

    # Try explicit patterns: "Title at Company" or "Role: ..."
    title_line_match = re.search(r"(?:job\s*title|title|role|position)\s*[:\-]\s*(.+)", text, re.I)
    company_line_match = re.search(r"(?:company|organization|employer)\s*[:\-]\s*(.+)", text, re.I)
    loc_line_match = re.search(r"(?:location|based\s+in)\s*[:\-]\s*(.+)", text, re.I)
    sal_match = re.search(r"(?:[$£€]\s?\d[\d,]*(?:\s*[-–]\s*[$£€]?\s?\d[\d,]*)?(?:\s*(?:k|K|per year|annum|/yr))?)", text)

    if title_line_match:
        job_title = title_line_match.group(1).strip()[:100]
    elif lines:
        first = lines[0]
        at_match = re.match(r"^(.{3,60}?)\s+(?:at|—|-)\s+(.{2,50})$", first, re.I)
        if at_match:
            job_title = at_match.group(1).strip()
            company = at_match.group(2).strip()
        elif len(first) <= 80 and ":" not in first:
            job_title = first

    if company_line_match:
        company = company_line_match.group(1).strip()[:80]
    else:
        comp_phrase = re.search(r"\b([A-Z][A-Za-z0-9&]+(?:\s+[A-Z][A-Za-z0-9&]+)?)\s+is\s+(?:seeking|looking|hiring)", text)
        if comp_phrase:
            company = comp_phrase.group(1).strip()

    if loc_line_match:
        location = loc_line_match.group(1).strip()[:80]
    elif "remote" in text.lower():
        location = "Remote"
    elif "london" in text.lower():
        location = "London, UK"

    if sal_match:
        salary = sal_match.group(0).strip()

    bullets = [ln.lstrip("-*• ").strip() for ln in lines if ln.startswith(("-", "*", "•"))][:6]
    if not bullets:
        extracted_kw = _extract_known_skills(text)
        bullets = [f"Proficiency in {kw}" for kw in extracted_kw[:5]] or ["Analytical problem solving and technical delivery"]

    summary_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20][:2]
    summary = " ".join(summary_sents) if summary_sents else f"Role focused on {job_title} deliverables at {company}."

    return {
        "job_title": job_title,
        "company": company,
        "location": location,
        "salary": salary,
        "core_requirements": bullets,
        "summary": summary,
    }


def _extract_profile_header(profile_markdown: str) -> Dict[str, str]:
    """Pull candidate name and contact line from profile markdown."""
    lines = [ln.strip() for ln in (profile_markdown or "").splitlines() if ln.strip()]
    full_name = "Candidate Name"
    contact_line = ""
    for idx, ln in enumerate(lines):
        if ln.startswith("# ") and not ln.startswith("## "):
            full_name = ln[2:].strip()
            if idx + 1 < len(lines) and not lines[idx + 1].startswith("#"):
                contact_line = lines[idx + 1]
            break

    email_m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", profile_markdown or "")
    phone_m = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", profile_markdown or "")
    linkedin_m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_-]+/?", profile_markdown or "", re.I)
    github_m = re.search(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_-]+/?", profile_markdown or "", re.I)

    return {
        "full_name": full_name,
        "contact_line": contact_line,
        "email": email_m.group(0) if email_m else "",
        "phone": phone_m.group(0).strip() if phone_m else "",
        "linkedin_url": linkedin_m.group(0) if linkedin_m else "",
        "github_url": github_m.group(0) if github_m else "",
    }


def _find_injected_keywords(base_profile: str, tailored_cv: str, job_description: str, job_title: str) -> List[str]:
    """Identify keywords present in tailored_cv & JD that were not present in base_profile."""
    base_lower = (base_profile or "").lower()
    cv_lower = (tailored_cv or "").lower()
    jd_keywords = _extract_jd_keywords(job_title, job_description, limit=25)
    injected: List[str] = []
    for kw in jd_keywords:
        pat = rf"(?<![a-z0-9]){re.escape(kw.lower())}(?![a-z0-9])"
        if re.search(pat, cv_lower) and not re.search(pat, base_lower):
            injected.append(kw)
    return injected


def _render_tone_cover_letter(
    candidate_name: str,
    contact_line: str,
    job_title: str,
    company: str,
    tone: str,
    matched_skills: List[str],
    injected_keywords: List[str],
    custom_capabilities: str,
) -> str:
    """Create a structured tone-tailored Markdown cover letter."""
    tone_lower = (tone or "Executive & Formal").lower()
    key_stack = ", ".join((matched_skills + injected_keywords)[:5]) or "SQL, Python, and modern analytics"
    cap_note = f" Furthermore, {custom_capabilities.strip()}" if custom_capabilities and custom_capabilities.strip() else ""

    if "conversational" in tone_lower:
        opening = (
            f"I've been following {company}'s work closely and was immediately energized to see the {job_title} opening. "
            f"Solving high-leverage problems with {key_stack} is where I do my best work."
        )
        closing = (
            f"I'd love to chat about how I can bring this energy and hands-on expertise to {company} as your next {job_title}."
        )
    elif "technical" in tone_lower or "direct" in tone_lower:
        opening = (
            f"I am applying for the {job_title} role at {company}. My engineering and analytics track record maps "
            f"directly onto your production stack, specifically across {key_stack}."
        )
        closing = (
            f"I welcome a technical discussion on how my architecture and delivery experience can accelerate {company}'s roadmap."
        )
    elif "modern" in tone_lower or "impact" in tone_lower:
        opening = (
            f"{company} is redefining the bar in its space, and I am eager to join as {job_title} to accelerate "
            f"measurable product outcomes through {key_stack}."
        )
        closing = (
            f"Thank you for your consideration—I look forward to demonstrating how I can drive immediate impact at {company}."
        )
    elif "confident" in tone_lower or "persuasive" in tone_lower:
        opening = (
            f"With a proven record of turning complex datasets and pipelines into decisive growth levers, I am "
            f"uniquely positioned to excel as {job_title} at {company}."
        )
        closing = (
            f"I am confident that my track record with {key_stack} will add immediate velocity to {company}, and I look forward to connecting."
        )
    else:
        opening = (
            f"I am writing to express my strong interest in the {job_title} position at {company}. "
            f"My background delivering enterprise-grade initiatives using {key_stack} aligns closely with your mandate."
        )
        closing = (
            f"Thank you for considering my application. I welcome the opportunity to discuss how my experience supports {company}'s strategic goals."
        )

    lines = [f"# {candidate_name}"]
    if contact_line:
        lines.append(contact_line)
    lines.extend(
        [
            "",
            f"**Re: {job_title} Application — {company}**",
            "",
            "Dear Hiring Team,",
            "",
            opening,
            "",
            (
                f"Across recent engagements, I architected automated workflows and executive reporting suites powered by "
                f"{key_stack}, reducing manual turnaround by over 40% while elevating decision accuracy.{cap_note}"
            ),
            "",
            (
                f"Equally important, I partner closely with cross-functional product and engineering stakeholders to "
                f"translate ambiguous requirements into scalable, tested deliverables ready for production."
            ),
            "",
            closing,
            "",
            "Sincerely,",
            "",
            candidate_name,
        ]
    )
    return "\n".join(lines)


def _fallback_tailor_pipeline(
    profile_markdown: str,
    job_title: str,
    company: str,
    job_description: str,
    custom_capabilities: str,
    tone: str,
) -> Dict[str, Any]:
    """Deterministic ApplicationTailorPipeline performing Aggressive Keyword Injection."""
    combined_profile = profile_markdown.strip()
    if custom_capabilities and custom_capabilities.strip():
        combined_profile = f"{combined_profile}\n\nAdditional Candidate Capabilities:\n{custom_capabilities.strip()}"

    header = _extract_profile_header(profile_markdown)
    pre_scores = _compute_four_scores(combined_profile, job_title, job_description)
    jd_keywords = _extract_jd_keywords(job_title, job_description, limit=18)

    base_lower = combined_profile.lower()
    existing_skills = _extract_known_skills(combined_profile)
    injected_keywords: List[str] = []
    for kw in jd_keywords:
        pat = rf"(?<![a-z0-9]){re.escape(kw.lower())}(?![a-z0-9])"
        if not re.search(pat, base_lower):
            injected_keywords.append(kw)
        if len(injected_keywords) >= 6:
            break

    # Guarantee at least one sensible JD keyword injection if JD has non-matching terms
    if not injected_keywords and pre_scores["missing_skills"]:
        injected_keywords = list(pre_scores["missing_skills"][:5])

    all_skills = list(dict.fromkeys(existing_skills + injected_keywords))
    injected_phrase = ", ".join(injected_keywords) if injected_keywords else ", ".join(all_skills[:4])

    # Build tailored CV Markdown incorporating injected keywords into Summary, Skills table, and Experience
    parsed = _fallback_parse_profile(combined_profile)
    if header["full_name"] != "Candidate Name":
        parsed["full_name"] = header["full_name"]

    summary_line = (
        f"Results-driven {job_title} candidate with proven expertise in {', '.join(all_skills[:5])}. "
        f"Accomplished measurable KPI acceleration and production reliability by operationalizing {injected_phrase} "
        f"aligned directly with {company}'s technical roadmap."
    )

    cv_lines = [f"# {parsed['full_name'].upper()}"]
    contact_line = header["contact_line"] or " | ".join(
        p for p in (parsed["location"], parsed["phone"], parsed["email"], parsed["linkedin_url"], parsed["github_url"]) if p
    )
    if contact_line:
        cv_lines.append(contact_line)

    cv_lines.extend(
        [
            "",
            "## PROFESSIONAL SUMMARY",
            summary_line,
            "",
            "## CORE TECHNICAL SKILLS",
            "| Category | Tools |",
            "| --- | --- |",
            f"| Core Stack | {', '.join(existing_skills[:8] or ['Python', 'SQL', 'Analytics'])} |",
            f"| Target Role Alignment | {injected_phrase} |",
            "",
            "## PROFESSIONAL EXPERIENCE",
        ]
    )

    for idx, exp in enumerate(parsed["experience"]):
        title = exp.get("title") or "Specialist"
        comp = exp.get("company") or "Organization"
        dur = exp.get("duration") or "Recent"
        cv_lines.append(f"**{title}** — {comp} | {dur}")
        for b in exp.get("highlights") or []:
            cv_lines.append(f"- {b}")
        if idx == 0 and injected_keywords:
            cv_lines.append(
                f"- Engineered scalable workflows incorporating {injected_phrase} to increase delivery throughput by 35% for {job_title} objectives."
            )
        cv_lines.append("")

    if parsed["projects"]:
        cv_lines.append("## KEY PROJECTS")
        for proj in parsed["projects"]:
            techs = ", ".join(proj.get("technologies") or all_skills[:4])
            cv_lines.append(f"**{proj.get('name', 'Key Initiative')}** — {techs}")
            cv_lines.append(f"- {proj.get('description', 'Delivered measurable business impact.')}")
            cv_lines.append("")

    if parsed["education"]:
        cv_lines.append("## EDUCATION")
        for edu in parsed["education"]:
            cv_lines.append(
                f"**{edu.get('degree', 'Degree')}** — {edu.get('institution', 'University')} | {edu.get('year', '')}".rstrip(" |")
            )
        cv_lines.append("")

    cv_markdown = "\n".join(cv_lines).strip()

    # Re-evaluate scores post-injection
    post_scores = _compute_four_scores(cv_markdown, job_title, job_description)
    cover_letter_markdown = _render_tone_cover_letter(
        candidate_name=parsed["full_name"],
        contact_line=contact_line,
        job_title=job_title,
        company=company,
        tone=tone,
        matched_skills=post_scores["matched_skills"],
        injected_keywords=injected_keywords,
        custom_capabilities=custom_capabilities,
    )

    cv_json = {
        "full_name": parsed["full_name"],
        "email": parsed["email"],
        "phone": parsed["phone"],
        "location": parsed["location"],
        "linkedin_url": parsed["linkedin_url"],
        "github_url": parsed["github_url"],
        "portfolio_url": parsed["portfolio_url"],
        "summary": summary_line,
        "skills": all_skills,
        "experience": parsed["experience"],
        "projects": parsed["projects"],
        "education": parsed["education"],
        "certifications": parsed["certifications"],
    }

    return {
        "cv_markdown": cv_markdown,
        "cv_json": cv_json,
        "cover_letter_markdown": cover_letter_markdown,
        "injected_keywords": injected_keywords,
        "overall_fit_score": max(post_scores["overall_fit_score"], pre_scores["overall_fit_score"]),
        "skills_match_score": max(post_scores["skills_match_score"], pre_scores["skills_match_score"]),
        "experience_fit_score": max(post_scores["experience_fit_score"], pre_scores["experience_fit_score"]),
        "ats_keyword_score": max(post_scores["ats_keyword_score"], pre_scores["ats_keyword_score"]),
        "matched_skills": post_scores["matched_skills"],
        "missing_skills": post_scores["missing_skills"],
        "match_reason": post_scores["match_reason"],
        "recommendation": post_scores["recommendation"],
    }


def _fallback_revision(
    doc_type: str,
    current_cv_markdown: str,
    current_cover_letter_markdown: str,
    instruction: str,
    job_title: str,
    company: str,
    job_description: str,
    profile_markdown: str,
) -> Dict[str, Any]:
    """Deterministic RevisionCopilotAgent fallback applying natural language edits."""
    is_cv = doc_type == "cv"
    current_doc = (current_cv_markdown if is_cv else current_cover_letter_markdown) or ""
    inst_lower = (instruction or "").lower()
    modified = current_doc.strip()
    explanation_parts: List[str] = []

    # 1. Handle explicit keyword removal instructions (e.g., "Remove dbt" or "Remove injected keywords...")
    if "remove" in inst_lower:
        if "injected" in inst_lower and "keyword" in inst_lower:
            base_lower = (profile_markdown or "").lower()
            injected = _find_injected_keywords(profile_markdown, current_cv_markdown, job_description, job_title)
            for kw in injected:
                if kw.lower() not in base_lower:
                    modified = re.sub(rf"\b{re.escape(kw)}\b,?\s*", "", modified, flags=re.IGNORECASE)
            modified = re.sub(r"\|\s*Target Role Alignment\s*\|\s*\|", "", modified)
            explanation_parts.append(
                f"Removed unverified injected keywords ({', '.join(injected) if injected else 'target alignment additions'}) to stay strictly within your base profile."
            )
        else:
            # Remove specifically named words after "remove"
            targets = re.findall(r"remove\s+(?:the\s+)?(?:keyword\s+)?([A-Za-z0-9+#._/-]+)", instruction, re.I)
            removed = []
            for t in targets:
                if t.lower() not in {"all", "any", "the", "section", "bullet"}:
                    modified = re.sub(rf"\b{re.escape(t)}\b,?\s*", "", modified, flags=re.IGNORECASE)
                    removed.append(t)
            explanation_parts.append(
                f"Removed {', '.join(removed)} from the document." if removed else "Applied requested removal edit."
            )

    # 2. Handle summary tightening / conciseness
    elif "concise" in inst_lower or "shorter" in inst_lower or "shorten" in inst_lower:
        lines = modified.splitlines()
        out_lines: List[str] = []
        in_summary = False
        summary_kept = False
        for ln in lines:
            if ln.strip().upper().startswith("## PROFESSIONAL SUMMARY"):
                in_summary = True
                out_lines.append(ln)
                continue
            if in_summary and ln.strip().startswith("## "):
                in_summary = False
            if in_summary:
                if ln.strip() and not summary_kept:
                    first_sentence = re.split(r"(?<=[.!?])\s+", ln.strip())[0]
                    out_lines.append(first_sentence)
                    summary_kept = True
                continue
            out_lines.append(ln)
        modified = "\n".join(out_lines).strip()
        explanation_parts.append("Condensed the summary for faster executive scanability.")

    # 3. Handle metrics / XYZ emphasis or generic addition
    elif "metric" in inst_lower or "quantif" in inst_lower or "xyz" in inst_lower:
        if is_cv:
            modified += "\n- Delivered 30% faster reporting cycle and 99.9% pipeline SLA compliance across cross-functional teams."
        else:
            modified = modified.replace(
                "Sincerely,",
                "Specifically, my initiatives increased analytical throughput by 35% while cutting manual effort by 12 hours weekly.\n\nSincerely,",
            )
        explanation_parts.append("Strengthened quantified impact metrics across key accomplishments.")

    # 4. Generic targeted addition / refinement
    else:
        clean_inst = instruction.strip().rstrip(".")
        if is_cv:
            if "## PROFESSIONAL EXPERIENCE" in modified:
                modified += f"\n- Applied tailored focus per revision: {clean_inst}."
            else:
                modified += f"\n\n## TAILORED HIGHLIGHTS\n- {clean_inst}."
        else:
            if "Sincerely," in modified:
                modified = modified.replace("Sincerely,", f"Additionally, {clean_inst}.\n\nSincerely,")
            else:
                modified += f"\n\n{clean_inst}."
        explanation_parts.append(f"Updated the {'CV' if is_cv else 'Cover Letter'} according to your instruction: '{clean_inst}'.")

    # Re-evaluate 4 scores against CV (if revising CV use modified, else use current_cv_markdown)
    cv_for_eval = modified if is_cv else (current_cv_markdown or modified)
    scores = _compute_four_scores(cv_for_eval, job_title, job_description)

    return {
        "modified_markdown": modified,
        "explanation": " ".join(explanation_parts).strip(),
        "overall_fit_score": scores["overall_fit_score"],
        "skills_match_score": scores["skills_match_score"],
        "experience_fit_score": scores["experience_fit_score"],
        "ats_keyword_score": scores["ats_keyword_score"],
        "matched_skills": scores["matched_skills"],
        "missing_skills": scores["missing_skills"],
    }


# =============================================================================
# Public ADK Orchestration Entrypoints
# =============================================================================


def parse_profile_from_text(
    raw_text: str,
    api_key: str,
    model_name: str = DEFAULT_MODEL,
) -> Tuple[Dict[str, Any], int, int]:
    """Use ADK ProfileParserAgent (with deterministic fallback) to parse raw resume text."""
    resolved_model = resolve_gemini_model(model_name)
    stub_mode = _is_stub_fallback_or_validate_key(api_key)
    prompt = f"Parse the following candidate resume/CV text into structured JSON and clean Markdown:\n\n{raw_text}"

    if not stub_mode:
        try:
            agent = create_profile_parser_agent(api_key=api_key, model_name=resolved_model)
            state, in_tok, out_tok = _run_coro_sync(
                _execute_adk_agent_async(agent, prompt, ["parsed_profile"])
            )
            parsed = _parse_json_payload(state.get("parsed_profile"), ProfileParsedOutput)
            if parsed is None:
                for txt in state.get("_author_texts", {}).values():
                    parsed = _parse_json_payload(txt, ProfileParsedOutput)
                    if parsed is not None:
                        break
            if parsed is not None:
                data = parsed.model_dump()
                if not data.get("raw_markdown"):
                    data["raw_markdown"] = build_profile_markdown(data)
                if in_tok == 0 and out_tok == 0:
                    in_tok, out_tok = _estimate_tokens(prompt, data["raw_markdown"])
                return data, in_tok, out_tok
        except Exception as exc:
            _raise_if_gemini_auth_error(exc)
            logger.warning("ADK ProfileParserAgent falling back to deterministic parser: %s", exc)

    fallback_data = _fallback_parse_profile(raw_text)
    in_tok, out_tok = (
        _estimate_tokens(prompt, fallback_data["raw_markdown"]) if stub_mode else (0, 0)
    )
    return fallback_data, in_tok, out_tok


def extract_jd_metadata(
    raw_text: str,
    api_key: str,
    model_name: str = DEFAULT_MODEL,
) -> Tuple[Dict[str, Any], int, int]:
    """Use ADK JDExtractorAgent (with deterministic fallback) to parse pasted job descriptions."""
    resolved_model = resolve_gemini_model(model_name)
    stub_mode = _is_stub_fallback_or_validate_key(api_key)
    prompt = f"Extract job_title, company, location, salary, core_requirements, and summary from:\n\n{raw_text}"

    if not stub_mode:
        try:
            agent = create_jd_extractor_agent(api_key=api_key, model_name=resolved_model)
            state, in_tok, out_tok = _run_coro_sync(
                _execute_adk_agent_async(agent, prompt, ["extracted_jd"])
            )
            parsed = _parse_json_payload(state.get("extracted_jd"), JDMetadataOutput)
            if parsed is None:
                for txt in state.get("_author_texts", {}).values():
                    parsed = _parse_json_payload(txt, JDMetadataOutput)
                    if parsed is not None:
                        break
            if parsed is not None:
                data = parsed.model_dump()
                if in_tok == 0 and out_tok == 0:
                    in_tok, out_tok = _estimate_tokens(prompt, json.dumps(data))
                return data, in_tok, out_tok
        except Exception as exc:
            _raise_if_gemini_auth_error(exc)
            logger.warning("ADK JDExtractorAgent falling back to deterministic extractor: %s", exc)

    fallback_data = _fallback_extract_jd(raw_text)
    in_tok, out_tok = _estimate_tokens(prompt, json.dumps(fallback_data)) if stub_mode else (0, 0)
    return fallback_data, in_tok, out_tok


def rank_jobs_batch(
    jobs: List[Dict[str, Any]],
    profile_markdown: str,
    api_key: str,
    model_name: str = DEFAULT_MODEL,
) -> Tuple[List[Dict[str, Any]], int, int]:
    """Use ADK JobMatcherAgent in batches of up to 10 jobs to score across 4 dimensions and sort descending."""
    if not jobs:
        return [], 0, 0

    resolved_model = resolve_gemini_model(model_name)
    stub_mode = _is_stub_fallback_or_validate_key(api_key)
    scored_jobs: List[Dict[str, Any]] = []
    total_in = 0
    total_out = 0
    batch_size = 10

    for start in range(0, len(jobs), batch_size):
        batch = jobs[start : start + batch_size]
        batch_payload = [
            {
                "job_index": idx,
                "title": j.get("title", ""),
                "company": j.get("company", ""),
                "location": j.get("location", ""),
                "salary": j.get("salary", ""),
                "source_platform": j.get("source_platform", ""),
                "description": (j.get("description") or "")[:2500],
            }
            for idx, j in enumerate(batch)
        ]
        prompt = (
            f"Candidate Profile:\n{profile_markdown}\n\n"
            f"Job Batch (score each job_index 0..{len(batch)-1}):\n"
            f"{json.dumps(batch_payload, ensure_ascii=False)}"
        )

        batch_scores_by_idx: Dict[int, JobScoreItemOutput] = {}
        used_adk = False

        if not stub_mode:
            try:
                agent = create_job_matcher_agent(api_key=api_key, model_name=resolved_model)
                state, in_tok, out_tok = _run_coro_sync(
                    _execute_adk_agent_async(agent, prompt, ["ranked_batch"])
                )
                parsed = _parse_json_payload(state.get("ranked_batch"), JobMatchBatchOutput)
                if parsed is None:
                    for txt in state.get("_author_texts", {}).values():
                        parsed = _parse_json_payload(txt, JobMatchBatchOutput)
                        if parsed is not None:
                            break
                if parsed is not None and parsed.scores:
                    for item in parsed.scores:
                        batch_scores_by_idx[item.job_index] = item
                    total_in += in_tok or _estimate_tokens(prompt, json.dumps(parsed.model_dump()))[0]
                    total_out += out_tok or _estimate_tokens(prompt, json.dumps(parsed.model_dump()))[1]
                    used_adk = True
            except Exception as exc:
                _raise_if_gemini_auth_error(exc)
                logger.warning("ADK JobMatcherAgent batch fallback triggered: %s", exc)

        for idx, raw_job in enumerate(batch):
            merged = dict(raw_job)
            adk_item = batch_scores_by_idx.get(idx)
            if used_adk and adk_item is not None:
                merged.update(
                    {
                        "overall_fit_score": _clamp_score(adk_item.overall_fit_score),
                        "skills_match_score": _clamp_score(adk_item.skills_match_score),
                        "experience_fit_score": _clamp_score(adk_item.experience_fit_score),
                        "ats_keyword_score": _clamp_score(adk_item.ats_keyword_score),
                        "matched_skills": list(adk_item.matched_skills),
                        "missing_skills": list(adk_item.missing_skills),
                        "match_reason": adk_item.match_reason,
                        "recommendation": adk_item.recommendation,
                    }
                )
            else:
                eval_res = _compute_four_scores(
                    profile_markdown,
                    str(raw_job.get("title") or ""),
                    str(raw_job.get("description") or ""),
                )
                merged.update(eval_res)
                if not used_adk and idx == len(batch) - 1 and stub_mode:
                    est_in, est_out = _estimate_tokens(prompt, json.dumps(eval_res))
                    total_in += est_in
                    total_out += est_out
            scored_jobs.append(merged)

    scored_jobs.sort(key=lambda item: int(item.get("overall_fit_score") or 0), reverse=True)
    return scored_jobs, total_in, total_out


def run_application_tailor_pipeline(
    profile_markdown: str,
    job_title: str,
    company: str,
    job_description: str,
    custom_capabilities: str = "",
    tone: str = "Executive & Formal",
    api_key: str = "",
    model_name: str = DEFAULT_MODEL,
) -> Tuple[Dict[str, Any], int, int]:
    """Execute ADK SequentialAgent ApplicationTailorPipeline (CVStrategist + CoverLetterWriter)."""
    resolved_model = resolve_gemini_model(model_name)
    stub_mode = _is_stub_fallback_or_validate_key(api_key)
    effective_tone = (tone or "Executive & Formal").strip() or "Executive & Formal"
    prompt = (
        f"Target Role: {job_title} at {company}\n"
        f"Cover Letter Tone: {effective_tone}\n\n"
        f"Candidate Base Profile:\n{profile_markdown}\n\n"
        f"Candidate Custom Capabilities / Notes:\n{custom_capabilities or 'None provided'}\n\n"
        f"Target Job Description:\n{job_description}\n"
    )

    if not stub_mode:
        try:
            pipeline = create_application_tailor_pipeline(
                tone=effective_tone,
                api_key=api_key,
                model_name=resolved_model,
            )
            state, in_tok, out_tok = _run_coro_sync(
                _execute_adk_agent_async(
                    pipeline,
                    prompt,
                    ["tailored_cv_bundle", "tailored_cover_letter"],
                )
            )
            cv_bundle = _parse_json_payload(state.get("tailored_cv_bundle"), CVTailorOutput)
            cl_bundle = _parse_json_payload(state.get("tailored_cover_letter"), CoverLetterOutput)
            if cv_bundle is not None and cv_bundle.cv_markdown.strip():
                cover_letter_md = (
                    cl_bundle.cover_letter_markdown.strip()
                    if cl_bundle and cl_bundle.cover_letter_markdown.strip()
                    else _render_tone_cover_letter(
                        candidate_name=cv_bundle.cv_json.full_name or "Candidate",
                        contact_line="",
                        job_title=job_title,
                        company=company,
                        tone=effective_tone,
                        matched_skills=cv_bundle.matched_skills,
                        injected_keywords=cv_bundle.injected_keywords,
                        custom_capabilities=custom_capabilities,
                    )
                )
                injected = list(dict.fromkeys(cv_bundle.injected_keywords))
                if not injected:
                    injected = _find_injected_keywords(
                        profile_markdown, cv_bundle.cv_markdown, job_description, job_title
                    )
                result = {
                    "cv_markdown": cv_bundle.cv_markdown.strip(),
                    "cv_json": cv_bundle.cv_json.model_dump(),
                    "cover_letter_markdown": cover_letter_md,
                    "injected_keywords": injected,
                    "overall_fit_score": _clamp_score(cv_bundle.overall_fit_score),
                    "skills_match_score": _clamp_score(cv_bundle.skills_match_score),
                    "experience_fit_score": _clamp_score(cv_bundle.experience_fit_score),
                    "ats_keyword_score": _clamp_score(cv_bundle.ats_keyword_score),
                    "matched_skills": list(cv_bundle.matched_skills),
                    "missing_skills": list(cv_bundle.missing_skills),
                    "match_reason": cv_bundle.match_reason,
                    "recommendation": cv_bundle.recommendation,
                }
                if in_tok == 0 and out_tok == 0:
                    in_tok, out_tok = _estimate_tokens(prompt, result["cv_markdown"] + result["cover_letter_markdown"])
                return result, in_tok, out_tok
        except Exception as exc:
            _raise_if_gemini_auth_error(exc)
            logger.warning("ADK ApplicationTailorPipeline falling back to deterministic synthesis: %s", exc)

    fallback_result = _fallback_tailor_pipeline(
        profile_markdown=profile_markdown,
        job_title=job_title,
        company=company,
        job_description=job_description,
        custom_capabilities=custom_capabilities,
        tone=effective_tone,
    )
    in_tok, out_tok = (
        _estimate_tokens(
            prompt,
            fallback_result["cv_markdown"] + "\n" + fallback_result["cover_letter_markdown"],
        )
        if stub_mode
        else (0, 0)
    )
    return fallback_result, in_tok, out_tok


def run_revision_copilot(
    doc_type: str,
    current_cv_markdown: str,
    current_cover_letter_markdown: str,
    instruction: str,
    job_title: str,
    company: str,
    job_description: str,
    profile_markdown: str,
    chat_history: List[Dict[str, Any]],
    api_key: str,
    model_name: str = DEFAULT_MODEL,
) -> Tuple[Dict[str, Any], int, int]:
    """Use ADK RevisionCopilotAgent to revise CV or Cover Letter and recompute 4 scores."""
    resolved_model = resolve_gemini_model(model_name)
    stub_mode = _is_stub_fallback_or_validate_key(api_key)
    clean_doc_type = "cover_letter" if str(doc_type).lower() in {"cover_letter", "cl"} else "cv"
    current_doc = current_cv_markdown if clean_doc_type == "cv" else current_cover_letter_markdown
    history_snippet = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in (chat_history or [])[-6:]
    )
    prompt = (
        f"Target Role: {job_title} at {company}\n"
        f"Document Type: {clean_doc_type}\n"
        f"Base Candidate Profile:\n{profile_markdown}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Recent Chat History:\n{history_snippet or 'None'}\n\n"
        f"Current Document Markdown:\n{current_doc}\n\n"
        f"User Revision Instruction:\n{instruction}\n"
    )

    if not stub_mode:
        try:
            agent = create_revision_copilot_agent(
                doc_type=clean_doc_type,
                api_key=api_key,
                model_name=resolved_model,
            )
            state, in_tok, out_tok = _run_coro_sync(
                _execute_adk_agent_async(agent, prompt, ["revision_result"])
            )
            parsed = _parse_json_payload(state.get("revision_result"), RevisionOutput)
            if parsed is None:
                for txt in state.get("_author_texts", {}).values():
                    parsed = _parse_json_payload(txt, RevisionOutput)
                    if parsed is not None:
                        break
            if parsed is not None and parsed.modified_markdown.strip():
                result = {
                    "modified_markdown": parsed.modified_markdown.strip(),
                    "explanation": parsed.explanation.strip() or f"Applied instruction: {instruction}",
                    "overall_fit_score": _clamp_score(parsed.overall_fit_score),
                    "skills_match_score": _clamp_score(parsed.skills_match_score),
                    "experience_fit_score": _clamp_score(parsed.experience_fit_score),
                    "ats_keyword_score": _clamp_score(parsed.ats_keyword_score),
                    "matched_skills": list(parsed.matched_skills),
                    "missing_skills": list(parsed.missing_skills),
                }
                if in_tok == 0 and out_tok == 0:
                    in_tok, out_tok = _estimate_tokens(prompt, result["modified_markdown"])
                return result, in_tok, out_tok
        except Exception as exc:
            _raise_if_gemini_auth_error(exc)
            logger.warning("ADK RevisionCopilotAgent falling back to deterministic revision: %s", exc)

    fallback_res = _fallback_revision(
        doc_type=clean_doc_type,
        current_cv_markdown=current_cv_markdown,
        current_cover_letter_markdown=current_cover_letter_markdown,
        instruction=instruction,
        job_title=job_title,
        company=company,
        job_description=job_description,
        profile_markdown=profile_markdown,
    )
    in_tok, out_tok = (
        _estimate_tokens(prompt, fallback_res["modified_markdown"]) if stub_mode else (0, 0)
    )
    return fallback_res, in_tok, out_tok
