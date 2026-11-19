import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ThemeToggleButton } from "../../src/components/ThemeToggleButton";
import {
  BriefcaseSparkIcon,
  PrimaryPillGradient,
  WelcomeAmbientGlow,
} from "../../src/components/WelcomeGraphics";
import { getCardElevation } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

const WEB_SANS =
  Platform.OS === "web"
    ? {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", sans-serif',
      }
    : undefined;

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <View className="flex-1 items-center" style={{ backgroundColor: colors.authBg }}>
      <View className="flex-1 w-full max-w-[430px] relative overflow-hidden">
        <WelcomeAmbientGlow />

        <SafeAreaView className="flex-1 justify-between px-7">
          {/* Clean top-right theme toggle bar */}
          <View className="pt-3 flex-row justify-end">
            <ThemeToggleButton />
          </View>

          {/* Upper hero zone positioned just beneath the luminous radial halo */}
          <View className="flex-1 items-center justify-center pb-6">
            <View className="mb-7">
              <BriefcaseSparkIcon width={68} height={58} />
            </View>

            <Text
              style={[WEB_SANS, { color: colors.textPrimary }]}
              className="text-center text-[32px] font-bold leading-[38px] tracking-[-0.8px]"
            >
              {"Hunt smarter.\nTailor in seconds."}
            </Text>

            <Text
              style={[WEB_SANS, { color: colors.textSecondary }]}
              className="mt-3.5 text-center text-[15px] font-normal leading-[21px] tracking-[-0.1px]"
            >
              {"Your career command center for\nsmart job ranking and ATS-ready CVs."}
            </Text>
          </View>

          {/* Bottom thumb-zone CTA stack matching iPhone mockup spacing */}
          <View className="pb-9">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get Started"
              onPress={() => router.push("/(auth)/onboarding")}
              style={{
                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : colors.indigoBorder,
              }}
              className="h-[48px] w-full items-center justify-center overflow-hidden rounded-full border active:opacity-90"
            >
              <PrimaryPillGradient />
              <Text
                style={[WEB_SANS, { color: "#FFFFFF" }]}
                className="text-[15.5px] font-semibold tracking-[-0.1px]"
              >
                Get Started
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              onPress={() => router.push("/(auth)/login?mode=signin")}
              style={[
                {
                  backgroundColor: colors.headerBtnBg,
                  borderColor: colors.borderStrong,
                },
                getCardElevation(isDark),
              ]}
              className="mt-3.5 h-[48px] w-full items-center justify-center rounded-full border active:opacity-80"
            >
              <Text
                style={[WEB_SANS, { color: colors.textPrimary }]}
                className="text-[15.5px] font-semibold tracking-[-0.1px]"
              >
                Sign In
              </Text>
            </Pressable>

            <Text
              style={[WEB_SANS, { color: colors.textMuted }]}
              className="mt-5 text-center text-[11.5px] font-normal tracking-[-0.05px]"
            >
              Your Gemini API key stays private on your device.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}
