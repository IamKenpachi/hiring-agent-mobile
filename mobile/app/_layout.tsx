import "../global.css";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { ThemeToggleButton } from "../src/components/ThemeToggleButton";
import type { ThemeColors } from "../src/constants/theme";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableNative: false,
  });
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  colors: ThemeColors;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
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
      const styles = createStyles(this.props.colors);
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
  const { isReady, token, geminiApiKey, trialMode, profiles } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;

    const segList: string[] = Array.isArray(segments) ? segments : [];
    const firstSegment = segList[0];
    const secondSegment = segList[1];
    const inAuthGroup = firstSegment === "(auth)";
    const onOnboarding = inAuthGroup && secondSegment === "onboarding";
    const onLogin = inAuthGroup && secondSegment === "login";
    const onWelcome = inAuthGroup && secondSegment === "welcome";
    const isCallbackOrUnmatched =
      firstSegment === "auth" ||
      firstSegment === "+not-found" ||
      firstSegment === "[...unmatched]";

    const safeReplace = (href: Parameters<typeof router.replace>[0]) => {
      try {
        router.replace(href);
      } catch {
        // Ignore pre-mount navigation race on deep link cold start
      }
    };

    if (!token) {
      if (firstSegment === "auth") {
        safeReplace("/(auth)/login");
        return;
      }
      if (!onWelcome && !onLogin && !onOnboarding) {
        safeReplace("/(auth)/welcome");
      }
      return;
    }

    const needsOnboarding = (!geminiApiKey.trim() && !trialMode) || profiles.length === 0;
    if (needsOnboarding) {
      if (!onOnboarding) {
        safeReplace("/(auth)/onboarding");
      }
      return;
    }

    if (inAuthGroup || !firstSegment || isCallbackOrUnmatched) {
      safeReplace("/home");
    }
  }, [isReady, token, geminiApiKey, trialMode, profiles.length, segments, router]);

  if (!isReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.indigo} />
        <Text style={styles.loadingText}>Initializing Command Center...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 16,
          color: colors.textPrimary,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => (
          <View style={{ marginRight: 12 }}>
            <ThemeToggleButton size="compact" />
          </View>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="job/[id]"
        options={{
          title: "Job Match Analysis",
          headerBackTitle: "Hunt",
        }}
      />
      <Stack.Screen
        name="tailoring"
        options={{
          headerShown: false,
          gestureEnabled: false,
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

function ThemedAppShell() {
  const { isDark, colors } = useTheme();

  return (
    <>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={colors.background}
      />
      <AppErrorBoundary colors={colors}>
        <AuthProvider>
          <AuthNavigationGuard />
        </AuthProvider>
      </AppErrorBoundary>
    </>
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedAppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default SENTRY_DSN ? Sentry.wrap(RootLayout) : RootLayout;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingScreen: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "600",
    },
    errorContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 12,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    errorBody: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
    },
    retryBtn: {
      marginTop: 8,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.indigo,
    },
    retryText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 13,
    },
  });
}
