import * as ExpoClipboard from "expo-clipboard";
import { Platform } from "react-native";

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  const container = document.body ?? document.documentElement;
  if (!container) return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.outline = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  container.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    container.removeChild(textarea);
    if (selection) {
      selection.removeAllRanges();
      if (previousRange) {
        selection.addRange(previousRange);
      }
    }
  }

  return copied;
}

/**
 * Copies plain text to the clipboard across Native (iOS/Android) and Web,
 * including HTTP/restricted web origins where navigator.clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  const canUseAsyncClipboardOnWeb =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText);

  if (Platform.OS !== "web" || canUseAsyncClipboardOnWeb) {
    try {
      const copied = await ExpoClipboard.setStringAsync(text);
      if (copied) return true;
    } catch {
      // Fall through to web clipboard fallbacks.
    }
  }

  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to legacy execCommand fallback.
      }
    }

    return copyViaExecCommand(text);
  }

  return false;
}
