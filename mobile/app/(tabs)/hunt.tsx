import React, { useEffect, useRef, useState } from "react";
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
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Globe,
  MapPin,
  Minus,
  Plus,
  Radar,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { ScoreBadge } from "../../src/components/ScoreBadge";
import type { RankedJob, SearchRun } from "../../src/types";

const PRIMARY_BOARDS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "indeed", label: "Indeed" },
  { id: "glassdoor", label: "Glassdoor" },
  { id: "google", label: "Google" },
  { id: "zip_recruiter", label: "ZipRecruiter" },
];

const REGIONAL_BOARDS = [
  { id: "bayt", label: "Bayt (MENA)" },
  { id: "naukri", label: "Naukri (India)" },
  { id: "bdjobs", label: "BDJobs (BD)" },
];

const WORK_TYPES = [
  "Any",
  "Remote",
  "Full-Time",
  "Part-Time",
  "Contract",
  "Internship",
];

const RECENCY_OPTIONS = [
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
  { label: "14d", hours: 336 },
  { label: "30d", hours: 720 },
  { label: "Any", hours: 0 },
];

const RADIUS_OPTIONS = [10, 25, 50, 100];
const TOP_N_PRESETS = [5, 10, 15, 20, 30];

export default function HuntScreen() {
  const router = useRouter();
  const { activeProfile, selectedModel, refreshTelemetry } = useAuth();

  const [query, setQuery] = useState("Data Analyst");
  const [location, setLocation] = useState("London, UK");
  const [radius, setRadius] = useState(25);
  const [workType, setWorkType] = useState("Any");
  const [hoursOld, setHoursOld] = useState(168);
  const [requestedTopN, setRequestedTopN] = useState(10);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "linkedin",
    "indeed",
    "glassdoor",
  ]);
  const [showRegional, setShowRegional] = useState(false);

  const [hunting, setHunting] = useState(false);
  const [activeRun, setActiveRun] = useState<Partial<SearchRun> | null>(null);
  const [rankedJobs, setRankedJobs] = useState<RankedJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [primaryBoards, setPrimaryBoards] = useState(PRIMARY_BOARDS);
  const [regionalBoards, setRegionalBoards] = useState(REGIONAL_BOARDS);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    const formatBoardLabel = (id: string) => {
      const known = [...PRIMARY_BOARDS, ...REGIONAL_BOARDS].find((b) => b.id === id);
      if (known) return known.label;
      return id
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    };
    apiClient
      .getPlatforms()
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res.primary) && res.primary.length > 0) {
          setPrimaryBoards(
            res.primary.map((item) =>
              typeof item === "string"
                ? { id: item, label: formatBoardLabel(item) }
                : { id: item.id, label: item.label }
            )
          );
        }
        if (Array.isArray(res.regional) && res.regional.length > 0) {
          setRegionalBoards(
            res.regional.map((item) =>
              typeof item === "string"
                ? { id: item, label: formatBoardLabel(item) }
                : { id: item.id, label: item.label }
            )
          );
        }
      })
      .catch(() => {
        // Fallback to static board list if offline
      });
    return () => {
      active = false;
      unsubscribeRef.current?.();
    };
  }, []);

  const togglePlatform = (boardId: string) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(boardId)) {
        return prev.length > 1 ? prev.filter((id) => id !== boardId) : prev;
      }
      return [...prev, boardId];
    });
  };

  const handleStartHunt = async () => {
    if (!query.trim()) {
      setError("Please enter a Job Title query.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("Select at least one JobSpy platform.");
      return;
    }

    unsubscribeRef.current?.();
    setError(null);
    setHunting(true);
    setRankedJobs([]);
    setActiveRun({
      status: "pending",
      progress_pct: 5,
      status_detail: "Initializing JobSpy multi-board hunt...",
      warnings: [],
      total_scraped: 0,
    });

    try {
      const started = await apiClient.startHunt({
        query: query.trim(),
        location: location.trim() || "Remote",
        radius,
        platforms: selectedPlatforms,
        hours_old: hoursOld,
        work_type: workType,
        requested_top_n: requestedTopN,
        profile_id: activeProfile?.id,
        model: selectedModel,
      });

      unsubscribeRef.current = apiClient.subscribeHuntRun(started.run_id, {
        onProgress: (runUpdate) => {
          setActiveRun((prev) => ({ ...(prev || {}), ...runUpdate }));
        },
        onComplete: (result) => {
          setActiveRun(result.run);
          const sorted = [...(result.jobs || [])].sort(
            (a, b) => (b.overall_fit_score || 0) - (a.overall_fit_score || 0)
          );
          setRankedJobs(sorted);
          setHunting(false);
          void refreshTelemetry();
        },
        onError: (err) => {
          setError(err.message);
          setHunting(false);
        },
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to start JobSpy hunt.";
      setError(msg);
      setHunting(false);
    }
  };

  const progressPct = Math.max(0, Math.min(100, Math.round(activeRun?.progress_pct || 0)));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {/* Active Context Banner */}
      <View style={styles.contextBar}>
        <View style={styles.contextItem}>
          <UserCheck size={14} color={COLORS.emerald} />
          <Text style={styles.contextText} numberOfLines={1}>
            {activeProfile?.profile_name || activeProfile?.full_name || "Default CV"}
          </Text>
        </View>
        <View style={styles.modelPill}>
          <Text style={styles.modelPillText}>{selectedModel}</Text>
        </View>
      </View>

      {/* Search Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Radar size={18} color={COLORS.indigo} />
          <Text style={styles.cardTitle}>Multi-Board JobSpy Configuration</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Job Title / Role Query *</Text>
          <View style={styles.inputRow}>
            <Briefcase size={15} color={COLORS.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. Senior Data Analyst, Analytics Engineer"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Location</Text>
          <View style={styles.inputRow}>
            <MapPin size={15} color={COLORS.textMuted} />
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. London, UK or Remote"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        {/* Radius */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Search Radius</Text>
          <View style={styles.chipRow}>
            {RADIUS_OPTIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRadius(r)}
                style={[styles.chip, radius === r && styles.chipActive]}
              >
                <Text style={[styles.chipText, radius === r && styles.chipTextActive]}>
                  {r} mi
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Work Type */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Work Type</Text>
          <View style={styles.chipRow}>
            {WORK_TYPES.map((wt) => (
              <Pressable
                key={wt}
                onPress={() => setWorkType(wt)}
                style={[styles.chip, workType === wt && styles.chipActive]}
              >
                <Text style={[styles.chipText, workType === wt && styles.chipTextActive]}>
                  {wt}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recency */}
        <View style={styles.fieldGroup}>
          <View style={styles.rowBetween}>
            <View style={styles.labelIconRow}>
              <Clock size={13} color={COLORS.amber} />
              <Text style={styles.label}>Posting Recency</Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {RECENCY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => setHoursOld(opt.hours)}
                style={[styles.chip, hoursOld === opt.hours && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    hoursOld === opt.hours && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Number of Ranked Results (N) */}
        <View style={styles.fieldGroup}>
          <View style={styles.rowBetween}>
            <View style={styles.labelIconRow}>
              <SlidersHorizontal size={13} color={COLORS.purple} />
              <Text style={styles.label}>Top Ranked Results (N)</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setRequestedTopN((n) => Math.max(1, n - 1))}
                style={styles.stepBtn}
              >
                <Minus size={13} color={COLORS.textPrimary} />
              </Pressable>
              <Text style={styles.stepVal}>{requestedTopN}</Text>
              <Pressable
                onPress={() => setRequestedTopN((n) => Math.min(50, n + 1))}
                style={styles.stepBtn}
              >
                <Plus size={13} color={COLORS.textPrimary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.chipRow}>
            {TOP_N_PRESETS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setRequestedTopN(n)}
                style={[styles.chip, requestedTopN === n && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, requestedTopN === n && styles.chipTextActive]}
                >
                  Top {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 8-Platform JobSpy Selector */}
        <View style={styles.fieldGroup}>
          <View style={styles.rowBetween}>
            <View style={styles.labelIconRow}>
              <Globe size={13} color={COLORS.cyan} />
              <Text style={styles.label}>
                JobSpy Platforms ({selectedPlatforms.length}/8 selected)
              </Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            {primaryBoards.map((b) => {
              const active = selectedPlatforms.includes(b.id);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => togglePlatform(b.id)}
                  style={[styles.boardChip, active && styles.boardChipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setShowRegional((prev) => !prev)}
            style={styles.regionalToggle}
          >
            <Text style={styles.regionalToggleText}>
              Regional JobSpy Boards (Bayt, Naukri, BDJobs)
            </Text>
            {showRegional ? (
              <ChevronUp size={15} color={COLORS.textSecondary} />
            ) : (
              <ChevronDown size={15} color={COLORS.textSecondary} />
            )}
          </Pressable>

          {showRegional ? (
            <View style={styles.chipRow}>
              {regionalBoards.map((b) => {
                const active = selectedPlatforms.includes(b.id);
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => togglePlatform(b.id)}
                    style={[styles.boardChip, active && styles.boardChipPurple]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleStartHunt}
          disabled={hunting}
          style={[styles.huntBtn, hunting && { opacity: 0.65 }]}
        >
          {hunting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Radar size={18} color="#FFFFFF" />
          )}
          <Text style={styles.huntBtnText}>
            {hunting ? "Scanning & Ranking Jobs..." : `Hunt Top ${requestedTopN} Matches`}
          </Text>
        </Pressable>
      </View>

      {/* Live Progress Card */}
      {activeRun ? (
        <View style={styles.progressCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.progressPhase}>
              {activeRun.status === "scraping"
                ? "Scraping JobSpy Boards"
                : activeRun.status === "ranking"
                  ? "ADK Multi-Agent Ranking"
                  : activeRun.status === "completed"
                    ? "Hunt Complete"
                    : activeRun.status === "failed"
                      ? "Hunt Failed"
                      : "Initializing"}
            </Text>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor:
                    activeRun.status === "completed"
                      ? COLORS.emerald
                      : activeRun.status === "failed"
                        ? COLORS.rose
                        : COLORS.indigo,
                },
              ]}
            />
          </View>

          <Text style={styles.progressDetail}>
            {activeRun.status_detail || "Working..."}
            {typeof activeRun.total_scraped === "number" && activeRun.total_scraped > 0
              ? ` • ${activeRun.total_scraped} postings harvested`
              : ""}
          </Text>

          {/* Non-blocking Rate-Limit / Partial Board Warnings */}
          {Array.isArray(activeRun.warnings) && activeRun.warnings.length > 0 ? (
            <View style={styles.warningBanner}>
              <AlertTriangle size={15} color={COLORS.amber} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.warningTitle}>Partial Board Warning</Text>
                {activeRun.warnings.map((warn, idx) => (
                  <Text key={idx} style={styles.warningBody}>
                    • {warn}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Ranked Results List */}
      {rankedJobs.length > 0 ? (
        <View style={styles.resultsSection}>
          <Text style={styles.resultsHeading}>
            Top {rankedJobs.length} AI-Ranked Matches
          </Text>

          {rankedJobs.map((job) => (
            <Pressable
              key={job.id}
              onPress={() => router.push(`/job/${job.id}`)}
              style={({ pressed }) => [
                styles.jobCard,
                pressed && { opacity: 0.88 },
              ]}
            >
              <View style={styles.jobHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.jobTitle}>{job.title}</Text>
                  <Text style={styles.jobCompany}>
                    {job.company}
                    {job.location ? ` • ${job.location}` : ""}
                  </Text>
                </View>
                <View style={styles.platformBadge}>
                  <Text style={styles.platformBadgeText}>
                    {(job.source_platform || "jobspy").toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.salaryRow}>
                <DollarSign size={13} color={COLORS.emerald} />
                <Text style={styles.salaryText}>
                  {job.salary || "Salary not listed"}
                </Text>
              </View>

              <Text style={styles.jobDescSnippet} numberOfLines={3} ellipsizeMode="tail">
                {(job.description || "No description provided.").replace(/\s+/g, " ").trim()}
              </Text>

              {/* 4 Score Badges */}
              <View style={styles.scoresGrid}>
                <ScoreBadge label="Overall Fit" score={job.overall_fit_score} compact />
                <ScoreBadge label="Skills" score={job.skills_match_score} compact />
                <ScoreBadge label="Experience" score={job.experience_fit_score} compact />
                <ScoreBadge label="ATS" score={job.ats_keyword_score} compact />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
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
    paddingBottom: 36,
    gap: 14,
  },
  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  contextItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  contextText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  modelPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modelPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E9D5FF",
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
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  labelIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.indigoSoft,
    borderColor: COLORS.indigoBorder,
  },
  boardChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  boardChipActive: {
    backgroundColor: COLORS.indigo,
    borderColor: COLORS.indigo,
  },
  boardChipPurple: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  stepBtn: {
    padding: 4,
  },
  stepVal: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.textPrimary,
    minWidth: 22,
    textAlign: "center",
  },
  regionalToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  regionalToggleText: {
    fontSize: 12,
    fontWeight: "600",
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
    fontWeight: "600",
    color: "#FDA4AF",
  },
  huntBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.indigo,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 2,
  },
  huntBtnText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  progressCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
    padding: 14,
    gap: 9,
  },
  progressPhase: {
    fontSize: 13.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  progressPct: {
    fontSize: 13.5,
    fontWeight: "800",
    color: COLORS.indigo,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: COLORS.amberBorder,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FCD34D",
  },
  warningBody: {
    fontSize: 11.5,
    color: "#FDE68A",
    lineHeight: 16,
  },
  resultsSection: {
    gap: 10,
  },
  resultsHeading: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  jobCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 9,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  jobCompany: {
    fontSize: 12.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  platformBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: COLORS.cyanBorder,
  },
  platformBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#67E8F9",
  },
  salaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  salaryText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.emerald,
  },
  jobDescSnippet: {
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  scoresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 2,
  },
});
