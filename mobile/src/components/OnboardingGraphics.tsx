import React, { useId } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { ArrowLeft } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";

export const WEB_SANS =
  Platform.OS === "web"
    ? {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", sans-serif',
      }
    : undefined;

function useSvgId(prefix: string, isDark?: boolean): string {
  const raw = useId();
  const modeSuffix = typeof isDark === "boolean" ? `-${isDark ? "d" : "l"}` : "";
  return `${prefix}${modeSuffix}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Full-bleed vibrant indigo-to-purple gradient background matching the mockup's primary CTA pills.
 * Uses a globally unique gradient ID so stacked Expo Router screens never collide in web DOM.
 */
export function AuthButtonGradient() {
  const { isDark } = useTheme();
  const gradId = useSvgId("btnGrad", isDark);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
      <Svg width="100%" height="100%" viewBox="0 0 345 50" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={isDark ? "#6366F1" : "#4F46E5"} />
            <Stop offset="50%" stopColor={isDark ? "#7C5DFA" : "#6366F1"} />
            <Stop offset="100%" stopColor={isDark ? "#9353F6" : "#7C3AED"} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="345" height="50" fill={`url(#${gradId})`} />
      </Svg>
    </View>
  );
}

/**
 * Frosted glass pill surface for the "Continue with Google" CTA in Dark and Light modes.
 */
export function GoogleButtonSurface() {
  const { isDark } = useTheme();
  const glassGradId = useSvgId("googleGlass", isDark);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
      <Svg width="100%" height="100%" viewBox="0 0 345 50" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={glassGradId} x1="25%" y1="0%" x2="75%" y2="100%">
            <Stop
              offset="0%"
              stopColor={isDark ? "#3B425C" : "#FFFFFF"}
              stopOpacity={isDark ? "0.82" : "1"}
            />
            <Stop
              offset={isDark ? "42%" : "55%"}
              stopColor={isDark ? "#1D2235" : "#F8FAFC"}
              stopOpacity={isDark ? "0.92" : "1"}
            />
            <Stop
              offset="100%"
              stopColor={isDark ? "#101423" : "#F1F5F9"}
              stopOpacity={isDark ? "0.98" : "1"}
            />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="345" height="50" fill={`url(#${glassGradId})`} />
      </Svg>
    </View>
  );
}

/**
 * Official 4-color Google "G" mark used inside the "Continue with Google" button.
 */
export function GoogleGIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, position: "relative", zIndex: 2 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <Path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <Path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          fill="#FBBC05"
        />
        <Path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </Svg>
    </View>
  );
}

/**
 * Ambient radial violet-indigo top glow used behind Screen 1 and subtle Step headers.
 */
export function OnboardingAmbientGlow({ strong = false }: { strong?: boolean }) {
  const { colors, isDark } = useTheme();
  const haloId = useSvgId(strong ? "haloStrong" : "haloSubtle", isDark);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 393 852"
        preserveAspectRatio="xMidYMin slice"
      >
        <Defs>
          <RadialGradient
            id={haloId}
            cx="196.5"
            cy={strong ? "150" : "100"}
            rx="195"
            ry={strong ? "175" : "150"}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0%"
              stopColor={colors.haloPrimary}
              stopOpacity={isDark ? (strong ? "0.62" : "0.28") : strong ? "0.22" : "0.14"}
            />
            <Stop
              offset="45%"
              stopColor={colors.haloSecondary}
              stopOpacity={isDark ? (strong ? "0.28" : "0.14") : strong ? "0.11" : "0.07"}
            />
            <Stop offset="100%" stopColor={colors.haloFade} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="393" height="420" fill={`url(#${haloId})`} />
      </Svg>
    </View>
  );
}

/**
 * Centered mobile phone container on wide desktop web + safe area wrapper.
 */
export function OnboardingScreenFrame({
  children,
  strongGlow = false,
}: {
  children: React.ReactNode;
  strongGlow?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center" style={{ backgroundColor: colors.authBg }}>
      <View className="flex-1 w-full max-w-[430px] relative overflow-hidden">
        <OnboardingAmbientGlow strong={strongGlow} />
        <SafeAreaView className="flex-1">{children}</SafeAreaView>
      </View>
    </View>
  );
}

