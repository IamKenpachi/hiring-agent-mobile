import test from "node:test";
import assert from "node:assert/strict";
import {
  COLORS,
  DARK_COLORS,
  LIGHT_COLORS,
  formatDisplayDate,
  getCardElevation,
  getScoreTheme,
  normalizeThemeMode,
} from "../../constants/theme.ts";

const EXPECTED_COLOR_KEYS = [
  "amber",
  "amberBorder",
  "amberSoft",
  "amberText",
  "authBg",
  "background",
  "border",
  "borderStrong",
  "cyan",
  "cyanBorder",
  "cyanSoft",
  "cyanText",
  "emerald",
  "emeraldBorder",
  "emeraldSoft",
  "emeraldText",
  "glassCardBg",
  "glassCardBorder",
  "haloFade",
  "haloPrimary",
  "haloSecondary",
  "headerBtnBg",
  "headerBtnBorder",
  "indigo",
  "indigoBorder",
  "indigoSoft",
  "indigoText",
  "inputBg",
  "modalBackdrop",
  "purple",
  "purpleBorder",
  "purpleSoft",
  "purpleText",
  "rose",
  "roseBorder",
  "roseSoft",
  "roseText",
  "shadowColor",
  "surface",
  "surfaceCard",
  "surfaceElevated",
  "tabBarBg",
  "tabBarBorder",
  "textMuted",
  "textPrimary",
  "textSecondary",
];

test("DARK_COLORS and LIGHT_COLORS have full key parity and valid non-empty tokens", () => {
  const darkKeys = Object.keys(DARK_COLORS).sort();
  const lightKeys = Object.keys(LIGHT_COLORS).sort();

  assert.deepEqual(darkKeys, EXPECTED_COLOR_KEYS);
  assert.deepEqual(lightKeys, EXPECTED_COLOR_KEYS);
  assert.deepEqual(COLORS, DARK_COLORS);

  for (const key of EXPECTED_COLOR_KEYS) {
    assert.equal(typeof DARK_COLORS[key], "string", `DARK_COLORS.${key} must be a string`);
    assert.ok(DARK_COLORS[key].trim().length > 0, `DARK_COLORS.${key} must be non-empty`);
    assert.equal(typeof LIGHT_COLORS[key], "string", `LIGHT_COLORS.${key} must be a string`);
    assert.ok(LIGHT_COLORS[key].trim().length > 0, `LIGHT_COLORS.${key} must be non-empty`);
  }
});

test("DARK_COLORS and LIGHT_COLORS define distinct canvas, surface, border, and text tokens", () => {
  const distinctKeys = [
    "background",
    "authBg",
    "surface",
    "surfaceElevated",
    "surfaceCard",
    "glassCardBg",
    "glassCardBorder",
    "inputBg",
    "border",
    "borderStrong",
    "textPrimary",
    "textSecondary",
    "indigo",
    "indigoText",
    "purpleText",
    "emeraldText",
    "amberText",
    "roseText",
    "cyanText",
    "tabBarBg",
    "tabBarBorder",
    "headerBtnBg",
    "headerBtnBorder",
    "modalBackdrop",
    "shadowColor",
    "haloPrimary",
    "haloSecondary",
    "haloFade",
  ];

  for (const key of distinctKeys) {
    assert.notEqual(
      DARK_COLORS[key],
      LIGHT_COLORS[key],
      `Expected DARK_COLORS.${key} and LIGHT_COLORS.${key} to differ`
    );
  }
});

test("normalizeThemeMode accepts case-insensitive light and defaults all other inputs to dark", () => {
  assert.equal(normalizeThemeMode("light"), "light");
  assert.equal(normalizeThemeMode("LIGHT"), "light");
  assert.equal(normalizeThemeMode("  Light  "), "light");

  assert.equal(normalizeThemeMode("dark"), "dark");
  assert.equal(normalizeThemeMode("DARK"), "dark");
  assert.equal(normalizeThemeMode("  dark  "), "dark");
  assert.equal(normalizeThemeMode(""), "dark");
  assert.equal(normalizeThemeMode("   "), "dark");
  assert.equal(normalizeThemeMode(null), "dark");
  assert.equal(normalizeThemeMode(undefined), "dark");
  assert.equal(normalizeThemeMode("system"), "dark");
  assert.equal(normalizeThemeMode("auto"), "dark");
});

test("getScoreTheme returns theme-aware colors, textColor, softBg, border, and labels", () => {
  // Default (DARK_COLORS)
  assert.deepEqual(getScoreTheme(92), {
    color: DARK_COLORS.emerald,
    textColor: DARK_COLORS.emeraldText,
    softBg: DARK_COLORS.emeraldSoft,
    border: DARK_COLORS.emeraldBorder,
    label: "Strong",
  });
  assert.deepEqual(getScoreTheme(72, DARK_COLORS), {
    color: DARK_COLORS.amber,
    textColor: DARK_COLORS.amberText,
    softBg: DARK_COLORS.amberSoft,
    border: DARK_COLORS.amberBorder,
    label: "Good Fit",
  });
  assert.deepEqual(getScoreTheme(45, DARK_COLORS), {
    color: DARK_COLORS.rose,
    textColor: DARK_COLORS.roseText,
    softBg: DARK_COLORS.roseSoft,
    border: DARK_COLORS.roseBorder,
    label: "Stretch",
  });

  // Light Mode high-contrast tokens
  assert.deepEqual(getScoreTheme(80, LIGHT_COLORS), {
    color: LIGHT_COLORS.emerald,
    textColor: LIGHT_COLORS.emeraldText,
    softBg: LIGHT_COLORS.emeraldSoft,
    border: LIGHT_COLORS.emeraldBorder,
    label: "Strong",
  });
  assert.deepEqual(getScoreTheme(65, LIGHT_COLORS), {
    color: LIGHT_COLORS.amber,
    textColor: LIGHT_COLORS.amberText,
    softBg: LIGHT_COLORS.amberSoft,
    border: LIGHT_COLORS.amberBorder,
    label: "Good Fit",
  });
  assert.deepEqual(getScoreTheme(64, LIGHT_COLORS), {
    color: LIGHT_COLORS.rose,
    textColor: LIGHT_COLORS.roseText,
    softBg: LIGHT_COLORS.roseSoft,
    border: LIGHT_COLORS.roseBorder,
    label: "Stretch",
  });

  // Clamping edge cases
  assert.equal(getScoreTheme(150, LIGHT_COLORS).label, "Strong");
  assert.equal(getScoreTheme(-10, LIGHT_COLORS).label, "Stretch");
  assert.equal(getScoreTheme(Number.NaN, LIGHT_COLORS).label, "Stretch");
});

test("getCardElevation zeroes elevation in dark mode and returns subtle shadow in light mode", () => {
  assert.deepEqual(getCardElevation(true), {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  });

  assert.deepEqual(getCardElevation(false), {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  });
});

test("formatDisplayDate preserves fallback and invalid date handling", () => {
  assert.equal(formatDisplayDate(null), "Just now");
  assert.equal(formatDisplayDate(undefined), "Just now");
  assert.equal(formatDisplayDate(""), "Just now");
  assert.equal(formatDisplayDate("not-a-date"), "not-a-date");
  assert.ok(formatDisplayDate("2026-11-18T12:00:00Z").length > 0);
});
