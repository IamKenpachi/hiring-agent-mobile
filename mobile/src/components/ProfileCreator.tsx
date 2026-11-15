import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  Briefcase,
  CheckCircle2,
  FileUp,
  FolderGit2,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
  User,
} from "lucide-react-native";
import { COLORS } from "../constants/theme";
import { apiClient, ApiError } from "../lib/api";
import type {
  EducationItem,
  ExperienceItem,
  Profile,
  ProfileCreatePayload,
  ProjectItem,
} from "../types";

interface ProfileCreatorProps {
  initialProfile?: Profile | null;
  defaultIsPrimary?: boolean;
  onSuccess: (profile: Profile) => void;
  onCancel?: () => void;
}

interface ExperienceDraft {
  title: string;
  company: string;
  duration: string;
  location: string;
  highlightsText: string;
}

interface ProjectDraft {
  name: string;
  description: string;
  technologiesText: string;
}

interface EducationDraft {
  degree: string;
  institution: string;
  year: string;
}

const WIZARD_STEPS = [
  { id: 1, label: "Contact", icon: User },
  { id: 2, label: "Skills", icon: Sparkles },
  { id: 3, label: "Experience", icon: Briefcase },
  { id: 4, label: "Projects & Edu", icon: GraduationCap },
];

export function ProfileCreator({
  initialProfile,
  defaultIsPrimary = false,
  onSuccess,
  onCancel,
}: ProfileCreatorProps) {
  const isEditing = Boolean(initialProfile);
  const [mode, setMode] = useState<"pdf" | "wizard">(isEditing ? "wizard" : "pdf");
  const [wizardStep, setWizardStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF upload state
  const [pdfProfileName, setPdfProfileName] = useState("");
  const [pickedFile, setPickedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);

  // Step 1: Contact Info
  const [profileName, setProfileName] = useState(
    initialProfile?.profile_name || "Master CV"
  );
  const [fullName, setFullName] = useState(initialProfile?.full_name || "");
  const [email, setEmail] = useState(initialProfile?.email || "");
  const [phone, setPhone] = useState(initialProfile?.phone || "");
  const [location, setLocation] = useState(initialProfile?.location || "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialProfile?.linkedin_url || "");
  const [githubUrl, setGithubUrl] = useState(initialProfile?.github_url || "");
  const [portfolioUrl, setPortfolioUrl] = useState(initialProfile?.portfolio_url || "");

  // Step 2: Summary & Skills
  const [summary, setSummary] = useState(initialProfile?.summary || "");
  const [skillsText, setSkillsText] = useState(
    initialProfile?.skills?.join(", ") || ""
  );

  // Step 3: Experience
  const [experiences, setExperiences] = useState<ExperienceDraft[]>(() => {
    if (initialProfile?.experience?.length) {
      return initialProfile.experience.map((exp) => ({
        title: exp.title || "",
        company: exp.company || "",
        duration: exp.duration || "",
        location: exp.location || "",
        highlightsText: (exp.highlights || (exp.description ? [exp.description] : [])).join(
          "\n"
        ),
      }));
    }
    return [{ title: "", company: "", duration: "", location: "", highlightsText: "" }];
  });

  // Step 4: Projects, Education, Certifications
  const [projects, setProjects] = useState<ProjectDraft[]>(() => {
    if (initialProfile?.projects?.length) {
      return initialProfile.projects.map((p) => ({
        name: p.name || "",
        description: p.description || "",
        technologiesText: (p.technologies || []).join(", "),
      }));
    }
    return [{ name: "", description: "", technologiesText: "" }];
  });

  const [educationList, setEducationList] = useState<EducationDraft[]>(() => {
    if (initialProfile?.education?.length) {
      return initialProfile.education.map((e) => ({
        degree: e.degree || "",
        institution: e.institution || "",
        year: e.year || "",
      }));
    }
    return [{ degree: "", institution: "", year: "" }];
  });

  const [certificationsText, setCertificationsText] = useState(
    initialProfile?.certifications?.join(", ") || ""
  );

  const parsedSkills = skillsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const handlePickPdf = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPickedFile(result.assets[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open file picker.");
    }
  };

  const handleUploadPdf = async () => {
    if (!pickedFile) {
      setError("Please pick a PDF or text CV file first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await apiClient.uploadProfilePdf(
        {
          uri: pickedFile.uri,
          name: pickedFile.name || "cv.pdf",
          mimeType: pickedFile.mimeType || "application/pdf",
          file: (pickedFile as unknown as { file?: File }).file,
        },
        pdfProfileName.trim() || undefined
      );
      onSuccess(created);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to upload and parse CV.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWizard = async () => {
    if (!fullName.trim()) {
      setWizardStep(1);
      setError("Full Name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cleanExperiences: ExperienceItem[] = experiences
        .filter((e) => e.title.trim() || e.company.trim())
        .map((e) => ({
          title: e.title.trim(),
          company: e.company.trim(),
          duration: e.duration.trim(),
          location: e.location.trim() || undefined,
          highlights: e.highlightsText
            .split("\n")
            .map((line) => line.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean),
        }));

      const cleanProjects: ProjectItem[] = projects
        .filter((p) => p.name.trim() || p.description.trim())
        .map((p) => ({
          name: p.name.trim(),
          description: p.description.trim(),
          technologies: p.technologiesText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }));

      const cleanEducation: EducationItem[] = educationList
        .filter((ed) => ed.degree.trim() || ed.institution.trim())
        .map((ed) => ({
          degree: ed.degree.trim(),
          institution: ed.institution.trim(),
          year: ed.year.trim(),
        }));

      const cleanCertifications = certificationsText
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const payload: ProfileCreatePayload = {
        profile_name: profileName.trim() || `${fullName.trim()} CV`,
        is_default: initialProfile ? initialProfile.is_default : defaultIsPrimary,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        location: location.trim(),
        linkedin_url: linkedinUrl.trim(),
        github_url: githubUrl.trim(),
        portfolio_url: portfolioUrl.trim(),
        summary: summary.trim(),
        skills: parsedSkills,
        experience: cleanExperiences,
        projects: cleanProjects,
        education: cleanEducation,
        certifications: cleanCertifications,
      };

      const saved = initialProfile
        ? await apiClient.updateProfile(initialProfile.id, payload)
        : await apiClient.createProfile(payload);

      onSuccess(saved);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save profile.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {!isEditing ? (
        <View style={styles.modeSwitch}>
          <Pressable
            onPress={() => {
              setMode("pdf");
              setError(null);
            }}
            style={[styles.modeBtn, mode === "pdf" && styles.modeBtnActive]}
          >
            <FileUp
              size={15}
              color={mode === "pdf" ? "#FFFFFF" : COLORS.textSecondary}
            />
            <Text style={[styles.modeText, mode === "pdf" && styles.modeTextActive]}>
              Upload PDF CV
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMode("wizard");
              setError(null);
            }}
            style={[styles.modeBtn, mode === "wizard" && styles.modeBtnActive]}
          >
            <Sparkles
              size={15}
              color={mode === "wizard" ? "#FFFFFF" : COLORS.textSecondary}
            />
            <Text style={[styles.modeText, mode === "wizard" && styles.modeTextActive]}>
              Questionnaire Wizard
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {mode === "pdf" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>AI-Powered CV PDF Parser</Text>
          <Text style={styles.helperText}>
            Upload an existing PDF, Markdown, or TXT resume. Our Google ADK ProfileParserAgent
            extracts your skills, work history, projects, and education automatically.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Profile Label (Optional)</Text>
            <TextInput
              value={pdfProfileName}
              onChangeText={setPdfProfileName}
              placeholder="e.g. Senior Data Analyst Track"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>

          <Pressable onPress={handlePickPdf} style={styles.dropzone}>
            <FileUp size={26} color={COLORS.indigo} />
            <Text style={styles.dropzoneTitle}>
              {pickedFile ? pickedFile.name : "Select PDF or Text CV"}
            </Text>
            <Text style={styles.dropzoneSub}>
              {pickedFile
                ? "Tap to choose a different file"
                : "Supports .pdf, .txt, .md resumes"}
            </Text>
          </Pressable>

          <View style={styles.actionRow}>
            {onCancel ? (
              <Pressable onPress={onCancel} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleUploadPdf}
              disabled={loading || !pickedFile}
              style={[
                styles.primaryBtn,
                (loading || !pickedFile) && styles.btnDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <CheckCircle2 size={16} color="#FFFFFF" />
              )}
              <Text style={styles.primaryBtnText}>
                {loading ? "Parsing CV with Gemini..." : "Parse & Save Profile"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          {/* Stepper Header */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stepperRow}
          >
            {WIZARD_STEPS.map((step) => {
              const Icon = step.icon;
              const active = wizardStep === step.id;
              const completed = wizardStep > step.id;
              return (
                <Pressable
                  key={step.id}
                  onPress={() => setWizardStep(step.id)}
                  style={[
                    styles.stepChip,
                    active && styles.stepChipActive,
                    completed && styles.stepChipCompleted,
                  ]}
                >
                  <Icon
                    size={13}
                    color={
                      active
                        ? "#FFFFFF"
                        : completed
                          ? COLORS.emerald
                          : COLORS.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.stepChipText,
                      active && styles.stepChipTextActive,
                    ]}
                  >
                    {step.id}. {step.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {wizardStep === 1 ? (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Step 1: Contact & Identity</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Profile Track Name *</Text>
                <TextInput
                  value={profileName}
                  onChangeText={setProfileName}
                  placeholder="e.g. Data Science & Analytics"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Alex Rivera"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="alex@example.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Phone</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+44 7700 900077"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="London, UK"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>LinkedIn URL</Text>
                <TextInput
                  value={linkedinUrl}
                  onChangeText={setLinkedinUrl}
                  placeholder="https://linkedin.com/in/username"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>GitHub URL</Text>
                  <TextInput
                    value={githubUrl}
                    onChangeText={setGithubUrl}
                    placeholder="https://github.com/user"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Portfolio URL</Text>
                  <TextInput
                    value={portfolioUrl}
                    onChangeText={setPortfolioUrl}
                    placeholder="https://portfolio.dev"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {wizardStep === 2 ? (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Step 2: Summary & Core Skills</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Professional Summary</Text>
                <TextInput
                  value={summary}
                  onChangeText={setSummary}
                  placeholder="Senior Data Analyst with 5+ years driving product growth through SQL, Python, dbt, and experimentation..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={[styles.input, styles.textArea]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Core Skills (comma-separated)</Text>
                <TextInput
                  value={skillsText}
                  onChangeText={setSkillsText}
                  placeholder="Python, SQL, Snowflake, dbt, Tableau, A/B Testing, Airflow"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  style={[styles.input, styles.textAreaSmall]}
                />
              </View>

              {parsedSkills.length > 0 ? (
                <View style={styles.chipWrap}>
                  {parsedSkills.map((skill, idx) => (
                    <View key={`${skill}-${idx}`} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{skill}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {wizardStep === 3 ? (
            <View style={styles.stepContent}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Step 3: Work Experience</Text>
                <Pressable
                  onPress={() =>
                    setExperiences((prev) => [
                      ...prev,
                      {
                        title: "",
                        company: "",
                        duration: "",
                        location: "",
                        highlightsText: "",
                      },
                    ])
                  }
                  style={styles.addSmallBtn}
                >
                  <Plus size={13} color={COLORS.indigo} />
                  <Text style={styles.addSmallText}>Add Role</Text>
                </Pressable>
              </View>

              {experiences.map((exp, idx) => (
                <View key={idx} style={styles.subCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.subCardTitle}>Role #{idx + 1}</Text>
                    {experiences.length > 1 ? (
                      <Pressable
                        onPress={() =>
                          setExperiences((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 size={15} color={COLORS.rose} />
                      </Pressable>
                    ) : null}
                  </View>

                  <TextInput
                    value={exp.title}
                    onChangeText={(val) =>
                      setExperiences((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                      )
                    }
                    placeholder="Job Title (e.g. Senior Data Analyst)"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.input}
                  />

                  <View style={styles.twoCol}>
                    <TextInput
                      value={exp.company}
                      onChangeText={(val) =>
                        setExperiences((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, company: val } : item
                          )
                        )
                      }
                      placeholder="Company"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <TextInput
                      value={exp.duration}
                      onChangeText={(val) =>
                        setExperiences((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, duration: val } : item
                          )
                        )
                      }
                      placeholder="2022 – Present"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.input, { flex: 1 }]}
                    />
                  </View>

                  <TextInput
                    value={exp.highlightsText}
                    onChangeText={(val) =>
                      setExperiences((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, highlightsText: val } : item
                        )
                      )
                    }
                    placeholder="Key impact bullets (one per line, include metrics e.g. Increased conversion by 18%)"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={[styles.input, styles.textAreaSmall]}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {wizardStep === 4 ? (
            <View style={styles.stepContent}>
              <View style={styles.rowBetween}>
                <View style={styles.rowIconTitle}>
                  <FolderGit2 size={15} color={COLORS.purple} />
                  <Text style={styles.sectionTitle}>Key Projects</Text>
                </View>
                <Pressable
                  onPress={() =>
                    setProjects((prev) => [
                      ...prev,
                      { name: "", description: "", technologiesText: "" },
                    ])
                  }
                  style={styles.addSmallBtn}
                >
                  <Plus size={13} color={COLORS.indigo} />
                  <Text style={styles.addSmallText}>Add Project</Text>
                </Pressable>
              </View>

              {projects.map((proj, idx) => (
                <View key={idx} style={styles.subCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.subCardTitle}>Project #{idx + 1}</Text>
                    {projects.length > 1 ? (
                      <Pressable
                        onPress={() =>
                          setProjects((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 size={15} color={COLORS.rose} />
                      </Pressable>
                    ) : null}
                  </View>

                  <TextInput
                    value={proj.name}
                    onChangeText={(val) =>
                      setProjects((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                      )
                    }
                    placeholder="Project Name"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.input}
                  />
                  <TextInput
                    value={proj.description}
                    onChangeText={(val) =>
                      setProjects((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, description: val } : item
                        )
                      )
                    }
                    placeholder="Impact & architecture summary"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    style={[styles.input, styles.textAreaSmall]}
                  />
                  <TextInput
                    value={proj.technologiesText}
                    onChangeText={(val) =>
                      setProjects((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, technologiesText: val } : item
                        )
                      )
                    }
                    placeholder="Technologies (e.g. Python, FastAPI, Snowflake)"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.input}
                  />
                </View>
              ))}

              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <View style={styles.rowIconTitle}>
                  <GraduationCap size={15} color={COLORS.emerald} />
                  <Text style={styles.sectionTitle}>Education</Text>
                </View>
                <Pressable
                  onPress={() =>
                    setEducationList((prev) => [
                      ...prev,
                      { degree: "", institution: "", year: "" },
                    ])
                  }
                  style={styles.addSmallBtn}
                >
                  <Plus size={13} color={COLORS.indigo} />
                  <Text style={styles.addSmallText}>Add Degree</Text>
                </Pressable>
              </View>

              {educationList.map((edu, idx) => (
                <View key={idx} style={styles.subCard}>
                  <TextInput
                    value={edu.degree}
                    onChangeText={(val) =>
                      setEducationList((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, degree: val } : item))
                      )
                    }
                    placeholder="Degree (e.g. B.Sc. Computer Science)"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.input}
                  />
                  <View style={styles.twoCol}>
                    <TextInput
                      value={edu.institution}
                      onChangeText={(val) =>
                        setEducationList((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, institution: val } : item
                          )
                        )
                      }
                      placeholder="University"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.input, { flex: 2 }]}
                    />
                    <TextInput
                      value={edu.year}
                      onChangeText={(val) =>
                        setEducationList((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, year: val } : item
                          )
                        )
                      }
                      placeholder="Year"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.input, { flex: 1 }]}
                    />
                  </View>
                </View>
              ))}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Certifications (comma-separated)</Text>
                <TextInput
                  value={certificationsText}
                  onChangeText={setCertificationsText}
                  placeholder="AWS Certified Data Analytics, dbt Analytics Engineering"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />
              </View>
            </View>
          ) : null}

          {/* Wizard Footer Controls */}
          <View style={styles.actionRow}>
            {wizardStep > 1 ? (
              <Pressable
                onPress={() => setWizardStep((s) => Math.max(1, s - 1))}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
            ) : onCancel ? (
              <Pressable onPress={onCancel} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            ) : null}

            {wizardStep < 4 ? (
              <Pressable
                onPress={() => setWizardStep((s) => Math.min(4, s + 1))}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Next Step</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmitWizard}
                disabled={loading}
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <CheckCircle2 size={16} color="#FFFFFF" />
                )}
                <Text style={styles.primaryBtnText}>
                  {loading
                    ? "Saving Profile..."
                    : isEditing
                      ? "Save Changes"
                      : "Create Master Profile"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.surface,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  modeBtnActive: {
    backgroundColor: COLORS.indigo,
  },
  modeText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  modeTextActive: {
    color: "#FFFFFF",
  },
  errorBanner: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: 12,
    color: "#FDA4AF",
    fontWeight: "600",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  helperText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  fieldGroup: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  textArea: {
    minHeight: 96,
  },
  textAreaSmall: {
    minHeight: 70,
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.indigoBorder,
    backgroundColor: COLORS.indigoSoft,
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 6,
  },
  dropzoneTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  dropzoneSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  stepperRow: {
    gap: 6,
    paddingBottom: 2,
  },
  stepChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepChipActive: {
    backgroundColor: COLORS.indigo,
    borderColor: COLORS.indigo,
  },
  stepChipCompleted: {
    borderColor: COLORS.emeraldBorder,
    backgroundColor: COLORS.emeraldSoft,
  },
  stepChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  stepChipTextActive: {
    color: "#FFFFFF",
  },
  stepContent: {
    gap: 11,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skillChip: {
    backgroundColor: COLORS.indigoSoft,
    borderColor: COLORS.indigoBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  skillChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#C7D2FE",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowIconTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
  },
  addSmallText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#C7D2FE",
  },
  subCard: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 11,
    gap: 9,
  },
  subCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.indigo,
    paddingVertical: 12,
    borderRadius: 11,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

