"""Google ADK multi-agent orchestration with deterministic offline/rate-limit fallbacks."""

from __future__ import annotations

import asyncio
import concurrent.futures
from datetime import datetime, timezone
import json
import logging
import os
import re
import uuid
from typing import Any, Coroutine, Dict, List, Optional, Tuple, Type, TypeVar

from google import genai
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.models.google_llm import Gemini
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import DEFAULT_MODEL, resolve_gemini_model
from app.templates.cv_templates import get_cover_letter_template, get_cv_template

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
    "Matplotlib",
    "Seaborn",
    "PyTorch",
    "TensorFlow",
    "Statsmodels",
    "Tableau",
    "Power BI",
    "Looker",
    "Metabase",
    "Excel",
    "Power Query",
    "VBA",
    "DAX",
    "A/B Testing",
    "Experimentation",
    "Statistical Modeling",
    "Statistical Analysis",
    "Causal Inference",
    "Predictive Modeling",
    "Time-Series Forecasting",
    "Data Visualization",
    "ETL",
    "ELT",
    "Data Modeling",
    "Dimensional Modeling",
    "Data Governance",
    "Data Quality",
    "Great Expectations",
    "Jupyter",
    "CI/CD",
    "Git",
    "GitHub",
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
    year: str = Field(default="")
    highlights: List[str] = Field(default_factory=list)
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
    languages: List[str] = Field(default_factory=list)
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
    experience: List[ExperienceSchema] = Field(default_factory=list)
    projects: List[ProjectSchema] = Field(default_factory=list)
    education: List[EducationSchema] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)


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
    job_description: str = "",
) -> SequentialAgent:
    """Build the Google ADK SequentialAgent combining CVStrategistAgent and CoverLetterWriterAgent."""
    adk_model = _build_adk_model(model_name, api_key)
    cv_template_text = get_cv_template(job_description)
    cl_template_text = get_cover_letter_template()

    cv_strategist = LlmAgent(
        name="CVStrategistAgent",
        model=adk_model,
        description="Tailors candidate CV using the strict executive Markdown template and computes 4 fit/ATS scores.",
        instruction=(
            "You are a Senior Executive CV Strategist and technical recruiter.\n"
            "Given the candidate profile and job posting, create a tailored CV in `cv_markdown` that strictly "
            "follows the Markdown template below.\n\n"
            f"Template to Follow Strictly:\n{cv_template_text}\n\n"
            "Rules:\n"
            "1. Preserve ALL personal information (name, location, phone, email, linkedin, github) and all real "
            "employers, degrees, and projects from the candidate profile.\n"
            "2. Select 2-3 most relevant projects from the candidate profile under `## KEY PROJECTS` and tailor "
            "their impact bullets (XYZ formula with numbers/percentages) to align with the job description.\n"
            "3. Tailor `## PROFESSIONAL SUMMARY`, `## CORE TECHNICAL SKILLS` (using the 4-category `| Category | Tools |` "
            "table), and `## PROFESSIONAL EXPERIENCE` bullets to highlight key skills matching this job description.\n"
            "4. Reframe experience and project bullets using JD terminology and weave in closely related "
            "analytical/domain concepts, and record newly aligned JD domain/analytical keywords in `injected_keywords`.\n"
            "5. Do NOT invent false qualifications, fake tools the candidate has never used, or unformatted keyword lists.\n"
            "6. Populate `cv_json` and evaluate the 4 post-tailoring scores (0-100): overall_fit_score, "
            "skills_match_score, experience_fit_score, ats_keyword_score, plus matched_skills, missing_skills, "
            "match_reason, and recommendation."
        ),
        output_schema=CVTailorOutput,
        output_key="tailored_cv_bundle",
    )

    cover_letter_writer = LlmAgent(
        name="CoverLetterWriterAgent",
        model=adk_model,
        description="Writes a tailored executive cover letter following the strict letterhead template.",
        instruction=(
            f"You are an Expert Executive Cover Letter Writer using the requested tone: '{tone}'.\n"
            "Write a high-impact, persuasive cover letter in `cover_letter_markdown` for the candidate applying "
            "to the target role and company.\n\n"
            f"Template Structure:\n{cl_template_text}\n\n"
            "Rules:\n"
            "1. Follow the template structure strictly: Candidate FULL NAME on line 1, pipe-separated contact line "
            "on line 2, current date, Hiring Manager + Company Name, `**Re: [Job Title] Application**`, "
            "`Dear [Company] Hiring Team,`, 4 well-structured paragraphs, and `Sincerely,\\n\\nFULL NAME`.\n"
            "2. Clearly articulate passion for the company and highlight 1-2 major quantified achievements/projects "
            "from the candidate profile that solve the company's specific needs.\n"
            f"3. Match the requested tone: '{tone}'."
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


_NON_SKILL_JD_TERMS = {
    "about",
    "overview",
    "summary",
    "profile",
    "description",
    "responsibilities",
    "requirements",
    "qualifications",
    "preferred",
    "benefits",
    "perks",
    "salary",
    "compensation",
    "bonus",
    "equity",
    "pension",
    "holiday",
    "holidays",
    "vacation",
    "apply",
    "application",
    "hiring",
    "recruiting",
    "recruitment",
    "job",
    "position",
    "opportunity",
    "career",
    "careers",
    "mission",
    "vision",
    "values",
    "culture",
    "diversity",
    "inclusion",
    "equal",
    "eeo",
    "hello",
    "dear",
    "hi",
    "regards",
    "sincerely",
    "thanks",
    "thank",
    "welcome",
    "please",
    "note",
    "fyi",
    "tbd",
    "tbc",
    "etc",
    "pulse",
    "group",
    "role",
    "team",
    "teams",
    "company",
    "organization",
    "employer",
    "department",
    "division",
    "london",
    "manchester",
    "birmingham",
    "edinburgh",
    "portsmouth",
    "uk",
    "usa",
    "emea",
    "apac",
    "remote",
    "hybrid",
    "onsite",
    "office",
    "location",
    "based",
    "city",
    "country",
    "senior",
    "junior",
    "mid",
    "lead",
    "principal",
    "staff",
    "head",
    "director",
    "manager",
    "intern",
    "graduate",
    "entry",
    "associate",
    "assistant",
    "specialist",
    "analyst",
    "engineer",
    "scientist",
    "architect",
    "consultant",
    "coordinator",
    "developer",
    "data",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "sept",
    "oct",
    "nov",
    "dec",
    "ltd",
    "inc",
    "llc",
    "plc",
    "corp",
    "gmbh",
    "bank",
    "holdings",
    "ventures",
    "partners",
    "solutions",
    "services",
    "technologies",
    "labs",
    "studio",
    "gbp",
    "usd",
    "eur",
    "cad",
    "aud",
    "chf",
    "aed",
    "annum",
    "year",
    "years",
    "month",
    "months",
    "week",
    "weeks",
    "day",
    "days",
    "hour",
    "hours",
    "full",
    "part",
    "time",
    "permanent",
    "contract",
    "temporary",
    "bsc",
    "msc",
    "phd",
    "mba",
    "bba",
    "meng",
    "beng",
    "cv",
    "resume",
    "ceo",
    "cto",
    "cfo",
    "coo",
    "gmt",
    "bst",
    "utc",
    "est",
    "pst",
    "cet",
    "nda",
}


def _extract_jd_keywords(job_title: str, job_description: str, limit: int = 24) -> List[str]:
    """Extract prioritized technical skills and genuine technical acronyms from a job posting."""
    combined = f"{job_title or ''}\n{job_description or ''}"
    skills = _extract_known_skills(combined)
    seen = {s.lower() for s in skills}

    # Supplement only with genuine mixed-case / symbol / short technical acronyms (never random prose)
    tokens = re.findall(r"\b[A-Za-z][A-Za-z0-9+#.-]{1,}\b", combined)
    for tok in tokens:
        clean_tok = tok.strip(".,-")
        low = clean_tok.lower()
        if not clean_tok or clean_tok.endswith("'s"):
            continue
        if len(low) < 3 and "+" not in clean_tok and "#" not in clean_tok:
            continue
        if low in _STOPWORDS or low in _NON_SKILL_JD_TERMS or low in seen:
            continue
        if any(c.isupper() for c in clean_tok[1:]) or "+" in clean_tok or "#" in clean_tok or clean_tok.isupper():
            # Skip generic ALL-CAPS prose headers (e.g. RESPONSIBILITIES, BENEFITS, OVERVIEW)
            if clean_tok.isupper() and len(clean_tok) > 5 and not any(ch.isdigit() for ch in clean_tok):
                continue
            skills.append(clean_tok)
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


_SKILL_CATEGORY_RULES: List[Tuple[str, Tuple[str, ...]]] = [
    (
        "Programming & Databases",
        (
            "python",
            "sql",
            "postgresql",
            "postgres",
            "mysql",
            "sqlite",
            "oracle",
            "t-sql",
            "pl/sql",
            "nosql",
            "mongodb",
            "pandas",
            "numpy",
            "scikit-learn",
            "sklearn",
            "matplotlib",
            "seaborn",
            "scipy",
            "statsmodels",
            "pytorch",
            "tensorflow",
            "r",
            "java",
            "javascript",
            "typescript",
            "node.js",
            "react",
            "fastapi",
            "django",
            "flask",
            "graphql",
            "rest api",
            "git",
            "github",
            "gitlab",
            "bash",
            "c++",
            "c#",
        ),
    ),
    (
        "BI & Visualization",
        (
            "power bi",
            "powerbi",
            "tableau",
            "looker",
            "lookml",
            "metabase",
            "superset",
            "qlik",
            "grafana",
            "excel",
            "advanced excel",
            "power query",
            "vba",
            "dax",
            "pivot tables",
            "visualization",
            "dashboard",
        ),
    ),
    (
        "Cloud & Engineering",
        (
            "etl",
            "elt",
            "airflow",
            "dagster",
            "dbt",
            "snowflake",
            "bigquery",
            "redshift",
            "databricks",
            "spark",
            "pyspark",
            "kafka",
            "hadoop",
            "fivetran",
            "docker",
            "kubernetes",
            "terraform",
            "aws",
            "gcp",
            "azure",
            "ci/cd",
            "github actions",
            "data modeling",
            "dimensional modeling",
            "data governance",
            "data quality",
            "great expectations",
            "jupyter",
            "pipeline",
        ),
    ),
    (
        "Analytical Methods",
        (
            "statistical",
            "a/b testing",
            "experimentation",
            "causal inference",
            "predictive",
            "machine learning",
            "generative ai",
            "llm",
            "rag",
            "prompt engineering",
            "forecasting",
            "time-series",
            "financial modeling",
            "financial reconciliation",
            "cohort analysis",
            "kpi reporting",
            "product analytics",
            "retention",
            "regression",
            "classification",
            "clustering",
            "data analysis",
            "analytics",
        ),
    ),
]


def _classify_skill_category(skill: str) -> str:
    """Assign a skill string to one of the 4 executive CV categories or Domain & Tools."""
    low = skill.strip().lower()
    if not low:
        return "Domain & Tools"
    for category, keywords in _SKILL_CATEGORY_RULES:
        for kw in keywords:
            if re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", low):
                return category
    return "Domain & Tools"


def _build_categorized_skills_rows(skills: List[str]) -> List[str]:
    """Group flat skills into executive Markdown table rows across the 4 standard categories."""
    buckets: Dict[str, List[str]] = {
        "Programming & Databases": [],
        "BI & Visualization": [],
        "Cloud & Engineering": [],
        "Analytical Methods": [],
        "Domain & Tools": [],
    }
    seen_lower: set[str] = set()
    for raw_skill in skills:
        clean_skill = str(raw_skill).strip()
        if not clean_skill:
            continue
        low = clean_skill.lower()
        if low in seen_lower:
            continue
        seen_lower.add(low)
        cat = _classify_skill_category(clean_skill)
        buckets[cat].append(clean_skill)

    rows: List[str] = []
    for cat in (
        "Programming & Databases",
        "BI & Visualization",
        "Cloud & Engineering",
        "Analytical Methods",
        "Domain & Tools",
    ):
        items = buckets[cat]
        if items:
            rows.append(f"| {cat} | {', '.join(items)} |")
    return rows


def _split_project_bullets(desc: str) -> List[str]:
    """Split multi-line or multi-sentence project description into crisp bullet points."""
    cleaned = (desc or "").strip()
    if not cleaned:
        return []
    if "\n" in cleaned:
        parts = [ln.lstrip("-*• ").strip() for ln in cleaned.splitlines() if ln.strip()]
        if parts:
            return parts
    # Split only at sentence boundaries followed by a capital letter to preserve numbers like 1.2M
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", cleaned) if s.strip()]
    return sents or [cleaned]


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

    skills = [str(s).strip() for s in (profile_data.get("skills") or []) if str(s).strip()]
    if skills:
        lines.append("## CORE TECHNICAL SKILLS")
        lines.append("| Category | Tools |")
        lines.append("| --- | --- |")
        lines.extend(_build_categorized_skills_rows(skills))
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
                clean_h = str(h).lstrip("-*• ").strip()
                if clean_h:
                    lines.append(f"- {clean_h}")
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
            year = str(proj.get("year") or proj.get("date") or proj.get("duration") or "").strip()
            header = f"**{name}**" + (f" — {tech_str}" if tech_str else "") + (f" | {year}" if year else "")
            lines.append(header)
            highlights = proj.get("highlights") or proj.get("bullets") or []
            if isinstance(highlights, str):
                highlights = [h.strip() for h in highlights.splitlines() if h.strip()]
            if highlights:
                for h in highlights:
                    clean_h = str(h).lstrip("-*• ").strip()
                    if clean_h:
                        lines.append(f"- {clean_h}")
            else:
                desc = str(proj.get("description") or "").strip()
                if desc:
                    for part in _split_project_bullets(desc):
                        lines.append(f"- {part}")
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
                lines.append(f"- {str(c).strip().lstrip('-*• ')}")
        lines.append("")

    languages = profile_data.get("languages") or []
    if languages:
        lines.append("## LANGUAGES")
        for lang in languages:
            if isinstance(lang, dict):
                l_name = str(lang.get("language") or lang.get("name") or "").strip()
                l_level = str(lang.get("level") or lang.get("proficiency") or "").strip()
                if l_name:
                    lines.append(f"- {l_name}: {l_level}" if l_level else f"- {l_name}")
            elif str(lang).strip():
                lines.append(f"- {str(lang).strip().lstrip('-*• ')}")
        lines.append("")

    return "\n".join(lines).strip()


_SECTION_HEADING_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    (
        "SUMMARY",
        re.compile(
            r"^(?:professional\s+summary|executive\s+summary|career\s+summary|summary|profile|about(?:\s+me)?|objective)$",
            re.I,
        ),
    ),
    (
        "EDUCATION",
        re.compile(
            r"^(?:education(?:al)?(?:\s+background)?|academic\s+background|qualifications|education\s*&\s*training)$",
            re.I,
        ),
    ),
    (
        "SKILLS",
        re.compile(
            r"^(?:core\s+technical\s+skills|technical\s+skills|core\s+skills|core\s+competencies|skills(?:\s*&\s*tools)?|technologies)$",
            re.I,
        ),
    ),
    (
        "EXPERIENCE",
        re.compile(
            r"^(?:work\s+experience|professional\s+experience|experience|employment(?:\s+history)?|career\s+history)$",
            re.I,
        ),
    ),
    (
        "PROJECTS",
        re.compile(
            r"^(?:key\s+projects|projects|selected\s+projects|academic\s+projects|personal\s+projects)$",
            re.I,
        ),
    ),
    (
        "CERTIFICATIONS",
        re.compile(r"^(?:certifications?|licenses?\s*(?:&|and)\s*certifications?|credentials)$", re.I),
    ),
    (
        "LANGUAGES",
        re.compile(r"^languages?$", re.I),
    ),
    (
        "OTHER",
        re.compile(
            r"^(?:soft\s+skills|interpersonal\s+skills|strengths|additional\s+candidate\s+capabilities|additional\s+capabilities|interests|hobbies|awards|honors|publications|references)$",
            re.I,
        ),
    ),
]

_BULLET_LINE_RE = re.compile(r"^(?:[-•]|\*(?!\*))\s*")
_DATE_ONLY_LINE_RE = re.compile(
    r"^(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+)?(?:19|20)\d{2}(?:\s*[-–—]\s*(?:present|current|now|(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+)?(?:19|20)\d{2}))?$",
    re.I,
)
_TRAILING_DATE_RE = re.compile(
    r"\s+((?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+)?(?:19|20)\d{2}(?:\s*[-–—]\s*(?:present|current|now|(?:(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+)?(?:19|20)\d{2})))$",
    re.I,
)
_CATALOG_CANONICAL_BY_LOWER: Dict[str, str] = {s.lower(): s for s in _CURATED_SKILLS_CATALOG}


def _detect_section_heading(line: str) -> Optional[str]:
    """Return canonical section name if line is a standalone resume section header."""
    if not line or _BULLET_LINE_RE.match(line) or line.startswith("|"):
        return None
    cand = re.sub(r"^#+\s*", "", line).replace("**", "").strip().rstrip(":").strip()
    if not cand or len(cand) > 55 or "@" in cand or "http" in cand.lower():
        return None
    for sec_name, pattern in _SECTION_HEADING_PATTERNS:
        if pattern.match(cand):
            return sec_name
    return None


def _split_skill_tokens(raw_text: str) -> List[str]:
    """Extract clean individual skill names from comma/semicolon lists including parentheticals."""
    tokens: List[str] = []
    # Split on top-level commas or semicolons (ignoring commas inside parentheses)
    chunks: List[str] = []
    depth = 0
    buf: List[str] = []
    for ch in raw_text:
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif ch in {",", ";"} and depth == 0:
            part = "".join(buf).strip()
            if part:
                chunks.append(part)
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        chunks.append(tail)

    for chunk in chunks:
        paren_m = re.match(r"^(.+?)\s*\(([^()]+)\)\s*$", chunk)
        if paren_m:
            base = paren_m.group(1).strip()
            inner = [p.strip() for p in paren_m.group(2).split(",") if p.strip()]
            for item in [base, *inner]:
                if item and len(item) <= 45 and len(item.split()) <= 5:
                    tokens.append(item)
        else:
            clean = chunk.strip()
            if clean and len(clean) <= 45 and len(clean.split()) <= 5:
                tokens.append(clean)
    return tokens


def _fallback_parse_profile(raw_text: str) -> Dict[str, Any]:
    """Section-aware deterministic resume parser extracting structured profile fields from raw text."""
    text = (raw_text or "").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text)
    linkedin_match = re.search(
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_.-]+/?",
        text,
        re.I,
    )
    github_match = re.search(
        r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+/?",
        text,
        re.I,
    )
    portfolio_match = re.search(r"https?://(?!(?:www\.)?(?:linkedin|github)\.com)[^\s|•]+", text, re.I)

    full_name = "Candidate Profile"
    for ln in lines[:5]:
        if _detect_section_heading(ln) is not None:
            continue
        cleaned = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()
        if cleaned and "@" not in cleaned and "http" not in cleaned.lower() and "|" not in cleaned and "•" not in cleaned:
            if len(cleaned.split()) <= 6:
                full_name = cleaned
                break

    # Extract location from pipe/bullet contact bar first, then fallback to known cities/countries
    location = ""
    for ln in lines[:6]:
        if "|" in ln or ("•" in ln and "@" in ln):
            sep = "|" if "|" in ln else "•"
            parts = [p.strip() for p in ln.split(sep) if p.strip()]
            for part in parts:
                low_p = part.lower()
                if (
                    "@" in part
                    or "http" in low_p
                    or "linkedin" in low_p
                    or "github" in low_p
                    or re.match(r"^[\d\s+().-]{7,}$", part)
                ):
                    continue
                if len(part) <= 60:
                    location = part
                    break
            if location:
                break

    if not location:
        loc_match = re.search(
            r"\b(Portsmouth|London|Manchester|New York|San Francisco|Remote|Berlin|Toronto|Dubai|Bengaluru|Casablanca|UK|USA)\b(?:,\s*[A-Za-z ]+)?",
            text,
            re.I,
        )
        if loc_match:
            location = loc_match.group(0).strip()

    # Split lines into canonical resume sections so headings never bleed across sections
    sections: Dict[str, List[str]] = {
        "HEADER": [],
        "SUMMARY": [],
        "EDUCATION": [],
        "SKILLS": [],
        "EXPERIENCE": [],
        "PROJECTS": [],
        "CERTIFICATIONS": [],
        "LANGUAGES": [],
        "OTHER": [],
    }
    seen_sections: set[str] = set()
    current_section = "HEADER"

    for ln in lines:
        sec = _detect_section_heading(ln)
        if sec is not None:
            current_section = sec
            seen_sections.add(sec)
            continue

        # Handle inline section prefixes like "Summary: Highly analytical..."
        if not _BULLET_LINE_RE.match(ln) and not ln.startswith("|"):
            inline_m = re.match(
                r"^(?:#+\s*|\*\*)?(professional\s+summary|executive\s+summary|summary|profile|about(?:\s+me)?|education|skills|core\s+technical\s+skills|experience|work\s+experience|professional\s+experience|projects|key\s+projects|certifications?|languages?)(?:\*\*)?\s*:\s*(.+)$",
                ln,
                re.I,
            )
            if inline_m:
                detected = _detect_section_heading(inline_m.group(1))
                if detected:
                    current_section = detected
                    seen_sections.add(detected)
                    rest = inline_m.group(2).strip()
                    if rest:
                        sections[current_section].append(rest)
                    continue

        sections[current_section].append(ln)

    # Skills: combine curated catalog matches + explicit entries inside SKILLS section
    skills = _extract_known_skills(text)
    seen_skill_lower = {s.lower() for s in skills}
    for ln in sections["SKILLS"]:
        clean_ln = ln.strip()
        if not clean_ln:
            continue
        if clean_ln.startswith("|"):
            cells = [c.strip() for c in clean_ln.split("|") if c.strip()]
            if not cells or all(
                c.replace("-", "").replace(":", "") == "" or c.lower() in {"category", "tools", "skills", "tools/skills"}
                for c in cells
            ):
                continue
            skill_text = cells[1] if len(cells) >= 2 else cells[0]
        else:
            no_bullet = _BULLET_LINE_RE.sub("", clean_ln).replace("**", "").strip()
            skill_text = no_bullet.split(":", 1)[1].strip() if ":" in no_bullet else no_bullet

        for raw_tok in _split_skill_tokens(skill_text):
            low = raw_tok.lower()
            canonical = _CATALOG_CANONICAL_BY_LOWER.get(low, raw_tok)
            if low in seen_skill_lower:
                continue
            # If a 2-3 word skill refines a 1-word catalog match (e.g., "Advanced Excel" vs "Excel"), prefer the specific phrase
            if len(raw_tok.split()) <= 3:
                subsumed = [
                    sk for sk in list(seen_skill_lower)
                    if len(sk.split()) == 1 and re.search(rf"(?<![a-z0-9]){re.escape(sk)}(?![a-z0-9])", low)
                ]
                if subsumed:
                    skills = [s for s in skills if s.lower() not in subsumed]
                    for sk in subsumed:
                        seen_skill_lower.discard(sk)
            # Avoid adding verbose multi-word wrappers if a multi-word catalog skill is already listed
            elif any(
                re.search(rf"(?<![a-z0-9]){re.escape(sk)}(?![a-z0-9])", low) for sk in seen_skill_lower
            ):
                continue
            skills.append(canonical)
            seen_skill_lower.add(canonical.lower())

    if not skills:
        skills = ["SQL", "Python", "Data Analysis", "Communication"]
    else:
        skills_lower = {s.lower() for s in skills}
        redundant_singles = {
            s.lower()
            for s in skills
            if (
                f"advanced {s.lower()}" in skills_lower
                or f"time-series {s.lower()}" in skills_lower
                or f"{s.lower()} notebooks" in skills_lower
                or f"{s.lower()} concepts" in skills_lower
            )
        }
        if redundant_singles:
            skills = [s for s in skills if s.lower() not in redundant_singles]

    # Summary: extract strictly from SUMMARY section
    summary = ""
    if sections["SUMMARY"]:
        summary = " ".join(
            _BULLET_LINE_RE.sub("", ln).replace("**", "").strip() for ln in sections["SUMMARY"]
        ).strip()
    elif lines:
        summary = f"Experienced professional specializing in {', '.join(skills[:5])}."

    # Experience: parse strictly inside EXPERIENCE section
    experience: List[Dict[str, Any]] = []
    current_exp: Optional[Dict[str, Any]] = None
    for ln in sections["EXPERIENCE"]:
        if _BULLET_LINE_RE.match(ln):
            bullet = _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
            if bullet:
                if current_exp is not None:
                    current_exp["highlights"].append(bullet)
                else:
                    current_exp = {
                        "title": "Specialist",
                        "company": "Organization",
                        "duration": "",
                        "location": location,
                        "highlights": [bullet],
                    }
                    experience.append(current_exp)
            continue

        ln_clean = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()
        if not ln_clean:
            continue

        if current_exp is not None and not current_exp["duration"] and _DATE_ONLY_LINE_RE.match(ln_clean):
            current_exp["duration"] = ln_clean
            continue

        duration = ""
        main_part = ln_clean
        if "|" in ln_clean:
            main_part, duration = [p.strip() for p in ln_clean.rsplit("|", 1)]
        else:
            trail_m = _TRAILING_DATE_RE.search(main_part)
            if trail_m:
                duration = trail_m.group(1).strip()
                main_part = main_part[: trail_m.start()].strip()

        sep_m = re.match(r"^(.+?)\s+(?:—|–|-|\bat\b)\s+(.+)$", main_part)
        if sep_m:
            title = sep_m.group(1).strip()
            comp = sep_m.group(2).strip()
        elif current_exp is not None and not duration:
            # Continuation line for previous role rather than a phantom new role
            current_exp["highlights"].append(ln_clean)
            continue
        else:
            title = main_part
            comp = ""

        current_exp = {
            "title": title,
            "company": comp,
            "duration": duration,
            "location": location,
            "highlights": [],
        }
        experience.append(current_exp)

    # Unsectioned fallback ONLY when there was no EXPERIENCE section heading at all
    if not experience and "EXPERIENCE" not in seen_sections:
        exp_line_re = re.compile(
            r"^([A-Za-z0-9 /&+]{3,50}?)\s+(?:—|–|-|\bat\b)\s+([A-Za-z0-9 .&,'-]{2,50}?)(?:\s*\|\s*(.+))?$"
        )
        for ln in sections["HEADER"]:
            ln_clean = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()
            if not ln_clean or "@" in ln_clean or "http" in ln_clean.lower() or ln_clean == full_name:
                continue
            low = ln_clean.lower()
            if any(
                k in low
                for k in ("university", "college", "b.sc", "bsc", "m.sc", "msc", "b.a.", "m.a.", "ph.d", "phd", "bachelor", "master")
            ):
                continue
            m = exp_line_re.match(ln_clean)
            if m:
                experience.append(
                    {
                        "title": m.group(1).strip(),
                        "company": m.group(2).strip(),
                        "duration": (m.group(3) or "").strip(),
                        "location": location,
                        "highlights": [],
                    }
                )

    if not experience:
        experience.append(
            {
                "title": "Data & Analytics Specialist",
                "company": "Enterprise Delivery",
                "duration": "2021 - Present",
                "location": location,
                "highlights": [f"Applied {', '.join(skills[:4])} to drive business KPIs."],
            }
        )

    # Projects: parse strictly inside PROJECTS section
    projects: List[Dict[str, Any]] = []
    current_proj: Optional[Dict[str, Any]] = None
    for ln in sections["PROJECTS"]:
        if _BULLET_LINE_RE.match(ln):
            bullet = _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
            if bullet and current_proj is not None:
                current_proj["highlights"].append(bullet)
                current_proj["description"] = " ".join(current_proj["highlights"])
            continue

        ln_clean = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()
        if not ln_clean:
            continue

        year = ""
        main_part = ln_clean
        if "|" in ln_clean:
            main_part, year = [p.strip() for p in ln_clean.rsplit("|", 1)]

        proj_name = main_part
        tech_list: List[str] = []
        dash_m = re.match(r"^(.+?)\s+(?:—|–|-)\s+(.+)$", main_part)
        paren_m = re.match(r"^(.+?)\s*\(([^()]+)\)\s*$", main_part)
        if dash_m:
            proj_name = dash_m.group(1).strip()
            tech_raw = dash_m.group(2).strip()
            tech_list = [t.strip() for t in tech_raw.split(",") if t.strip()]
        elif paren_m:
            proj_name = paren_m.group(1).strip()
            tech_raw = paren_m.group(2).strip()
            tech_list = [t.strip() for t in tech_raw.split(",") if t.strip()]

        current_proj = {
            "name": proj_name,
            "description": "",
            "technologies": tech_list,
            "year": year,
            "highlights": [],
            "url": "",
        }
        projects.append(current_proj)

    if not projects:
        projects.append(
            {
                "name": "End-to-End Analytics & Automation Suite",
                "description": f"Built reproducible workflows leveraging {', '.join(skills[:4])}.",
                "technologies": skills[:4],
                "year": "",
                "highlights": [f"Built reproducible workflows leveraging {', '.join(skills[:4])}."],
                "url": "",
            }
        )

    # Education: parse strictly inside EDUCATION section (preserving ALL degrees & date ranges)
    education: List[Dict[str, Any]] = []
    for ln in sections["EDUCATION"]:
        if _BULLET_LINE_RE.match(ln):
            bullet = _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
            if bullet and education and not re.search(
                r"\b(?:b\.?sc|m\.?sc|b\.?eng|m\.?eng|ph\.?d|bachelor|master|doctorate|diploma|degree|ba|ma|bs|ms)\b",
                bullet,
                re.I,
            ):
                prev_det = education[-1].get("details", "")
                education[-1]["details"] = f"{prev_det}; {bullet}".strip("; ")
                continue
            ln_clean = bullet
        else:
            ln_clean = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()

        if not ln_clean:
            continue

        if education and not education[-1]["year"] and _DATE_ONLY_LINE_RE.match(ln_clean):
            education[-1]["year"] = ln_clean
            continue

        year = ""
        main_part = ln_clean
        if "|" in ln_clean:
            main_part, year = [p.strip() for p in ln_clean.rsplit("|", 1)]
        else:
            trail_m = _TRAILING_DATE_RE.search(main_part)
            if trail_m:
                year = trail_m.group(1).strip()
                main_part = main_part[: trail_m.start()].strip()

        sep_m = re.match(r"^(.+?)\s+(?:—|–|-|\bat\b)\s+(.+)$", main_part)
        if sep_m:
            degree = sep_m.group(1).strip(" ,-|—–")
            inst = sep_m.group(2).strip(" ,-|—–")
        else:
            degree = main_part.strip(" ,-|—–")
            inst = "University"

        education.append(
            {
                "degree": degree,
                "institution": inst,
                "year": year,
                "details": "",
            }
        )

    # Unsectioned fallback ONLY if no EDUCATION section header existed
    if not education and "EDUCATION" not in seen_sections:
        edu_line_re = re.compile(
            r"\b((?:B\.?Sc\.?|M\.?Sc\.?|B\.?Eng\.?|M\.?Eng\.?|Ph\.?D\.?|Bachelor(?:'s)?|Master(?:'s)?|Doctorate|B\.A\.?|M\.A\.?)\b[^|\n—–]{1,65}?)(?:\s+(?:—|–|-|\bat\b|,)\s+([^|\n•]{2,60}?))?(?:\s*(?:\||•)\s*([^\n]+))?$",
            re.I,
        )
        edu_abbrev_re = re.compile(
            r"\b((?:BA|MA|BS|MS)\s+(?:in|of)\s+[^|\n—–]{2,55}?)(?:\s+(?:—|–|-|\bat\b|,)\s+([^|\n•]{2,60}?))?(?:\s*(?:\||•)\s*([^\n]+))?$"
        )
        for ln in sections["HEADER"]:
            ln_clean = re.sub(r"^#+\s*", "", ln).replace("**", "").strip()
            if not ln_clean or "@" in ln_clean or "http" in ln_clean.lower():
                continue
            edu_match = None
            if re.search(r"\b(?:b\.?sc|m\.?sc|b\.?eng|m\.?eng|ph\.?d|bachelor|master|doctorate|b\.a\.|m\.a\.)\b", ln_clean, re.I):
                edu_match = edu_line_re.search(ln_clean)
            elif re.search(r"\b(?:BA|MA|BS|MS)\s+(?:in|of)\b", ln_clean):
                edu_match = edu_abbrev_re.search(ln_clean)
            if edu_match:
                tail = (edu_match.group(3) or "").strip()
                education.append(
                    {
                        "degree": edu_match.group(1).strip(" ,-|—–"),
                        "institution": (edu_match.group(2) or "University").strip(" ,-|—–"),
                        "year": tail or "2020",
                        "details": "",
                    }
                )

    certifications = [
        _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
        for ln in sections["CERTIFICATIONS"]
        if _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
    ]
    languages = [
        _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
        for ln in sections["LANGUAGES"]
        if _BULLET_LINE_RE.sub("", ln).replace("**", "").strip()
    ]

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
        "projects": projects,
        "education": education,
        "certifications": certifications,
        "languages": languages,
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
    """Pull candidate name and contact line from profile markdown or plain text."""
    lines = [ln.strip() for ln in (profile_markdown or "").splitlines() if ln.strip()]
    full_name = "Candidate Name"
    contact_line = ""
    for idx, ln in enumerate(lines):
        if ln.startswith("# ") and not ln.startswith("## "):
            full_name = ln[2:].strip()
            if idx + 1 < len(lines) and not lines[idx + 1].startswith("#"):
                contact_line = lines[idx + 1]
            break

    if full_name == "Candidate Name" and lines:
        first_clean = re.sub(r"^#+\s*", "", lines[0]).replace("**", "").strip()
        if (
            first_clean
            and "@" not in first_clean
            and "http" not in first_clean.lower()
            and "|" not in first_clean
            and len(first_clean.split()) <= 6
            and _detect_section_heading(first_clean) is None
        ):
            full_name = first_clean
            if len(lines) > 1 and ("|" in lines[1] or "@" in lines[1]):
                contact_line = lines[1]

    email_m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", profile_markdown or "")
    phone_m = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", profile_markdown or "")
    linkedin_m = re.search(
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_.-]+/?",
        profile_markdown or "",
        re.I,
    )
    github_m = re.search(
        r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+/?",
        profile_markdown or "",
        re.I,
    )

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


