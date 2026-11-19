export type ThemeMode = "dark" | "light";

export interface ThemeColors {
  background: string;
  authBg: string;
  surface: string;
  surfaceElevated: string;
  surfaceCard: string;
  glassCardBg: string;
  glassCardBorder: string;
  inputBg: string;
  border: string;
  borderStrong: string;
  indigo: string;
  indigoText: string;
  indigoSoft: string;
  indigoBorder: string;
  purple: string;
  purpleText: string;
  purpleSoft: string;
  purpleBorder: string;
  emerald: string;
  emeraldText: string;
  emeraldSoft: string;
  emeraldBorder: string;
  amber: string;
  amberText: string;
  amberSoft: string;
  amberBorder: string;
  rose: string;
  roseText: string;
  roseSoft: string;
  roseBorder: string;
  cyan: string;
  cyanText: string;
  cyanSoft: string;
  cyanBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  tabBarBg: string;
  tabBarBorder: string;
  headerBtnBg: string;
  headerBtnBorder: string;
  modalBackdrop: string;
  shadowColor: string;
  haloPrimary: string;
  haloSecondary: string;
  haloFade: string;
}

export const DARK_COLORS: ThemeColors = {
  background: "#090D16",
  authBg: "#070A12",
  surface: "#111827",
  surfaceElevated: "#161F33",
  surfaceCard: "#0F1624",
  glassCardBg: "rgba(18, 22, 41, 0.85)",
  glassCardBorder: "rgba(255, 255, 255, 0.15)",
  inputBg: "#0B111E",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  indigo: "#6366F1",
  indigoText: "#C7D2FE",
  indigoSoft: "rgba(99, 102, 241, 0.16)",
  indigoBorder: "rgba(99, 102, 241, 0.42)",
  purple: "#A855F7",
  purpleText: "#E9D5FF",
  purpleSoft: "rgba(168, 85, 247, 0.16)",
  purpleBorder: "rgba(168, 85, 247, 0.42)",
  emerald: "#10B981",
  emeraldText: "#6EE7B7",
  emeraldSoft: "rgba(16, 185, 129, 0.16)",
  emeraldBorder: "rgba(16, 185, 129, 0.42)",
  amber: "#F59E0B",
  amberText: "#FDE68A",
  amberSoft: "rgba(245, 158, 11, 0.15)",
  amberBorder: "rgba(245, 158, 11, 0.4)",
  rose: "#F43F5E",
  roseText: "#FDA4AF",
  roseSoft: "rgba(244, 63, 94, 0.15)",
  roseBorder: "rgba(244, 63, 94, 0.4)",
  cyan: "#06B6D4",
  cyanText: "#A5F3FC",
  cyanSoft: "rgba(6, 182, 212, 0.15)",
  cyanBorder: "rgba(6, 182, 212, 0.38)",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  tabBarBg: "#0B101D",
  tabBarBorder: "rgba(255, 255, 255, 0.09)",
  headerBtnBg: "rgba(255, 255, 255, 0.06)",
  headerBtnBorder: "rgba(255, 255, 255, 0.16)",
  modalBackdrop: "rgba(3, 6, 14, 0.78)",
  shadowColor: "#000000",
  haloPrimary: "#6D5CE8",
  haloSecondary: "#3B357A",
  haloFade: "#070A12",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F8FAFC",
  authBg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceElevated: "#F1F5F9",
  surfaceCard: "#FFFFFF",
  glassCardBg: "#FFFFFF",
  glassCardBorder: "#E2E8F0",
  inputBg: "#F1F5F9",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  indigo: "#4F46E5",
  indigoText: "#4338CA",
  indigoSoft: "#EEF2FF",
  indigoBorder: "rgba(79, 70, 229, 0.28)",
  purple: "#7C3AED",
  purpleText: "#6D28D9",
  purpleSoft: "#F5F3FF",
  purpleBorder: "rgba(124, 58, 237, 0.28)",
  emerald: "#059669",
  emeraldText: "#047857",
  emeraldSoft: "#ECFDF5",
  emeraldBorder: "rgba(5, 150, 105, 0.30)",
  amber: "#D97706",
  amberText: "#B45309",
  amberSoft: "#FFFBEB",
  amberBorder: "rgba(217, 119, 6, 0.30)",
  rose: "#E11D48",
  roseText: "#BE123C",
  roseSoft: "#FFF1F2",
  roseBorder: "rgba(225, 29, 72, 0.28)",
  cyan: "#0284C7",
  cyanText: "#0369A1",
  cyanSoft: "#F0F9FF",
  cyanBorder: "rgba(2, 132, 199, 0.26)",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#64748B",
  tabBarBg: "#FFFFFF",
  tabBarBorder: "#E2E8F0",
  headerBtnBg: "#FFFFFF",
  headerBtnBorder: "#E2E8F0",
  modalBackdrop: "rgba(15, 23, 42, 0.45)",
  shadowColor: "#0F172A",
  haloPrimary: "#818CF8",
  haloSecondary: "#C7D2FE",
  haloFade: "#F8FAFC",
};

export const COLORS: ThemeColors = DARK_COLORS;

/**
 * Normalizes any persisted or external theme string into a valid ThemeMode,
 * defaulting to Dark Mode unless explicitly "light".
 */
export function normalizeThemeMode(raw?: string | null): ThemeMode {
  return (raw ?? "").trim().toLowerCase() === "light" ? "light" : "dark";
}

export function getScoreTheme(
  score: number,
  colors: ThemeColors = DARK_COLORS
): {
  color: string;
  textColor: string;
  softBg: string;
  border: string;
  label: string;
} {
  const clamped = Math.max(0, Math.min(100, Math.round(score || 0)));
  if (clamped >= 80) {
    return {
      color: colors.emerald,
      textColor: colors.emeraldText,
      softBg: colors.emeraldSoft,
      border: colors.emeraldBorder,
      label: "Strong",
    };
  }
  if (clamped >= 65) {
    return {
      color: colors.amber,
      textColor: colors.amberText,
      softBg: colors.amberSoft,
      border: colors.amberBorder,
      label: "Good Fit",
    };
  }
  return {
    color: colors.rose,
    textColor: colors.roseText,
    softBg: colors.roseSoft,
    border: colors.roseBorder,
    label: "Stretch",
  };
}

/**
 * Returns subtle light-mode card elevation shadows (zeroed in dark mode)
 * structurally compatible with React Native ViewStyle without RN runtime imports.
 */
export function getCardElevation(isDark: boolean) {
  return {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: isDark ? 0 : 4 },
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: isDark ? 0 : 12,
    elevation: isDark ? 0 : 2,
  };
}

export function formatDisplayDate(iso?: string | null): string {
  if (!iso) return "Just now";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
