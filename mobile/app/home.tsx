import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  Clock,
  KeyRound,
  Layers,
  LogOut,
  Settings,
  User as UserIcon,
  X,
} from "lucide-react-native";
import {
  AuthButtonGradient,
  HubBrandBriefcaseIcon,
  JobHunterHubIcon,
  OnboardingScreenFrame,
  TailorStudioHubIcon,
  WEB_SANS,
} from "../src/components/OnboardingGraphics";
import { useAuth } from "../src/context/AuthContext";
import { formatHomeActiveStatus } from "../src/lib/profileHelpers";

const GLASS_CARD_STYLE =
  Platform.OS === "web"
    ? ({
        boxShadow:
          "0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.14)",
      } as unknown as Record<string, string>)
    : undefined;

const ICON_TILE_GLOW_STYLE =
  Platform.OS === "web"
    ? ({
        boxShadow:
          "0 0 22px rgba(56, 189, 248, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.14)",
      } as unknown as Record<string, string>)
    : undefined;

const CTA_GLOW_STYLE =
  Platform.OS === "web"
    ? ({
        boxShadow: "0 4px 18px rgba(124, 93, 250, 0.38)",
      } as unknown as Record<string, string>)
    : {
        shadowColor: "#7C5DFA",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 5,
      };

export default function HomeHubScreen() {
  const router = useRouter();
  const {
    user,
    profiles,
    activeProfile,
    selectedModel,
    availableModels,
    activateProfile,
    signOut,
  } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const handleOpenSettings = () => {
    setAccountMenuOpen(false);
    router.push("/(tabs)/settings");
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await signOut();
  };

  return (
    <OnboardingScreenFrame strongGlow>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Brand + Profile Avatar Bar & Active Status Pill */}
        <View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2.5">
              <HubBrandBriefcaseIcon size={34} />
              <Text
                style={WEB_SANS}
                className="text-[18.5px] font-bold tracking-[-0.3px] text-white"
              >
                Hiring Agent
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account menu"
              onPress={() => setAccountMenuOpen(true)}
              className="h-[38px] w-[38px] items-center justify-center rounded-full border border-white/20 bg-white/[0.08] active:bg-white/15"
            >
              <UserIcon size={18} color="#CBD5E1" />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Active Profile Settings"
            onPress={() => router.push("/(tabs)/settings")}
            className="mt-4 max-w-[92%] flex-row items-center justify-center gap-2 self-center rounded-full border border-white/15 bg-white/[0.045] px-4 py-2 active:bg-white/[0.09]"
          >
            <View
              style={
                Platform.OS === "web"
                  ? ({
                      boxShadow: "0 0 8px rgba(34, 197, 94, 0.85)",
                    } as unknown as Record<string, string>)
                  : undefined
              }
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22C55E]"
            />
            <Text
              style={WEB_SANS}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="min-w-0 shrink text-[12px] font-medium text-[#CBD5E1]"
            >
              {formatHomeActiveStatus(activeProfile, selectedModel, availableModels)}
            </Text>
          </Pressable>
        </View>

        {/* Vertically Centered Middle Section: Hero + Module Cards */}
        <View className="flex-1 justify-center py-6">
          <View className="mb-7 items-center">
            <Text
              style={WEB_SANS}
              className="text-center text-[27px] font-bold leading-[33px] tracking-[-0.6px] text-white"
            >
              {"What would you like\nto do today?"}
            </Text>
          </View>

          <View className="gap-5">
            {/* Card 1: Job Hunter */}
            <View
              style={GLASS_CARD_STYLE}
              className="rounded-[20px] border border-white/15 bg-[#121629]/85 p-5"
            >
              <View className="flex-row items-start gap-4">
                <View
                  style={ICON_TILE_GLOW_STYLE}
                  className="h-[68px] w-[68px] items-center justify-center rounded-[16px] border border-white/15 bg-[#181F36]/95"
                >
                  <JobHunterHubIcon size={48} />
                </View>

                <View className="flex-1 pt-0.5">
                  <Text
                    style={WEB_SANS}
                    className="text-[18.5px] font-bold tracking-[-0.3px] text-white"
                  >
                    Job Hunter
                  </Text>
                  <Text
                    style={WEB_SANS}
                    className="mt-1 text-[13px] leading-[18.5px] text-[#94A3B8]"
                  >
                    Search 8 major job boards simultaneously with smart role matching
                  </Text>
                </View>
              </View>

              <View className="mt-5 flex-row items-center justify-between gap-2">
                <View className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5">
                  <Text style={WEB_SANS} className="text-[11px] font-medium text-[#CBD5E1]">
                    8 Boards • Live Ranking
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Launch Hunter"
                  onPress={() => router.push("/(tabs)/hunt")}
                  style={CTA_GLOW_STYLE}
                  className="h-[38px] flex-row items-center justify-center overflow-hidden rounded-full px-4 active:opacity-90"
                >
                  <AuthButtonGradient />
                  <View className="relative z-10 flex-row items-center gap-1.5">
                    <Text style={WEB_SANS} className="text-[13px] font-semibold text-white">
                      Launch Hunter
                    </Text>
                    <ArrowRight size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Card 2: Tailor Studio */}
            <View
              style={GLASS_CARD_STYLE}
              className="rounded-[20px] border border-white/15 bg-[#121629]/85 p-5"
            >
              <View className="flex-row items-start gap-4">
                <View
                  style={ICON_TILE_GLOW_STYLE}
                  className="h-[68px] w-[68px] items-center justify-center rounded-[16px] border border-white/15 bg-[#181F36]/95"
                >
                  <TailorStudioHubIcon size={48} />
                </View>

                <View className="flex-1 pt-0.5">
                  <Text
                    style={WEB_SANS}
                    className="text-[18.5px] font-bold tracking-[-0.3px] text-white"
                  >
                    Tailor Studio
                  </Text>
                  <Text
                    style={WEB_SANS}
                    className="mt-1 text-[13px] leading-[18.5px] text-[#94A3B8]"
                  >
                    Customize your CV & cover letter for any job description
                  </Text>
                </View>
              </View>

              <View className="mt-5 flex-row items-center justify-between gap-2">
                <View className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5">
                  <Text style={WEB_SANS} className="text-[11px] font-medium text-[#CBD5E1]">
                    ATS Resume Optimizer
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Studio"
                  onPress={() => router.push("/(tabs)/studio")}
                  style={CTA_GLOW_STYLE}
                  className="h-[38px] flex-row items-center justify-center overflow-hidden rounded-full px-4 active:opacity-90"
                >
                  <AuthButtonGradient />
                  <View className="relative z-10 flex-row items-center gap-1.5">
                    <Text style={WEB_SANS} className="text-[13px] font-semibold text-white">
                      Open Studio
                    </Text>
                    <ArrowRight size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom-Anchored Quick Links Row */}
        <View className="flex-row gap-3 pt-2 pb-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Saved History"
            onPress={() => router.push("/(tabs)/outputs")}
            className="h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-[#14182B]/90 px-3 active:bg-white/10"
          >
            <Clock size={16} color="#94A3B8" />
            <Text style={WEB_SANS} className="text-[13px] font-medium text-[#E2E8F0]">
              Saved History
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Master Profiles"
            onPress={() => router.push("/(tabs)/settings")}
            className="h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-[#14182B]/90 px-3 active:bg-white/10"
          >
            <Layers size={16} color="#94A3B8" />
            <Text style={WEB_SANS} className="text-[13px] font-medium text-[#E2E8F0]">
              Master Profiles
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Compact Account & Quick Settings Popover Modal */}
      <Modal
        visible={accountMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountMenuOpen(false)}
      >
        <Pressable
          onPress={() => setAccountMenuOpen(false)}
          className="flex-1 items-center justify-start bg-black/65 px-5 pt-16"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-2xl border border-white/15 bg-[#111528] p-4"
          >
            <View className="flex-row items-center justify-between border-b border-white/10 pb-3">
              <View className="flex-1 pr-2">
                <Text style={WEB_SANS} className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Signed in account
                </Text>
                <Text style={WEB_SANS} numberOfLines={1} className="mt-0.5 text-[14px] font-semibold text-white">
                  {user?.email || "Authenticated User"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close account menu"
                onPress={() => setAccountMenuOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]"
              >
                <X size={16} color="#94A3B8" />
              </Pressable>
            </View>

            {profiles.length > 0 ? (
              <View className="mt-3">
                <Text style={WEB_SANS} className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Switch Master Profile
                </Text>
                <View className="gap-1.5">
                  {profiles.slice(0, 3).map((p) => {
                    const isActive = activeProfile?.id === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          void activateProfile(p.id);
                        }}
                        className={`flex-row items-center justify-between rounded-xl border px-3 py-2 ${
                          isActive
                            ? "border-[#6366F1]/60 bg-[#6366F1]/15"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <Text style={WEB_SANS} numberOfLines={1} className="flex-1 text-[13px] font-medium text-white">
                          {p.profile_name}
                        </Text>
                        {isActive ? <Check size={14} color="#818CF8" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View className="mt-3 gap-2 border-t border-white/10 pt-3">
              <Pressable
                onPress={handleOpenSettings}
                className="flex-row items-center gap-2.5 rounded-xl bg-white/[0.05] px-3 py-2.5 active:bg-white/10"
              >
                <KeyRound size={16} color="#A5B4FC" />
                <Text style={WEB_SANS} className="text-[13.5px] font-medium text-white">
                  API Key & Tailoring Mode
                </Text>
              </Pressable>

              <Pressable
                onPress={handleOpenSettings}
                className="flex-row items-center gap-2.5 rounded-xl bg-white/[0.05] px-3 py-2.5 active:bg-white/10"
              >
                <Settings size={16} color="#94A3B8" />
                <Text style={WEB_SANS} className="text-[13.5px] font-medium text-white">
                  Manage Master Profiles
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSignOut()}
                className="flex-row items-center gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 active:bg-red-500/20"
              >
                <LogOut size={16} color="#FCA5A5" />
                <Text style={WEB_SANS} className="text-[13.5px] font-semibold text-red-200">
                  Sign Out
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </OnboardingScreenFrame>
  );
}