def _format_dd_month_yyyy() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.day} {now.strftime('%B %Y')}"


def _render_tone_cover_letter(
    candidate_name: str,
    contact_line: str,
    job_title: str,
    company: str,
    tone: str,
    matched_skills: List[str],
    injected_keywords: List[str],
    custom_capabilities: str,
    experience: Optional[List[Dict[str, Any]]] = None,
    projects: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Create an executive letterhead Markdown cover letter matching cover_letter.md."""
    tone_lower = (tone or "Executive & Formal").lower()
    key_stack = ", ".join(dict.fromkeys((matched_skills + injected_keywords)[:5])) or "SQL, Python, and modern analytics"
    cap_note = f" Furthermore, {custom_capabilities.strip()}" if custom_capabilities and custom_capabilities.strip() else ""

    if "conversational" in tone_lower:
        opening = (
            f"I have been following {company}'s work closely and was immediately energized by the {job_title} opening. "
            f"Solving high-leverage analytical challenges with {key_stack} is where I deliver my strongest impact."
        )
        closing = (
            f"Thank you for your time and consideration. I would welcome the chance to discuss how I can bring this "
            f"energy and hands-on expertise to {company} as your next {job_title}."
        )
    elif "technical" in tone_lower or "direct" in tone_lower:
        opening = (
            f"The {job_title} opportunity at {company} aligns directly with my analytical engineering background across "
            f"{key_stack}. Your focus on turning complex operational data into reliable, decision-ready systems maps "
            f"closely to my hands-on delivery experience."
        )
        closing = (
            f"Thank you for reviewing my application. I welcome a technical discussion on how my architecture and "
            f"analytics track record can accelerate {company}'s roadmap."
        )
    elif "modern" in tone_lower or "impact" in tone_lower:
        opening = (
            f"{company} continues to raise the bar in its space, and I am eager to join as {job_title} to accelerate "
            f"measurable business outcomes through {key_stack}."
        )
        closing = (
            f"Thank you for your consideration. I look forward to demonstrating how I can drive immediate, measurable "
            f"impact for {company}."
        )
    elif "confident" in tone_lower or "persuasive" in tone_lower:
        opening = (
            f"With a proven record of transforming complex datasets and workflows into decisive performance gains, I am "
            f"well positioned to excel as {job_title} at {company}."
        )
        closing = (
            f"Thank you for considering my application. I am confident my expertise with {key_stack} will add immediate "
            f"velocity to {company}, and I look forward to speaking with you."
        )
    else:
        opening = (
            f"The {job_title} position at {company} stands out as an ideal match for my background in {key_stack}. "
            f"I am particularly drawn to {company}'s commitment to data-driven execution and measurable operational rigor."
        )
        closing = (
            f"Thank you for considering my application. I look forward to the opportunity to discuss how my analytical "
            f"capabilities can support {company}'s strategic objectives."
        )

    # Paragraph 2: Anchor in real work experience highlight when available
    top_exp = (experience or [None])[0]
    if isinstance(top_exp, dict) and top_exp.get("title"):
        exp_title = str(top_exp.get("title") or "").strip()
        exp_comp = str(top_exp.get("company") or "").strip()
        exp_bullets = [str(b).strip() for b in (top_exp.get("highlights") or []) if str(b).strip()]
        lead_bullet = exp_bullets[0].rstrip(".") if exp_bullets else (
            f"delivered data-backed analytical workflows powered by {key_stack}"
        )
        role_ref = f"as {exp_title} at {exp_comp}" if exp_comp else f"as {exp_title}"
        para2 = (
            f"In my work {role_ref}, I {lead_bullet[0].lower() + lead_bullet[1:] if len(lead_bullet) > 1 else lead_bullet}. "
            f"By pairing structured problem-solving with {key_stack}, I consistently converted raw datasets into "
            f"reliable reporting and measurable efficiency gains.{cap_note}"
        )
    else:
        para2 = (
            f"Across recent engagements, I architected automated workflows and executive reporting suites powered by "
            f"{key_stack}, improving accuracy and cutting manual turnaround by over 25%.{cap_note}"
        )

    # Paragraph 3: Anchor in real key project + cross-functional fit
    top_proj = (projects or [None])[0]
    if isinstance(top_proj, dict) and top_proj.get("name"):
        proj_name = str(top_proj.get("name") or "").strip()
        proj_tech = ", ".join(str(t).strip() for t in (top_proj.get("technologies") or []) if str(t).strip())
        proj_bullets = [str(b).strip() for b in (top_proj.get("highlights") or []) if str(b).strip()]
        proj_detail = (
            proj_bullets[0].rstrip(".")
            if proj_bullets
            else str(top_proj.get("description") or "").strip().rstrip(".")
        )
        tech_phrase = f" using {proj_tech}" if proj_tech else ""
        if proj_detail:
            para3 = (
                f"Beyond core operations, I reinforced these capabilities through my {proj_name} initiative{tech_phrase}, "
                f"where I {proj_detail[0].lower() + proj_detail[1:] if len(proj_detail) > 1 else proj_detail}. "
                f"Equally important, I collaborate effectively with cross-functional stakeholders to translate "
                f"business questions into clear, actionable deliverables."
            )
        else:
            para3 = (
                f"I further demonstrated these skills through {proj_name}{tech_phrase}, translating analytical findings "
                f"into executive-ready insights while partnering smoothly across technical and business stakeholders."
            )
    else:
        para3 = (
            f"Equally important, I partner closely with cross-functional product, finance, and engineering stakeholders "
            f"to translate complex business requirements into clear, scalable deliverables ready for decision-making."
        )

    lines = [candidate_name]
    if contact_line:
        lines.append(contact_line)
    lines.extend(
        [
            "",
            _format_dd_month_yyyy(),
            "",
            "Hiring Manager",
            company,
            "",
            f"**Re: {job_title} Application**",
            "",
            f"Dear {company} Hiring Team,",
            "",
            opening,
            "",
            para2,
            "",
            para3,
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
    """Deterministic section-preserving ApplicationTailorPipeline."""
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

    if not injected_keywords and pre_scores["missing_skills"]:
        injected_keywords = list(pre_scores["missing_skills"][:5])

    # Parse only the real base profile so custom_capabilities text never leaks into sections
    parsed = _fallback_parse_profile(profile_markdown)
    if header["full_name"] != "Candidate Name":
        parsed["full_name"] = header["full_name"]

    merged_existing_skills = list(dict.fromkeys(parsed.get("skills") or existing_skills))
    all_skills = list(dict.fromkeys(merged_existing_skills + injected_keywords))
    injected_phrase = ", ".join(injected_keywords) if injected_keywords else ", ".join(all_skills[:4])

    base_summary = (parsed.get("summary") or "").strip()
    if base_summary and not base_summary.startswith("Experienced professional specializing in"):
        if injected_keywords:
            summary_line = (
                f"{base_summary} Tailored for {job_title} at {company}, applying proven strengths in "
                f"{', '.join(all_skills[:4])} alongside {injected_phrase}."
            )
        else:
            summary_line = (
                f"{base_summary} Tailored for {job_title} at {company}, bringing demonstrated impact across "
                f"{', '.join(all_skills[:5])}."
            )
    else:
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

    skill_rows = _build_categorized_skills_rows(merged_existing_skills or ["Python", "SQL", "Analytics"])
    cv_lines.extend(
        [
            "",
            "## PROFESSIONAL SUMMARY",
            summary_line,
            "",
            "## CORE TECHNICAL SKILLS",
            "| Category | Tools |",
            "| --- | --- |",
            *skill_rows,
        ]
    )
    if injected_keywords:
        cv_lines.append(f"| Target Role Alignment | {injected_phrase} |")
    cv_lines.extend(["", "## PROFESSIONAL EXPERIENCE"])

    for idx, exp in enumerate(parsed["experience"]):
        title = exp.get("title") or "Specialist"
        comp = exp.get("company") or "Organization"
        dur = exp.get("duration") or ""
        exp_header = f"**{title}** — {comp}" + (f" | {dur}" if dur else "")
        cv_lines.append(exp_header)
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
            year = str(proj.get("year") or "").strip()
            p_header = (
                f"**{proj.get('name', 'Key Initiative')}**"
                + (f" — {techs}" if techs else "")
                + (f" | {year}" if year else "")
            )
            cv_lines.append(p_header)
            proj_bullets = proj.get("highlights") or _split_project_bullets(
                str(proj.get("description") or "Delivered measurable business impact.")
            )
            for pb in proj_bullets:
                clean_pb = str(pb).lstrip("-*• ").strip()
                if clean_pb:
                    cv_lines.append(f"- {clean_pb}")
            cv_lines.append("")

    if parsed["education"]:
        cv_lines.append("## EDUCATION")
        for edu in parsed["education"]:
            cv_lines.append(
                f"**{edu.get('degree', 'Degree')}** — {edu.get('institution', 'University')} | {edu.get('year', '')}".rstrip(" |")
            )
        cv_lines.append("")

    if parsed.get("certifications"):
        cv_lines.append("## CERTIFICATIONS")
        for c in parsed["certifications"]:
            if str(c).strip():
                cv_lines.append(f"- {str(c).strip()}")
        cv_lines.append("")

    if parsed.get("languages"):
        cv_lines.append("## LANGUAGES")
        for lang in parsed["languages"]:
            if str(lang).strip():
                cv_lines.append(f"- {str(lang).strip()}")
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
        experience=parsed.get("experience"),
        projects=parsed.get("projects"),
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
        "languages": parsed.get("languages", []),
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


def _clean_markdown_output(text: str) -> str:
    """Remove surrounding ```markdown ... ``` code fences if the LLM wrapped its output."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```markdown"):
        cleaned = cleaned[11:]
    elif cleaned.startswith("```md"):
        cleaned = cleaned[5:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _direct_gemini_tailor_fallback(
    profile_markdown: str,
    job_title: str,
    company: str,
    job_description: str,
    custom_capabilities: str,
    tone: str,
    api_key: str,
    model_name: str,
) -> Optional[Tuple[Dict[str, Any], int, int]]:
    """Direct Gemini LLM Markdown synthesis fallback modeled on hiring agent final's cv_crew.py."""
    cv_template_text = get_cv_template(job_description)
    cl_template_text = get_cover_letter_template()
    profile_block = (profile_markdown or "").strip()
    if custom_capabilities and custom_capabilities.strip():
        profile_block = f"{profile_block}\n\nAdditional Candidate Capabilities:\n{custom_capabilities.strip()}"

    today_str = _format_dd_month_yyyy()
    cv_prompt = f"""You are a Senior Executive CV Strategist.
Tailor the user's CV to the specific job description below while strictly maintaining the Markdown template structure.

Candidate Profile:
{profile_block}

Target Job Details:
- Title: {job_title}
- Company: {company}
- Job Description:
{job_description}

Template to Follow Strictly:
{cv_template_text}

Rules:
1. Preserve ALL personal contact headers (name, location, phone, email, linkedin, github) and all real employers, degrees, and projects from the candidate profile.
2. Select 2-3 most relevant projects under `## KEY PROJECTS` and align experience and project bullets to the target role using the XYZ formula with quantifiable metrics.
3. Reframe experience, summary, and skills using JD terminology and closely related analytical/domain concepts without inventing false qualifications or fake tools.
4. Return ONLY the complete Markdown CV. Do NOT enclose in markdown code fence blocks.
"""

    cl_prompt = f"""You are an Expert Executive Cover Letter Writer.
Write a compelling, {tone.lower()} cover letter connecting the candidate's core projects and experience directly to {company}'s requirements.

Candidate Profile:
{profile_block}

Target Job Details:
- Title: {job_title}
- Company: {company}
- Current Date: {today_str}
- Job Description:
{job_description}

Template Structure:
{cl_template_text}

Rules:
1. Follow the template structure strictly: Candidate FULL NAME on line 1, pipe-separated contact line on line 2, date ({today_str}), Hiring Manager + {company}, `**Re: {job_title} Application**`, `Dear {company} Hiring Team,`, 4 concise paragraphs, and `Sincerely,\\n\\nFULL NAME`.
2. Match the requested tone: '{tone}'.
3. Emphasize key candidate strengths and 1-2 quantified achievements/projects relevant to {company}.
4. Return ONLY the complete Markdown cover letter. Do NOT enclose in markdown code fence blocks.
"""

    client = genai.Client(api_key=api_key.strip())
    in_tok = 0
    out_tok = 0

    try:
        cv_res = client.models.generate_content(model=model_name, contents=cv_prompt)
        cv_markdown = _clean_markdown_output(getattr(cv_res, "text", "") or "")
        cv_usage = getattr(cv_res, "usage_metadata", None)
        if cv_usage is not None:
            in_tok += int(getattr(cv_usage, "prompt_token_count", 0) or 0)
            out_tok += int(getattr(cv_usage, "candidates_token_count", 0) or 0)
    except Exception as exc:
        _raise_if_gemini_auth_error(exc)
        logger.warning("Direct Gemini CV synthesis fallback failed: %s", exc)
        return None

    if not cv_markdown:
        return None

    cover_letter_markdown = ""
    try:
        cl_res = client.models.generate_content(model=model_name, contents=cl_prompt)
        cover_letter_markdown = _clean_markdown_output(getattr(cl_res, "text", "") or "")
        cl_usage = getattr(cl_res, "usage_metadata", None)
        if cl_usage is not None:
            in_tok += int(getattr(cl_usage, "prompt_token_count", 0) or 0)
            out_tok += int(getattr(cl_usage, "candidates_token_count", 0) or 0)
    except Exception as exc:
        _raise_if_gemini_auth_error(exc)
        logger.warning("Direct Gemini Cover Letter synthesis fallback failed: %s", exc)

    parsed_cv = _fallback_parse_profile(cv_markdown)
    header = _extract_profile_header(cv_markdown)
    if header["full_name"] != "Candidate Name":
        parsed_cv["full_name"] = header["full_name"]
    contact_line = header["contact_line"] or _extract_profile_header(profile_markdown)["contact_line"]

    injected_keywords = _find_injected_keywords(profile_markdown, cv_markdown, job_description, job_title)
    scores = _compute_four_scores(cv_markdown, job_title, job_description)

    if not cover_letter_markdown:
        cover_letter_markdown = _render_tone_cover_letter(
            candidate_name=parsed_cv["full_name"],
            contact_line=contact_line,
            job_title=job_title,
            company=company,
            tone=tone,
            matched_skills=scores["matched_skills"],
            injected_keywords=injected_keywords,
            custom_capabilities=custom_capabilities,
            experience=parsed_cv.get("experience"),
            projects=parsed_cv.get("projects"),
        )

    cv_json = {
        "full_name": parsed_cv["full_name"],
        "email": parsed_cv["email"],
        "phone": parsed_cv["phone"],
        "location": parsed_cv["location"],
        "linkedin_url": parsed_cv["linkedin_url"],
        "github_url": parsed_cv["github_url"],
        "portfolio_url": parsed_cv["portfolio_url"],
        "summary": parsed_cv["summary"],
        "skills": parsed_cv["skills"],
        "experience": parsed_cv["experience"],
        "projects": parsed_cv["projects"],
        "education": parsed_cv["education"],
        "certifications": parsed_cv["certifications"],
        "languages": parsed_cv.get("languages", []),
    }

    result = {
        "cv_markdown": cv_markdown,
        "cv_json": cv_json,
        "cover_letter_markdown": cover_letter_markdown,
        "injected_keywords": injected_keywords,
        "overall_fit_score": scores["overall_fit_score"],
        "skills_match_score": scores["skills_match_score"],
        "experience_fit_score": scores["experience_fit_score"],
        "ats_keyword_score": scores["ats_keyword_score"],
        "matched_skills": scores["matched_skills"],
        "missing_skills": scores["missing_skills"],
        "match_reason": scores["match_reason"],
        "recommendation": scores["recommendation"],
    }
    if in_tok == 0 and out_tok == 0:
        in_tok, out_tok = _estimate_tokens(cv_prompt + "\n" + cl_prompt, cv_markdown + "\n" + cover_letter_markdown)
    return result, in_tok, out_tok


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
                job_description=job_description,
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
            if cv_bundle is not None and _clean_markdown_output(cv_bundle.cv_markdown):
                clean_cv_md = _clean_markdown_output(cv_bundle.cv_markdown)
                clean_cl_md = (
                    _clean_markdown_output(cl_bundle.cover_letter_markdown)
                    if cl_bundle and _clean_markdown_output(cl_bundle.cover_letter_markdown)
                    else ""
                )
                header = _extract_profile_header(profile_markdown)
                cv_json_dict = cv_bundle.cv_json.model_dump()
                cover_letter_md = clean_cl_md or _render_tone_cover_letter(
                    candidate_name=cv_bundle.cv_json.full_name or header["full_name"] or "Candidate",
                    contact_line=header["contact_line"],
                    job_title=job_title,
                    company=company,
                    tone=effective_tone,
                    matched_skills=cv_bundle.matched_skills,
                    injected_keywords=cv_bundle.injected_keywords,
                    custom_capabilities=custom_capabilities,
                    experience=cv_json_dict.get("experience"),
                    projects=cv_json_dict.get("projects"),
                )
                injected = list(dict.fromkeys(cv_bundle.injected_keywords))
                if not injected:
                    injected = _find_injected_keywords(
                        profile_markdown, clean_cv_md, job_description, job_title
                    )
                result = {
                    "cv_markdown": clean_cv_md,
                    "cv_json": cv_json_dict,
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
            logger.warning("ADK ApplicationTailorPipeline failed (%s); attempting direct Gemini synthesis.", exc)

        direct_result = _direct_gemini_tailor_fallback(
            profile_markdown=profile_markdown,
            job_title=job_title,
            company=company,
            job_description=job_description,
            custom_capabilities=custom_capabilities,
            tone=effective_tone,
            api_key=api_key,
            model_name=resolved_model,
        )
        if direct_result is not None:
            return direct_result

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
