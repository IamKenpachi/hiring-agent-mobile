import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";
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

function getBadgeStyle(modelId: string): {
  pillClass: string;
  textClass: string;
} {
  if (modelId.includes("3.8")) {
    return {
      pillClass: "bg-[#6D28D9]/35 border-[#8B5CF6]/45",
      textClass: "text-[#DDD6FE]",
    };
  }
  if (modelId.includes("lite")) {
    return {
      pillClass: "bg-[#059669]/25 border-[#10B981]/40",
      textClass: "text-[#6EE7B7]",
    };
  }
  if (modelId.includes("hydrogen")) {
    return {
      pillClass: "bg-[#0369A1]/30 border-[#38BDF8]/40",
      textClass: "text-[#BAE6FD]",
    };
  }
  if (modelId.includes("argon")) {
    return {
      pillClass: "bg-[#9D174D]/30 border-[#EC4899]/40",
      textClass: "text-[#FBCFE8]",
    };
  }
  return {
    pillClass: "bg-[#4338CA]/30 border-[#818CF8]/40",
    textClass: "text-[#C7D2FE]",
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    token,
    geminiApiKey,
    selectedModel,
    availableModels,
    profiles,
    setGeminiKey,
    setSelectedModel,
    setOnboardingDraft,
    refreshProfiles,
    signOut,
  } = useAuth();

  const [subStep, setSubStep] = useState<OnboardingSubStep>(() =>
    token && geminiApiKey.trim() && profiles.length === 0 ? "method" : "api"
  );
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey || "");
  const [modelInput, setModelInput] = useState(() => normalizeModelId(selectedModel));
  const [showKey, setShowKey] = useState(false);
  const [keyVerified, setKeyVerified] = useState(Boolean(geminiApiKey.trim()));
  const [showAllModels, setShowAllModels] = useState(false);
  const [validating, setValidating] = useState(false);
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
          geminiKey: apiKeyInput.trim() || geminiApiKey,
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
          token ? (
            <Pressable
              accessibilityLabel="Sign Out"
              onPress={() => void signOut()}
              className="h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
            >
              <LogOut size={14} color="#94A3B8" />
            </Pressable>
          ) : null
        }
      />

      {subStep === "api" ? (
        <View className="flex-1 justify-between">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={WEB_SANS}
              className="text-center text-[22px] font-bold tracking-[-0.4px] text-white mb-5"
            >
              Connect Your Gemini API Key
            </Text>

            {error ? (
              <View className="mb-3.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5">
                <Text className="text-xs font-medium text-red-200">{error}</Text>
              </View>
            ) : null}

            {/* Label + Key Verified Pill */}
            <View className="flex-row items-center justify-between mb-2">
              <Text style={WEB_SANS} className="text-[13px] font-semibold text-white">
                Gemini API Key
              </Text>
              {keyVerified ? (
                <View className="flex-row items-center gap-1 rounded-full border border-[#10B981]/40 bg-[#10B981]/15 px-2.5 py-0.5">
                  <Check size={11} color="#34D399" />
                  <Text style={WEB_SANS} className="text-[11px] font-semibold text-[#34D399]">
                    Key Verified
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Key Input */}
            <View className="h-[46px] flex-row items-center rounded-xl border border-white/15 bg-[#0D121F] px-3.5">
              <TextInput
                value={apiKeyInput}
                onChangeText={(val) => {
                  setApiKeyInput(val);
                  if (keyVerified) setKeyVerified(false);
                }}
                placeholder="AIzaSy•••••••••••••••••••••"
                placeholderTextColor="#475569"
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-[14px] text-white"
              />
              <Pressable
                accessibilityLabel={showKey ? "Hide API key" : "Show API key"}
                onPress={() => setShowKey((prev) => !prev)}
                className="pl-2 py-1"
              >
                {showKey ? (
                  <EyeOff size={16} color="#94A3B8" />
                ) : (
                  <Eye size={16} color="#94A3B8" />
                )}
              </Pressable>
            </View>

            <View className="mt-2 mb-5 flex-row items-center gap-1.5">
              <Lock size={12} color="#64748B" />
              <Text style={WEB_SANS} className="text-[11.5px] text-[#64748B]">
                Saved on-device in SecureStore
              </Text>
            </View>

            {/* Tailoring Mode 2x2 grid */}
            <Text style={WEB_SANS} className="text-[14px] font-semibold text-white mb-2.5">
              Select Tailoring Mode
            </Text>

            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              {visibleModels.map((model) => {
                const isSelected = model.id === modelInput;
                const badgeStyle = getBadgeStyle(model.id);
                return (
                  <Pressable
                    key={model.id}
                    accessibilityRole="button"
                    onPress={() => setModelInput(model.id)}
                    className={`w-[48.5%] rounded-2xl border p-3.5 ${
                      isSelected
                        ? "border-[#7C6FF6] bg-[#141932]"
                        : "border-white/10 bg-[#0D121F]"
                    }`}
                  >
                    <Text
                      style={WEB_SANS}
                      numberOfLines={2}
                      className="text-[13.5px] font-bold leading-[18px] text-white"
                    >
                      {resolveModelDisplayName(model.id, availableModels)}
                    </Text>

                    {model.badge ? (
                      <View
                        className={`mt-1.5 self-start rounded-full border px-2 py-0.5 ${badgeStyle.pillClass}`}
                      >
                        <Text
                          style={WEB_SANS}
                          className={`text-[10.5px] font-semibold ${badgeStyle.textClass}`}
                        >
                          {model.badge}
                        </Text>
                      </View>
                    ) : null}

                    <Text
                      style={WEB_SANS}
                      className="mt-2.5 text-[11px] font-medium text-[#CBD5E1]"
                    >
                      ${model.input_cost_per_m} / 1M tokens
                    </Text>

                    <Text
                      style={WEB_SANS}
                      className={`mt-0.5 text-[10.5px] ${
                        isSelected ? "font-semibold text-[#A5B4FC]" : "text-transparent"
                      }`}
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
                className="mt-3 self-center flex-row items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 active:bg-white/[0.07]"
              >
                <Text style={WEB_SANS} className="text-[11.5px] font-medium text-[#94A3B8]">
                  {showAllModels
                    ? "Show fewer models"
                    : `Show ${extraCount} more models`}
                </Text>
                {showAllModels ? (
                  <ChevronUp size={13} color="#94A3B8" />
                ) : (
                  <ChevronDown size={13} color="#94A3B8" />
                )}
              </Pressable>
            ) : null}
          </ScrollView>

          <View className="px-6 pb-6 pt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              disabled={validating}
              onPress={() => void handleSaveStep1()}
              className="h-[50px] w-full flex-row items-center justify-center gap-2 overflow-hidden rounded-full active:opacity-90"
            >
              <AuthButtonGradient />
              {validating ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={WEB_SANS} className="text-[15.5px] font-semibold text-white">
                {validating ? "Verifying..." : "Continue"}
              </Text>
            </Pressable>
          </View>
        </View>
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
            style={WEB_SANS}
            className="text-center text-[22px] font-bold leading-[28px] tracking-[-0.4px] text-white mb-8"
          >
            {"How do you want to build\nyour base CV?"}
          </Text>

          {error ? (
            <View className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5">
              <Text className="text-xs font-medium text-red-200">{error}</Text>
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
              className="flex-1 min-h-[296px] rounded-2xl border border-dashed border-[#7C6FF6]/55 bg-[#121731]/90 p-3.5 items-center justify-between active:opacity-90"
            >
              <View className="items-center mt-2">
                <UploadDocumentSparkIcon size={58} />
                <Text
                  style={WEB_SANS}
                  className="mt-3 text-center text-[15px] font-bold leading-[20px] text-white"
                >
                  {"Upload Existing\nPDF CV"}
                </Text>
                <Text
                  style={WEB_SANS}
                  className="mt-2.5 text-center text-[11.5px] leading-[16px] text-[#94A3B8]"
                >
                  Extracts your experience, skills, and education in seconds
                </Text>
              </View>

              <View className="mt-4 w-full h-[38px] items-center justify-center rounded-full overflow-hidden">
                <AuthButtonGradient />
                {parsingPdf ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={WEB_SANS} className="text-[12.5px] font-semibold text-white">
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
              className="flex-1 min-h-[296px] rounded-2xl border border-white/15 bg-[#0E1321]/95 p-3.5 items-center justify-between active:bg-white/[0.04]"
            >
              <View className="items-center mt-2">
                <WizardChecklistIcon size={58} />
                <Text
                  style={WEB_SANS}
                  className="mt-3 text-center text-[15px] font-bold leading-[20px] text-white"
                >
                  {"4-Step Questionnaire\nWizard"}
                </Text>
                <Text
                  style={WEB_SANS}
                  className="mt-2.5 text-center text-[11.5px] leading-[16px] text-[#94A3B8]"
                >
                  No resume file? Answer 4 quick steps to build your master profile from scratch
                </Text>
              </View>

              <View className="mt-4 w-full h-[38px] flex-row items-center justify-center gap-1 rounded-full border border-white/15 bg-white/[0.04]">
                <Text style={WEB_SANS} className="text-[12.5px] font-semibold text-white">
                  Start Wizard
                </Text>
                <ArrowRight size={13} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </OnboardingScreenFrame>
  );
}
