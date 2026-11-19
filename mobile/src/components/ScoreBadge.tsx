import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getScoreTheme, type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface ScoreBadgeProps {
  label: string;
  score: number;
  compact?: boolean;
}

export function ScoreBadge({ label, score, compact = false }: ScoreBadgeProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const theme = getScoreTheme(score, colors);
  const rounded = Math.max(0, Math.min(100, Math.round(score || 0)));

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        { backgroundColor: theme.softBg, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.pillLabel, compact && styles.pillLabelCompact]}>
        {label}
      </Text>
      <Text
        style={[
          styles.pillValue,
          compact && styles.pillValueCompact,
          { color: theme.textColor },
        ]}
      >
        {rounded}%
      </Text>
    </View>
  );
}

interface ScoreBarProps {
  label: string;
  score: number;
  subtitle?: string;
}

export function ScoreBar({ label, score, subtitle }: ScoreBarProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const theme = getScoreTheme(score, colors);
  const rounded = Math.max(0, Math.min(100, Math.round(score || 0)));

  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <View style={styles.barTitleWrap}>
          <Text style={styles.barLabel}>{label}</Text>
          {subtitle ? <Text style={styles.barSub}>{subtitle}</Text> : null}
        </View>
        <View style={styles.barRight}>
          <View
            style={[
              styles.bandChip,
              { backgroundColor: theme.softBg, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.bandText, { color: theme.textColor }]}>
              {theme.label}
            </Text>
          </View>
          <Text style={[styles.barValue, { color: theme.textColor }]}>
            {rounded}%
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${rounded}%`, backgroundColor: theme.color },
          ]}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillCompact: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      gap: 4,
    },
    pillLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    pillLabelCompact: {
      fontSize: 10,
    },
    pillValue: {
      fontSize: 12,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    pillValueCompact: {
      fontSize: 11,
    },
    barContainer: {
      gap: 6,
    },
    barHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    barTitleWrap: {
      flex: 1,
    },
    barLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    barSub: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    barRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    bandChip: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    bandText: {
      fontSize: 10,
      fontWeight: "700",
    },
    barValue: {
      fontSize: 15,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
      minWidth: 42,
      textAlign: "right",
    },
    track: {
      height: 7,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : colors.border,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: 999,
    },
  });
}

