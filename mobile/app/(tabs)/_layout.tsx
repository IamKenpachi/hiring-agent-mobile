import React from "react";
import { Pressable } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { FileCheck2, Home, Radar, Settings, Wand2 } from "lucide-react-native";
import { COLORS } from "../../src/constants/theme";

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace("/home")}
            className="ml-4 h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] active:bg-white/10"
          >
            <Home size={16} color="#CBD5E1" />
          </Pressable>
        ),
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTitleStyle: {
          color: COLORS.textPrimary,
          fontWeight: "800",
          fontSize: 17,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBarBg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.indigo,
        tabBarInactiveTintColor: COLORS.textMuted,
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

