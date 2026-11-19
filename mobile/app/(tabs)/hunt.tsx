import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  Filter,
  Globe,
  Home,
  MapPin,
  Minus,
  Plus,
  Radar,
  SlidersHorizontal,
  Trophy,
  UserCheck,
} from "lucide-react-native";
import {
  getCardElevation,
  getScoreTheme,
  type ThemeColors,
} from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { resolveModelDisplayName } from "../../src/lib/profileHelpers";
import {
  AuthButtonGradient,
  OnboardingAmbientGlow,
  WEB_SANS,
} from "../../src/components/OnboardingGraphics";
import { ThemeToggleButton } from "../../src/components/ThemeToggleButton";
import type { RankedJob, SearchRun } from "../../src/types";

type HuntStage = "config" | "progress" | "results";
type StepVisualState = "pending" | "running" | "done" | "failed";

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

function statusToPhaseIndex(status?: SearchRun["status"]): number {
  switch (status) {
    case "completed":
      return 5;
    case "finalizing":
      return 4;
    case "ranking":
      return 3;
    case "deduplicating":
      return 2;
    case "scraping":
      return 1;
    case "pending":
    default:
      return 0;
  }
}

function cleanMarkdownSnippet(raw?: string | null): string {
  if (!raw || !raw.trim()) return "No description provided.";
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)\s*#{1,6}\s*/g, "$1")
    .replace(/(^|\n)\s*[-*+•]\s+/g, "$1")
    .replace(/[*_`~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBoardListSummary(
  selectedIds: string[],
  allBoards: { id: string; label: string }[]
): string {
  const labels = selectedIds.map(
    (id) => allBoards.find((b) => b.id === id)?.label || id.replace(/_/g, " ")
  );
  if (labels.length === 0) return "selected boards";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]} & ${labels[2]}`;
  return `${labels[0]}, ${labels[1]} & ${labels.length - 2} more`;
}

function ProgressGradientFill({ failed }: { failed: boolean }) {
  const rawId = useId();
  const gradId = `huntProg-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 8" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={failed ? "#FB7185" : "#06B6D4"} />
          <Stop offset="55%" stopColor={failed ? "#F43F5E" : "#14B8A6"} />
          <Stop offset="100%" stopColor={failed ? "#E11D48" : "#10B981"} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="300" height="8" rx="4" fill={`url(#${gradId})`} />
    </Svg>
  );
}

interface ExecutionStepItem {
  id: number;
  kicker: string;
  title: string;
  subtitle: string;
  state: StepVisualState;
  icon: "globe" | "filter" | "brain" | "trophy";
}

function StepIcon({
  icon,
  state,
}: {
  icon: ExecutionStepItem["icon"];
  state: StepVisualState;
}) {
  const { colors } = useTheme();
  const color =
    state === "done"
      ? colors.emeraldText
      : state === "running"
        ? colors.cyanText
        : state === "failed"
          ? colors.roseText
          : colors.textMuted;
  switch (icon) {
    case "globe":
      return <Globe size={21} color={color} />;
    case "filter":
      return <Filter size={21} color={color} />;
    case "brain":
      return <Brain size={21} color={color} />;
    case "trophy":
      return <Trophy size={21} color={color} />;
  }
}

export default function HuntScreen() {
  const router = useRouter();
  const { activeProfile, selectedModel, availableModels, refreshTelemetry } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [stage, setStage] = useState<HuntStage>("config");
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
  const highestPhaseRef = useRef<number>(0);

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
    highestPhaseRef.current = 0;
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
    setStage("progress");

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
          const nextPhase = statusToPhaseIndex(runUpdate.status);
          if (nextPhase > highestPhaseRef.current) {
            highestPhaseRef.current = nextPhase;
          }
          setActiveRun((prev) => ({ ...(prev || {}), ...runUpdate }));
        },
        onComplete: (result) => {
          highestPhaseRef.current = 5;
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
          setActiveRun((prev) => ({
            ...(prev || {}),
            status: "failed",
            status_detail: err.message,
          }));
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
      setActiveRun((prev) => ({
        ...(prev || {}),
        status: "failed",
        status_detail: msg,
      }));
      setHunting(false);
    }
  };

  const activeProfileName =
    activeProfile?.profile_name || activeProfile?.full_name || "Default CV";
  const allBoards = [...primaryBoards, ...regionalBoards];
  const boardSummary = formatBoardListSummary(selectedPlatforms, allBoards);
  const totalScraped = activeRun?.total_scraped || 0;
  const progressPct = Math.max(0, Math.min(100, Math.round(activeRun?.progress_pct || 0)));
  const isCompleted = activeRun?.status === "completed";
  const isFailed = activeRun?.status === "failed";

  // Map live SSE backend run state into 4 sequential UI step states
  const currentPhase = isFailed
    ? Math.max(1, highestPhaseRef.current)
    : statusToPhaseIndex(activeRun?.status);

  const resolveStepState = (stepNumber: number): StepVisualState => {
    if (isCompleted) return "done";
    if (isFailed) {
      if (stepNumber < currentPhase) return "done";
      if (stepNumber === currentPhase) return "failed";
      return "pending";
    }
    if (stepNumber === 1) {
      return currentPhase >= 2 ? "done" : "running";
    }
    if (currentPhase > stepNumber) return "done";
    if (currentPhase === stepNumber) return "running";
    return "pending";
  };

  const executionSteps: ExecutionStepItem[] = [
    {
      id: 1,
      icon: "globe",
      state: resolveStepState(1),
      kicker:
        resolveStepState(1) === "done"
          ? "Stage 1 • Scraped"
          : resolveStepState(1) === "failed"
            ? "Stage 1 • Stopped"
            : "Stage 1 • Harvesting",
      title: "Multi-Board JobSpy Scraping",
      subtitle:
        resolveStepState(1) === "done"
          ? `Harvested ${totalScraped > 0 ? totalScraped : requestedTopN} listings across ${boardSummary}`
          : resolveStepState(1) === "running"
            ? activeRun?.status_detail || `Scraping ${boardSummary}...`
            : "Waiting to harvest job boards",
    },
    {
      id: 2,
      icon: "filter",
      state: resolveStepState(2),
      kicker:
        resolveStepState(2) === "done"
          ? "Stage 2 • Verified"
          : resolveStepState(2) === "running"
            ? "Stage 2 • Cleaning"
            : resolveStepState(2) === "failed"
              ? "Stage 2 • Stopped"
              : "Stage 2 • Queued",
      title: "Deduplication & Normalization",
      subtitle:
        resolveStepState(2) === "done"
          ? `Cleaned and verified ${totalScraped > 0 ? `${totalScraped} unique` : "scraped"} job descriptions`
          : resolveStepState(2) === "running"
            ? activeRun?.status_detail || "Deduplicating & normalizing postings..."
            : "Deduplicates cross-board listings & metadata",
    },
    {
      id: 3,
      icon: "brain",
      state: resolveStepState(3),
      kicker:
        resolveStepState(3) === "done"
          ? "Stage 3 • Scored"
          : resolveStepState(3) === "running"
            ? "Stage 3 • Evaluating"
            : resolveStepState(3) === "failed"
              ? "Stage 3 • Stopped"
              : "Stage 3 • Queued",
      title: "Role Match & ATS Scoring",
      subtitle:
        resolveStepState(3) === "done"
          ? "Evaluated Overall Fit, Skills, Experience & ATS (batches of 10)"
          : resolveStepState(3) === "running"
            ? activeRun?.status_detail || `Scoring roles with ${resolveModelDisplayName(selectedModel, availableModels)}...`
            : `Evaluates Overall Fit, Skills, Experience & ATS`,
    },
    {
      id: 4,
      icon: "trophy",
      state: resolveStepState(4),
      kicker:
        resolveStepState(4) === "done"
          ? "Stage 4 • Ranked"
          : resolveStepState(4) === "running"
            ? "Stage 4 • Selecting"
            : resolveStepState(4) === "failed"
              ? "Stage 4 • Stopped"
              : "Stage 4 • Queued",
      title: `Ranking Top ${requestedTopN} Matches`,
      subtitle:
        resolveStepState(4) === "done"
          ? `Sorted top ${rankedJobs.length > 0 ? rankedJobs.length : requestedTopN} highest-fit roles for ${activeProfileName}`
          : resolveStepState(4) === "running"
            ? activeRun?.status_detail || `Persisting top ${requestedTopN} ranked matches...`
            : `Selects top ${requestedTopN} roles tailored to ${activeProfileName}`,
    },
  ];

  return (
    <SafeAreaView edges={["top"]} style={styles.screenRoot}>
      <OnboardingAmbientGlow />

      {/* ================================================================ */}
      {/* SCREEN 1: HUNT CONFIGURATION                                      */}
      {/* ================================================================ */}
      {stage === "config" ? (
        <View style={styles.stageContainer}>
          <View style={styles.headerBar}>
            <Text style={[styles.headerTitle, WEB_SANS]}>JobSpy Hunter</Text>
            <View style={styles.headerRightActions}>
              <ThemeToggleButton size="compact" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Home"
                onPress={() => router.replace("/home")}
                style={({ pressed }) => [
                  styles.headerPillBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Home size={14} color={colors.textPrimary} />
                <Text style={[styles.headerPillText, WEB_SANS]}>Home</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.flexScroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Active Context Banner */}
            <View style={styles.contextBar}>
              <View style={styles.contextItem}>
                <View style={styles.profileDotWrap}>
                  <UserCheck size={14} color={colors.emerald} />
                </View>
                <Text style={[styles.contextText, WEB_SANS]} numberOfLines={1}>
                  {activeProfileName}
                </Text>
              </View>
              <View style={styles.modelPill}>
                <Text style={[styles.modelPillText, WEB_SANS]} numberOfLines={1}>
                  {resolveModelDisplayName(selectedModel, availableModels)}
                </Text>
              </View>
            </View>

            {/* Configuration Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Radar size={18} color={colors.indigo} />
                <Text style={[styles.cardTitle, WEB_SANS]}>
                  Multi-Board JobSpy Configuration
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, WEB_SANS]}>Job Title / Role Query *</Text>
                <View style={styles.inputRow}>
                  <Briefcase size={15} color={colors.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="e.g. Senior Data Analyst, Analytics Engineer"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, WEB_SANS]}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, WEB_SANS]}>Location</Text>
                <View style={styles.inputRow}>
                  <MapPin size={15} color={colors.textMuted} />
                  <TextInput
                    value={location}
                    onChangeText={setLocation}
                    placeholder="e.g. London, UK or Remote"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, WEB_SANS]}
                  />
                </View>
              </View>

              {/* Radius */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, WEB_SANS]}>Search Radius</Text>
                <View style={styles.chipRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setRadius(r)}
                      style={[styles.chip, radius === r && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          WEB_SANS,
                          radius === r && styles.chipTextActive,
                        ]}
                      >
                        {r} mi
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Work Type */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, WEB_SANS]}>Work Type</Text>
                <View style={styles.chipRow}>
                  {WORK_TYPES.map((wt) => (
                    <Pressable
                      key={wt}
                      onPress={() => setWorkType(wt)}
                      style={[styles.chip, workType === wt && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          WEB_SANS,
                          workType === wt && styles.chipTextActive,
                        ]}
                      >
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
                    <Clock size={13} color={colors.amber} />
                    <Text style={[styles.label, WEB_SANS]}>Posting Recency</Text>
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
                          WEB_SANS,
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
                    <SlidersHorizontal size={13} color={colors.purple} />
                    <Text style={[styles.label, WEB_SANS]}>Top Ranked Results (N)</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setRequestedTopN((n) => Math.max(1, n - 1))}
                      style={styles.stepBtn}
                    >
                      <Minus size={13} color={colors.textPrimary} />
                    </Pressable>
                    <Text style={[styles.stepVal, WEB_SANS]}>{requestedTopN}</Text>
                    <Pressable
                      onPress={() => setRequestedTopN((n) => Math.min(50, n + 1))}
                      style={styles.stepBtn}
                    >
                      <Plus size={13} color={colors.textPrimary} />
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
                        style={[
                          styles.chipText,
                          WEB_SANS,
                          requestedTopN === n && styles.chipTextActive,
                        ]}
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
                    <Globe size={13} color={colors.cyan} />
                    <Text style={[styles.label, WEB_SANS]}>
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
                        {active ? <AuthButtonGradient /> : null}
                        <Text
                          style={[
                            styles.chipText,
                            WEB_SANS,
                            styles.boardChipLabel,
                            active && styles.boardChipTextActive,
                          ]}
                        >
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
                  <Text style={[styles.regionalToggleText, WEB_SANS]}>
                    Regional JobSpy Boards (Bayt, Naukri, BDJobs)
                  </Text>
                  {showRegional ? (
                    <ChevronUp size={15} color={colors.textSecondary} />
                  ) : (
                    <ChevronDown size={15} color={colors.textSecondary} />
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
                          style={[styles.boardChip, active && styles.boardChipActive]}
                        >
                          {active ? <AuthButtonGradient /> : null}
                          <Text
                            style={[
                              styles.chipText,
                              WEB_SANS,
                              styles.boardChipLabel,
                              active && styles.boardChipTextActive,
                            ]}
                          >
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
                  <Text style={[styles.errorText, WEB_SANS]}>{error}</Text>
                </View>
              ) : null}

              {/* Vibrant Gradient Hunt CTA */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hunt Top ${requestedTopN} Matches`}
                onPress={handleStartHunt}
                disabled={hunting}
                style={({ pressed }) => [
                  styles.gradientCta,
                  hunting && { opacity: 0.7 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <AuthButtonGradient />
                <View style={styles.gradientCtaInner}>
                  {hunting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Radar size={18} color="#FFFFFF" />
                  )}
                  <Text style={[styles.gradientCtaText, WEB_SANS]}>
                    {hunting ? "Starting JobSpy Hunt..." : `Hunt Top ${requestedTopN} Matches`}
                  </Text>
                </View>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* ================================================================ */}
      {/* SCREEN 2: LIVE EXECUTION STEPS                                   */}
      {/* ================================================================ */}
      {stage === "progress" ? (
        <View style={styles.stageContainer}>
          <View style={styles.headerBar}>
            <View style={styles.headerLeftGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to hunt configuration"
                onPress={() => setStage("config")}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
              >
                <ArrowLeft size={20} color={colors.textPrimary} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, WEB_SANS]}>Job Hunt Progress</Text>
                <Text style={[styles.headerSubtitle, WEB_SANS]} numberOfLines={1}>
                  {query.trim() || "Job Hunt"} • {location.trim() || "Remote"}
                </Text>
              </View>
            </View>
            <View style={styles.headerRightActions}>
              <ThemeToggleButton size="compact" />
            </View>
          </View>

          <ScrollView
            style={styles.flexScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Progress Summary Card */}
            <View style={[styles.summaryCard, isFailed && styles.summaryCardFailed]}>
              <View style={styles.summaryTopRow}>
                <Text style={[styles.summaryHeadline, WEB_SANS]}>
                  {isFailed ? `Hunt Failed` : `${progressPct}% Complete`}
                  {totalScraped > 0 ? (
                    <Text style={styles.summarySubCount}>
                      {` • ${totalScraped} jobs harvested`}
                    </Text>
                  ) : null}
                </Text>
                {!isCompleted && !isFailed ? (
                  <ActivityIndicator size="small" color={colors.cyan} />
                ) : null}
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressBarWrap, { width: `${progressPct}%` }]}>
                  <ProgressGradientFill failed={isFailed} />
                </View>
              </View>
            </View>

            {/* 4 Vertical Step Cards */}
            <View style={styles.stepsStack}>
              {executionSteps.map((step) => {
                const isDone = step.state === "done";
                const isRunning = step.state === "running";
                const isStepFailed = step.state === "failed";

                return (
                  <View
                    key={step.id}
                    style={[
                      styles.stepCard,
                      isDone && styles.stepCardDone,
                      isRunning && styles.stepCardRunning,
                      isStepFailed && styles.stepCardFailed,
                    ]}
                  >
                    <View
                      style={[
                        styles.stepIconRing,
                        isDone && styles.stepIconRingDone,
                        isRunning && styles.stepIconRingRunning,
                        isStepFailed && styles.stepIconRingFailed,
                      ]}
                    >
                      <StepIcon icon={step.icon} state={step.state} />
                    </View>

                    <View style={styles.stepBody}>
                      <View style={styles.stepTopRow}>
                        <Text
                          style={[
                            styles.stepKicker,
                            WEB_SANS,
                            isDone && styles.stepKickerDone,
                            isRunning && styles.stepKickerRunning,
                            isStepFailed && styles.stepKickerFailed,
                          ]}
                        >
                          {step.kicker}
                        </Text>

                        <View
                          style={[
                            styles.stepStatusPill,
                            isDone && styles.stepStatusPillDone,
                            isRunning && styles.stepStatusPillRunning,
                            isStepFailed && styles.stepStatusPillFailed,
                          ]}
                        >
                          {isDone ? (
                            <>
                              <Check size={11} color={colors.emeraldText} />
                              <Text style={[styles.stepStatusTextDone, WEB_SANS]}>Done</Text>
                            </>
                          ) : isRunning ? (
                            <>
                              <ActivityIndicator size={10} color={colors.cyanText} />
                              <Text style={[styles.stepStatusTextRunning, WEB_SANS]}>
                                Running
                              </Text>
                            </>
                          ) : isStepFailed ? (
                            <Text style={[styles.stepStatusTextFailed, WEB_SANS]}>
                              Failed
                            </Text>
                          ) : (
                            <Text style={[styles.stepStatusTextPending, WEB_SANS]}>
                              Queued
                            </Text>
                          )}
                        </View>
                      </View>

                      <Text style={[styles.stepTitle, WEB_SANS]}>{step.title}</Text>
                      <Text style={[styles.stepSubtitle, WEB_SANS]} numberOfLines={2}>
                        {step.subtitle}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Non-blocking Rate-Limit / Partial Board Warnings */}
            {Array.isArray(activeRun?.warnings) && activeRun.warnings.length > 0 ? (
              <View style={styles.warningBanner}>
                <AlertTriangle size={15} color={colors.amberText} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.warningTitle, WEB_SANS]}>Partial Board Warning</Text>
                  {activeRun.warnings.map((warn, idx) => (
                    <Text key={idx} style={[styles.warningBody, WEB_SANS]}>
                      • {warn}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Failure Recovery */}
            {isFailed || error ? (
              <View style={styles.failureBox}>
                <Text style={[styles.errorText, WEB_SANS]}>
                  {error || activeRun?.status_detail || "JobSpy hunt failed."}
                </Text>
                <View style={styles.failureActions}>
                  <Pressable
                    onPress={() => setStage("config")}
                    style={styles.secondaryOutlineBtn}
                  >
                    <Text style={[styles.secondaryOutlineText, WEB_SANS]}>
                      Edit Search Config
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleStartHunt} style={styles.retryBtn}>
                    <Text style={[styles.retryBtnText, WEB_SANS]}>Retry Hunt</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Show Results CTA reveals ONLY once hunt finishes */}
            {isCompleted ? (
              <View style={styles.completionActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show Results"
                  onPress={() => setStage("results")}
                  style={({ pressed }) => [
                    styles.showResultsCta,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <AuthButtonGradient />
                  <View style={styles.gradientCtaInner}>
                    <Text style={[styles.gradientCtaText, WEB_SANS]}>Show Results</Text>
                    <ArrowRight size={18} color="#FFFFFF" />
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit Search Config"
                  onPress={() => setStage("config")}
                  style={({ pressed }) => [
                    styles.editConfigLink,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.editConfigLinkText, WEB_SANS]}>
                    Edit Search Config
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {/* ================================================================ */}
      {/* SCREEN 3: RANKED RESULTS                                         */}
      {/* ================================================================ */}
      {stage === "results" ? (
        <View style={styles.stageContainer}>
          <View style={styles.headerBar}>
            <View style={styles.headerLeftGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to hunt progress"
                onPress={() => setStage("progress")}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
              >
                <ArrowLeft size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.headerTitle, WEB_SANS]}>
                Top {rankedJobs.length || requestedTopN} Matches
              </Text>
            </View>

            <View style={styles.headerRightActions}>
              <ThemeToggleButton size="compact" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New Hunt"
                onPress={() => setStage("config")}
                style={({ pressed }) => [
                  styles.headerPillBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[styles.headerPillText, WEB_SANS]}>New Hunt</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.flexScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Emerald Results Banner */}
            <View style={styles.resultsBanner}>
              <Text style={[styles.resultsBannerTitle, WEB_SANS]}>
                Ranked Job Results
              </Text>
              <Text style={[styles.resultsBannerSub, WEB_SANS]}>
                Ranked top {rankedJobs.length} of{" "}
                {totalScraped > 0 ? totalScraped : rankedJobs.length} scraped jobs
              </Text>
            </View>

            {rankedJobs.length === 0 ? (
              <View style={styles.emptyResultsCard}>
                <Text style={[styles.emptyResultsTitle, WEB_SANS]}>
                  No ranked jobs returned
                </Text>
                <Text style={[styles.emptyResultsSub, WEB_SANS]}>
                  Try widening your search radius, recency window, or job boards.
                </Text>
                <Pressable
                  onPress={() => setStage("config")}
                  style={styles.secondaryOutlineBtn}
                >
                  <Text style={[styles.secondaryOutlineText, WEB_SANS]}>
                    Edit Search Config
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.resultsList}>
                {rankedJobs.map((job) => {
                  const scoreItems = [
                    { label: "Overall Fit", score: job.overall_fit_score },
                    { label: "Skills", score: job.skills_match_score },
                    { label: "Experience", score: job.experience_fit_score },
                    { label: "ATS", score: job.ats_keyword_score },
                  ];

                  return (
                    <Pressable
                      key={job.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/job/${job.id}`)}
                      style={({ pressed }) => [
                        styles.jobCard,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <View style={styles.jobHeader}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.jobTitle, WEB_SANS]} numberOfLines={1}>
                            {job.title}
                          </Text>
                          <Text style={[styles.jobCompany, WEB_SANS]} numberOfLines={1}>
                            {job.company}
                            {job.location ? ` • ${job.location}` : ""}
                          </Text>
                        </View>
                        <View style={styles.platformBadge}>
                          <Text style={[styles.platformBadgeText, WEB_SANS]}>
                            {(job.source_platform || "jobspy").toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.jobMiddleRow}>
                        <View style={styles.jobMiddleLeft}>
                          <View style={styles.salaryRow}>
                            <DollarSign size={13} color={colors.emeraldText} />
                            <Text style={[styles.salaryText, WEB_SANS]}>
                              {job.salary || "Salary not listed"}
                            </Text>
                          </View>

                          <Text
                            style={[styles.jobDescSnippet, WEB_SANS]}
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            {cleanMarkdownSnippet(job.description)}
                          </Text>
                        </View>
                        <ChevronRight size={17} color={colors.textMuted} />
                      </View>

                      {/* 4 Equal-Width Score Cards */}
                      <View style={styles.scoresGrid}>
                        {scoreItems.map((item) => {
                          const theme = getScoreTheme(item.score, colors);
                          const rounded = Math.max(
                            0,
                            Math.min(100, Math.round(item.score || 0))
                          );
                          return (
                            <View
                              key={item.label}
                              style={[
                                styles.scoreBox,
                                {
                                  backgroundColor: theme.softBg,
                                  borderColor: theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.scoreBoxLabel, WEB_SANS]}
                                numberOfLines={1}
                              >
                                {item.label}
                              </Text>
                              <Text
                                style={[
                                  styles.scoreBoxValue,
                                  WEB_SANS,
                                  { color: theme.textColor },
                                ]}
                              >
                                {rounded}%
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const cardElevation = getCardElevation(isDark);
  return StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.authBg,
    },
    stageContainer: {
      flex: 1,
    },
    flexScroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 28,
      gap: 13,
    },
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 12,
    },
    headerLeftGroup: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerRightActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    backBtn: {
      width: 28,
      height: 32,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      color: colors.textSecondary,
      fontSize: 12.5,
      marginTop: 1,
    },
    headerPillBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.headerBtnBg,
      borderWidth: 1,
      borderColor: colors.headerBtnBorder,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
      ...cardElevation,
    },
    headerPillText: {
      color: colors.textPrimary,
      fontSize: 12.5,
      fontWeight: "600",
    },
    contextBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 8,
      ...cardElevation,
    },
    contextItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    profileDotWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    contextText: {
      color: colors.textPrimary,
      fontSize: 13.5,
      fontWeight: "600",
      flex: 1,
    },
    modelPill: {
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      maxWidth: 170,
    },
    modelPillText: {
      color: colors.purpleText,
      fontSize: 11,
      fontWeight: "700",
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 14,
      gap: 11,
      ...cardElevation,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 15.5,
      fontWeight: "700",
    },
    fieldGroup: {
      gap: 6,
    },
    rowBetween: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    labelIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
    },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6.5,
      borderRadius: 999,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.indigoSoft,
      borderColor: colors.indigoBorder,
    },
    chipText: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontWeight: "600",
    },
    chipTextActive: {
      color: colors.indigoText,
      fontWeight: "700",
    },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    stepBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
    stepVal: {
      color: colors.textPrimary,
      fontSize: 13.5,
      fontWeight: "800",
      minWidth: 20,
      textAlign: "center",
    },
    boardChip: {
      overflow: "hidden",
      position: "relative",
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    boardChipActive: {
      borderColor: colors.purpleBorder,
    },
    boardChipLabel: {
      position: "relative",
      zIndex: 2,
    },
    boardChipTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    regionalToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 2,
    },
    regionalToggleText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    errorBanner: {
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
      borderRadius: 10,
      padding: 10,
    },
    errorText: {
      color: colors.roseText,
      fontSize: 12.5,
    },
    gradientCta: {
      height: 50,
      borderRadius: 15,
      overflow: "hidden",
      position: "relative",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 2,
    },
    gradientCtaInner: {
      position: "relative",
      zIndex: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    gradientCtaText: {
      color: "#FFFFFF",
      fontSize: 15.5,
      fontWeight: "800",
    },

    /* Screen 2: Progress */
    summaryCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cyanBorder,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      ...cardElevation,
    },
    summaryCardFailed: {
      borderColor: colors.roseBorder,
    },
    summaryTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    summaryHeadline: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      flex: 1,
    },
    summarySubCount: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.border,
      overflow: "hidden",
    },
    progressBarWrap: {
      height: "100%",
      borderRadius: 999,
      overflow: "hidden",
      minWidth: 10,
    },
    stepsStack: {
      gap: 11,
    },
    stepCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      ...cardElevation,
    },
    stepCardDone: {
      backgroundColor: isDark ? "rgba(11, 36, 38, 0.90)" : colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
    },
    stepCardRunning: {
      backgroundColor: isDark ? "rgba(12, 30, 50, 0.94)" : colors.cyanSoft,
      borderColor: colors.cyanBorder,
    },
    stepCardFailed: {
      backgroundColor: isDark ? "rgba(46, 16, 28, 0.90)" : colors.roseSoft,
      borderColor: colors.roseBorder,
    },
    stepIconRing: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepIconRingDone: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
    },
    stepIconRingRunning: {
      backgroundColor: colors.cyanSoft,
      borderColor: colors.cyanBorder,
    },
    stepIconRingFailed: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
    },
    stepBody: {
      flex: 1,
      gap: 3,
    },
    stepTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    stepKicker: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    stepKickerDone: {
      color: colors.emeraldText,
    },
    stepKickerRunning: {
      color: colors.cyanText,
    },
    stepKickerFailed: {
      color: colors.roseText,
    },
    stepStatusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepStatusPillDone: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
    },
    stepStatusPillRunning: {
      backgroundColor: colors.cyanSoft,
      borderColor: colors.cyanBorder,
    },
    stepStatusPillFailed: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
    },
    stepStatusTextDone: {
      color: colors.emeraldText,
      fontSize: 10.5,
      fontWeight: "700",
    },
    stepStatusTextRunning: {
      color: colors.cyanText,
      fontSize: 10.5,
      fontWeight: "700",
    },
    stepStatusTextFailed: {
      color: colors.roseText,
      fontSize: 10.5,
      fontWeight: "700",
    },
    stepStatusTextPending: {
      color: colors.textMuted,
      fontSize: 10.5,
      fontWeight: "600",
    },
    stepTitle: {
      color: colors.textPrimary,
      fontSize: 14.5,
      fontWeight: "700",
    },
    stepSubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 16.5,
    },
    warningBanner: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: colors.amberBorder,
      borderRadius: 12,
      padding: 11,
    },
    warningTitle: {
      color: colors.amberText,
      fontSize: 12,
      fontWeight: "700",
    },
    warningBody: {
      color: colors.amberText,
      fontSize: 11.5,
      lineHeight: 16,
    },
    failureBox: {
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    failureActions: {
      flexDirection: "row",
      gap: 10,
    },
    secondaryOutlineBtn: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.headerBtnBg,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: "center",
    },
    secondaryOutlineText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
    retryBtn: {
      flex: 1,
      borderRadius: 999,
      backgroundColor: colors.indigo,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: "center",
    },
    retryBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    completionActions: {
      marginTop: 6,
      gap: 10,
      alignItems: "center",
    },
    showResultsCta: {
      width: "100%",
      height: 50,
      borderRadius: 999,
      overflow: "hidden",
      position: "relative",
      justifyContent: "center",
      alignItems: "center",
    },
    editConfigLink: {
      paddingVertical: 4,
      paddingHorizontal: 12,
    },
    editConfigLinkText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
      textDecorationLine: "underline",
    },

    /* Screen 3: Results */
    resultsBanner: {
      backgroundColor: isDark ? "rgba(11, 42, 36, 0.88)" : colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
      borderRadius: 15,
      paddingHorizontal: 15,
      paddingVertical: 12,
      gap: 2,
      ...cardElevation,
    },
    resultsBannerTitle: {
      color: colors.textPrimary,
      fontSize: 15.5,
      fontWeight: "800",
    },
    resultsBannerSub: {
      color: colors.emeraldText,
      fontSize: 12.5,
      fontWeight: "600",
    },
    emptyResultsCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 20,
      alignItems: "center",
      gap: 10,
      ...cardElevation,
    },
    emptyResultsTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    emptyResultsSub: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: "center",
    },
    resultsList: {
      gap: 11,
    },
    jobCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      gap: 9,
      ...cardElevation,
    },
    jobHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    jobTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    jobCompany: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    platformBadge: {
      backgroundColor: colors.cyanSoft,
      borderWidth: 1,
      borderColor: colors.cyanBorder,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    platformBadgeText: {
      color: colors.cyanText,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    jobMiddleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    jobMiddleLeft: {
      flex: 1,
      gap: 5,
    },
    salaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    salaryText: {
      color: colors.emeraldText,
      fontSize: 12.5,
      fontWeight: "600",
    },
    jobDescSnippet: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    scoresGrid: {
      flexDirection: "row",
      gap: 6,
      marginTop: 2,
    },
    scoreBox: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
    },
    scoreBoxLabel: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: "600",
    },
    scoreBoxValue: {
      fontSize: 13.5,
      fontWeight: "800",
    },
  });
}
