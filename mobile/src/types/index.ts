export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  trial_available?: boolean;
  trial_calls_used?: number;
  trial_calls_limit?: number;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  badge?: string;
  input_cost_per_m: number;
  output_cost_per_m: number;
}

export interface ExperienceItem {
  title: string;
  company: string;
  duration: string;
  location?: string;
  highlights?: string[];
  description?: string;
}

export interface ProjectItem {
  name: string;
  description: string;
  technologies?: string[];
  url?: string;
}

export interface EducationItem {
  degree: string;
  institution: string;
  year: string;
  details?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  profile_name: string;
  is_default: boolean;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  certifications: string[];
  raw_markdown: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileCreatePayload {
  profile_name: string;
  is_default?: boolean;
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  summary?: string;
  skills: string[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  certifications?: string[];
}

export type ProfileUpdatePayload = Partial<ProfileCreatePayload> & {
  raw_markdown?: string;
};

export interface ProfilePreviewResponse extends ProfileCreatePayload {
  filename: string;
  file_size_bytes: number;
}

export interface PlatformInfo {
  id: string;
  label: string;
  tier: "primary" | "regional";
  region?: string;
}

export interface PlatformsResponse {
  primary: (string | PlatformInfo)[];
  regional: (string | PlatformInfo)[];
}

export interface SearchRun {
  id: string;
  user_id: string;
  profile_id?: string | null;
  query: string;
  location: string;
  radius: number;
  platforms: string[];
  hours_old: number;
  work_type: string;
  requested_top_n: number;
  status:
    | "pending"
    | "scraping"
    | "deduplicating"
    | "ranking"
    | "finalizing"
    | "completed"
    | "failed"
    | string;
  progress_pct: number;
  status_detail: string;
  warnings: string[];
  total_scraped: number;
  created_at?: string;
}

export interface RankedJob {
  id: string;
  search_run_id: string;
  user_id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  source_platform: string;
  job_url: string;
  description: string;
  overall_fit_score: number;
  skills_match_score: number;
  experience_fit_score: number;
  ats_keyword_score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_reason: string;
  recommendation: string;
  created_at?: string;
}

export interface HuntStartPayload {
  query: string;
  location?: string;
  radius?: number;
  platforms: string[];
  hours_old?: number;
  work_type?: string;
  requested_top_n?: number;
  profile_id?: string;
  model?: string;
  run_sync?: boolean;
}

export interface HuntRunResponse {
  run: SearchRun;
  jobs: RankedJob[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  doc_type?: "cv" | "cover_letter";
  action_taken?: string;
}

export interface TailoredOutputSummary {
  id: string;
  job_title: string;
  company: string;
  job_url?: string;
  tone: string;
  model_used: string;
  overall_fit_score: number;
  skills_match_score: number;
  experience_fit_score: number;
  ats_keyword_score: number;
  created_at?: string;
  updated_at?: string;
}

export interface TailoredOutput extends TailoredOutputSummary {
  user_id?: string;
  profile_id?: string;
  ranked_job_id?: string | null;
  job_description?: string;
  custom_capabilities?: string;
  matched_skills: string[];
  missing_skills: string[];
  injected_keywords: string[];
  match_reason: string;
  recommendation: string;
  cv_json?: Record<string, unknown> | null;
  cv_markdown: string;
  cv_html: string;
  cover_letter_markdown: string;
  cover_letter_html: string;
  chat_history: ChatMessage[];
  cv_pdf_url?: string;
  cl_pdf_url?: string;
}

export interface ReviseOutputResponse extends TailoredOutput {
  explanation?: string;
  output?: TailoredOutput;
}

export interface ExtractJDResponse {
  job_title: string;
  company: string;
  location: string;
  salary: string;
  core_requirements: string[];
  summary: string;
}

export interface StudioTailorPayload {
  job_title?: string;
  company?: string;
  job_url?: string;
  job_description: string;
  custom_capabilities?: string;
  tone?: string;
  profile_id?: string;
  model?: string;
}

export interface ModelUsageStats {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  calls: number;
  est_cost_usd?: number;
}

export interface TokenOperation {
  id?: string;
  model_name: string;
  operation_type: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  created_at?: string;
}

export interface TokenTelemetry {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  calls: number;
  est_cost_usd: number;
  est_cost_formatted: string;
  per_model: Record<string, ModelUsageStats>;
  recent_operations?: TokenOperation[];
  available_models?: ModelOption[];
}
