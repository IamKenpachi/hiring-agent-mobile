import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  MapPin,
  Sparkles,
  XCircle,
} from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { ScoreBar } from "../../src/components/ScoreBadge";
import type { RankedJob } from "../../src/types";

const TONES = [
  "Executive & Formal",
  "Modern & Impactful",
  "Technical & Direct",
  "Confident & Persuasive",
  "Conversational",
];

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedModel, refreshTelemetry } = useAuth();

  const [job, setJob] = useState<RankedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [tailoring, setTailoring] = useState(false);
  const [tone, setTone] = useState("Modern & Impactful");
  const [customCapabilities, setCustomCapabilities] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadJob = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await apiClient.getJobDetail(String(id));
        if (active) setJob(detail);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load job details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadJob();
    return () => {
      active = false;
    };
  }, [id]);

  const handleTailorJob = async () => {
    if (!job) return;
    setTailoring(true);
    setError(null);
    try {
      const output = await apiClient.tailorJob(job.id, {
        tone,
        custom_capabilities: customCapabilities.trim() || undefined,
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
            : "Failed to tailor CV & Cover Letter."
      );
    } finally {
      setTailoring(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
        <Text style={styles.centerText}>Loading AI Match Analysis...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "Job not found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header Card */}
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.platformBadge}>
              <Text style={styles.platformText}>
                {(job.source_platform || "jobspy").toUpperCase()}
              </Text>
            </View>
            {job.job_url ? (
              <Pressable
                onPress={() => void Linking.openURL(job.job_url)}
                style={styles.linkBtn}
              >
                <ExternalLink size={13} color={COLORS.indigo} />
                <Text style={styles.linkBtnText}>View Original Posting</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.title}>{job.title}</Text>

          <View style={styles.metaList}>
            <View style={styles.metaItem}>
              <Building2 size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{job.company}</Text>
            </View>
            <View style={styles.metaItem}>
              <MapPin size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{job.location || "Remote / Unspecified"}</Text>
            </View>
            <View style={styles.metaItem}>
              <DollarSign size={14} color={COLORS.emerald} />
              <Text style={[styles.metaText, { color: COLORS.emerald, fontWeight: "700" }]}>
                {job.salary || "Salary not listed"}
              </Text>
            </View>
          </View>
        </View>

        {/* 4 Score Bars */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4-Dimension AI Fit Breakdown</Text>
          <ScoreBar
            label="Overall Fit"
            score={job.overall_fit_score}
            subtitle="Holistic alignment with your master profile"
          />
          <ScoreBar
            label="Skills Match"
            score={job.skills_match_score}
            subtitle="Hard technical & domain skill overlap"
          />
          <ScoreBar
            label="Experience Fit"
            score={job.experience_fit_score}
            subtitle="Seniority, years & impact scope"
          />
          <ScoreBar
            label="ATS Keyword Score"
            score={job.ats_keyword_score}
            subtitle="Resume parser keyword coverage"
          />
        </View>

        {/* Matched & Missing Skills */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Skills Gap & Keyword Audit</Text>

          <View style={styles.skillSection}>
            <View style={styles.skillHeader}>
              <CheckCircle2 size={14} color={COLORS.emerald} />
              <Text style={styles.skillHeading}>
                Matched Skills ({job.matched_skills?.length || 0})
              </Text>
            </View>
            <View style={styles.chipWrap}>
              {job.matched_skills?.length ? (
                job.matched_skills.map((skill, idx) => (
                  <View key={`${skill}-${idx}`} style={styles.matchedChip}>
                    <Text style={styles.matchedText}>{skill}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No matched skills extracted.</Text>
              )}
            </View>
          </View>

          <View style={styles.skillSection}>
            <View style={styles.skillHeader}>
              <XCircle size={14} color={COLORS.rose} />
              <Text style={styles.skillHeading}>
                Missing / Target Skills ({job.missing_skills?.length || 0})
              </Text>
            </View>
            <View style={styles.chipWrap}>
              {job.missing_skills?.length ? (
                job.missing_skills.map((skill, idx) => (
                  <View key={`${skill}-${idx}`} style={styles.missingChip}>
                    <Text style={styles.missingText}>{skill}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No major skill gaps detected!</Text>
              )}
            </View>
          </View>
        </View>

        {/* AI Rationale & Strategy */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>AI Match Rationale & Strategy</Text>
          {job.match_reason ? (
            <View style={styles.callout}>
              <Text style={styles.calloutLabel}>Match Rationale</Text>
              <Text style={styles.calloutBody}>{job.match_reason}</Text>
            </View>
          ) : null}
          {job.recommendation ? (
            <View style={[styles.callout, styles.strategyCallout]}>
              <Text style={[styles.calloutLabel, { color: "#E9D5FF" }]}>
                Tailoring Recommendation
              </Text>
              <Text style={styles.calloutBody}>{job.recommendation}</Text>
            </View>
          ) : null}
        </View>

        {/* Tailoring Strategy Options */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Application Tailoring Options</Text>
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

          <TextInput
            value={customCapabilities}
            onChangeText={setCustomCapabilities}
            placeholder="Optional: extra highlights or projects to emphasize for this role..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            style={styles.overrideInput}
          />
        </View>

        {/* Full Description */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Full Job Description</Text>
          <Text selectable style={styles.fullDesc}>
            {job.description || "No full description provided."}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom CTA */}
      <View style={styles.stickyBar}>
        <Pressable
          onPress={handleTailorJob}
          disabled={tailoring}
          style={[styles.ctaBtn, tailoring && { opacity: 0.65 }]}
        >
          {tailoring ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Sparkles size={18} color="#FFFFFF" />
          )}
          <Text style={styles.ctaText}>
            {tailoring
              ? "ADK Agents Tailoring CV & Cover Letter..."
              : "Yes, Tailor CV & Cover Letter"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
  centerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  scroll: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  platformBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: COLORS.cyanBorder,
  },
  platformText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#67E8F9",
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
  },
  linkBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#C7D2FE",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  metaList: {
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  skillSection: {
    gap: 7,
  },
  skillHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  skillHeading: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  matchedChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.emeraldSoft,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
  },
  matchedText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#6EE7B7",
  },
  missingChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
  },
  missingText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#FDA4AF",
  },
  muted: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  callout: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 4,
  },
  strategyCallout: {
    backgroundColor: COLORS.purpleSoft,
    borderColor: COLORS.purpleBorder,
  },
  calloutLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: COLORS.indigo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calloutBody: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textPrimary,
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
  overrideInput: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 62,
    fontSize: 12.5,
    color: COLORS.textPrimary,
    textAlignVertical: "top",
  },
  fullDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
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
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "rgba(9, 13, 22, 0.96)",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.purple,
    paddingVertical: 15,
    borderRadius: 13,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

