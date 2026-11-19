import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  DARK_COLORS,
  LIGHT_COLORS,
  normalizeThemeMode,
  type ThemeColors,
  type ThemeMode,
} from "../constants/theme";
import { secureStorage, STORAGE_KEYS } from "../lib/storage";

export interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (next: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialWebThemeMode(): ThemeMode {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "dark";
  }
  try {
    return normalizeThemeMode(window.localStorage?.getItem(STORAGE_KEYS.THEME_MODE));
  } catch {
    return "dark";
  }
}

function syncWebDocumentTheme(mode: ThemeMode): void {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }
  const isDark = mode === "dark";
  const nextColors = isDark ? DARK_COLORS : LIGHT_COLORS;
  try {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = mode;
    if (document.body) {
      document.body.style.backgroundColor = nextColors.background;
    }
  } catch {
    // Ignore DOM access issues in restricted web contexts
  }
}

/**
 * Provides reactive Dark / Light theme state with zero-flash Web initialization
 * and persistent storage across sessions and sign-outs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const initial = readInitialWebThemeMode();
    syncWebDocumentTheme(initial);
    return initial;
  });
  const modeRef = useRef<ThemeMode>(mode);
  const userChangedRef = useRef(false);

  const setThemeMode = useCallback(async (next: ThemeMode): Promise<void> => {
    const normalized = normalizeThemeMode(next);
    userChangedRef.current = true;
    modeRef.current = normalized;
    setModeState(normalized);
    syncWebDocumentTheme(normalized);
    try {
      await secureStorage.setThemeMode(normalized);
    } catch {
      // Keep optimistic in-memory theme if storage write fails
    }
  }, []);

  const toggleTheme = useCallback(async (): Promise<void> => {
    const next: ThemeMode = modeRef.current === "dark" ? "light" : "dark";
    await setThemeMode(next);
  }, [setThemeMode]);

  useEffect(() => {
    syncWebDocumentTheme(modeRef.current);
    if (Platform.OS === "web") {
      return;
    }

    let mounted = true;
    const hydrateNativeTheme = async () => {
      try {
        const stored = await secureStorage.getThemeMode();
        if (!mounted || userChangedRef.current) return;
        modeRef.current = stored;
        setModeState(stored);
      } catch {
        // Default to dark mode if native storage read fails
      }
    };

    void hydrateNativeTheme();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === "dark";
    return {
      mode,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      setThemeMode,
      toggleTheme,
    };
  }, [mode, setThemeMode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}
