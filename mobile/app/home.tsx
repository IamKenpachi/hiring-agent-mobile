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
import { ThemeToggleButton } from "../src/components/ThemeToggleButton";
import { getCardElevation } from "../src/constants/theme";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
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
  const { colors, isDark } = useTheme();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const handleOpenSettings = () => {
    setAccountMenuOpen(false);
    router.push("/(tabs)/settings");
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await signOut();
  };

  const glassCardElevation = isDark && Platform.OS === "web" ? GLASS_CARD_STYLE : getCardElevation(isDark);
  const iconTileStyle = [
    {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.border,
    },
    isDark && Platform.OS === "web" ? ICON_TILE_GLOW_STYLE : undefined,
  ];

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
        {/* Top Brand + Theme Toggle & Profile Avatar Bar + Active Status Pill */}
        <View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2.5">
              <HubBrandBriefcaseIcon size={34} />
              <Text
                style={[WEB_SANS, { color: colors.textPrimary }]}
                className="text-[18.5px] font-bold tracking-[-0.3px]"
              >
                Hiring Agent
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <ThemeToggleButton />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account menu"
                onPress={() => setAccountMenuOpen(true)}
                style={[
                  {
                    backgroundColor: colors.headerBtnBg,
                    borderColor: colors.headerBtnBorder,
                  },
                  getCardElevation(isDark),
                ]}
                className="h-[38px] w-[38px] items-center justify-center rounded-full border active:opacity-80"
              >
                <UserIcon size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Active Profile Settings"
            onPress={() => router.push("/(tabs)/settings")}
            style={[
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              getCardElevation(isDark),
            ]}
            className="mt-4 max-w-[92%] flex-row items-center justify-center gap-2 self-center rounded-full border px-4 py-2 active:opacity-80"
          >
            <View
              style={[
                { backgroundColor: colors.emerald },
                Platform.OS === "web"
                  ? ({
                      boxShadow: "0 0 8px rgba(34, 197, 94, 0.75)",
                    } as unknown as Record<string, string>)
                  : undefined,
              ]}
              className="h-2.5 w-2.5 shrink-0 rounded-full"
            />
            <Text
              style={[WEB_SANS, { color: colors.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="min-w-0 shrink text-[12px] font-medium"
            >
              {formatHomeActiveStatus(activeProfile, selectedModel, availableModels)}
            </Text>
          </Pressable>
        </View>

        {/* Vertically Centered Middle Section: Hero + Module Cards */}
        <View className="flex-1 justify-center py-6">
          <View className="mb-7 items-center">
            <Text
              style={[WEB_SANS, { color: colors.textPrimary }]}
              className="text-center text-[27px] font-bold leading-[33px] tracking-[-0.6px]"
            >
              {"What would you like\nto do today?"}
            </Text>
          </View>

          <View className="gap-5">
            {/* Card 1: Job Hunter */}
            <View
              style={[
                {
                  backgroundColor: colors.glassCardBg,
                  borderColor: colors.glassCardBorder,
                },
                glassCardElevation,
              ]}
              className="rounded-[20px] border p-5"
            >
              <View className="flex-row items-start gap-4">
                <View
                  style={iconTileStyle}
                  className="h-[68px] w-[68px] items-center justify-center rounded-[16px] border"
                >
                  <JobHunterHubIcon size={48} />
                </View>

                <View className="flex-1 pt-0.5">
                  <Text
                    style={[WEB_SANS, { color: colors.textPrimary }]}
                    className="text-[18.5px] font-bold tracking-[-0.3px]"
                  >
                    Job Hunter
                  </Text>
                  <Text
                    style={[WEB_SANS, { color: colors.textSecondary }]}
                    className="mt-1 text-[13px] leading-[18.5px]"
                  >
                    Search 8 major job boards simultaneously with smart role matching
                  </Text>
                </View>
              </View>

              <View className="mt-5 flex-row items-center justify-between gap-2">
                <View
                  style={{
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  }}
                  className="rounded-full border px-3 py-1.5"
                >
                  <Text style={[WEB_SANS, { color: colors.textSecondary }]} className="text-[11px] font-medium">
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
                    <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[13px] font-semibold">
                      Launch Hunter
                    </Text>
                    <ArrowRight size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Card 2: Tailor Studio */}
            <View
              style={[
                {
                  backgroundColor: colors.glassCardBg,
                  borderColor: colors.glassCardBorder,
                },
                glassCardElevation,
              ]}
              className="rounded-[20px] border p-5"
            >
              <View className="flex-row items-start gap-4">
                <View
                  style={iconTileStyle}
                  className="h-[68px] w-[68px] items-center justify-center rounded-[16px] border"
                >
                  <TailorStudioHubIcon size={48} />
                </View>

                <View className="flex-1 pt-0.5">
                  <Text
                    style={[WEB_SANS, { color: colors.textPrimary }]}
                    className="text-[18.5px] font-bold tracking-[-0.3px]"
                  >
                    Tailor Studio
                  </Text>
                  <Text
                    style={[WEB_SANS, { color: colors.textSecondary }]}
                    className="mt-1 text-[13px] leading-[18.5px]"
                  >
                    Customize your CV & cover letter for any job description
                  </Text>
                </View>
              </View>

              <View className="mt-5 flex-row items-center justify-between gap-2">
                <View
                  style={{
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  }}
                  className="rounded-full border px-3 py-1.5"
                >
                  <Text style={[WEB_SANS, { color: colors.textSecondary }]} className="text-[11px] font-medium">
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
                    <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[13px] font-semibold">
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
            style={[
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              getCardElevation(isDark),
            ]}
            className="h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border px-3 active:opacity-80"
          >
            <Clock size={16} color={colors.textSecondary} />
            <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[13px] font-medium">
              Saved History
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Master Profiles"
            onPress={() => router.push("/(tabs)/settings")}
            style={[
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              getCardElevation(isDark),
            ]}
            className="h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border px-3 active:opacity-80"
          >
            <Layers size={16} color={colors.textSecondary} />
            <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[13px] font-medium">
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
          style={{ backgroundColor: colors.modalBackdrop }}
          className="flex-1 items-center justify-start px-5 pt-16"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              getCardElevation(isDark),
            ]}
            className="w-full max-w-[360px] rounded-2xl border p-4"
          >
            <View
              style={{ borderBottomColor: colors.border }}
              className="flex-row items-center justify-between border-b pb-3"
            >
              <View className="flex-1 pr-2">
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="text-[11px] font-semibold uppercase tracking-wider"
                >
                  Signed in account
                </Text>
                <Text
                  style={[WEB_SANS, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  className="mt-0.5 text-[14px] font-semibold"
                >
                  {user?.email || "Authenticated User"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close account menu"
                onPress={() => setAccountMenuOpen(false)}
                style={{ backgroundColor: colors.surfaceElevated }}
                className="h-8 w-8 items-center justify-center rounded-full active:opacity-75"
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            {profiles.length > 0 ? (
              <View className="mt-3">
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                >
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
                        style={{
                          backgroundColor: isActive ? colors.indigoSoft : colors.surfaceElevated,
                          borderColor: isActive ? colors.indigoBorder : colors.border,
                        }}
                        className="flex-row items-center justify-between rounded-xl border px-3 py-2"
                      >
                        <Text
                          style={[
                            WEB_SANS,
                            { color: isActive ? colors.indigoText : colors.textPrimary },
                          ]}
                          numberOfLines={1}
                          className="flex-1 text-[13px] font-medium"
                        >
                          {p.profile_name}
                        </Text>
                        {isActive ? <Check size={14} color={colors.indigo} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View
              style={{ borderTopColor: colors.border }}
              className="mt-3 gap-2 border-t pt-3"
            >
              <Pressable
                onPress={handleOpenSettings}
                style={{ backgroundColor: colors.surfaceElevated }}
                className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 active:opacity-80"
              >
                <KeyRound size={16} color={colors.indigoText} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[13.5px] font-medium">
                  API Key & Tailoring Mode
                </Text>
              </Pressable>

              <Pressable
                onPress={handleOpenSettings}
                style={{ backgroundColor: colors.surfaceElevated }}
                className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 active:opacity-80"
              >
                <Settings size={16} color={colors.textSecondary} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[13.5px] font-medium">
                  Manage Master Profiles
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSignOut()}
                style={{
                  backgroundColor: colors.roseSoft,
                  borderColor: colors.roseBorder,
                }}
                className="flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 active:opacity-80"
              >
                <LogOut size={16} color={colors.roseText} />
                <Text style={[WEB_SANS, { color: colors.roseText }]} className="text-[13.5px] font-semibold">
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
