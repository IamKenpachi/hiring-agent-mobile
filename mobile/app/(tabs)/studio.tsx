import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  Link as LinkIcon,
  RotateCcw,
  Sliders,
  UserCircle,
  Wand2,
  Zap,
} from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";

const SAMPLE_JDS = [
  {
    title: "Senior Data Analyst",
    company: "Monzo Bank",
    url: "https://monzo.com/careers/data-analyst",
    text: `About the Role:
We are looking for a Senior Data Analyst to join our Core Banking Product Analytics team. You will partner with product managers and engineers to build actionable metrics, design rigorous A/B experiments, and unearth strategic insights from multi-terabyte transactional datasets.

Key Responsibilities:
- Build and maintain scalable dbt models and SQL queries in Snowflake.
- Design, monitor, and analyze statistical A/B tests to optimize user onboarding conversion.
- Create executive Tableau and Looker dashboards for cross-functional stakeholders.
- Partner with leadership to translate product questions into predictive analyses.

Qualifications:
- 4+ years of experience in data analytics, BI, or product analytics.
- Advanced SQL and Python proficiency (pandas, numpy, statsmodels).
- Proven experience with modern data stacks (Snowflake, dbt, Airflow).
- Deep expertise in data visualization (Tableau, Looker, Metabase).`,
  },
  {
    title: "Lead Analytics Engineer",
    company: "Revolut",
    url: "https://revolut.com/careers/analytics-engineer",
    text: `Job Description:
Revolut is seeking a Lead Analytics Engineer to spearhead our financial data modeling initiatives. You will sit at the intersection of data engineering and business intelligence, establishing production-grade data modeling standards and semantic layers.

What You'll Do:
- Architect modular, tested, and documented dbt data pipelines across BigQuery and Snowflake.
- Implement CI/CD and data quality frameworks using Great Expectations and GitHub Actions.
- Optimize query performance and warehouse compute costs.
- Mentor junior analysts on software engineering best practices for analytics.

Requirements:
- 5+ years building production data pipelines and semantic data models.
- Expert-level dbt, SQL, and Python skills.
- Experience with orchestration tools (Airflow, Dagster).
- Strong communication and stakeholder management abilities.`,
  },
];

const TONES = [
  "Executive & Formal",
  "Modern & Impactful",
  "Technical & Direct",
  "Confident & Persuasive",
  "Conversational",
];

