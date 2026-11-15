import "../global.css";
import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { COLORS } from "../src/constants/theme";
import { AuthProvider, useAuth } from "../src/context/AuthContext";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableNative: false,
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: Error) {
    if (SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{this.state.errorMessage}</Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, errorMessage: "" })}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function AuthNavigationGuard() {
  const { isReady, token, geminiApiKey, profiles } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;

    const segList: string[] = segments;
    const firstSegment = segList[0];
    const secondSegment = segList[1];
    const inAuthGroup = firstSegment === "(auth)";
    const onOnboarding = inAuthGroup && secondSegment === "onboarding";
    const onLogin = inAuthGroup && secondSegment === "login";
    const onWelcome = inAuthGroup && secondSegment === "welcome";

    if (!token) {
      if (!onWelcome && !onLogin && !onOnboarding) {
        router.replace("/(auth)/welcome");
      }
      return;
    }

    const needsOnboarding = !geminiApiKey.trim() || profiles.length === 0;
    if (needsOnboarding) {
      if (!onOnboarding) {
        router.replace("/(auth)/onboarding");
      }
      return;
    }

    if (inAuthGroup || !firstSegment) {
      router.replace("/(tabs)/hunt");
    }
  }, [isReady, token, geminiApiKey, profiles.length, segments, router]);

  if (!isReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
        <Text style={styles.loadingText}>Initializing Command Center...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: "700", fontSize: 16 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="job/[id]"
        options={{
          title: "Job Match Analysis",
          headerBackTitle: "Hunt",
        }}
      />
      <Stack.Screen
        name="output/[id]"
        options={{
          title: "Tailored Application",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.background} />
      <AppErrorBoundary>
        <AuthProvider>
          <AuthNavigationGuard />
        </AuthProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

export default SENTRY_DSN ? Sentry.wrap(RootLayout) : RootLayout;

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  errorBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.indigo,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
});
