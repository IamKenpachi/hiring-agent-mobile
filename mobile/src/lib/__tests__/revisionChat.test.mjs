import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDisplayedChatHistory,
  computeAndroidModalKeyboardInset,
  parseChatMessageLines,
} from "../revisionChat.ts";
import { parseInlineSpans } from "../descriptionParser.ts";

test("computeAndroidModalKeyboardInset computes exact inset for non-resizing Android Modal", () => {
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 850,
      keyboardScreenY: 512,
      keyboardHeight: 290,
    }),
    338
  );

  // Rounds fractional layout measurements cleanly
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 850.4,
      keyboardScreenY: 512.1,
      keyboardHeight: 290.6,
    }),
    338
  );
});

test("computeAndroidModalKeyboardInset returns 0 for auto-resizing Modal (zero double-pad)", () => {
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 512,
      keyboardScreenY: 512,
      keyboardHeight: 290,
    }),
    0
  );

  // Modal bottom already above the keyboard
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 480,
      keyboardScreenY: 512,
      keyboardHeight: 290,
    }),
    0
  );
});

test("computeAndroidModalKeyboardInset handles hidden keyboard and zero-bounds fallback", () => {
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 850,
      keyboardScreenY: 512,
      keyboardHeight: 0,
    }),
    0
  );

  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 850,
      keyboardScreenY: 512,
      keyboardHeight: -20,
    }),
    0
  );

  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 0,
      keyboardScreenY: 0,
      keyboardHeight: 290,
    }),
    290
  );

  // Partial zero bounds also fall back to keyboardHeight
  assert.equal(
    computeAndroidModalKeyboardInset({
      modalBottomY: 850,
      keyboardScreenY: 0,
      keyboardHeight: 290,
    }),
    290
  );
});

test("buildDisplayedChatHistory appends optimistic user message cleanly without mutating serverHistory", () => {
  const serverHistory = [
    { role: "user", content: "Make summary more concise", doc_type: "cv" },
    { role: "assistant", content: "Tightened your summary to 3 lines.", doc_type: "cv" },
  ];
  const pending = {
    role: "user",
    content: "Emphasize quantifiable metrics",
    timestamp: "2026-11-19T15:20:00.000Z",
    doc_type: "cv",
  };

  const displayed = buildDisplayedChatHistory(serverHistory, pending);
  assert.equal(displayed.length, 3);
  assert.deepEqual(displayed[2], pending);
  assert.equal(serverHistory.length, 2);

  // Also works cleanly when serverHistory is initially empty
  const fromEmpty = buildDisplayedChatHistory([], pending);
  assert.deepEqual(fromEmpty, [pending]);
});

test("buildDisplayedChatHistory returns serverHistory unchanged when pending is null/blank or already echoed", () => {
  const serverHistory = [
    { role: "user", content: "Make summary more concise", doc_type: "cv" },
    { role: "assistant", content: "Done! Summary is now tighter.", doc_type: "cv" },
  ];

  assert.equal(buildDisplayedChatHistory(serverHistory, null), serverHistory);
  assert.equal(
    buildDisplayedChatHistory(serverHistory, { role: "user", content: "" }),
    serverHistory
  );
  assert.equal(
    buildDisplayedChatHistory(serverHistory, { role: "user", content: "   \n\t  " }),
    serverHistory
  );

  // Echoed as last user message (with whitespace differences)
  const trailingUserHistory = [
    ...serverHistory,
    { role: "user", content: "Emphasize quantifiable metrics" },
  ];
  assert.equal(
    buildDisplayedChatHistory(trailingUserHistory, {
      role: "user",
      content: "  Emphasize quantifiable metrics  ",
    }),
    trailingUserHistory
  );

  // Echoed as user + assistant pair at the end
  const completedTurnHistory = [
    ...trailingUserHistory,
    { role: "assistant", content: "Added impact numbers across 4 bullets." },
  ];
  assert.equal(
    buildDisplayedChatHistory(completedTurnHistory, {
      role: "user",
      content: "Emphasize quantifiable metrics",
    }),
    completedTurnHistory
  );

  // Re-sending an older prompt from earlier in the thread should still append
  const repeatedOlderPrompt = {
    role: "user",
    content: "Make summary more concise",
  };
  const withRepeat = buildDisplayedChatHistory(
    completedTurnHistory,
    repeatedOlderPrompt
  );
  assert.equal(withRepeat.length, completedTurnHistory.length + 1);
  assert.deepEqual(withRepeat[withRepeat.length - 1], repeatedOlderPrompt);
});

test("parseChatMessageLines parses multiline assistant markdown with bold spans and preserves blank lines", () => {
  const assistantReply = [
    "Updated your profile headline to **Strategic Data Analyst** for stronger ATS match.",
    "",
    "**Aggressive Keyword Injection added:**",
    "- Embedded *Snowflake* and **dbt Core** into recent experience.",
  ].join("\r\n");

  const lines = parseChatMessageLines(assistantReply, parseInlineSpans);
  assert.equal(lines.length, 4);

  assert.deepEqual(lines[0], [
    { text: "Updated your profile headline to " },
    { text: "Strategic Data Analyst", bold: true },
    { text: " for stronger ATS match." },
  ]);
  assert.deepEqual(lines[1], []);
  assert.deepEqual(lines[2], [
    { text: "Aggressive Keyword Injection added:", bold: true },
  ]);
  assert.deepEqual(lines[3], [
    { text: "- Embedded " },
    { text: "Snowflake", italic: true },
    { text: " and " },
    { text: "dbt Core", bold: true },
    { text: " into recent experience." },
  ]);

  // No raw ** markers remain in any parsed line
  for (const lineSpans of lines) {
    for (const span of lineSpans) {
      assert.equal(span.text.includes("**"), false);
    }
  }

  // Empty string maps to [[]]
  assert.deepEqual(parseChatMessageLines("", parseInlineSpans), [[]]);
});