export default function StudioScreen() {
  const router = useRouter();
  const { activeProfile, selectedModel, refreshTelemetry } = useAuth();

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [customCapabilities, setCustomCapabilities] = useState("");
  const [tone, setTone] = useState("Modern & Impactful");
  const [showOverride, setShowOverride] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingReset) return;
    const timer = setTimeout(() => setConfirmingReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  const trimmedJd = jobDescription.trim();
  const wordCount = trimmedJd ? trimmedJd.split(/\s+/).length : 0;
  const charCount = jobDescription.length;
  const hasContent = Boolean(jobTitle || company || jobUrl || jobDescription || customCapabilities);

  const loadSample = (sample: (typeof SAMPLE_JDS)[number]) => {
    setJobTitle(sample.title);
    setCompany(sample.company);
    setJobUrl(sample.url);
    setJobDescription(sample.text);
    setError(null);
    setExtractSuccess(null);
  };

  const resetSession = () => {
    setJobTitle("");
    setCompany("");
    setJobUrl("");
    setJobDescription("");
    setCustomCapabilities("");
    setConfirmingReset(false);
    setError(null);
    setExtractSuccess(null);
  };

  const handleExtractJD = async () => {
    if (trimmedJd.length < 10) {
      setError("Please paste at least 10 characters of the Job Description to auto-extract.");
      return;
    }
    setExtracting(true);
    setError(null);
    setExtractSuccess(null);
    try {
      const extracted = await apiClient.extractJD(trimmedJd, selectedModel);
      if (extracted.job_title) setJobTitle(extracted.job_title);
      if (extracted.company) setCompany(extracted.company);
      setExtractSuccess(
        extracted.summary ||
          `Extracted ${extracted.job_title || "Role"} @ ${extracted.company || "Company"}`
      );
      await refreshTelemetry();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to extract JD details."
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async () => {
    if (trimmedJd.length < 10) {
      setError("Please paste at least 10 characters of the Job Description first.");
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const output = await apiClient.tailorStudio({
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        job_url: jobUrl.trim() || undefined,
        job_description: trimmedJd,
        custom_capabilities: customCapabilities.trim() || undefined,
        tone,
        profile_id: activeProfile?.id,
        model: selectedModel,
      });
      await refreshTelemetry();
      router.push(`/output/${output.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to generate tailored application."
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {/* Quick Sample Presets */}
      <View style={styles.samplesWrap}>
        <Text style={styles.samplesLabel}>Quick Samples:</Text>
        <View style={styles.samplesRow}>
          {SAMPLE_JDS.map((sample) => (
            <Pressable
              key={sample.title}
              onPress={() => loadSample(sample)}
              style={styles.sampleBtn}
            >
              <Text style={styles.sampleBtnText}>
                {sample.title} ({sample.company})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Main Studio Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <FileText size={16} color={COLORS.purple} />
            <Text style={styles.cardTitle}>Target Job Details & Strategy</Text>
          </View>

          <View style={styles.headerRight}>
            {hasContent ? (
              confirmingReset ? (
                <View style={styles.confirmBox}>
                  <Pressable onPress={resetSession}>
                    <Text style={styles.confirmYes}>Confirm Clear</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmingReset(false)}>
                    <Text style={styles.confirmNo}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setConfirmingReset(true)}
                  style={styles.resetBtn}
                >
                  <RotateCcw size={12} color={COLORS.textSecondary} />
                  <Text style={styles.resetText}>Reset</Text>
                </Pressable>
              )
            ) : null}

            <View style={styles.modelPill}>
              <Text style={styles.modelPillText}>{selectedModel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <View style={styles.labelRow}>
              <Briefcase size={12} color={COLORS.textMuted} />
              <Text style={styles.label}>Job Title</Text>
            </View>
            <TextInput
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder="e.g. Senior Data Analyst"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>

          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <View style={styles.labelRow}>
              <Building2 size={12} color={COLORS.textMuted} />
              <Text style={styles.label}>Company Name</Text>
            </View>
            <TextInput
              value={company}
              onChangeText={setCompany}
              placeholder="e.g. Monzo"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <LinkIcon size={12} color={COLORS.textMuted} />
            <Text style={styles.label}>Job URL (Optional)</Text>
          </View>
          <TextInput
            value={jobUrl}
            onChangeText={setJobUrl}
            placeholder="https://company.com/careers/job-id"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        {/* Job Description + Auto-Extract Info */}
        <View style={styles.fieldGroup}>
          <View style={styles.jdHeader}>
            <Text style={styles.labelBold}>Job Description Text *</Text>
            <Pressable
              onPress={handleExtractJD}
              disabled={extracting || !trimmedJd}
              style={[
                styles.extractBtn,
                (extracting || !trimmedJd) && { opacity: 0.45 },
              ]}
            >
              {extracting ? (
                <ActivityIndicator size="small" color="#D8B4FE" />
              ) : (
                <Wand2 size={12} color="#D8B4FE" />
              )}
              <Text style={styles.extractText}>
                {extracting ? "Extracting..." : "Auto-Extract Info"}
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={jobDescription}
            onChangeText={setJobDescription}
            placeholder="Paste the full job description here (responsibilities, required skills, qualifications)..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            style={[styles.input, styles.jdTextArea]}
          />

          <View style={styles.counterRow}>
            <Text style={styles.tipText}>Include full requirements for ATS accuracy</Text>
            <Text style={styles.counterText}>
              {wordCount} words • {charCount} chars
            </Text>
          </View>

          {extractSuccess ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{extractSuccess}</Text>
            </View>
          ) : null}
        </View>

        {/* Collapsible Candidate Capabilities / Profile Override */}
        <View style={styles.overrideBox}>
          <Pressable
            onPress={() => setShowOverride((prev) => !prev)}
            style={styles.overrideHeader}
          >
            <View style={styles.overrideTitleWrap}>
              <UserCircle size={16} color={COLORS.emerald} />
              <Text style={styles.overrideTitle}>
                Candidate Capabilities / Profile Override
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  customCapabilities.trim()
                    ? styles.statusBadgeEmerald
                    : styles.statusBadgeMuted,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    customCapabilities.trim() && { color: "#6EE7B7" },
                  ]}
                >
                  {customCapabilities.trim()
                    ? "Custom Active"
                    : activeProfile?.profile_name || "Default Profile"}
                </Text>
              </View>
            </View>
            {showOverride ? (
              <ChevronUp size={16} color={COLORS.textSecondary} />
            ) : (
              <ChevronDown size={16} color={COLORS.textSecondary} />
            )}
          </Pressable>

          {showOverride ? (
            <View style={styles.overrideBody}>
              <Text style={styles.overrideHint}>
                Leave empty to use your active master profile. Add specific projects,
                keywords, or custom background overrides for this tailoring run.
              </Text>
              <TextInput
                value={customCapabilities}
                onChangeText={setCustomCapabilities}
                placeholder="e.g. Specialized in real-time streaming analytics, Kafka, Snowflake, and dbt..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[styles.input, styles.overrideTextArea]}
              />
              {customCapabilities.trim() ? (
                <Pressable
                  onPress={() => setCustomCapabilities("")}
                  style={styles.clearOverrideBtn}
                >
                  <RotateCcw size={12} color={COLORS.rose} />
                  <Text style={styles.clearOverrideText}>Reset to Active Profile</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Cover Letter Tone Picker */}
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Sliders size={12} color={COLORS.textMuted} />
            <Text style={styles.label}>Cover Letter Tone</Text>
          </View>
          <View style={styles.toneWrap}>
            {TONES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTone(t)}
                style={[styles.toneChip, tone === t && styles.toneChipActive]}
              >
                <Text style={[styles.toneText, tone === t && styles.toneTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Generate CTA */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating || !trimmedJd}
          style={[
            styles.generateBtn,
            (generating || !trimmedJd) && { opacity: 0.55 },
          ]}
        >
          {generating ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Zap size={17} color="#FDE047" />
          )}
          <Text style={styles.generateBtnText}>
            {generating
              ? "AI Agents Tailoring Application..."
              : "Generate Tailored Application"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 38,
    gap: 12,
  },
  samplesWrap: {
    gap: 6,
  },
  samplesLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  samplesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sampleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sampleBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 13,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resetText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  confirmBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
  },
  confirmYes: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FDA4AF",
  },
  confirmNo: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  modelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modelPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#E9D5FF",
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
  },
  fieldGroup: {
    gap: 5,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  labelBold: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  jdHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  extractBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  extractText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#E9D5FF",
  },
  jdTextArea: {
    minHeight: 165,
    lineHeight: 19,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tipText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
  },
  counterText: {
    fontSize: 10.5,
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  successBanner: {
    backgroundColor: COLORS.emeraldSoft,
    borderColor: COLORS.emeraldBorder,
    borderWidth: 1,
    borderRadius: 9,
    padding: 9,
  },
  successText: {
    fontSize: 12,
    color: "#6EE7B7",
    fontWeight: "600",
  },
  overrideBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    overflow: "hidden",
  },
  overrideHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 8,
  },
  overrideTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    flex: 1,
  },
  overrideTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeEmerald: {
    backgroundColor: COLORS.emeraldSoft,
    borderColor: COLORS.emeraldBorder,
  },
  statusBadgeMuted: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: COLORS.border,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  overrideBody: {
    padding: 12,
    paddingTop: 0,
    gap: 8,
  },
  overrideHint: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  overrideTextArea: {
    minHeight: 80,
  },
  clearOverrideBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 5,
  },
  clearOverrideText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: COLORS.rose,
  },
  toneWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  toneChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toneChipActive: {
    backgroundColor: COLORS.purpleSoft,
    borderColor: COLORS.purpleBorder,
  },
  toneText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  toneTextActive: {
    color: "#E9D5FF",
    fontWeight: "700",
  },
  errorBanner: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: 12.5,
    color: "#FDA4AF",
    fontWeight: "600",
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.purple,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 2,
  },
  generateBtnText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
