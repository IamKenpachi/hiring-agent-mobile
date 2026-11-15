import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BriefcaseSparkIcon,
  PrimaryPillGradient,
  WelcomeAmbientGlow,
} from "../../src/components/WelcomeGraphics";

const WEB_SANS =
  Platform.OS === "web"
    ? {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", sans-serif',
      }
    : undefined;

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#070A12] items-center">
      <View className="flex-1 w-full max-w-[430px] relative overflow-hidden">
        <WelcomeAmbientGlow />

        <SafeAreaView className="flex-1 justify-between px-7">
          {/* Upper hero zone positioned just beneath the luminous radial halo */}
          <View className="flex-1 items-center justify-center pb-6">
            <View className="mb-7">
              <BriefcaseSparkIcon width={68} height={58} />
            </View>

            <Text
              style={WEB_SANS}
              className="text-center text-[32px] font-bold leading-[38px] tracking-[-0.8px] text-white"
            >
              {"Hunt smarter.\nTailor in seconds."}
            </Text>

            <Text
              style={WEB_SANS}
              className="mt-3.5 text-center text-[15px] font-normal leading-[21px] tracking-[-0.1px] text-[#9298AA]"
            >
              {"Your AI career command center for\njob ranking and ATS-ready CVs."}
            </Text>
          </View>

          {/* Bottom thumb-zone CTA stack matching iPhone mockup spacing */}
          <View className="pb-9">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get Started"
              onPress={() => router.push("/(auth)/login?mode=signup")}
              className="h-[48px] w-full items-center justify-center overflow-hidden rounded-full border border-white/[0.08] active:opacity-90"
            >
              <PrimaryPillGradient />
              <Text
                style={WEB_SANS}
                className="text-[15.5px] font-semibold tracking-[-0.1px] text-white"
              >
                Get Started
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              onPress={() => router.push("/(auth)/login?mode=signin")}
              className="mt-3.5 h-[48px] w-full items-center justify-center rounded-full border border-white/[0.16] bg-transparent active:bg-white/[0.06]"
            >
              <Text
                style={WEB_SANS}
                className="text-[15.5px] font-semibold tracking-[-0.1px] text-[#F8FAFC]"
              >
                Sign In
              </Text>
            </Pressable>

            <Text
              style={WEB_SANS}
              className="mt-5 text-center text-[11.5px] font-normal tracking-[-0.05px] text-[#686E80]"
            >
              Your Gemini API key stays private on your device.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}
