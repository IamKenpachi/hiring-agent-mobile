export const COLORS = {
  background: "#090D16",
  surface: "#111827",
  surfaceElevated: "#161F33",
  surfaceCard: "#0F1624",
  inputBg: "#0B111E",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  indigo: "#6366F1",
  indigoSoft: "rgba(99, 102, 241, 0.16)",
  indigoBorder: "rgba(99, 102, 241, 0.42)",
  purple: "#A855F7",
  purpleSoft: "rgba(168, 85, 247, 0.16)",
  purpleBorder: "rgba(168, 85, 247, 0.42)",
  emerald: "#10B981",
  emeraldSoft: "rgba(16, 185, 129, 0.16)",
  emeraldBorder: "rgba(16, 185, 129, 0.42)",
  amber: "#F59E0B",
  amberSoft: "rgba(245, 158, 11, 0.15)",
  amberBorder: "rgba(245, 158, 11, 0.4)",
  rose: "#F43F5E",
  roseSoft: "rgba(244, 63, 94, 0.15)",
  roseBorder: "rgba(244, 63, 94, 0.4)",
  cyan: "#06B6D4",
  cyanSoft: "rgba(6, 182, 212, 0.15)",
  cyanBorder: "rgba(6, 182, 212, 0.38)",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  tabBarBg: "#0B101D",
} as const;

export function getScoreTheme(score: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(score || 0)));
  if (clamped >= 80) {
    return {
      color: COLORS.emerald,
      softBg: COLORS.emeraldSoft,
      border: COLORS.emeraldBorder,
      label: "Strong",
    };
  }
  if (clamped >= 65) {
    return {
      color: COLORS.amber,
      softBg: COLORS.amberSoft,
      border: COLORS.amberBorder,
      label: "Good Fit",
    };
  }
  return {
    color: COLORS.rose,
    softBg: COLORS.roseSoft,
    border: COLORS.roseBorder,
    label: "Stretch",
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

