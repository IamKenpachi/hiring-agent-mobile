import React, { useId } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { ArrowLeft } from "lucide-react-native";

export const WEB_SANS =
  Platform.OS === "web"
    ? {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", sans-serif',
      }
    : undefined;

function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Full-bleed vibrant indigo-to-purple gradient background matching the mockup's primary CTA pills.
 * Uses a globally unique gradient ID so stacked Expo Router screens never collide in web DOM.
 */
export function AuthButtonGradient() {
  const gradId = useSvgId("btnGrad");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 345 50" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#6366F1" />
            <Stop offset="50%" stopColor="#7C5DFA" />
            <Stop offset="100%" stopColor="#9353F6" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="345" height="50" fill={`url(#${gradId})`} />
      </Svg>
    </View>
  );
}

/**
 * Ambient radial violet-indigo top glow used behind Screen 1 and subtle Step headers.
 */
export function OnboardingAmbientGlow({ strong = false }: { strong?: boolean }) {
  const haloId = useSvgId(strong ? "haloStrong" : "haloSubtle");
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
            <Stop offset="0%" stopColor="#6D5CE8" stopOpacity={strong ? "0.62" : "0.28"} />
            <Stop offset="45%" stopColor="#3B357A" stopOpacity={strong ? "0.28" : "0.14"} />
            <Stop offset="100%" stopColor="#070A12" stopOpacity="0" />
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
  return (
    <View className="flex-1 bg-[#070A12] items-center">
      <View className="flex-1 w-full max-w-[430px] relative overflow-hidden">
        <OnboardingAmbientGlow strong={strongGlow} />
        <SafeAreaView className="flex-1">{children}</SafeAreaView>
      </View>
    </View>
  );
}

/**
 * Luminous outlined briefcase + central white 4-point sparkle for Screen 1 ("Hiring Agent AI").
 */
export function AuthHeroBriefcase({ size = 84 }: { size?: number }) {
  const strokeId = useSvgId("caseStroke");
  const fillId = useSvgId("caseFill");
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 88 74" fill="none">
      <Defs>
        <LinearGradient id={strokeId} x1="16" y1="12" x2="72" y2="62" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#818CF8" />
          <Stop offset="50%" stopColor="#A78BFA" />
          <Stop offset="100%" stopColor="#60A5FA" />
        </LinearGradient>
        <LinearGradient id={fillId} x1="20" y1="18" x2="68" y2="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#6366F1" stopOpacity="0.22" />
          <Stop offset="100%" stopColor="#9333EA" stopOpacity="0.14" />
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

      {/* Center white 4-point sparkle */}
      <Path
        d="M44 31C44.9 37.8 47.2 40.1 54 41C47.2 41.9 44.9 44.2 44 51C43.1 44.2 40.8 41.9 34 41C40.8 40.1 43.1 37.8 44 31Z"
        fill="#FFFFFF"
      />

      {/* Top accent sparkles */}
      <Path
        d="M17 9L17.9 12.1L21 13L17.9 13.9L17 17L16.1 13.9L13 13L16.1 12.1L17 9Z"
        fill="#E0E7FF"
      />
      <Path
        d="M25 6L25.5 7.8L27.3 8.3L25.5 8.8L25 10.6L24.5 8.8L22.7 8.3L24.5 7.8L25 6Z"
        fill="#C7D2FE"
        fillOpacity="0.8"
      />
    </Svg>
  );
}

/**
 * Glowing document with sparkle icon for Step 2 left card ("Upload Existing PDF CV").
 */
export function UploadDocumentSparkIcon({ size = 56 }: { size?: number }) {
  const docGradId = useSvgId("docGrad");
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Defs>
        <LinearGradient id={docGradId} x1="12" y1="8" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#818CF8" />
          <Stop offset="100%" stopColor="#A855F7" />
        </LinearGradient>
      </Defs>
      <Path
        d="M18 10H34L44 20V46C44 48.21 42.21 50 40 50H18C15.79 50 14 48.21 14 46V14C14 11.79 15.79 10 18 10Z"
        fill="#6366F1"
        fillOpacity="0.24"
        stroke={`url(#${docGradId})`}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Path d="M34 10V20H44" stroke={`url(#${docGradId})`} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M21 28H35" stroke="#C7D2FE" strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 34H37" stroke="#C7D2FE" strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 40H30" stroke="#C7D2FE" strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M47 7L48.1 10.9L52 12L48.1 13.1L47 17L45.9 13.1L42 12L45.9 10.9L47 7Z"
        fill="#E0E7FF"
      />
    </Svg>
  );
}

/**
 * Checklist clipboard icon for Step 2 right card ("4-Step Questionnaire Wizard").
 */
export function WizardChecklistIcon({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Rect
        x="15"
        y="12"
        width="30"
        height="38"
        rx="6"
        fill="#1F2937"
        fillOpacity="0.45"
        stroke="#94A3B8"
        strokeWidth={2}
      />
      <Rect
        x="23"
        y="9"
        width="14"
        height="6"
        rx="2.5"
        fill="#0F172A"
        stroke="#94A3B8"
        strokeWidth={1.8}
      />
      <Path d="M21 23L23 25L26 21.5" stroke="#CBD5E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 23.5H38" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 31L23 33L26 29.5" stroke="#CBD5E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 31.5H38" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      <Path d="M21 39L23 41L26 37.5" stroke="#CBD5E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M29 39.5H36" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
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
  return (
    <View className="px-5 pt-3 pb-2">
      <View className="flex-row items-center justify-between mb-3">
        <View className="w-9">
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              className="h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] active:bg-white/10"
            >
              <ArrowLeft size={16} color="#CBD5E1" />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={WEB_SANS}
          className="text-[12.5px] font-medium tracking-[0.2px] text-[#94A3B8]"
        >
          {label}
        </Text>

        <View className="w-9 items-end">{rightSlot}</View>
      </View>

      <View className="flex-row items-center justify-center gap-2 px-6">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const active = idx < currentStep;
          return (
            <View
              key={idx}
              className={`h-[4px] flex-1 rounded-full overflow-hidden ${
                active ? "bg-[#6366F1]" : "bg-[#1E2438]"
              }`}
            >
              {active ? <AuthButtonGradient /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
