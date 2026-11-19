import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { ZoomIn, ZoomOut } from "lucide-react-native";
import type { ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

interface HtmlDocumentViewerProps {
  html: string;
  markdownFallback?: string;
  title?: string;
}

function buildResponsiveHtml(rawHtml: string, zoomPct: number, isDark: boolean): string {
  const safeHtml = rawHtml || "<p>No document preview available.</p>";
  // Keep A4 paper crisp white while adapting the surrounding desk wrapper to the active theme.
  const deskBg = isDark ? "#1e293b" : "#e2e8f0";
  const scale = Math.max(0.65, Math.min(1.5, zoomPct / 100));
  const styleBlock = `
    <meta name="viewport" content="width=device-width, initial-scale=${scale}, maximum-scale=3.0, user-scalable=yes" />
    <style>
      html {
        margin: 0;
        padding: 10px;
        background: ${deskBg};
        -webkit-text-size-adjust: 100%;
      }
      body {
        margin: 0 auto;
        padding: 16px;
        background: #ffffff;
        color: #1e293b;
        border-radius: 6px;
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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [zoomPct, setZoomPct] = useState(100);
  const [showMarkdown, setShowMarkdown] = useState(false);

  const deskBg = isDark ? "#1E293B" : "#E2E8F0";
  const wrappedHtml = useMemo(
    () => buildResponsiveHtml(html, zoomPct, isDark),
    [html, zoomPct, isDark]
  );

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
              <Text style={[styles.toolBtnText, showMarkdown && styles.toolBtnTextActive]}>
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
                <ZoomOut size={14} color={colors.textSecondary} />
              </Pressable>
              <Text style={styles.zoomLabel}>{zoomPct}%</Text>
              <Pressable
                onPress={() => setZoomPct((z) => Math.min(145, z + 15))}
                style={styles.iconBtn}
              >
                <ZoomIn size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {showMarkdown ? (
        <ScrollView
          style={styles.markdownBox}
          contentContainerStyle={styles.markdownContent}
          nestedScrollEnabled
        >
          <Text selectable style={styles.markdownText}>
            {markdownFallback}
          </Text>
        </ScrollView>
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
              backgroundColor: deskBg,
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

function createStyles(colors: ThemeColors, isDark: boolean) {
  const deskBg = isDark ? "#1E293B" : "#E2E8F0";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    toolbarTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
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
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toolBtnActive: {
      backgroundColor: colors.indigoSoft,
      borderColor: colors.indigoBorder,
    },
    toolBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    toolBtnTextActive: {
      color: colors.indigoText,
    },
    zoomGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textPrimary,
      minWidth: 34,
      textAlign: "center",
    },
    webview: {
      flex: 1,
      backgroundColor: deskBg,
    },
    webFrameWrap: {
      flex: 1,
      overflow: "hidden",
      backgroundColor: deskBg,
    },
    markdownBox: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    markdownContent: {
      padding: 14,
    },
    markdownText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textPrimary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
  });
}