/**
 * Luminous outlined briefcase + central 4-point sparkle for Screen 1 ("Hiring Agent").
 */
export function AuthHeroBriefcase({ size = 84 }: { size?: number }) {
  const { isDark } = useTheme();
  const strokeId = useSvgId("caseStroke", isDark);
  const fillId = useSvgId("caseFill", isDark);
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 88 74" fill="none">
      <Defs>
        <LinearGradient id={strokeId} x1="16" y1="12" x2="72" y2="62" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#818CF8" : "#4F46E5"} />
          <Stop offset="50%" stopColor={isDark ? "#A78BFA" : "#7C3AED"} />
          <Stop offset="100%" stopColor={isDark ? "#60A5FA" : "#0284C7"} />
        </LinearGradient>
        <LinearGradient id={fillId} x1="20" y1="18" x2="68" y2="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#6366F1" stopOpacity={isDark ? "0.22" : "0.14"} />
          <Stop offset="100%" stopColor="#9333EA" stopOpacity={isDark ? "0.14" : "0.08"} />
        </LinearGradient>
      </Defs>

      {/* Handle */}
      <Path
        d="M34 19V14.5C34 12.01 36.01 10 38.5 10H49.5C51.99 10 54 12.01 54 14.5V19"
        stroke={`url(#${strokeId})`}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Briefcase body */}
      <Rect
        x="15"
        y="19"
        width="58"
        height="43"
        rx="9"
        fill={`url(#${fillId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth={2.8}
      />

      {/* Curved upper flap */}
      <Path
        d="M15 31C15 38.5 23 41 44 41C65 41 73 38.5 73 31"
        stroke={`url(#${strokeId})`}
        strokeWidth={2.2}
        strokeOpacity="0.85"
        strokeLinecap="round"
      />

      {/* Center 4-point sparkle */}
      <Path
        d="M44 31C44.9 37.8 47.2 40.1 54 41C47.2 41.9 44.9 44.2 44 51C43.1 44.2 40.8 41.9 34 41C40.8 40.1 43.1 37.8 44 31Z"
        fill={isDark ? "#FFFFFF" : "#4F46E5"}
      />

      {/* Top accent sparkles */}
      <Path
        d="M17 9L17.9 12.1L21 13L17.9 13.9L17 17L16.1 13.9L13 13L16.1 12.1L17 9Z"
        fill={isDark ? "#E0E7FF" : "#4F46E5"}
      />
      <Path
        d="M25 6L25.5 7.8L27.3 8.3L25.5 8.8L25 10.6L24.5 8.8L22.7 8.3L24.5 7.8L25 6Z"
        fill={isDark ? "#C7D2FE" : "#7C3AED"}
        fillOpacity={isDark ? "0.8" : "0.75"}
      />
    </Svg>
  );
}

/**
 * Glowing document with sparkle icon for Step 2 left card ("Upload Existing PDF CV").
 */
export function UploadDocumentSparkIcon({ size = 56 }: { size?: number }) {
  const { isDark } = useTheme();
  const docGradId = useSvgId("docGrad", isDark);
  const lineColor = isDark ? "#C7D2FE" : "#4F46E5";
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Defs>
        <LinearGradient id={docGradId} x1="12" y1="8" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#818CF8" : "#4F46E5"} />
          <Stop offset="100%" stopColor={isDark ? "#A855F7" : "#7C3AED"} />
        </LinearGradient>
      </Defs>
      <Path
        d="M18 10H34L44 20V46C44 48.21 42.21 50 40 50H18C15.79 50 14 48.21 14 46V14C14 11.79 15.79 10 18 10Z"
        fill={isDark ? "#6366F1" : "#EEF2FF"}
        fillOpacity={isDark ? "0.24" : "0.95"}
        stroke={`url(#${docGradId})`}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Path d="M34 10V20H44" stroke={`url(#${docGradId})`} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M21 28H35" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 34H37" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 40H30" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M47 7L48.1 10.9L52 12L48.1 13.1L47 17L45.9 13.1L42 12L45.9 10.9L47 7Z"
        fill={isDark ? "#E0E7FF" : "#7C3AED"}
      />
    </Svg>
  );
}

/**
 * Checklist clipboard icon for Step 2 right card ("4-Step Questionnaire Wizard").
 */
