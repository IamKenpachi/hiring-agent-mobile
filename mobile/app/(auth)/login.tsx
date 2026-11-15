import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Lock, Mail, Sparkles, User as UserIcon } from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { API_BASE_URL, ApiError } from "../../src/lib/api";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp, backendHealthy, pingHealth } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.mode === "signup" ? "signup" : "signin"
  );

  useEffect(() => {
    if (params.mode === "signup" || params.mode === "signin") {
      setMode(params.mode);
    }
  }, [params.mode]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Authentication failed. Please check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View className="px-5 pt-2 pb-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Welcome"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(auth)/welcome");
            }
          }}
          className="self-start flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 active:bg-white/10"
        >
          <ArrowLeft size={14} color={COLORS.textSecondary} />
          <Text className="text-xs font-semibold text-[#94A3B8]">Welcome</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Executive Hero */}
          <View style={styles.hero}>
            <View style={styles.logoBadge}>
              <Sparkles size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.brand}>Hiring Agent Mobile</Text>
            <Text style={styles.tagline}>
              Multi-Agent JobSpy Hunter, ATS Optimizer & Executive Revision Studio
            </Text>

            <Pressable onPress={() => void pingHealth()} style={styles.healthPill}>
              <View
                style={[
                  styles.healthDot,
                  {
                    backgroundColor:
                      backendHealthy === true
                        ? COLORS.emerald
                        : backendHealthy === false
                          ? COLORS.rose
                          : COLORS.amber,
                  },
                ]}
              />
              <Text style={styles.healthText}>
                {backendHealthy === true
                  ? "API Connected"
                  : backendHealthy === false
                    ? `API Unreachable (${API_BASE_URL})`
                    : "Checking API..."}
              </Text>
            </Pressable>
          </View>

          {/* Auth Card */}
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => {
                  setMode("signin");
                  setError(null);
                }}
                style={[styles.toggleBtn, mode === "signin" && styles.toggleActive]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    mode === "signin" && styles.toggleTextActive,
                  ]}
                >
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMode("signup");
                  setError(null);
                }}
                style={[styles.toggleBtn, mode === "signup" && styles.toggleActive]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    mode === "signup" && styles.toggleTextActive,
                  ]}
                >
                  Create Account
                </Text>
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {mode === "signup" ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full Name (Optional)</Text>
                <View style={styles.inputRow}>
                  <UserIcon size={16} color={COLORS.textMuted} />
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Alex Rivera"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.input}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputRow}>
                <Mail size={16} color={COLORS.textMuted} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <Lock size={16} color={COLORS.textMuted} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitBtn,
                loading && styles.submitDisabled,
                pressed && { opacity: 0.9 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : null}
              <Text style={styles.submitText}>
                {loading
                  ? "Authenticating..."
                  : mode === "signin"
                    ? "Sign In to Command Center"
                    : "Create Account & Continue"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    gap: 24,
  },
  hero: {
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.indigo,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.indigo,
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
  },
  healthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 14,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: COLORS.indigo,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  toggleTextActive: {
    color: "#FFFFFF",
  },
  errorBox: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    color: "#FDA4AF",
    fontSize: 12.5,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.indigo,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

