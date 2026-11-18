import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  AlertTriangle,
  ArrowLeft,
  Cpu,
  RotateCcw,
  Sliders,
  Sparkles,
  Wand2,
} from "lucide-react-native";
import {
  AuthButtonGradient,
  OnboardingAmbientGlow,
  WEB_SANS,
} from "../src/components/OnboardingGraphics";
import { COLORS } from "../src/constants/theme";
import { useAuth } from "../src/context/AuthContext";
import { apiClient, ApiError } from "../src/lib/api";
import { resolveModelDisplayName } from "../src/lib/profileHelpers";
import {
  MINIMUM_TAILOR_WAIT_MS,
  TAILOR_WITTY_MESSAGES,
  abortActiveTailorRun,
  clearPendingTailorRequest,
  executeWithMinimumDelay,
  getOrStartTailorRun,
  getPendingTailorRequest,
  isAbortError,
  resetActiveTailorRun,
  type PendingTailorRequest,
} from "../src/lib/tailorSession";

type TailorScreenStatus = "waiting" | "error" | "missing";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

function formatTargetSubtitle(request: PendingTailorRequest): string {
  const title = request.jobTitle.trim();
  const company = request.company.trim();
  if (title && company) return `${title} • ${company}`;
  if (title) return title;
  if (company) return `Target: ${company}`;
  return "Custom Job Description";
}

