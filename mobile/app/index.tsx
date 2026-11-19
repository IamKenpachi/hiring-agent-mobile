import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "../src/context/ThemeContext";

export default function IndexScreen() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <ActivityIndicator size="large" color={colors.indigo} />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        Loading Hiring Agent Mobile...
      </Text>
    </View>
  );
}
