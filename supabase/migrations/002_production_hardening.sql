-- Hiring Agent Mobile — Production Hardening Migration
-- Aligns default tailoring model with gemini-3.8-flash and ensures production lookup indexes.

ALTER TABLE public.tailored_outputs
    ALTER COLUMN model_used SET DEFAULT 'gemini-3.8-flash';

-- Ensure private storage bucket remains configured for persistent A4 PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('outputs-pdfs', 'outputs-pdfs', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Production lookup indexes (idempotent sanity checks)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
    ON public.profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_default
    ON public.profiles(user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_search_runs_user_created
    ON public.search_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_runs_status
    ON public.search_runs(status);

CREATE INDEX IF NOT EXISTS idx_ranked_jobs_run_score
    ON public.ranked_jobs(search_run_id, overall_fit_score DESC);

CREATE INDEX IF NOT EXISTS idx_ranked_jobs_user_id
    ON public.ranked_jobs(user_id);

CREATE INDEX IF NOT EXISTS idx_tailored_outputs_user_created
    ON public.tailored_outputs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tailored_outputs_ranked_job
    ON public.tailored_outputs(ranked_job_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_created
    ON public.token_usage(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_model
    ON public.token_usage(user_id, model_name);

-- Covering indexes for unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_search_runs_profile_id
    ON public.search_runs(profile_id);

CREATE INDEX IF NOT EXISTS idx_tailored_outputs_profile_id
    ON public.tailored_outputs(profile_id);

-- Lock trigger helper search_path (Supabase security advisor: function_search_path_mutable)
ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- Wrap auth.uid() in (select auth.uid()) across all RLS policies (auth_rls_initplan)
-- 1. profiles
ALTER POLICY "profiles_select_own" ON public.profiles
    USING ((select auth.uid()) = user_id);
ALTER POLICY "profiles_insert_own" ON public.profiles
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "profiles_update_own" ON public.profiles
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "profiles_delete_own" ON public.profiles
    USING ((select auth.uid()) = user_id);

-- 2. search_runs
ALTER POLICY "search_runs_select_own" ON public.search_runs
    USING ((select auth.uid()) = user_id);
ALTER POLICY "search_runs_insert_own" ON public.search_runs
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "search_runs_update_own" ON public.search_runs
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "search_runs_delete_own" ON public.search_runs
    USING ((select auth.uid()) = user_id);

-- 3. ranked_jobs
ALTER POLICY "ranked_jobs_select_own" ON public.ranked_jobs
    USING ((select auth.uid()) = user_id);
ALTER POLICY "ranked_jobs_insert_own" ON public.ranked_jobs
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "ranked_jobs_update_own" ON public.ranked_jobs
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "ranked_jobs_delete_own" ON public.ranked_jobs
    USING ((select auth.uid()) = user_id);

-- 4. tailored_outputs
ALTER POLICY "tailored_outputs_select_own" ON public.tailored_outputs
    USING ((select auth.uid()) = user_id);
ALTER POLICY "tailored_outputs_insert_own" ON public.tailored_outputs
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "tailored_outputs_update_own" ON public.tailored_outputs
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "tailored_outputs_delete_own" ON public.tailored_outputs
    USING ((select auth.uid()) = user_id);

-- 5. token_usage
ALTER POLICY "token_usage_select_own" ON public.token_usage
    USING ((select auth.uid()) = user_id);
ALTER POLICY "token_usage_insert_own" ON public.token_usage
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "token_usage_update_own" ON public.token_usage
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "token_usage_delete_own" ON public.token_usage
    USING ((select auth.uid()) = user_id);
