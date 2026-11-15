import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import {
  AuthButtonGradient,
  AuthHeroBriefcase,
  OnboardingScreenFrame,
  WEB_SANS,
} from "../../src/components/OnboardingGraphics";
import { useAuth } from "../../src/context/AuthContext";
import { ApiError } from "../../src/lib/api";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp, signUpWithOnboarding, onboardingDraft } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(
    params.mode === "signup" || onboardingDraft ? "signup" : "signin"
  );
  const [email, setEmail] = useState(() => onboardingDraft?.email || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.mode === "signup") {
      setMode("signup");
    } else if (params.mode === "signin") {
      setMode("signin");
    }
  }, [params.mode]);

  useEffect(() => {
    if (onboardingDraft?.email && !email) {
      setEmail(onboardingDraft.email);
    }
  }, [onboardingDraft?.email, email]);

  const isSignUpFlow = mode === "signup";

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    if (isSignUpFlow && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUpFlow) {
        if (onboardingDraft) {
          await signUpWithOnboarding(email, password, onboardingDraft);
        } else {
          await signUp(email, password);
        }
      } else {
        await signIn(email, password);
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
    <OnboardingScreenFrame strongGlow>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-5 pt-3 pb-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(auth)/welcome");
              }
            }}
            className="h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] active:bg-white/10"
          >
            <ArrowLeft size={16} color="#CBD5E1" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 26,
            paddingTop: 28,
            paddingBottom: 30,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Glowing Hero */}
          <View className="items-center mt-2">
            <View className="mb-4">
              <AuthHeroBriefcase size={88} />
            </View>
            <Text
              style={WEB_SANS}
              className="text-center text-[28px] font-bold tracking-[-0.6px] text-white"
            >
              Hiring Agent AI
            </Text>
            <Text
              style={WEB_SANS}
              className="mt-1.5 text-center text-[13px] font-normal text-[#94A3B8]"
            >
              {isSignUpFlow
                ? "Create your account to save your master profile."
                : "Hunt Smarter. Tailor Instantly. Land Offers."}
            </Text>
          </View>

          {/* Clean Email + Password Form (without Sign In / Sign Up pills on top) */}
          <View className="mt-10 gap-4">
            {error ? (
              <View className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5">
                <Text className="text-xs font-medium text-red-200">{error}</Text>
              </View>
            ) : null}

            <View>
              <Text style={WEB_SANS} className="text-[12.5px] font-medium text-[#CBD5E1] mb-1.5">
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-[46px] rounded-xl border border-[#4E568A] bg-[#0D1120] px-3.5 text-[14px] text-white"
              />
            </View>

            <View>
              <Text style={WEB_SANS} className="text-[12.5px] font-medium text-[#CBD5E1] mb-1.5">
                Password
              </Text>
              <View className="h-[46px] flex-row items-center rounded-xl border border-white/15 bg-[#0D1120] px-3.5">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#475569"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  className="flex-1 text-[14px] text-white"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  onPress={() => setShowPassword((prev) => !prev)}
                  className="pl-2 py-1"
                >
                  {showPassword ? (
                    <EyeOff size={17} color="#64748B" />
                  ) : (
                    <Eye size={17} color="#64748B" />
                  )}
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSignUpFlow ? "Create Account & Start Hunting" : "Sign In"}
              disabled={loading}
              onPress={() => void handleSubmit()}
              className="mt-3 h-[50px] w-full flex-row items-center justify-center gap-2 overflow-hidden rounded-full active:opacity-90"
            >
              <AuthButtonGradient />
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={WEB_SANS} className="text-[15.5px] font-semibold text-white">
                {loading
                  ? "Authenticating..."
                  : isSignUpFlow
                    ? "Create Account & Start Hunting"
                    : "Sign In"}
              </Text>
            </Pressable>
          </View>

          <View className="mt-auto pt-8 items-center">
            {isSignUpFlow ? (
              <Pressable onPress={() => setMode("signin")} className="py-2">
                <Text style={WEB_SANS} className="text-[12.5px] text-[#94A3B8]">
                  Already have an account?{" "}
                  <Text className="font-semibold text-[#A5B4FC]">Sign In</Text>
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.replace("/(auth)/onboarding")} className="py-2">
                <Text style={WEB_SANS} className="text-[12.5px] text-[#94A3B8]">
                  New to Hiring Agent AI?{" "}
                  <Text className="font-semibold text-[#A5B4FC]">Get Started</Text>
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingScreenFrame>
  );
}
