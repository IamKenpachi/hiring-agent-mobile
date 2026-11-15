import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { COLORS } from "../src/constants/theme";

export default function IndexScreen() {
  return (
    <View className="flex-1 bg-obsidian items-center justify-center gap-3">
      <ActivityIndicator size="large" color={COLORS.indigo} />
      <Text className="text-slate-400 text-[13px] font-semibold">
        Loading Hiring Agent Mobile...
      </Text>
    </View>
  );
}

