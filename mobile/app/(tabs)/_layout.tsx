import React from "react";
import { Pressable, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { FileCheck2, Home, Radar, Settings, Wand2 } from "lucide-react-native";
import { ThemeToggleButton } from "../../src/components/ThemeToggleButton";
import { getCardElevation } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

export default function TabsLayout() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace("/home")}
            style={({ pressed }) => [
              {
                marginLeft: 16,
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.headerBtnBorder,
                backgroundColor: colors.headerBtnBg,
                opacity: pressed ? 0.78 : 1,
              },
              getCardElevation(isDark),
            ]}
          >
            <Home size={16} color={colors.textPrimary} />
          </Pressable>
        ),
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <ThemeToggleButton size="compact" />
          </View>
        ),
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTitleStyle: {
          color: colors.textPrimary,
          fontWeight: "800",
          fontSize: 17,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.indigo,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="hunt"
        options={{
          title: "JobSpy Hunter",
          tabBarLabel: "Hunt",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Radar size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: "Instant Tailor Studio",
          tabBarLabel: "Studio",
          tabBarIcon: ({ color, size }) => <Wand2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="outputs"
        options={{
          title: "Saved Outputs",
          tabBarLabel: "Outputs",
          tabBarIcon: ({ color, size }) => <FileCheck2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profiles & Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
