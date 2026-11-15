import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * Full-bleed upper radial ambient glow matching the luminous indigo-lavender
 * halo in welcome_screen_mockup_2K.jpg.
 */
export function WelcomeAmbientGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 393 852"
        preserveAspectRatio="xMidYMin slice"
      >
        <Defs>
          <RadialGradient
            id="welcomeHalo"
            cx="196.5"
            cy="218"
            rx="186"
            ry="180"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor="#7773CB" stopOpacity="0.82" />
            <Stop offset="28%" stopColor="#5C58AA" stopOpacity="0.58" />
            <Stop offset="58%" stopColor="#302F65" stopOpacity="0.27" />
            <Stop offset="85%" stopColor="#121428" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#070A12" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="393" height="510" fill="url(#welcomeHalo)" />
      </Svg>
    </View>
  );
}

/**
 * Thin-stroke outline briefcase with integrated 4-point AI sparkle star,
 * matching welcome_screen_mockup_2K.jpg proportions and clean star cutout.
 */
export function BriefcaseSparkIcon({
  width = 68,
  height = 58,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 64 56" fill="none">
      <Defs>
        <LinearGradient
          id="briefcaseStroke"
          x1="10"
          y1="8"
          x2="54"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="#F5F5FC" />
          <Stop offset="100%" stopColor="#C4C2E6" />
        </LinearGradient>
      </Defs>

      {/* Top briefcase handle cleanly seated on the upper frame */}
      <Path
        d="M24.5 14V10.5C24.5 8.84 25.84 7.5 27.5 7.5H36.5C38.16 7.5 39.5 8.84 39.5 10.5V14"
        stroke="url(#briefcaseStroke)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Top-right shoulder segment with clean notch above the sparkle */}
      <Path
        d="M55 22.5V19C55 16.24 52.76 14 50 14H45.5"
        stroke="url(#briefcaseStroke)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main outer briefcase frame leaving generous cutout around the sparkle */}
      <Path
        d="M40.5 14H14C11.24 14 9 16.24 9 19V42.5C9 45.26 11.24 47.5 14 47.5H50C52.76 47.5 55 45.26 55 42.5V37.2"
        stroke="url(#briefcaseStroke)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Curved upper flap stopping neatly to the left of the sparkle */}
      <Path
        d="M9 22.8C9.2 28.4 13 30.8 19 30.8H31"
        stroke="url(#briefcaseStroke)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Crisp 4-point Gemini sparkle star */}
      <Path
        d="M44.5 19.2C45.5 27.5 48.5 29.8 56.8 30.8C48.5 31.8 45.5 34.1 44.5 42.4C43.5 34.1 40.5 31.8 32.2 30.8C40.5 29.8 43.5 27.5 44.5 19.2Z"
        fill="#F4F4FC"
      />
    </Svg>
  );
}

/**
 * Full-bleed horizontal periwinkle-indigo pill gradient for the primary CTA.
 */
export function PrimaryPillGradient() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 345 48"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="ctaPillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#7A81DF" />
            <Stop offset="50%" stopColor="#6E72D2" />
            <Stop offset="100%" stopColor="#6366C2" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="345" height="48" fill="url(#ctaPillGrad)" />
      </Svg>
    </View>
  );
}
