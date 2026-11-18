import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHomeActiveStatus,
  resolveModelDisplayName,
} from "../profileHelpers.ts";

const SAMPLE_MODELS = [
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
  { id: "gemini-2.5-flash", name: "  Gemini 2.5 Flash  " },
  { id: "blank-name-model", name: "   " },
];

test("resolveModelDisplayName resolves friendly model name and trims whitespace", () => {
  assert.equal(
    resolveModelDisplayName("gemini-3.1-pro-preview", SAMPLE_MODELS),
    "Gemini 3.1 Pro Preview"
  );
  assert.equal(
    resolveModelDisplayName("  gemini-2.5-flash  ", SAMPLE_MODELS),
    "Gemini 2.5 Flash"
  );
});

test("resolveModelDisplayName falls back to raw model ID when unmatched, omitted, or blank name", () => {
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

test("resolveModelDisplayName falls back to Gemini 3.7 Flash when selectedModel is blank", () => {
  assert.equal(resolveModelDisplayName("", SAMPLE_MODELS), "Gemini 3.7 Flash");
  assert.equal(resolveModelDisplayName("   ", SAMPLE_MODELS), "Gemini 3.7 Flash");
  assert.equal(resolveModelDisplayName(""), "Gemini 3.7 Flash");
  assert.equal(resolveModelDisplayName(undefined, SAMPLE_MODELS), "Gemini 3.7 Flash");
});

test("formatHomeActiveStatus formats activeProfile.profile_name and friendly ModelOption.name", () => {
  const result = formatHomeActiveStatus(
    { profile_name: "KARIM FAIQ CV", full_name: "Karim Faiq" },
    "gemini-3.1-pro-preview",
    SAMPLE_MODELS
  );

  assert.equal(result, "Active Profile: KARIM FAIQ CV • Gemini 3.1 Pro Preview");
});

test("formatHomeActiveStatus trims profile_name and friendly model name", () => {
  const result = formatHomeActiveStatus(
    { profile_name: "  Principal Analytics CV  ", full_name: "Karim Faiq" },
    "gemini-2.5-flash",
    SAMPLE_MODELS
  );

  assert.equal(result, "Active Profile: Principal Analytics CV • Gemini 2.5 Flash");
});

test("formatHomeActiveStatus falls back to full_name when profile_name is blank and Default Profile when null/undefined", () => {
  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "   ", full_name: "Karim Faiq" },
      "gemini-3.7-flash",
      SAMPLE_MODELS
    ),
    "Active Profile: Karim Faiq • Gemini 3.7 Flash"
  );

  assert.equal(
    formatHomeActiveStatus(null, "gemini-3.7-flash", SAMPLE_MODELS),
    "Active Profile: Default Profile • Gemini 3.7 Flash"
  );

  assert.equal(
    formatHomeActiveStatus(undefined, "gemini-3.1-pro-preview", SAMPLE_MODELS),
    "Active Profile: Default Profile • Gemini 3.1 Pro Preview"
  );

  assert.equal(
    formatHomeActiveStatus(
      { profile_name: "", full_name: "  " },
      "gemini-3.7-flash",
      SAMPLE_MODELS
    ),
    "Active Profile: Default Profile • Gemini 3.7 Flash"
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
    "Active Profile: Default Profile • Gemini 3.7 Flash"
  );
});
