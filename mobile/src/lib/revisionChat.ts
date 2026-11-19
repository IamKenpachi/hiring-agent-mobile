import type { ChatMessage } from "../types";
import type { TextSpan } from "./descriptionParser";

export interface AndroidModalKeyboardInsetInput {
  modalBottomY: number;
  keyboardScreenY: number;
  keyboardHeight: number;
}

/**
 * Compute bottom padding for an Android <Modal> when the soft keyboard opens.
 * Comparing the un-padded modal's bottom edge (`modalBottomY`) against
 * `keyboardScreenY` handles both non-resizing edge-to-edge modals and
 * OEM/window-mode auto-resizing modals without double-padding.
 */
export function computeAndroidModalKeyboardInset(
  input: AndroidModalKeyboardInsetInput
): number {
  if (!Number.isFinite(input.keyboardHeight) || input.keyboardHeight <= 0) {
    return 0;
  }

  if (
    Number.isFinite(input.modalBottomY) &&
    Number.isFinite(input.keyboardScreenY) &&
    input.modalBottomY > 0 &&
    input.keyboardScreenY > 0
  ) {
    return Math.max(0, Math.round(input.modalBottomY - input.keyboardScreenY));
  }

  return Math.max(0, Math.round(input.keyboardHeight));
}

/**
 * Append an optimistic pending user prompt to server chat history unless
 * the server history already ends with that same user turn (either alone or
 * immediately followed by the assistant's reply).
 */
export function buildDisplayedChatHistory(
  serverHistory: ChatMessage[],
  pendingUserMessage: ChatMessage | null
): ChatMessage[] {
  if (!pendingUserMessage) {
    return serverHistory;
  }

  const pendingText =
    typeof pendingUserMessage.content === "string"
      ? pendingUserMessage.content.trim()
      : "";
  if (!pendingText) {
    return serverHistory;
  }

  const last =
    serverHistory.length > 0 ? serverHistory[serverHistory.length - 1] : undefined;
  const secondLast =
    serverHistory.length > 1 ? serverHistory[serverHistory.length - 2] : undefined;

  const lastText = typeof last?.content === "string" ? last.content.trim() : "";
  const secondLastText =
    typeof secondLast?.content === "string" ? secondLast.content.trim() : "";

  if (last?.role === "user" && lastText === pendingText) {
    return serverHistory;
  }

  if (
    last?.role === "assistant" &&
    secondLast?.role === "user" &&
    secondLastText === pendingText
  ) {
    return serverHistory;
  }

  return [...serverHistory, pendingUserMessage];
}

/**
 * Normalize line endings and parse each line of a revision chat message into
 * inline TextSpans while preserving blank lines as `[]`.
 */
export function parseChatMessageLines(
  content: string,
  parseLineSpans: (line: string) => TextSpan[]
): TextSpan[][] {
  const normalized = (typeof content === "string" ? content : "").replace(
    /\r\n?/g,
    "\n"
  );
  return normalized
    .split("\n")
    .map((line) => (line.length > 0 ? parseLineSpans(line) : []));
}
