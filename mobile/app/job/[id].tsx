import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  ExternalLink,
  MapPin,
  Sparkles,
  XCircle,
} from "lucide-react-native";
import {
  getCardElevation,
  type ThemeColors,
} from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { copyToClipboard } from "../../src/lib/clipboard";
import {
  parseJobDescription,
  type TextSpan,
} from "../../src/lib/descriptionParser";
import { setPendingTailorRequest } from "../../src/lib/tailorSession";
import { ScoreBar } from "../../src/components/ScoreBadge";
import type { RankedJob } from "../../src/types";

const TONES = [
  "Executive & Formal",
  "Modern & Impactful",
  "Technical & Direct",
  "Confident & Persuasive",
  "Conversational",
];

type JobDetailStyles = ReturnType<typeof createStyles>;

function renderTextSpans(spans: TextSpan[], styles: JobDetailStyles) {
  return spans.map((span, index) => {
    const linkUrl =
      span.linkUrl && /^(https?:|mailto:)/i.test(span.linkUrl)
        ? span.linkUrl
        : undefined;
    if (!span.bold && !span.italic && !linkUrl) {
      return <React.Fragment key={index}>{span.text}</React.Fragment>;
    }
    return (
      <Text
        key={index}
        onPress={
          linkUrl ? () => void Linking.openURL(linkUrl).catch(() => {}) : undefined
        }
        style={[
          span.bold && styles.descBold,
          span.italic && styles.descItalic,
          linkUrl && styles.descLink,
        ]}
      >
        {span.text}
      </Text>
    );
  });
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedModel } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [job, setJob] = useState<RankedJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [tone, setTone] = useState("Modern & Impactful");
  const [customCapabilities, setCustomCapabilities] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const descriptionBlocks = useMemo(
    () => parseJobDescription(job?.description || ""),
    [job?.description]
  );

  useEffect(() => {
    setCopiedDesc(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [id]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

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

  const handleTailorJob = () => {
    if (!job) return;
    setError(null);
    setPendingTailorRequest({
      source: "job",
      jobId: job.id,
      payload: {
        tone,
        custom_capabilities: customCapabilities.trim() || undefined,
        model: selectedModel,
      },
      jobTitle: job.title?.trim() || "Target Role",
      company: job.company?.trim() || "",
      model: selectedModel,
      tone,
    });
    router.push("/tailoring");
  };

  const handleCopyDescription = async () => {
    if (!job?.description) return;
    const copied = await copyToClipboard(job.description);
    if (!copied) return;
    setCopiedDesc(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedDesc(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.indigo} />
        <Text style={styles.centerText}>Loading Job Match Analysis...</Text>
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

  const hasDescription = Boolean(job.description && job.description.trim().length > 0);

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
                <ExternalLink size={13} color={colors.indigoText} />
                <Text style={styles.linkBtnText}>View Original Posting</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.title}>{job.title}</Text>

          <View style={styles.metaList}>
            <View style={styles.metaItem}>
              <Building2 size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{job.company}</Text>
            </View>
            <View style={styles.metaItem}>
              <MapPin size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{job.location || "Remote / Unspecified"}</Text>
            </View>
            <View style={styles.metaItem}>
              <DollarSign size={14} color={colors.emeraldText} />
              <Text style={[styles.metaText, { color: colors.emeraldText, fontWeight: "700" }]}>
                {job.salary || "Salary not listed"}
              </Text>
            </View>
          </View>
        </View>

        {/* 4 Score Bars */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4-Dimension Fit Breakdown</Text>
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
              <CheckCircle2 size={14} color={colors.emerald} />
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
              <XCircle size={14} color={colors.rose} />
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

        {/* Match Rationale & Strategy */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Match Rationale & Strategy</Text>
          {job.match_reason ? (
            <View style={styles.callout}>
              <Text style={styles.calloutLabel}>Match Rationale</Text>
              <Text style={styles.calloutBody}>{job.match_reason}</Text>
            </View>
          ) : null}
          {job.recommendation ? (
            <View style={[styles.callout, styles.strategyCallout]}>
              <Text style={[styles.calloutLabel, { color: colors.purpleText }]}>
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
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.overrideInput}
          />
        </View>

        {/* Full Description */}
        <View style={styles.card}>
          <View style={styles.descHeaderRow}>
            <Text style={styles.sectionTitle}>Full Job Description</Text>
            {hasDescription ? (
              <Pressable
                onPress={() => void handleCopyDescription()}
                accessibilityRole="button"
                accessibilityLabel="Copy job description"
                style={({ pressed }) => [
                  styles.copyBtn,
                  copiedDesc && styles.copyBtnCopied,
                  pressed && { opacity: 0.75 },
                ]}
              >
                {copiedDesc ? (
                  <Check size={13} color={colors.emeraldText} />
                ) : (
                  <Copy size={13} color={colors.textSecondary} />
                )}
                <Text
                  style={[
                    styles.copyBtnText,
                    copiedDesc && styles.copyBtnTextCopied,
                  ]}
                >
                  {copiedDesc ? "Copied!" : "Copy"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {descriptionBlocks.length > 0 ? (
            <View style={styles.descBody}>
              {descriptionBlocks.map((block, idx) => {
                if (block.type === "heading") {
                  return (
                    <Text
                      key={`desc-h-${idx}`}
                      selectable
                      style={[
                        styles.descHeading,
                        idx > 0 && styles.descHeadingSpaced,
                      ]}
                    >
                      {block.text}
                    </Text>
                  );
                }
                if (block.type === "bullet") {
                  return (
                    <View key={`desc-b-${idx}`} style={styles.descBulletRow}>
                      <Text
                        style={[
                          styles.descBulletMarker,
                          block.marker.length > 1 && styles.descNumberMarker,
                        ]}
                      >
                        {block.marker}
                      </Text>
                      <Text selectable style={styles.descBulletText}>
                        {renderTextSpans(block.spans, styles)}
                      </Text>
                    </View>
                  );
                }
                return (
                  <Text key={`desc-p-${idx}`} selectable style={styles.fullDesc}>
                    {renderTextSpans(block.spans, styles)}
                  </Text>
                );
              })}
            </View>
          ) : (
            <Text selectable style={styles.fullDesc}>
              No full description provided.
            </Text>
          )}
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
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
        >
          <Sparkles size={18} color="#FFFFFF" />
          <Text style={styles.ctaText}>Yes, Tailor CV & Cover Letter</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 20,
    },
    centerText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    scroll: {
      padding: 16,
      paddingBottom: 110,
      gap: 14,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 15,
      gap: 12,
      ...getCardElevation(isDark),
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
      backgroundColor: colors.cyanSoft,
      borderWidth: 1,
      borderColor: colors.cyanBorder,
    },
    platformText: {
      fontSize: 10.5,
      fontWeight: "800",
      color: colors.cyanText,
    },
    linkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.indigoSoft,
      borderWidth: 1,
      borderColor: colors.indigoBorder,
    },
    linkBtnText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.indigoText,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.textPrimary,
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
      color: colors.textSecondary,
    },
    sectionTitle: {
      fontSize: 14.5,
      fontWeight: "800",
      color: colors.textPrimary,
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
      color: colors.textPrimary,
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
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    matchedText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.emeraldText,
    },
    missingChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    missingText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.roseText,
    },
    muted: {
      fontSize: 12,
      color: colors.textMuted,
    },
    callout: {
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 4,
    },
    strategyCallout: {
      backgroundColor: colors.purpleSoft,
      borderColor: colors.purpleBorder,
    },
    calloutLabel: {
      fontSize: 11.5,
      fontWeight: "800",
      color: colors.indigoText,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    calloutBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textPrimary,
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
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toneChipActive: {
      backgroundColor: colors.purpleSoft,
      borderColor: colors.purpleBorder,
    },
    toneText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    toneTextActive: {
      color: colors.purpleText,
      fontWeight: "700",
    },
    overrideInput: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      minHeight: 62,
      fontSize: 12.5,
      color: colors.textPrimary,
      textAlignVertical: "top",
    },
    descHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    copyBtnCopied: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
    },
    copyBtnText: {
      fontSize: 11.5,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    copyBtnTextCopied: {
      color: colors.emeraldText,
      fontWeight: "700",
    },
    descBody: {
      gap: 8,
    },
    descHeading: {
      fontSize: 13.5,
      fontWeight: "700",
      lineHeight: 19,
      color: colors.textPrimary,
    },
    descHeadingSpaced: {
      marginTop: 6,
    },
    descBulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingLeft: 2,
    },
    descBulletMarker: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "700",
      color: colors.textSecondary,
      minWidth: 10,
    },
    descNumberMarker: {
      minWidth: 20,
    },
    descBulletText: {
      flex: 1,
      flexShrink: 1,
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    fullDesc: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    descBold: {
      fontWeight: "700",
      color: colors.textPrimary,
    },
    descItalic: {
      fontStyle: "italic",
    },
    descLink: {
      color: colors.indigoText,
      textDecorationLine: "underline",
    },
    errorBanner: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    errorText: {
      fontSize: 12.5,
      color: colors.roseText,
      fontWeight: "600",
    },
    stickyBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 14,
      backgroundColor: colors.tabBarBg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    ctaBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.purple,
      paddingVertical: 15,
      borderRadius: 13,
    },
    ctaText: {
      fontSize: 15,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}

