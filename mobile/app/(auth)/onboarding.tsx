import React, { useState } from "react";
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
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  ShieldCheck,
} from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { ModelPickerList } from "../../src/components/ModelPickerList";
import { ProfileCreator } from "../../src/components/ProfileCreator";

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    user,
    geminiApiKey,
    selectedModel,
    availableModels,
    profiles,
    setGeminiKey,
    setSelectedModel,
    refreshProfiles,
    signOut,
  } = useAuth();

  const [step, setStep] = useState<1 | 2>(() =>
    geminiApiKey.trim() && profiles.length === 0 ? 2 : 1
  );
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey || "");
  const [modelInput, setModelInput] = useState(selectedModel || "gemini-3.7-flash");
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveStep1 = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setError("Please enter your Gemini API Key to power the ADK agents.");
      return;
    }

    setValidating(true);
    setError(null);
    try {
      const result = await apiClient.validateGeminiKey(trimmed, modelInput);
      if (!result.valid) {
        setError("Gemini API Key could not be validated. Please check your key.");
        return;
      }
      await setGeminiKey(trimmed);
      await setSelectedModel(result.active_model || modelInput);

      if (profiles.length > 0) {
        router.replace("/(tabs)/hunt");
      } else {
        setStep(2);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not validate Gemini key.";
      setError(msg);
    } finally {
      setValidating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>WELCOME{user?.email ? ` • ${user.email}` : ""}</Text>
            <Text style={styles.title}>
              {step === 1 ? "Step 1: Connect Gemini AI" : "Step 2: Create Master CV"}
            </Text>
          </View>
          <Pressable onPress={() => void signOut()} style={styles.signOutBtn}>
            <LogOut size={15} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {/* Step Indicator */}
        <View style={styles.progressRow}>
          <View style={[styles.progressPill, styles.progressActive]}>
            <Text style={styles.progressText}>1. Gemini Key & Model</Text>
          </View>
          <View
            style={[
              styles.progressPill,
              step === 2 && styles.progressActive,
            ]}
          >
            <Text
              style={[
                styles.progressText,
                step !== 2 && { color: COLORS.textMuted },
              ]}
            >
              2. Master CV Profile
            </Text>
          </View>
        </View>

        {step === 1 ? (
          <View style={styles.section}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <KeyRound size={18} color={COLORS.purple} />
                <Text style={styles.cardTitle}>Your Personal Gemini API Key</Text>
              </View>
              <Text style={styles.helperText}>
                Stored securely on your device using Expo SecureStore (or Web localStorage)
                and transmitted via X-Gemini-Api-Key only when running AI agents.
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.keyInputWrap}>
                <TextInput
                  value={apiKeyInput}
                  onChangeText={setApiKeyInput}
                  placeholder="AIzaSy..."
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.keyInput}
                />
                <Pressable
                  onPress={() => setShowKey((prev) => !prev)}
                  style={styles.eyeBtn}
                >
                  {showKey ? (
                    <EyeOff size={18} color={COLORS.textSecondary} />
                  ) : (
                    <Eye size={18} color={COLORS.textSecondary} />
                  )}
                </Pressable>
              </View>

              <View style={styles.securityNote}>
                <ShieldCheck size={14} color={COLORS.emerald} />
                <Text style={styles.securityText}>
                  Never shared publicly • Switch or revoke anytime in Settings
                </Text>
              </View>
            </View>

            <View style={styles.modelSection}>
              <Text style={styles.subHeading}>Select Default Intelligence Engine</Text>
              <ModelPickerList
                models={availableModels}
                selectedModel={modelInput}
                onSelect={setModelInput}
              />
            </View>

            <Pressable
              onPress={handleSaveStep1}
              disabled={validating}
              style={[styles.primaryBtn, validating && { opacity: 0.6 }]}
            >
              {validating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <CheckCircle2 size={17} color="#FFFFFF" />
              )}
              <Text style={styles.primaryBtnText}>
                {validating ? "Validating Key..." : "Save Key & Continue to CV Setup"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Pressable onPress={() => setStep(1)} style={styles.backStepBtn}>
              <ArrowLeft size={14} color={COLORS.textSecondary} />
              <Text style={styles.backStepText}>Back to Gemini Key & Model</Text>
            </Pressable>

            <ProfileCreator
              defaultIsPrimary={profiles.length === 0}
              onSuccess={async () => {
                await refreshProfiles();
                router.replace("/(tabs)/hunt");
              }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 18,
    paddingBottom: 42,
    gap: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.indigo,
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  signOutBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRow: {
    flexDirection: "row",
    gap: 8,
  },
  progressPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  progressActive: {
    backgroundColor: COLORS.indigoSoft,
    borderColor: COLORS.indigoBorder,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  section: {
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 11,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  helperText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  errorBanner: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: 12.5,
    color: "#FDA4AF",
    fontWeight: "600",
  },
  keyInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  keyInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  eyeBtn: {
    padding: 6,
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  securityText: {
    fontSize: 11.5,
    color: COLORS.emerald,
    fontWeight: "600",
  },
  modelSection: {
    gap: 10,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.indigo,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  backStepBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  backStepText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
});

