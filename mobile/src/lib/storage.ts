import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { normalizeThemeMode, type ThemeMode } from "../constants/theme";
import type { ProfileCreatePayload } from "../types";

export const STORAGE_KEYS = {
  GEMINI_API_KEY: "gemini_api_key",
  AUTH_TOKEN: "auth_token",
  SELECTED_MODEL: "selected_model",
  PENDING_ONBOARDING_DRAFT: "pending_onboarding_draft",
  THEME_MODE: "app_theme_mode",
  TRIAL_MODE: "starter_trial_mode",
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

async function getRawItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      return null;
    }
    return null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setRawItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage quota errors in restricted web contexts
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteRawItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore web storage errors
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore missing item deletion errors
  }
}

export async function clearAllAccountData(): Promise<void> {
  await Promise.all([
    deleteRawItem(STORAGE_KEYS.AUTH_TOKEN),
    deleteRawItem(STORAGE_KEYS.PENDING_ONBOARDING_DRAFT),
    deleteRawItem(STORAGE_KEYS.GEMINI_API_KEY),
    deleteRawItem(STORAGE_KEYS.TRIAL_MODE),
  ]);
}

export const secureStorage = {
  getItem: getRawItem,
  setItem: setRawItem,
  deleteItem: deleteRawItem,

  async getAuthToken(): Promise<string | null> {
    return getRawItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  async setAuthToken(token: string | null): Promise<void> {
    if (!token) {
      await deleteRawItem(STORAGE_KEYS.AUTH_TOKEN);
    } else {
      await setRawItem(STORAGE_KEYS.AUTH_TOKEN, token);
    }
  },

  async getGeminiApiKey(): Promise<string | null> {
    return getRawItem(STORAGE_KEYS.GEMINI_API_KEY);
  },

  async setGeminiApiKey(apiKey: string | null): Promise<void> {
    const trimmed = apiKey?.trim() || "";
    if (!trimmed) {
      await deleteRawItem(STORAGE_KEYS.GEMINI_API_KEY);
    } else {
      await setRawItem(STORAGE_KEYS.GEMINI_API_KEY, trimmed);
    }
  },

  async getSelectedModel(): Promise<string> {
    const saved = await getRawItem(STORAGE_KEYS.SELECTED_MODEL);
    return saved || DEFAULT_GEMINI_MODEL;
  },

  async setSelectedModel(model: string): Promise<void> {
    await setRawItem(STORAGE_KEYS.SELECTED_MODEL, model || DEFAULT_GEMINI_MODEL);
  },

  async getThemeMode(): Promise<ThemeMode> {
    const raw = await getRawItem(STORAGE_KEYS.THEME_MODE);
    return normalizeThemeMode(raw);
  },

  async setThemeMode(mode: ThemeMode): Promise<void> {
    await setRawItem(STORAGE_KEYS.THEME_MODE, normalizeThemeMode(mode));
  },

  async getPendingOnboardingDraft(): Promise<ProfileCreatePayload | null> {
    const raw = await getRawItem(STORAGE_KEYS.PENDING_ONBOARDING_DRAFT);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProfileCreatePayload;
    } catch {
      return null;
    }
  },

  async setPendingOnboardingDraft(draft: ProfileCreatePayload | null): Promise<void> {
    if (!draft) {
      await deleteRawItem(STORAGE_KEYS.PENDING_ONBOARDING_DRAFT);
    } else {
      await setRawItem(STORAGE_KEYS.PENDING_ONBOARDING_DRAFT, JSON.stringify(draft));
    }
  },

  async getTrialMode(): Promise<boolean> {
    const raw = await getRawItem(STORAGE_KEYS.TRIAL_MODE);
    return raw === "true";
  },

  async setTrialMode(enabled: boolean): Promise<void> {
    if (enabled) {
      await setRawItem(STORAGE_KEYS.TRIAL_MODE, "true");
    } else {
      await deleteRawItem(STORAGE_KEYS.TRIAL_MODE);
    }
  },

  async clearAuthSession(): Promise<void> {
    await Promise.all([
      deleteRawItem(STORAGE_KEYS.AUTH_TOKEN),
      deleteRawItem(STORAGE_KEYS.PENDING_ONBOARDING_DRAFT),
    ]);
  },

  clearAllAccountData,
};

