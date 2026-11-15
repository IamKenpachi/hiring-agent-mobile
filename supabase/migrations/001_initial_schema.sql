-- Hiring Agent Mobile — Initial Supabase PostgreSQL Schema
-- Tables: profiles, search_runs, ranked_jobs, tailored_outputs, token_usage
-- Includes indexes, updated_at triggers, Row-Level Security (auth.uid() = user_id),
-- and private storage bucket policies for outputs-pdfs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared trigger helper for updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT 'Default Profile',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '',
    portfolio_url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    skills_json TEXT NOT NULL DEFAULT '[]',
    experience_json TEXT NOT NULL DEFAULT '[]',
    projects_json TEXT NOT NULL DEFAULT '[]',
    education_json TEXT NOT NULL DEFAULT '[]',
    certifications_json TEXT NOT NULL DEFAULT '[]',
    raw_markdown TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_default ON public.profiles(user_id, is_default);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. SEARCH RUNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.search_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'Remote',
    radius INTEGER NOT NULL DEFAULT 25,
    platforms_json TEXT NOT NULL DEFAULT '[]',
    hours_old INTEGER NOT NULL DEFAULT 168,
    work_type TEXT NOT NULL DEFAULT 'Any',
    requested_top_n INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'pending',
    progress_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    status_detail TEXT NOT NULL DEFAULT '',
    warnings_json TEXT NOT NULL DEFAULT '[]',
    total_scraped INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_runs_user_created ON public.search_runs(user_id, created_at DESC);

-- ============================================================================
-- 3. RANKED JOBS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ranked_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_run_id UUID NOT NULL REFERENCES public.search_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    source_platform TEXT NOT NULL DEFAULT '',
    job_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    overall_fit_score INTEGER NOT NULL DEFAULT 0,
    skills_match_score INTEGER NOT NULL DEFAULT 0,
    experience_fit_score INTEGER NOT NULL DEFAULT 0,
    ats_keyword_score INTEGER NOT NULL DEFAULT 0,
    matched_skills_json TEXT NOT NULL DEFAULT '[]',
    missing_skills_json TEXT NOT NULL DEFAULT '[]',
    match_reason TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ranked_jobs_run_score ON public.ranked_jobs(search_run_id, overall_fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_ranked_jobs_user_id ON public.ranked_jobs(user_id);

-- ============================================================================
-- 4. TAILORED OUTPUTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tailored_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ranked_job_id UUID REFERENCES public.ranked_jobs(id) ON DELETE SET NULL,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    job_url TEXT NOT NULL DEFAULT '',
    job_description TEXT NOT NULL DEFAULT '',
    custom_capabilities TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'Executive & Formal',
    model_used TEXT NOT NULL DEFAULT 'gemini-3.7-flash',
    overall_fit_score INTEGER NOT NULL DEFAULT 0,
    skills_match_score INTEGER NOT NULL DEFAULT 0,
    experience_fit_score INTEGER NOT NULL DEFAULT 0,
    ats_keyword_score INTEGER NOT NULL DEFAULT 0,
    matched_skills_json TEXT NOT NULL DEFAULT '[]',
    missing_skills_json TEXT NOT NULL DEFAULT '[]',
    injected_keywords_json TEXT NOT NULL DEFAULT '[]',
    match_reason TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    cv_json TEXT NOT NULL DEFAULT '{}',
    cv_markdown TEXT NOT NULL DEFAULT '',
    cv_html TEXT NOT NULL DEFAULT '',
    cover_letter_markdown TEXT NOT NULL DEFAULT '',
    cover_letter_html TEXT NOT NULL DEFAULT '',
    cv_pdf_path TEXT NOT NULL DEFAULT '',
    cl_pdf_path TEXT NOT NULL DEFAULT '',
    chat_history_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tailored_outputs_user_created ON public.tailored_outputs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tailored_outputs_ranked_job ON public.tailored_outputs(ranked_job_id);

DROP TRIGGER IF EXISTS trg_tailored_outputs_updated_at ON public.tailored_outputs;
CREATE TRIGGER trg_tailored_outputs_updated_at
    BEFORE UPDATE ON public.tailored_outputs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. TOKEN USAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON public.token_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON public.token_usage(user_id, model_name);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_delete_own" ON public.profiles
    FOR DELETE USING (auth.uid() = user_id);

-- Search Runs RLS
CREATE POLICY "search_runs_select_own" ON public.search_runs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "search_runs_insert_own" ON public.search_runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "search_runs_update_own" ON public.search_runs
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "search_runs_delete_own" ON public.search_runs
    FOR DELETE USING (auth.uid() = user_id);

-- Ranked Jobs RLS
CREATE POLICY "ranked_jobs_select_own" ON public.ranked_jobs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ranked_jobs_insert_own" ON public.ranked_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ranked_jobs_update_own" ON public.ranked_jobs
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ranked_jobs_delete_own" ON public.ranked_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- Tailored Outputs RLS
CREATE POLICY "tailored_outputs_select_own" ON public.tailored_outputs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tailored_outputs_insert_own" ON public.tailored_outputs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tailored_outputs_update_own" ON public.tailored_outputs
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tailored_outputs_delete_own" ON public.tailored_outputs
    FOR DELETE USING (auth.uid() = user_id);

-- Token Usage RLS
CREATE POLICY "token_usage_select_own" ON public.token_usage
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "token_usage_insert_own" ON public.token_usage
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "token_usage_update_own" ON public.token_usage
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "token_usage_delete_own" ON public.token_usage
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- STORAGE BUCKET: outputs-pdfs (Private)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('outputs-pdfs', 'outputs-pdfs', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Path convention: <user_id>/<output_id>/tailored_cv.pdf
CREATE POLICY "outputs_pdfs_select_own" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'outputs-pdfs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "outputs_pdfs_insert_own" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'outputs-pdfs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "outputs_pdfs_update_own" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'outputs-pdfs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    ) WITH CHECK (
        bucket_id = 'outputs-pdfs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "outputs_pdfs_delete_own" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'outputs-pdfs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
