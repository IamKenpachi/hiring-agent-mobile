import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const STORAGE_KEYS = {
  GEMINI_API_KEY: "gemini_api_key",
  AUTH_TOKEN: "auth_token",
  SELECTED_MODEL: "selected_model",
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

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

  async clearAuthSession(): Promise<void> {
    await deleteRawItem(STORAGE_KEYS.AUTH_TOKEN);
  },
};

