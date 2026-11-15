import type {
  EducationItem,
  ExperienceItem,
  ProfileCreatePayload,
  ProfilePreviewResponse,
  ProjectItem,
} from "../types";

export type WorkPreference = "Remote" | "Hybrid" | "On-Site";

export interface WizardDraftState {
  profileName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  workPreference: WorkPreference;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  skills: string[];
  summary: string;
  experiences: Array<{
    title: string;
    company: string;
    duration: string;
    bulletsText: string;
  }>;
  projects: Array<{
    name: string;
    technologies: string[];
    description: string;
  }>;
  educationList: Array<{
    degree: string;
    institutionAndYear: string;
  }>;
}

export function extractWorkPreference(rawLocation?: string): {
  city: string;
  preference: WorkPreference;
} {
  const clean = (rawLocation || "").trim();
  const match = clean.match(/\b(Remote|Hybrid|On-Site)\b/i);
  const preference: WorkPreference =
    match?.[1]?.toLowerCase() === "remote"
      ? "Remote"
      : match?.[1]?.toLowerCase() === "on-site"
        ? "On-Site"
        : "Hybrid";

  const city = clean
    .replace(/\s*[•|/,-]?\s*\b(Remote|Hybrid|On-Site)\b/gi, "")
    .trim();

  return { city, preference };
}

export function formatLocationWithPreference(
  city: string,
  preference: WorkPreference
): string {
  const cleanCity = city.trim();
  if (!cleanCity) return preference;
  return `${cleanCity} • ${preference}`;
}

export function splitInstitutionAndYear(raw: string): {
  institution: string;
  year: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { institution: "", year: "" };
  const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return { institution: trimmed, year: "" };
  const year = yearMatch[0];
  const institution = trimmed
    .replace(year, "")
    .replace(/^[\s•|/,-]+|[\s•|/,-]+$/g, "")
    .trim();
  return { institution: institution || trimmed, year };
}

export function createEmptyWizardDraft(): WizardDraftState {
  return {
    profileName: "",
    fullName: "",
    email: "",
    phone: "",
    location: "",
    workPreference: "Hybrid",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    skills: [],
    summary: "",
    experiences: [{ title: "", company: "", duration: "", bulletsText: "" }],
    projects: [{ name: "", technologies: [], description: "" }],
    educationList: [{ degree: "", institutionAndYear: "" }],
  };
}

export function previewToWizardDraft(preview: ProfilePreviewResponse): WizardDraftState {
  const { city, preference } = extractWorkPreference(preview.location);
  return {
    profileName: preview.profile_name || "",
    fullName: preview.full_name || "",
    email: preview.email || "",
    phone: preview.phone || "",
    location: city,
    workPreference: preference,
    linkedinUrl: preview.linkedin_url || "",
    githubUrl: preview.github_url || "",
    portfolioUrl: preview.portfolio_url || "",
    skills: Array.isArray(preview.skills) ? preview.skills : [],
    summary: preview.summary || "",
    experiences: preview.experience?.length
      ? preview.experience.map((e) => ({
          title: e.title || "",
          company: e.company || "",
          duration: e.duration || "",
          bulletsText: (e.highlights || (e.description ? [e.description] : []))
            .filter(Boolean)
            .join("\n"),
        }))
      : [{ title: "", company: "", duration: "", bulletsText: "" }],
    projects: preview.projects?.length
      ? preview.projects.map((p) => ({
          name: p.name || "",
          technologies: Array.isArray(p.technologies) ? p.technologies : [],
          description: p.description || "",
        }))
      : [{ name: "", technologies: [], description: "" }],
    educationList: preview.education?.length
      ? preview.education.map((ed) => ({
          degree: ed.degree || "",
          institutionAndYear: [ed.institution, ed.year].filter(Boolean).join(" • "),
        }))
      : [{ degree: "", institutionAndYear: "" }],
  };
}

export function wizardDraftToPayload(
  draft: WizardDraftState
): ProfileCreatePayload {
  const experience: ExperienceItem[] = draft.experiences
    .filter((e) => e.title.trim() || e.company.trim() || e.bulletsText.trim())
    .map((e) => ({
      title: e.title.trim(),
      company: e.company.trim(),
      duration: e.duration.trim(),
      highlights: e.bulletsText
        .split("\n")
        .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean),
    }));

  const projects: ProjectItem[] = draft.projects
    .filter((p) => p.name.trim() || p.description.trim() || p.technologies.length > 0)
    .map((p) => ({
      name: p.name.trim(),
      description: p.description.trim(),
      technologies: p.technologies,
    }));

  const education: EducationItem[] = draft.educationList
    .filter((ed) => ed.degree.trim() || ed.institutionAndYear.trim())
    .map((ed) => {
      const { institution, year } = splitInstitutionAndYear(ed.institutionAndYear);
      return {
        degree: ed.degree.trim(),
        institution,
        year,
      };
    });

  const cleanFullName = draft.fullName.trim() || "Candidate";
  return {
    profile_name: draft.profileName.trim() || `${cleanFullName} CV`,
    is_default: true,
    full_name: cleanFullName,
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    location: formatLocationWithPreference(draft.location, draft.workPreference),
    linkedin_url: draft.linkedinUrl.trim(),
    github_url: draft.githubUrl.trim(),
    portfolio_url: draft.portfolioUrl.trim(),
    summary: draft.summary.trim(),
    skills: draft.skills,
    experience,
    projects,
    education,
    certifications: [],
  };
}
