import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_MODEL_DISPLAY_NAMES,
  DEFAULT_MODEL_DISPLAY_NAME,
  LEGACY_MODEL_ID_MAP,
  formatHomeActiveStatus,
  normalizeModelId,
  resolveModelDisplayName,
} from "../profileHelpers.ts";

const SAMPLE_MODELS = [
  { id: "gemini-3.5-flash-lite", name: "Rapid Job Scanner" },
  { id: "gemini-3.8-flash", name: "Daily Application Tailor" },
  { id: "gemini-4-hydrogen", name: "  Career Strategist  " },
  { id: "gemini-4-argon", name: "Executive Headhunter" },
  { id: "blank-name-model", name: "   " },
];

test("normalizeModelId normalizes canonical IDs, strips prefixes, and maps legacy IDs", () => {
  assert.equal(DEFAULT_MODEL_DISPLAY_NAME, "Daily Application Tailor");
  assert.equal(normalizeModelId("gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("  GEMINI/gemini-4-hydrogen  "), "gemini-4-hydrogen");
  assert.equal(normalizeModelId("models/gemini-4-argon"), "gemini-4-argon");
  assert.equal(normalizeModelId("gemini/models/gemini-3.5-flash-lite"), "gemini-3.5-flash-lite");

  // Legacy model mappings
  assert.equal(normalizeModelId("gemini-3.7-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("gemini-3.6-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("gemini-3.5-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("gemini-2.5-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("gemini-3.1-pro-preview"), "gemini-4-argon");
  assert.equal(normalizeModelId("gemini-2.5-pro"), "gemini-4-argon");
  assert.equal(normalizeModelId("gemini-3.1-flash-lite"), "gemini-3.5-flash-lite");
  assert.equal(normalizeModelId("gemini-2.5-flash-lite"), "gemini-3.5-flash-lite");
  assert.equal(Object.keys(LEGACY_MODEL_ID_MAP).length, 8);
  assert.equal(Object.keys(CANONICAL_MODEL_DISPLAY_NAMES).length, 4);

  // Blank fallback & custom preservation
  assert.equal(normalizeModelId(""), "gemini-3.8-flash");
  assert.equal(normalizeModelId("   "), "gemini-3.8-flash");
  assert.equal(normalizeModelId(null), "gemini-3.8-flash");
  assert.equal(normalizeModelId(undefined), "gemini-3.8-flash");
  assert.equal(normalizeModelId("  gemini-custom-preview  "), "gemini-custom-preview");
});

test("resolveModelDisplayName resolves friendly tier names and maps legacy model IDs", () => {
  assert.equal(
    resolveModelDisplayName("gemini-3.5-flash-lite", SAMPLE_MODELS),
    "Rapid Job Scanner"
  );
  assert.equal(
    resolveModelDisplayName("gemini-3.8-flash", SAMPLE_MODELS),
    "Daily Application Tailor"
  );
  assert.equal(
    resolveModelDisplayName("  gemini-4-hydrogen  ", SAMPLE_MODELS),
    "Career Strategist"
  );
  assert.equal(
    resolveModelDisplayName("gemini-4-argon", SAMPLE_MODELS),
    "Executive Headhunter"
  );

  // Legacy IDs resolve to new friendly tier names with or without availableModels
  assert.equal(
    resolveModelDisplayName("gemini-3.7-flash", SAMPLE_MODELS),
    "Daily Application Tailor"
  );
  assert.equal(
    resolveModelDisplayName("gemini-3.1-pro-preview"),
    "Executive Headhunter"
  );
  assert.equal(
    resolveModelDisplayName("gemini-3.1-flash-lite"),
    "Rapid Job Scanner"
  );
});

test("resolveModelDisplayName falls back to raw model ID when unmatched or blank name", () => {
  assert.equal(
    resolveModelDisplayName("gemini-custom-preview", SAMPLE_MODELS),
    "gemini-custom-preview"
  );
  assert.equal(
    resolveModelDisplayName("  gemini-custom-preview  "),
    "gemini-custom-preview"
  );
  assert.equal(
    resolveModelDisplayName("blank-name-model", SAMPLE_MODELS),
    "blank-name-model"
  );
});

test("resolveModelDisplayName falls back to Daily Application Tailor when selectedModel is blank", () => {
  assert.equal(resolveModelDisplayName("", SAMPLE_MODELS), "Daily Application Tailor");
  assert.equal(resolveModelDisplayName("   ", SAMPLE_MODELS), "Daily Application Tailor");
  assert.equal(resolveModelDisplayName(""), "Daily Application Tailor");
  assert.equal(resolveModelDisplayName(null, SAMPLE_MODELS), "Daily Application Tailor");
  assert.equal(resolveModelDisplayName(undefined, SAMPLE_MODELS), "Daily Application Tailor");
});

test("formatHomeActiveStatus formats activeProfile.profile_name and friendly ModelOption.name", () => {
  const result = formatHomeActiveStatus(
    { profile_name: "KARIM FAIQ CV", full_name: "Karim Faiq" },
    "gemini-4-argon",
    SAMPLE_MODELS
  );

  assert.equal(result, "Active Profile: KARIM FAIQ CV • Executive Headhunter");
});

test("formatHomeActiveStatus trims profile_name, friendly model name, and maps legacy model IDs", () => {
  const result = formatHomeActiveStatus(
    { profile_name: "  Principal Analytics CV  ", full_name: "Karim Faiq" },
    "gemini-4-hydrogen",
    SAMPLE_MODELS
  );

  assert.equal(result, "Active Profile: Principal Analytics CV • Career Strategist");

  const legacyResult = formatHomeActiveStatus(
    { profile_name: "Principal Analytics CV", full_name: "Karim Faiq" },
    "gemini-3.1-pro-preview",
    SAMPLE_MODELS
  );

  assert.equal(legacyResult, "Active Profile: Principal Analytics CV • Executive Headhunter");
});

test("formatHomeActiveStatus falls back to full_name when profile_name is blank and Default Profile when null/undefined", () => {
  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "   ", full_name: "Karim Faiq" },
      "gemini-3.8-flash",
      SAMPLE_MODELS
    ),
    "Active Profile: Karim Faiq • Daily Application Tailor"
  );

  assert.equal(
    formatHomeActiveStatus(null, "gemini-3.8-flash", SAMPLE_MODELS),
    "Active Profile: Default Profile • Daily Application Tailor"
  );

  assert.equal(
    formatHomeActiveStatus(undefined, "gemini-4-argon", SAMPLE_MODELS),
    "Active Profile: Default Profile • Executive Headhunter"
  );

  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "", full_name: "  " },
      "gemini-3.5-flash-lite",
      SAMPLE_MODELS
    ),
    "Active Profile: Default Profile • Rapid Job Scanner"
  );
});

test("formatHomeActiveStatus falls back cleanly to raw selectedModel ID or default model label", () => {
  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "Data Lead CV", full_name: "Karim Faiq" },
      "gemini-custom-preview",
      SAMPLE_MODELS
    ),
    "Active Profile: Data Lead CV • gemini-custom-preview"
  );

  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "Data Lead CV", full_name: "Karim Faiq" },
      "gemini-custom-preview"
    ),
    "Active Profile: Data Lead CV • gemini-custom-preview"
  );

  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "Data Lead CV", full_name: "Karim Faiq" },
      "blank-name-model",
      SAMPLE_MODELS
    ),
    "Active Profile: Data Lead CV • blank-name-model"
  );

  assert.equal(
    formatHomeActiveStatus(null, "   ", SAMPLE_MODELS),
    "Active Profile: Default Profile • Daily Application Tailor"
  );
});
