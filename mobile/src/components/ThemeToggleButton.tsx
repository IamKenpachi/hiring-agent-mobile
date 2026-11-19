import React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Moon, Sun } from "lucide-react-native";
import { getCardElevation } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

export interface ThemeToggleButtonProps {
  size?: "default" | "compact";
  style?: StyleProp<ViewStyle>;
}

/**
 * Circular top-bar theme toggle rendering a Sun in Dark Mode
 * and a Moon in Light Mode with accessible labels.
 */
export function ThemeToggleButton({
  size = "default",
  style,
}: ThemeToggleButtonProps) {
  const { isDark, colors, toggleTheme } = useTheme();
  const dimension = size === "compact" ? 34 : 38;
  const iconSize = size === "compact" ? 16 : 18;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      hitSlop={6}
      onPress={() => void toggleTheme()}
      style={({ pressed }) => [
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: colors.headerBtnBg,
          borderWidth: 1,
          borderColor: colors.headerBtnBorder,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.78 : 1,
        },
        getCardElevation(isDark),
        style,
      ]}
    >
      {isDark ? (
        <Sun size={iconSize} color="#FBBF24" />
      ) : (
        <Moon size={iconSize} color={colors.indigo} />
      )}
    </Pressable>
  );
}