function OrbitalRingSvg({
  size,
  strokeWidth,
  dashArray,
  startColor,
  endColor,
  dotColor,
}: {
  size: number;
  strokeWidth: number;
  dashArray: string;
  startColor: string;
  endColor: string;
  dotColor: string;
}) {
  const rawId = useId();
  const gradId = `orbital-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const center = size / 2;
  const radius = center - strokeWidth - 5;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={startColor} stopOpacity="0.95" />
          <Stop offset="100%" stopColor={endColor} stopOpacity="0.25" />
        </LinearGradient>
      </Defs>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
      <Circle cx={center} cy={center - radius} r={4} fill={dotColor} />
    </Svg>
  );
}

export default function TailoringScreen() {
  const router = useRouter();
  const { availableModels, refreshTelemetry } = useAuth();

  const [request] = useState<PendingTailorRequest | null>(() =>
    getPendingTailorRequest()
  );
  const [status, setStatus] = useState<TailorScreenStatus>(() =>
    getPendingTailorRequest() ? "waiting" : "missing"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quipIndex, setQuipIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const counterSpinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const quipOpacity = useRef(new Animated.Value(1)).current;

  // Execute tailoring request with minimum delay and StrictMode-safe run deduplication
  useEffect(() => {
    if (!request) {
      setStatus("missing");
      return;
    }

    let isActive = true;
    setStatus("waiting");
    setErrorMessage(null);
    progressAnim.setValue(0);

    const progressTiming = Animated.timing(progressAnim, {
      toValue: 0.88,
      duration: MINIMUM_TAILOR_WAIT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    progressTiming.start();

    const run = getOrStartTailorRun(request, (signal) =>
      executeWithMinimumDelay(
        () =>
          request.source === "studio"
            ? apiClient.tailorStudio(request.payload, { signal })
            : apiClient.tailorJob(request.jobId, request.payload, { signal }),
        MINIMUM_TAILOR_WAIT_MS,
        signal
      )
    );

    run.promise.then(
      async (output) => {
        if (!isActive || run.controller.signal.aborted) return;

        progressTiming.stop();
        await Promise.all([
          refreshTelemetry().catch(() => {}),
          new Promise<void>((resolve) => {
            Animated.timing(progressAnim, {
              toValue: 1,
              duration: 240,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }).start(() => resolve());
          }),
        ]);

        if (!isActive || run.controller.signal.aborted) return;
        clearPendingTailorRequest();
        router.replace(`/output/${output.id}`);
      },
      (err) => {
        if (!isActive || run.controller.signal.aborted || isAbortError(err)) {
          return;
        }
        progressTiming.stop();
        progressAnim.stopAnimation();
        setErrorMessage(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to generate tailored application."
        );
        setStatus("error");
      }
    );

    return () => {
      isActive = false;
      progressTiming.stop();
      progressAnim.stopAnimation();
      run.scheduleUnmountAbort();
    };
  }, [request, attempt, progressAnim, refreshTelemetry, router]);

  // Orbital rings + pulsing radial core animation loops
  useEffect(() => {
    if (status !== "waiting") return;

    pulseAnim.setValue(0);
    spinAnim.setValue(0);
    counterSpinAnim.setValue(0);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );

    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );

    const counterSpinLoop = Animated.loop(
      Animated.timing(counterSpinAnim, {
        toValue: 1,
        duration: 7600,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );

    pulseLoop.start();
    spinLoop.start();
    counterSpinLoop.start();

    return () => {
      pulseLoop.stop();
      spinLoop.stop();
      counterSpinLoop.stop();
    };
  }, [status, pulseAnim, spinAnim, counterSpinAnim]);

  // Rotating funny Claude-style status quips every ~2.5s
  useEffect(() => {
    if (status !== "waiting") return;

    let active = true;
    quipOpacity.setValue(1);

    const interval = setInterval(() => {
      Animated.timing(quipOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (!active || !finished) return;
        setQuipIndex((prev) => (prev + 1) % TAILOR_WITTY_MESSAGES.length);
        Animated.timing(quipOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.in(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      });
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
      quipOpacity.stopAnimation();
    };
  }, [status, quipOpacity]);

  const handleCancel = () => {
    abortActiveTailorRun();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/home");
    }
  };

  const handleGoBack = () => {
    clearPendingTailorRequest();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/home");
    }
  };

  const handleRetry = () => {
    resetActiveTailorRun();
    setQuipIndex((prev) => (prev + 1) % TAILOR_WITTY_MESSAGES.length);
    setAttempt((prev) => prev + 1);
  };

  const subtitle = useMemo(
    () => (request ? formatTargetSubtitle(request) : ""),
    [request]
  );

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const counterSpinInterpolate = counterSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["360deg", "0deg"],
  });

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.14],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0.72],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const progressGradId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <View style={styles.root}>
      <OnboardingAmbientGlow strong />
      <SafeAreaView style={styles.safeArea}>
        {/* Top-left subtle Cancel / Back button */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status === "waiting" ? "Cancel tailoring" : "Go back"}
            onPress={status === "waiting" ? handleCancel : handleGoBack}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.75 }]}
          >
            <ArrowLeft size={16} color={COLORS.textSecondary} />
            <Text style={[styles.cancelText, WEB_SANS]}>
              {status === "waiting" ? "Cancel" : "Back"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {status === "missing" ? (
            <View style={styles.card}>
              <View style={styles.warningIconBadge}>
                <AlertTriangle size={24} color={COLORS.amber} />
              </View>
              <Text style={[styles.cardTitle, WEB_SANS]}>
                No Active Tailoring Session
              </Text>
              <Text style={[styles.cardBody, WEB_SANS]}>
                Start a tailoring run from Instant Tailor Studio or any Job Match
                Analysis screen to generate your customized CV and Cover Letter.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go Back"
                onPress={handleGoBack}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <AuthButtonGradient />
                <Text style={[styles.primaryBtnText, WEB_SANS]}>Go Back</Text>
              </Pressable>
            </View>
          ) : status === "error" ? (
            <View style={[styles.card, styles.errorCard]}>
              <View style={styles.errorIconBadge}>
                <AlertTriangle size={24} color="#FDA4AF" />
              </View>
              <Text style={[styles.cardTitle, WEB_SANS]}>Tailoring Interrupted</Text>
              {subtitle ? (
                <Text style={[styles.errorSubtitle, WEB_SANS]}>{subtitle}</Text>
              ) : null}
              <View style={styles.errorMsgBox}>
                <Text style={[styles.errorMsgText, WEB_SANS]}>
                  {errorMessage || "An unexpected error occurred while tailoring."}
                </Text>
              </View>
              <View style={styles.errorActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry Tailoring"
                  onPress={handleRetry}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <AuthButtonGradient />
                  <View style={styles.btnInner}>
                    <RotateCcw size={16} color="#FFFFFF" />
                    <Text style={[styles.primaryBtnText, WEB_SANS]}>
                      Retry Tailoring
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go Back"
                  onPress={handleGoBack}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.secondaryBtnText, WEB_SANS]}>Go Back</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.waitingWrap}>
              {/* Animated Orbital + Pulsing Core Graphic */}
              <View style={styles.orbitalStage}>
                <Animated.View
                  style={[
                    styles.pulseHalo,
                    {
                      opacity: pulseOpacity,
                      transform: [{ scale: pulseScale }],
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.orbitalLayer,
                    { transform: [{ rotate: spinInterpolate }] },
                  ]}
                >
                  <OrbitalRingSvg
                    size={156}
                    strokeWidth={2.2}
                    dashArray="84 26 24 22"
                    startColor="#818CF8"
                    endColor="#A855F7"
                    dotColor="#C4B5FD"
                  />
                </Animated.View>

                <Animated.View
                  style={[
                    styles.orbitalLayer,
                    { transform: [{ rotate: counterSpinInterpolate }] },
                  ]}
                >
                  <OrbitalRingSvg
                    size={114}
                    strokeWidth={1.8}
                    dashArray="52 24 14 20"
                    startColor="#38BDF8"
                    endColor="#6366F1"
                    dotColor="#67E8F9"
                  />
                </Animated.View>

                <View style={styles.coreBadge}>
                  <Sparkles size={28} color="#E9D5FF" />
                  <View style={styles.coreMiniWand}>
                    <Wand2 size={12} color="#67E8F9" />
                  </View>
                </View>
              </View>

              {/* Main Heading */}
              <Text style={[styles.mainTitle, WEB_SANS]}>
                Tailoring Your Application...
              </Text>

              {/* Target Role / Company Subtitle */}
              <Text style={[styles.targetSubtitle, WEB_SANS]} numberOfLines={2}>
                {subtitle}
              </Text>

              {/* Model + Tone Pills */}
              {request ? (
                <View style={styles.pillsRow}>
                  <View style={styles.modelPill}>
                    <Cpu size={12} color="#E9D5FF" />
                    <Text style={[styles.modelPillText, WEB_SANS]}>
                      {resolveModelDisplayName(request.model, availableModels)}
                    </Text>
                  </View>
                  <View style={styles.tonePill}>
                    <Sliders size={12} color="#C7D2FE" />
                    <Text style={[styles.tonePillText, WEB_SANS]}>
                      {request.tone}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Progress Card */}
              <View style={styles.progressCard}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[styles.progressFillWrap, { width: progressWidth }]}
                  >
                    <Svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 300 8"
                      preserveAspectRatio="none"
                    >
                      <Defs>
                        <LinearGradient
                          id={`bar-${progressGradId}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <Stop offset="0%" stopColor="#38BDF8" />
                          <Stop offset="50%" stopColor="#6366F1" />
                          <Stop offset="100%" stopColor="#A855F7" />
                        </LinearGradient>
                      </Defs>
                      <Rect
                        x="0"
                        y="0"
                        width="300"
                        height="8"
                        fill={`url(#bar-${progressGradId})`}
                      />
                    </Svg>
                  </Animated.View>
                </View>

                <Animated.View
                  style={[styles.quipBox, { opacity: quipOpacity }]}
                >
                  <Text style={[styles.quipText, WEB_SANS]}>
                    {TAILOR_WITTY_MESSAGES[quipIndex]}
                  </Text>
                </Animated.View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  cancelText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingBottom: 42,
  },
  waitingWrap: {
    alignItems: "center",
    gap: 16,
  },
  orbitalStage: {
    width: 172,
    height: 172,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  pulseHalo: {
    position: "absolute",
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: "rgba(99, 102, 241, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.35)",
  },
  orbitalLayer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  coreBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#141A2E",
    borderWidth: 1.5,
    borderColor: "rgba(168, 85, 247, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 28px rgba(124, 93, 250, 0.45)",
        } as unknown as Record<string, string>)
      : {
          shadowColor: "#7C5DFA",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 16,
          elevation: 8,
        }),
  },
  coreMiniWand: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  targetSubtitle: {
    fontSize: 14.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modelPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#E9D5FF",
  },
  tonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
  },
  tonePillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#C7D2FE",
  },
  progressCard: {
    width: "100%",
    marginTop: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  progressFillWrap: {
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: COLORS.indigo,
  },
  quipBox: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  quipText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  errorCard: {
    borderColor: COLORS.roseBorder,
  },
  warningIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: COLORS.amberBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  errorIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  cardBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  errorMsgBox: {
    width: "100%",
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
    borderRadius: 10,
    padding: 12,
  },
  errorMsgText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#FDA4AF",
    fontWeight: "600",
    textAlign: "center",
  },
  errorActions: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  btnInner: {
    position: "relative",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    position: "relative",
    zIndex: 2,
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
});
