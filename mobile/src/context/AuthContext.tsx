import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { apiClient, DEFAULT_AVAILABLE_MODELS, syncApiCredentials } from "../lib/api";
import { normalizeModelId } from "../lib/profileHelpers";
import { DEFAULT_GEMINI_MODEL, secureStorage } from "../lib/storage";
import { getSupabaseAuthClient, isGoogleAuthConfigured } from "../lib/supabase";
import type {
  ModelOption,
  Profile,
  ProfileCreatePayload,
  TokenTelemetry,
  User,
} from "../types";

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  isReady: boolean;
  backendHealthy: boolean | null;
  user: User | null;
  token: string | null;
  geminiApiKey: string;
  selectedModel: string;
  availableModels: ModelOption[];
  profiles: Profile[];
  activeProfile: Profile | null;
  tokenTelemetry: TokenTelemetry | null;
  onboardingDraft: ProfileCreatePayload | null;
  setOnboardingDraft: (draft: ProfileCreatePayload | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signUpWithOnboarding: (
    email: string,
    password: string,
    draft: ProfileCreatePayload
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setGeminiKey: (key: string) => Promise<void>;
  setSelectedModel: (model: string) => Promise<void>;
  refreshProfiles: () => Promise<Profile[]>;
  activateProfile: (profileId: string) => Promise<void>;
  refreshTelemetry: () => Promise<void>;
  pingHealth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKeyState] = useState<string>("");
  const [selectedModel, setSelectedModelState] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(
    DEFAULT_AVAILABLE_MODELS
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tokenTelemetry, setTokenTelemetry] = useState<TokenTelemetry | null>(null);
  const [onboardingDraft, setOnboardingDraft] = useState<ProfileCreatePayload | null>(null);

  const pingHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiClient.healthCheck();
      const ok = res?.status === "ok";
      setBackendHealthy(ok);
      return ok;
    } catch {
      setBackendHealthy(false);
      return false;
    }
  }, []);

  const refreshProfiles = useCallback(async (): Promise<Profile[]> => {
    try {
      const list = await apiClient.listProfiles();
      setProfiles(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }, []);

  const refreshTelemetry = useCallback(async (): Promise<void> => {
    try {
      const telemetry = await apiClient.getTokenTelemetry();
      setTokenTelemetry(telemetry);
      if (Array.isArray(telemetry.available_models) && telemetry.available_models.length > 0) {
        setAvailableModels(telemetry.available_models);
      }
    } catch {
      // Keep previous telemetry on transient network error
    }
  }, []);

  // Hydrate credentials from SecureStore / localStorage on launch
  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        let [storedToken, storedKey, storedModel] = await Promise.all([
          secureStorage.getAuthToken(),
          secureStorage.getGeminiApiKey(),
          secureStorage.getSelectedModel(),
        ]);

        // Recover Supabase Google OAuth session on web redirect return (PKCE ?code= or hash tokens)
        let pendingDraft = await secureStorage.getPendingOnboardingDraft();
        if (isGoogleAuthConfigured) {
          try {
            const supabase = getSupabaseAuthClient();
            const { data } = await supabase.auth.getSession();
            if (data?.session?.access_token) {
              storedToken = data.session.access_token;
              await secureStorage.setAuthToken(storedToken);
            }
            if (Platform.OS === "web" && typeof window !== "undefined") {
              const url = new URL(window.location.href);
              if (
                url.searchParams.has("code") ||
                url.searchParams.has("error") ||
                url.hash.includes("access_token")
              ) {
                window.history.replaceState({}, document.title, url.pathname);
              }
            }
          } catch {
            // Fall back to existing token if Supabase session lookup fails
          }
        }

        if (!mounted) return;
        const cleanKey = storedKey || "";
        const cleanModel = normalizeModelId(storedModel || DEFAULT_GEMINI_MODEL);
        if (storedModel && storedModel !== cleanModel) {
          void secureStorage.setSelectedModel(cleanModel).catch(() => {});
        }

        syncApiCredentials({
          token: storedToken,
          geminiKey: cleanKey,
          model: cleanModel,
        });

        setToken(storedToken);
        setGeminiApiKeyState(cleanKey);
        setSelectedModelState(cleanModel);
        if (pendingDraft) {
          setOnboardingDraft(pendingDraft);
        }

        // Non-blocking warm-up ping
        void pingHealth();

        if (storedToken) {
          try {
            const me = await apiClient.getMe();
            if (!mounted) return;
            setUser(me);
            const existingProfiles = await refreshProfiles();
            if (!mounted) return;

            if (pendingDraft && existingProfiles.length === 0) {
              const created = await apiClient.createProfile({
                ...pendingDraft,
                email: pendingDraft.email?.trim() || me.email,
                is_default: true,
              });
              if (!mounted) return;
              setProfiles([created]);
              await secureStorage.setPendingOnboardingDraft(null);
              pendingDraft = null;
              setOnboardingDraft(null);
            }
            await refreshTelemetry();
          } catch {
            // Token expired or invalid -> clear auth state
            if (!mounted) return;
            await secureStorage.clearAuthSession();
            syncApiCredentials({ token: null });
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (mounted) setIsReady(true);
      }
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, [pingHealth, refreshProfiles, refreshTelemetry]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const auth = await apiClient.signIn(email.trim(), password);
      await secureStorage.setAuthToken(auth.access_token);
      syncApiCredentials({ token: auth.access_token });
      setToken(auth.access_token);
      setUser(auth.user);
      await Promise.all([refreshProfiles(), refreshTelemetry()]);
    },
    [refreshProfiles, refreshTelemetry]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const auth = await apiClient.signUp(email.trim(), password, fullName);
      await secureStorage.setAuthToken(auth.access_token);
      syncApiCredentials({ token: auth.access_token });
      setToken(auth.access_token);
      setUser(auth.user);
      await Promise.all([refreshProfiles(), refreshTelemetry()]);
    },
    [refreshProfiles, refreshTelemetry]
  );

  const signUpWithOnboarding = useCallback(
    async (email: string, password: string, draft: ProfileCreatePayload) => {
      const auth = await apiClient.signUp(email.trim(), password, draft.full_name);
      await secureStorage.setAuthToken(auth.access_token);
      syncApiCredentials({ token: auth.access_token });

      const created = await apiClient.createProfile({
        ...draft,
        email: draft.email?.trim() || email.trim(),
        is_default: true,
      });

      setProfiles([created]);
      await secureStorage.setPendingOnboardingDraft(null);
      setOnboardingDraft(null);
      setUser(auth.user);
      setToken(auth.access_token);
      await refreshTelemetry();
    },
    [refreshTelemetry]
  );

  const applyAuthenticatedToken = useCallback(
    async (accessToken: string, fallbackEmail = "", fallbackName = "") => {
      await secureStorage.setAuthToken(accessToken);
      syncApiCredentials({ token: accessToken });

      let me: User = { id: "", email: fallbackEmail, full_name: fallbackName };
      try {
        me = await apiClient.getMe();
      } catch {
        // Use OAuth profile fallback if /me fails temporarily
      }

      const existingProfiles = await refreshProfiles();
      const draftToPersist = onboardingDraft || (await secureStorage.getPendingOnboardingDraft());

      if (draftToPersist && existingProfiles.length === 0) {
        const created = await apiClient.createProfile({
          ...draftToPersist,
          email: draftToPersist.email?.trim() || me.email || fallbackEmail,
          is_default: true,
        });
        setProfiles([created]);
      }

      await secureStorage.setPendingOnboardingDraft(null);
      setOnboardingDraft(null);
      setUser(me);
      setToken(accessToken);
      await refreshTelemetry();
    },
    [onboardingDraft, refreshProfiles, refreshTelemetry]
  );

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseAuthClient();
    if (onboardingDraft) {
      await secureStorage.setPendingOnboardingDraft(onboardingDraft);
    }

    if (Platform.OS === "web") {
      const redirectTo =
        typeof window !== "undefined" ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
      }
      return;
    }

    // Native iOS / Android PKCE flow using custom scheme hiring-agent://auth/callback
    const redirectTo = makeRedirectUri({
      scheme: "hiring-agent",
      path: "auth/callback",
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) {
      throw new Error("Could not start Google sign-in URL.");
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      if (result.type === "cancel" || result.type === "dismiss") {
        return;
      }
      throw new Error("Google authentication did not complete.");
    }

    const parsed = new URL(result.url);
    const hashParams = new URLSearchParams(
      parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash
    );
    const errorDesc =
      parsed.searchParams.get("error_description") || hashParams.get("error_description");
    if (errorDesc) {
      throw new Error(errorDesc);
    }

    const code = parsed.searchParams.get("code");
    let session = null;
    if (code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
      session = exchanged.data.session;
    } else {
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const res = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (res.error) throw res.error;
        session = res.data.session;
      }
    }

    if (!session?.access_token) {
      throw new Error("Google sign-in completed without a valid session token.");
    }

    const meta = (session.user?.user_metadata || {}) as Record<string, unknown>;
    await applyAuthenticatedToken(
      session.access_token,
      session.user?.email || "",
      String(meta.full_name || meta.name || "")
    );
  }, [applyAuthenticatedToken, onboardingDraft]);

  const signOut = useCallback(async () => {
    if (isGoogleAuthConfigured) {
      try {
        await getSupabaseAuthClient().auth.signOut();
      } catch {
        // Ignore remote signOut failure on offline logout
      }
    }
    await secureStorage.clearAuthSession();
    syncApiCredentials({ token: null });
    setToken(null);
    setUser(null);
    setProfiles([]);
    setTokenTelemetry(null);
    setOnboardingDraft(null);
  }, []);

  const setGeminiKey = useCallback(async (key: string) => {
    const clean = key.trim();
    await secureStorage.setGeminiApiKey(clean);
    syncApiCredentials({ geminiKey: clean });
    setGeminiApiKeyState(clean);
  }, []);

  const setSelectedModel = useCallback(async (model: string) => {
    const clean = normalizeModelId(model || DEFAULT_GEMINI_MODEL);
    syncApiCredentials({ model: clean });
    setSelectedModelState(clean);
    try {
      await secureStorage.setSelectedModel(clean);
    } catch {
      // Keep optimistic in-memory model selection if device storage write fails
    }
  }, []);

  const activateProfile = useCallback(
    async (profileId: string) => {
      await apiClient.activateProfile(profileId);
      await refreshProfiles();
    },
    [refreshProfiles]
  );

  const activeProfile = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find((p) => p.is_default) || profiles[0];
  }, [profiles]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      backendHealthy,
      user,
      token,
      geminiApiKey,
      selectedModel,
      availableModels,
      profiles,
      activeProfile,
      tokenTelemetry,
      onboardingDraft,
      setOnboardingDraft,
      signIn,
      signUp,
      signUpWithOnboarding,
      signInWithGoogle,
      signOut,
      setGeminiKey,
      setSelectedModel,
      refreshProfiles,
      activateProfile,
      refreshTelemetry,
      pingHealth,
    }),
    [
      isReady,
      backendHealthy,
      user,
      token,
      geminiApiKey,
      selectedModel,
      availableModels,
      profiles,
      activeProfile,
      tokenTelemetry,
      onboardingDraft,
      signIn,
      signUp,
      signUpWithOnboarding,
      signInWithGoogle,
      signOut,
      setGeminiKey,
      setSelectedModel,
      refreshProfiles,
      activateProfile,
      refreshTelemetry,
      pingHealth,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}

