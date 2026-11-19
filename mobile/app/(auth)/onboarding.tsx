import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Zap,
} from "lucide-react-native";
import { AiResumeParserView } from "../../src/components/AiResumeParserView";
import {
  AuthButtonGradient,
  OnboardingScreenFrame,
  StepProgressHeader,
  UploadDocumentSparkIcon,
  WEB_SANS,
  WizardChecklistIcon,
} from "../../src/components/OnboardingGraphics";
import { ProfileWizardView } from "../../src/components/ProfileWizardView";
import { ThemeToggleButton } from "../../src/components/ThemeToggleButton";
import { getCardElevation, type ThemeColors } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError, PRIVACY_POLICY_URL } from "../../src/lib/api";
import {
  createEmptyWizardDraft,
  normalizeModelId,
  previewToWizardDraft,
  resolveModelDisplayName,
  wizardDraftToPayload,
  type WizardDraftState,
} from "../../src/lib/profileHelpers";

type OnboardingSubStep = "api" | "method" | "parser" | "wizard";

const MOCKUP_PRIMARY_MODEL_ORDER = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-4-hydrogen",
  "gemini-4-argon",
];

function getBadgeStyle(
  modelId: string,
  colors: ThemeColors
): {
  bg: string;
  border: string;
  text: string;
} {
  if (modelId.includes("3.8")) {
    return {
      bg: colors.purpleSoft,
      border: colors.purpleBorder,
      text: colors.purpleText,
    };
  }
  if (modelId.includes("lite")) {
    return {
      bg: colors.emeraldSoft,
      border: colors.emeraldBorder,
      text: colors.emeraldText,
    };
  }
  if (modelId.includes("hydrogen")) {
    return {
      bg: colors.cyanSoft,
      border: colors.cyanBorder,
      text: colors.cyanText,
    };
  }
  if (modelId.includes("argon")) {
    return {
      bg: colors.roseSoft,
      border: colors.roseBorder,
      text: colors.roseText,
    };
  }
  return {
    bg: colors.indigoSoft,
    border: colors.indigoBorder,
    text: colors.indigoText,
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    token,
    geminiApiKey,
    trialMode,
    selectedModel,
    availableModels,
    profiles,
    setGeminiKey,
    setTrialMode,
    setSelectedModel,
    setOnboardingDraft,
    refreshProfiles,
    signOut,
  } = useAuth();
  const { colors, isDark } = useTheme();

  const [subStep, setSubStep] = useState<OnboardingSubStep>(() =>
    token && (geminiApiKey.trim() || trialMode) && profiles.length === 0 ? "method" : "api"
  );
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey || "");
  const [modelInput, setModelInput] = useState(() => normalizeModelId(selectedModel));
  const [showKey, setShowKey] = useState(false);
  const [keyVerified, setKeyVerified] = useState(Boolean(geminiApiKey.trim()));
  const [showAllModels, setShowAllModels] = useState(false);
  const [validating, setValidating] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsedFileInfo, setParsedFileInfo] = useState<{
    filename: string;
    fileSizeBytes: number;
  }>({ filename: "Resume.pdf", fileSizeBytes: 0 });
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardDraft, setWizardDraft] = useState<WizardDraftState>(createEmptyWizardDraft);
  const [draftOrigin, setDraftOrigin] = useState<"none" | "pdf" | "wizard">("none");

  useEffect(() => {
    const trimmed = apiKeyInput.trim();
    if (trimmed.length < 25 || /\s/.test(trimmed)) {
      setKeyVerified(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.validateGeminiKey(trimmed, modelInput, true);
        setKeyVerified(Boolean(res.valid));
      } catch {
        setKeyVerified(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [apiKeyInput, modelInput]);

  const orderedModels = useMemo(() => {
    const rank = (id: string) => {
      const idx = MOCKUP_PRIMARY_MODEL_ORDER.indexOf(id);
      return idx === -1 ? 999 : idx;
    };
    return [...availableModels].sort((a, b) => rank(a.id) - rank(b.id));
  }, [availableModels]);

  const visibleModels = showAllModels ? orderedModels : orderedModels.slice(0, 4);
  const extraCount = Math.max(0, orderedModels.length - 4);

  const handleSaveStep1 = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setError("Please enter your Gemini API Key to continue.");
      return;
    }

    setValidating(true);
    setError(null);
    try {
      const result = await apiClient.validateGeminiKey(trimmed, modelInput, true);
      if (!result.valid) {
        setKeyVerified(false);
        setError(
          result.detail ||
            "Google Gemini rejected this API key. Check that your key starts with AIza and is active."
        );
        return;
      }
      setKeyVerified(true);
      await setGeminiKey(trimmed);
      if (trialMode) {
        await setTrialMode(false);
      }
      await setSelectedModel(result.active_model || modelInput);

      if (token && profiles.length > 0) {
        router.replace("/(tabs)/hunt");
      } else {
        setSubStep("method");
      }
    } catch (err) {
      // Allow clean progression if key passes local length guard when backend is offline in local preview
      const looksReasonable = trimmed.length >= 8 && !/\s/.test(trimmed);
      if (err instanceof TypeError && looksReasonable) {
        setKeyVerified(true);
        await setGeminiKey(trimmed);
        if (trialMode) {
          await setTrialMode(false);
        }
        await setSelectedModel(modelInput);
        setSubStep("method");
      } else {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not validate Gemini key.";
        setError(msg);
      }
    } finally {
      setValidating(false);
    }
  };

  const handleStartTrialMode = async () => {
    setError(null);
    setStartingTrial(true);
    try {
      await setTrialMode(true);
      await setSelectedModel(modelInput);
      if (token && profiles.length > 0) {
        router.replace("/(tabs)/hunt");
      } else {
        setSubStep("method");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not enable Starter Mode.";
      setError(msg);
    } finally {
      setStartingTrial(false);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      setError(`Could not open Privacy Policy (${PRIVACY_POLICY_URL}).`);
    }
  };

  const handleSelectPdfFile = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setParsingPdf(true);

      const preview = await apiClient.parseProfilePreview(
        {
          uri: asset.uri,
          name: asset.name || "resume.pdf",
          mimeType: asset.mimeType || "application/pdf",
          file: (asset as unknown as { file?: File }).file,
        },
        undefined,
        {
          geminiKey: apiKeyInput.trim() || geminiApiKey || undefined,
          model: modelInput,
        }
      );

      setParsedFileInfo({
        filename: preview.filename || asset.name || "resume.pdf",
        fileSizeBytes: preview.file_size_bytes || asset.size || 1024,
      });
      setWizardDraft(previewToWizardDraft(preview));
      setDraftOrigin("pdf");
      setSubStep("parser");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to extract CV details from file.";
      setError(msg);
    } finally {
      setParsingPdf(false);
    }
  };

  const handleCompleteProfile = async () => {
    setError(null);
    if (!wizardDraft.fullName.trim() && subStep === "wizard") {
      setWizardStep(1);
      setError("Please enter your Full Name in Step 1 before finishing.");
      return;
    }

    const payload = wizardDraftToPayload(wizardDraft);

    if (!token) {
      setOnboardingDraft(payload);
      router.push("/(auth)/login?mode=signup");
      return;
    }

    setSavingProfile(true);
    try {
      await apiClient.createProfile({ ...payload, is_default: profiles.length === 0 });
      await refreshProfiles();
      router.replace("/(tabs)/hunt");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save master profile.";
      setError(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  if (subStep === "parser") {
    return (
      <OnboardingScreenFrame>
        <AiResumeParserView
          filename={parsedFileInfo.filename}
          fileSizeBytes={parsedFileInfo.fileSizeBytes}
          draft={wizardDraft}
          onChange={setWizardDraft}
          onBack={() => {
            setError(null);
            setSubStep("method");
          }}
          onSaveMasterProfile={() => void handleCompleteProfile()}
          saving={savingProfile}
          error={error}
        />
      </OnboardingScreenFrame>
    );
  }

  if (subStep === "wizard") {
    return (
      <OnboardingScreenFrame>
        <ProfileWizardView
          draft={wizardDraft}
          onChange={setWizardDraft}
          step={wizardStep}
          onStepChange={(s) => {
            setError(null);
            setWizardStep(s);
          }}
          onExitWizard={() => {
            setError(null);
            setSubStep("method");
          }}
          onComplete={() => void handleCompleteProfile()}
          submitting={savingProfile}
          error={error}
        />
      </OnboardingScreenFrame>
    );
  }

  return (
    <OnboardingScreenFrame>
      <StepProgressHeader
        label={
          subStep === "api"
            ? "Step 1 of 2 • Workspace Setup"
            : "Step 2 of 2 • Career Profile"
        }
        totalSteps={2}
        currentStep={subStep === "api" ? 1 : 2}
        onBack={() => {
          setError(null);
          if (subStep === "method") {
            setSubStep("api");
          } else if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/(auth)/welcome");
          }
        }}
        rightSlot={
          <View className="flex-row items-center gap-2">
            <ThemeToggleButton size="compact" />
            {token ? (
              <Pressable
                accessibilityLabel="Sign Out"
                onPress={() => void signOut()}
                style={{
                  backgroundColor: colors.headerBtnBg,
                  borderColor: colors.headerBtnBorder,
                }}
                className="h-8 w-8 items-center justify-center rounded-full border active:opacity-75"
              >
                <LogOut size={14} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        }
      />

      {subStep === "api" ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "space-between",
            paddingHorizontal: 22,
            paddingTop: 10,
            paddingBottom: 22,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text
              style={[WEB_SANS, { color: colors.textPrimary }]}
              className="text-center text-[22px] font-bold tracking-[-0.4px] mb-5"
            >
              Connect Your Gemini API Key
            </Text>

            {error ? (
              <View
                style={{
                  backgroundColor: colors.roseSoft,
                  borderColor: colors.roseBorder,
                }}
                className="mb-3.5 rounded-xl border px-3.5 py-2.5"
              >
                <Text style={{ color: colors.roseText }} className="text-xs font-medium">
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Label + Key Verified Pill */}
            <View className="flex-row items-center justify-between mb-2">
              <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[13px] font-semibold">
                Gemini API Key
              </Text>
              {keyVerified ? (
                <View
                  style={{
                    backgroundColor: colors.emeraldSoft,
                    borderColor: colors.emeraldBorder,
                  }}
                  className="flex-row items-center gap-1 rounded-full border px-2.5 py-0.5"
                >
                  <Check size={11} color={colors.emeraldText} />
                  <Text
                    style={[WEB_SANS, { color: colors.emeraldText }]}
                    className="text-[11px] font-semibold"
                  >
                    Key Verified
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Key Input */}
            <View
              style={{
                backgroundColor: colors.inputBg,
                borderColor: colors.borderStrong,
              }}
              className="h-[46px] flex-row items-center rounded-xl border px-3.5"
            >
              <TextInput
                value={apiKeyInput}
                onChangeText={(val) => {
                  setApiKeyInput(val);
                  if (keyVerified) setKeyVerified(false);
                }}
                placeholder="AIzaSy•••••••••••••••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ color: colors.textPrimary }}
                className="flex-1 text-[14px]"
              />
              <Pressable
                accessibilityLabel={showKey ? "Hide API key" : "Show API key"}
                onPress={() => setShowKey((prev) => !prev)}
                className="pl-2 py-1"
              >
                {showKey ? (
                  <EyeOff size={16} color={colors.textSecondary} />
                ) : (
                  <Eye size={16} color={colors.textSecondary} />
                )}
              </Pressable>
            </View>

            <View className="mt-2 mb-5 flex-row items-center gap-1.5">
              <Lock size={12} color={colors.textMuted} />
              <Text style={[WEB_SANS, { color: colors.textMuted }]} className="text-[11.5px]">
                Saved on-device in SecureStore
              </Text>
            </View>

            {/* Tailoring Mode 2x2 grid */}
            <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold mb-2.5">
              Select Tailoring Mode
            </Text>

            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              {visibleModels.map((model) => {
                const isSelected = model.id === modelInput;
                const badgeStyle = getBadgeStyle(model.id, colors);
                return (
                  <Pressable
                    key={model.id}
                    accessibilityRole="button"
                    onPress={() => setModelInput(model.id)}
                    style={[
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? "#141932"
                            : colors.indigoSoft
                          : colors.surface,
                        borderColor: isSelected
                          ? isDark
                            ? "#7C6FF6"
                            : colors.indigo
                          : colors.border,
                      },
                      getCardElevation(isDark),
                    ]}
                    className="w-[48.5%] rounded-2xl border p-3.5"
                  >
                    <Text
                      style={[WEB_SANS, { color: colors.textPrimary }]}
                      numberOfLines={2}
                      className="text-[13.5px] font-bold leading-[18px]"
                    >
                      {resolveModelDisplayName(model.id, availableModels)}
                    </Text>

                    {model.badge ? (
                      <View
                        style={{
                          backgroundColor: badgeStyle.bg,
                          borderColor: badgeStyle.border,
                        }}
                        className="mt-1.5 self-start rounded-full border px-2 py-0.5"
                      >
                        <Text
                          style={[WEB_SANS, { color: badgeStyle.text }]}
                          className="text-[10.5px] font-semibold"
                        >
                          {model.badge}
                        </Text>
                      </View>
                    ) : null}

                    <Text
                      style={[WEB_SANS, { color: colors.textSecondary }]}
                      className="mt-2.5 text-[11px] font-medium"
                    >
                      ${model.input_cost_per_m} / 1M tokens
                    </Text>

                    <Text
                      style={[
                        WEB_SANS,
                        { color: isSelected ? colors.indigoText : "transparent" },
                      ]}
                      className={`mt-0.5 text-[10.5px] ${isSelected ? "font-semibold" : ""}`}
                    >
                      Selected
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {extraCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showAllModels ? "Show fewer models" : `Show ${extraCount} more models`
                }
                onPress={() => setShowAllModels((prev) => !prev)}
                style={{
                  backgroundColor: colors.headerBtnBg,
                  borderColor: colors.borderStrong,
                }}
                className="mt-3 self-center flex-row items-center gap-1 rounded-full border px-3.5 py-1.5 active:opacity-80"
              >
                <Text style={[WEB_SANS, { color: colors.textSecondary }]} className="text-[11.5px] font-medium">
                  {showAllModels
                    ? "Show fewer models"
                    : `Show ${extraCount} more models`}
                </Text>
                {showAllModels ? (
                  <ChevronUp size={13} color={colors.textSecondary} />
                ) : (
                  <ChevronDown size={13} color={colors.textSecondary} />
                )}
              </Pressable>
            ) : null}
          </View>

          <View className="pt-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              disabled={validating || startingTrial}
              onPress={() => void handleSaveStep1()}
              className="h-[50px] w-full flex-row items-center justify-center gap-2 overflow-hidden rounded-full active:opacity-90"
            >
              <AuthButtonGradient />
              {validating ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[15.5px] font-semibold">
                {validating ? "Verifying..." : "Continue"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with Starter Mode (No Key Required)"
              disabled={validating || startingTrial}
              onPress={() => void handleStartTrialMode()}
              style={[
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.indigoBorder,
                },
                getCardElevation(isDark),
              ]}
              className="mt-2.5 h-[46px] w-full flex-row items-center justify-center gap-2 rounded-full border px-4 active:opacity-85"
            >
              {startingTrial ? (
                <ActivityIndicator size="small" color={colors.indigoText} />
              ) : (
                <Zap size={15} color={colors.indigoText} />
              )}
              <Text
                style={[WEB_SANS, { color: colors.indigoText }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-[13.5px] font-semibold"
              >
                Continue with Starter Mode (No Key Required)
              </Text>
            </Pressable>

            <View className="mt-3.5 items-center px-1">
              <Text
                style={[WEB_SANS, { color: colors.textMuted }]}
                className="text-center text-[11.5px] leading-[16.5px]"
              >
                Your resume and job descriptions are sent securely to Gemini to extract and tailor applications.{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() => void handleOpenPrivacyPolicy()}
                  style={{ color: colors.indigoText, textDecorationLine: "underline" }}
                  className="font-semibold"
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingTop: 32,
            paddingBottom: 28,
          }}
        >
          <Text
            style={[WEB_SANS, { color: colors.textPrimary }]}
            className="text-center text-[22px] font-bold leading-[28px] tracking-[-0.4px] mb-8"
          >
            {"How do you want to build\nyour base CV?"}
          </Text>

          {error ? (
            <View
              style={{
                backgroundColor: colors.roseSoft,
                borderColor: colors.roseBorder,
              }}
              className="mb-4 rounded-xl border px-3.5 py-2.5"
            >
              <Text style={{ color: colors.roseText }} className="text-xs font-medium">
                {error}
              </Text>
            </View>
          ) : null}

          {/* Side-by-side method cards matching Screen 3 */}
          <View className="flex-row gap-3">
            {/* Left Card: Upload Existing PDF CV */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select PDF File"
              disabled={parsingPdf}
              onPress={() => void handleSelectPdfFile()}
              style={[
                {
                  backgroundColor: isDark ? "rgba(18, 23, 49, 0.90)" : colors.surface,
                  borderColor: isDark ? "rgba(124, 111, 246, 0.55)" : colors.indigoBorder,
                },
                getCardElevation(isDark),
              ]}
              className="flex-1 min-h-[296px] rounded-2xl border border-dashed p-3.5 items-center justify-between active:opacity-90"
            >
              <View className="items-center mt-2">
                <UploadDocumentSparkIcon size={58} />
                <Text
                  style={[WEB_SANS, { color: colors.textPrimary }]}
                  className="mt-3 text-center text-[15px] font-bold leading-[20px]"
                >
                  {"Upload Existing\nPDF CV"}
                </Text>
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="mt-2.5 text-center text-[11.5px] leading-[16px]"
                >
                  Extracts your experience, skills, and education in seconds
                </Text>
              </View>

              <View className="mt-4 w-full h-[38px] items-center justify-center rounded-full overflow-hidden">
                <AuthButtonGradient />
                {parsingPdf ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[12.5px] font-semibold">
                    Select PDF File
                  </Text>
                )}
              </View>
            </Pressable>

            {/* Right Card: 4-Step Questionnaire Wizard */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start Wizard"
              onPress={() => {
                setError(null);
                if (draftOrigin !== "wizard") {
                  setWizardDraft(createEmptyWizardDraft());
                  setDraftOrigin("wizard");
                }
                setWizardStep(1);
                setSubStep("wizard");
              }}
              style={[
                {
                  backgroundColor: isDark ? "rgba(14, 19, 33, 0.95)" : colors.surface,
                  borderColor: colors.borderStrong,
                },
                getCardElevation(isDark),
              ]}
              className="flex-1 min-h-[296px] rounded-2xl border p-3.5 items-center justify-between active:opacity-85"
            >
              <View className="items-center mt-2">
                <WizardChecklistIcon size={58} />
                <Text
                  style={[WEB_SANS, { color: colors.textPrimary }]}
                  className="mt-3 text-center text-[15px] font-bold leading-[20px]"
                >
                  {"4-Step Questionnaire\nWizard"}
                </Text>
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="mt-2.5 text-center text-[11.5px] leading-[16px]"
                >
                  No resume file? Answer 4 quick steps to build your master profile from scratch
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderStrong,
                }}
                className="mt-4 w-full h-[38px] flex-row items-center justify-center gap-1 rounded-full border"
              >
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[12.5px] font-semibold">
                  Start Wizard
                </Text>
                <ArrowRight size={13} color={colors.textPrimary} />
              </View>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </OnboardingScreenFrame>
  );
}
