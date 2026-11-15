import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiClient, DEFAULT_AVAILABLE_MODELS, syncApiCredentials } from "../lib/api";
import { DEFAULT_GEMINI_MODEL, secureStorage } from "../lib/storage";
import type {
  ModelOption,
  Profile,
  ProfileCreatePayload,
  TokenTelemetry,
  User,
} from "../types";

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
        const [storedToken, storedKey, storedModel] = await Promise.all([
          secureStorage.getAuthToken(),
          secureStorage.getGeminiApiKey(),
          secureStorage.getSelectedModel(),
        ]);

        if (!mounted) return;
        const cleanKey = storedKey || "";
        const cleanModel = storedModel || DEFAULT_GEMINI_MODEL;

        syncApiCredentials({
          token: storedToken,
          geminiKey: cleanKey,
          model: cleanModel,
        });

        setToken(storedToken);
        setGeminiApiKeyState(cleanKey);
        setSelectedModelState(cleanModel);

        // Non-blocking warm-up ping
        void pingHealth();

        if (storedToken) {
          try {
            const me = await apiClient.getMe();
            if (!mounted) return;
            setUser(me);
            await Promise.all([refreshProfiles(), refreshTelemetry()]);
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
      setOnboardingDraft(null);
      setUser(auth.user);
      setToken(auth.access_token);
      await refreshTelemetry();
    },
    [refreshTelemetry]
  );

  const signOut = useCallback(async () => {
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
    const clean = model || DEFAULT_GEMINI_MODEL;
    await secureStorage.setSelectedModel(clean);
    syncApiCredentials({ model: clean });
    setSelectedModelState(clean);
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

