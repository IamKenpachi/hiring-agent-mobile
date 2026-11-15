import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { ZoomIn, ZoomOut } from "lucide-react-native";
import { COLORS } from "../constants/theme";

interface HtmlDocumentViewerProps {
  html: string;
  markdownFallback?: string;
  title?: string;
}

function buildResponsiveHtml(rawHtml: string, zoomPct: number): string {
  const safeHtml = rawHtml || "<p>No document preview available.</p>";
  // If rawHtml is a full HTML document, inject responsive viewport + scaling override; otherwise wrap it cleanly.
  const scale = Math.max(0.65, Math.min(1.5, zoomPct / 100));
  const styleBlock = `
    <meta name="viewport" content="width=device-width, initial-scale=${scale}, maximum-scale=3.0, user-scalable=yes" />
    <style>
      html, body {
        margin: 0;
        padding: 10px;
        background: #e2e8f0;
        -webkit-text-size-adjust: 100%;
      }
      .a4-sheet, .page, body > div:first-child {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
    </style>
  `;

  if (/<head[\s>]/i.test(safeHtml)) {
    return safeHtml.replace(/<head([^>]*)>/i, `<head$1>${styleBlock}`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${styleBlock}</head><body>${safeHtml}</body></html>`;
}

export function HtmlDocumentViewer({
  html,
  markdownFallback,
  title,
}: HtmlDocumentViewerProps) {
  const [zoomPct, setZoomPct] = useState(100);
  const [showMarkdown, setShowMarkdown] = useState(false);

  const wrappedHtml = useMemo(() => buildResponsiveHtml(html, zoomPct), [html, zoomPct]);

  return (
    <View style={styles.container}>
      {/* Controls Bar */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {title || "A4 Executive Preview"}
        </Text>

        <View style={styles.toolbarActions}>
          {markdownFallback ? (
            <Pressable
              onPress={() => setShowMarkdown((prev) => !prev)}
              style={[styles.toolBtn, showMarkdown && styles.toolBtnActive]}
            >
              <Text style={styles.toolBtnText}>
                {showMarkdown ? "Styled A4" : "Markdown"}
              </Text>
            </Pressable>
          ) : null}

          {!showMarkdown ? (
            <View style={styles.zoomGroup}>
              <Pressable
                onPress={() => setZoomPct((z) => Math.max(70, z - 15))}
                style={styles.iconBtn}
              >
                <ZoomOut size={14} color={COLORS.textSecondary} />
              </Pressable>
              <Text style={styles.zoomLabel}>{zoomPct}%</Text>
              <Pressable
                onPress={() => setZoomPct((z) => Math.min(145, z + 15))}
                style={styles.iconBtn}
              >
                <ZoomIn size={14} color={COLORS.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {showMarkdown ? (
        <View style={styles.markdownBox}>
          <Text selectable style={styles.markdownText}>
            {markdownFallback}
          </Text>
        </View>
      ) : Platform.OS === "web" ? (
        <View style={styles.webFrameWrap}>
          {/* On Web, render an iframe with srcDoc for crisp isolated A4 CSS */}
          <iframe
            title={title || "Document Preview"}
            srcDoc={wrappedHtml}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#E2E8F0",
              borderRadius: 10,
              transform: zoomPct !== 100 ? `scale(${zoomPct / 100})` : undefined,
              transformOrigin: "top center",
            }}
          />
        </View>
      ) : (
        <WebView
          originWhitelist={["*"]}
          source={{ html: wrappedHtml }}
          style={styles.webview}
          scalesPageToFit
          builtInZoomControls
          displayZoomControls={false}
          nestedScrollEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  toolbarTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textPrimary,
    flex: 1,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toolBtnActive: {
    backgroundColor: COLORS.indigoSoft,
    borderColor: COLORS.indigoBorder,
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  zoomGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  iconBtn: {
    padding: 4,
  },
  zoomLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
    minWidth: 34,
    textAlign: "center",
  },
  webview: {
    flex: 1,
    backgroundColor: "#E2E8F0",
  },
  webFrameWrap: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  markdownBox: {
    flex: 1,
    padding: 14,
    backgroundColor: COLORS.inputBg,
  },
  markdownText: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