export function WizardChecklistIcon({ size = 56 }: { size?: number }) {
  const { isDark } = useTheme();
  const bodyFill = isDark ? "#1F2937" : "#F1F5F9";
  const bodyOpacity = isDark ? "0.45" : "0.95";
  const clipFill = isDark ? "#0F172A" : "#FFFFFF";
  const strokeColor = isDark ? "#94A3B8" : "#475569";
  const checkColor = isDark ? "#CBD5E1" : "#4F46E5";
  const lineColor = isDark ? "#94A3B8" : "#64748B";

  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Rect
        x="15"
        y="12"
        width="30"
        height="38"
        rx="6"
        fill={bodyFill}
        fillOpacity={bodyOpacity}
        stroke={strokeColor}
        strokeWidth={2}
      />
      <Rect
        x="23"
        y="9"
        width="14"
        height="6"
        rx="2.5"
        fill={clipFill}
        stroke={strokeColor}
        strokeWidth={1.8}
      />
      <Path d="M21 23L23 25L26 21.5" stroke={checkColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 23.5H38" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 31L23 33L26 29.5" stroke={checkColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 31.5H38" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 39L23 41L26 37.5" stroke={checkColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 39.5H36" stroke={lineColor} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Reusable step header + segmented progress bar matching Images 2, 3, and 5-8.
 */
export function StepProgressHeader({
  label,
  totalSteps,
  currentStep,
  onBack,
  rightSlot,
}: {
  label: string;
  totalSteps: number;
  currentStep: number;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View className="px-5 pt-3 pb-2">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 items-start">
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              style={{
                backgroundColor: colors.headerBtnBg,
                borderColor: colors.headerBtnBorder,
              }}
              className="h-8 w-8 items-center justify-center rounded-full border active:opacity-75"
            >
              <ArrowLeft size={16} color={colors.textPrimary} />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={[WEB_SANS, { color: colors.textSecondary }]}
          numberOfLines={1}
          className="mx-2 text-center text-[12.5px] font-medium tracking-[0.2px]"
        >
          {label}
        </Text>

        <View className="flex-1 flex-row items-center justify-end">{rightSlot}</View>
      </View>

      <View className="flex-row items-center justify-center gap-2 px-6">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const active = idx < currentStep;
          return (
            <View
              key={idx}
              style={{
                backgroundColor: active
                  ? colors.indigo
                  : isDark
                    ? "#1E2438"
                    : colors.border,
              }}
              className="h-[4px] flex-1 rounded-full overflow-hidden"
            >
              {active ? <AuthButtonGradient /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Compact luminous cyan-to-violet briefcase mark for the Home Hub top header.
 */
export function HubBrandBriefcaseIcon({ size = 34 }: { size?: number }) {
  const { isDark } = useTheme();
  const strokeId = useSvgId("hubCaseStroke", isDark);
  const fillId = useSvgId("hubCaseFill", isDark);
  return (
    <Svg width={size} height={size * 0.9} viewBox="0 0 40 36" fill="none">
      <Defs>
        <LinearGradient id={strokeId} x1="4" y1="6" x2="36" y2="32" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#38BDF8" : "#0284C7"} />
          <Stop offset="55%" stopColor={isDark ? "#818CF8" : "#4F46E5"} />
          <Stop offset="100%" stopColor={isDark ? "#C084FC" : "#7C3AED"} />
        </LinearGradient>
        <LinearGradient id={fillId} x1="6" y1="9" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#38BDF8" : "#0284C7"} stopOpacity={isDark ? "0.18" : "0.12"} />
          <Stop offset="100%" stopColor={isDark ? "#A855F7" : "#7C3AED"} stopOpacity={isDark ? "0.16" : "0.10"} />
        </LinearGradient>
      </Defs>
      <Path
        d="M14.5 11V8.5C14.5 7.12 15.62 6 17 6H23C24.38 6 25.5 7.12 25.5 8.5V11"
        stroke={`url(#${strokeId})`}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Rect
        x="5"
        y="11"
        width="30"
        height="21"
        rx="5"
        fill={`url(#${fillId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth={2.2}
      />
      <Path
        d="M5 18C5 21.5 9.5 23 20 23C30.5 23 35 21.5 35 18"
        stroke={`url(#${strokeId})`}
        strokeWidth={1.8}
        strokeOpacity="0.9"
      />
      <Rect x="18" y="21.2" width="4" height="3.6" rx="1" fill={isDark ? "#E0E7FF" : "#4F46E5"} />
      <Path
        d="M34.5 2.5L35.35 5.15L38 6L35.35 6.85L34.5 9.5L33.65 6.85L31 6L33.65 5.15L34.5 2.5Z"
        fill={isDark ? "#E0F2FE" : "#0284C7"}
      />
    </Svg>
  );
}

/**
 * Glowing cyan-to-indigo target radar icon matching Card 1 of the Home Hub mockup.
 */
export function JobHunterHubIcon({ size = 42 }: { size?: number }) {
  const { isDark } = useTheme();
  const gradId = useSvgId("radarGrad", isDark);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#38BDF8" : "#0284C7"} />
          <Stop offset="55%" stopColor={isDark ? "#60A5FA" : "#4F46E5"} />
          <Stop offset="100%" stopColor={isDark ? "#A78BFA" : "#7C3AED"} />
        </LinearGradient>
      </Defs>
      <Circle cx="24" cy="24" r="16" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeOpacity="0.92" />
      <Circle cx="24" cy="24" r="10.5" stroke={`url(#${gradId})`} strokeWidth={2} strokeOpacity="0.82" />
      <Circle cx="24" cy="24" r="5" stroke={`url(#${gradId})`} strokeWidth={1.8} strokeOpacity="0.75" />
      <Line x1="24" y1="5.5" x2="24" y2="12" stroke={`url(#${gradId})`} strokeWidth={2} strokeLinecap="round" />
      <Line x1="24" y1="36" x2="24" y2="42.5" stroke={`url(#${gradId})`} strokeWidth={2} strokeLinecap="round" />
      <Line x1="5.5" y1="24" x2="12" y2="24" stroke={`url(#${gradId})`} strokeWidth={2} strokeLinecap="round" />
      <Line x1="36" y1="24" x2="42.5" y2="24" stroke={`url(#${gradId})`} strokeWidth={2} strokeLinecap="round" />
      <Line
        x1="24"
        y1="24"
        x2="34.5"
        y2="13.5"
        stroke={isDark ? "#BAE6FD" : "#0284C7"}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Circle cx="24" cy="24" r="2.2" fill={isDark ? "#E0F2FE" : "#4F46E5"} />
    </Svg>
  );
}

/**
 * Glowing cyan-to-purple document + sparkle icon matching Card 2 of the Home Hub mockup.
 */
export function TailorStudioHubIcon({ size = 42 }: { size?: number }) {
  const { isDark } = useTheme();
  const gradId = useSvgId("studioGrad", isDark);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={isDark ? "#38BDF8" : "#0284C7"} />
          <Stop offset="55%" stopColor={isDark ? "#818CF8" : "#4F46E5"} />
          <Stop offset="100%" stopColor={isDark ? "#C084FC" : "#7C3AED"} />
        </LinearGradient>
      </Defs>
      <Path
        d="M14 8H27L35 16V37C35 38.66 33.66 40 32 40H14C12.34 40 11 38.66 11 37V11C11 9.34 12.34 8 14 8Z"
        fill={isDark ? "#38BDF8" : "#4F46E5"}
        fillOpacity="0.08"
        stroke={`url(#${gradId})`}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Path d="M27 8V16H35" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeLinejoin="round" />
      <Line x1="16.5" y1="21.5" x2="27" y2="21.5" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1="16.5" y1="27" x2="29.5" y2="27" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1="16.5" y1="32.5" x2="23.5" y2="32.5" stroke={`url(#${gradId})`} strokeWidth={2.2} strokeLinecap="round" />
      <Path
        d="M34.5 25.5C35.25 30.2 36.8 31.75 41.5 32.5C36.8 33.25 35.25 34.8 34.5 39.5C33.75 34.8 32.2 33.25 27.5 32.5C32.2 31.75 33.75 30.2 34.5 25.5Z"
        fill={isDark ? "#A78BFA" : "#7C3AED"}
        stroke={isDark ? "#E0E7FF" : "#4338CA"}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
