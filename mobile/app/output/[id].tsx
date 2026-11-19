import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MessageSquareText,
  Send,
  Sparkles,
  Target,
  User as UserIcon,
  X,
  XCircle,
  Zap,
} from "lucide-react-native";
import {
  formatDisplayDate,
  getCardElevation,
  type ThemeColors,
} from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError, buildAuthHeaders } from "../../src/lib/api";
import { resolveModelDisplayName } from "../../src/lib/profileHelpers";
import { HtmlDocumentViewer } from "../../src/components/HtmlDocumentViewer";
import { ScoreBadge, ScoreBar } from "../../src/components/ScoreBadge";
import type { TailoredOutput } from "../../src/types";

const SLIDES = [
  { key: "cv", label: "Tailored CV", icon: FileText },
  { key: "cl", label: "Cover Letter", icon: Mail },
  { key: "scores", label: "Scores & Keywords", icon: Target },
] as const;

const QUICK_ACTIONS: Array<{ label: string; docType?: "cv" | "cover_letter" }> = [
  { label: "Remove injected keywords I don't know", docType: "cv" },
  { label: "Make summary more concise", docType: "cv" },
  { label: "Emphasize quantifiable metrics", docType: "cv" },
  { label: "Make Cover Letter hook stronger", docType: "cover_letter" },
];

export default function OutputDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const { selectedModel, availableModels, refreshTelemetry } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();

  const [output, setOutput] = useState<TailoredOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [carouselWidth, setCarouselWidth] = useState(windowWidth);
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [targetDoc, setTargetDoc] = useState<"cv" | "cover_letter">("cv");
  const [chatInput, setChatInput] = useState("");
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [downloadingType, setDownloadingType] = useState<"cv" | "cover_letter" | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    const loadOutput = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await apiClient.getOutputDetail(String(id));
        if (active) setOutput(detail);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load tailored application."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadOutput();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - carouselWidth) > 2) {
      setCarouselWidth(w);
    }
  };

  const goToSlide = (index: number) => {
    setActiveSlide(index);
    carouselRef.current?.scrollTo({ x: index * carouselWidth, animated: true });
    if (index === 0) setTargetDoc("cv");
    if (index === 1) setTargetDoc("cover_letter");
  };

  const handleRevise = async (instructionText?: string, overrideDocType?: "cv" | "cover_letter") => {
    if (!output || revising) return;
    const cleanInstruction = (instructionText ?? chatInput).trim();
    if (!cleanInstruction) return;

    const docTypeToUse = overrideDocType ?? targetDoc;
    if (!instructionText) setChatInput("");
    setRevising(true);
    setReviseError(null);

    try {
      const result = await apiClient.reviseOutput(output.id, {
        doc_type: docTypeToUse,
        instruction: cleanInstruction,
        model: selectedModel,
      });
      setOutput(result.output);
      await refreshTelemetry();
      setToastMsg(
        docTypeToUse === "cv"
          ? "Tailored CV revised & re-scored"
          : "Cover Letter revised & re-scored"
      );
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (err) {
      setReviseError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Revision request failed."
      );
    } finally {
      setRevising(false);
    }
  };

  const handleDownloadPdf = async (docType: "cv" | "cover_letter") => {
    if (!output || downloadingType) return;
    setDownloadingType(docType);
    setError(null);
    const url = apiClient.getOutputPdfUrl(output.id, docType);
    const safeCompany = (output.company || "Application")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 30);
    const filename = `${safeCompany}_${docType === "cv" ? "CV" : "Cover_Letter"}.pdf`;

    try {
      const headers = await buildAuthHeaders(undefined, false);
      if (Platform.OS === "web") {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`PDF download failed (${res.status})`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
        setToastMsg(`Downloaded ${filename}`);
      } else {
        const targetFile = new File(Paths.cache, filename);
        const downloaded = await File.downloadFileAsync(url, targetFile, {
          headers,
          idempotent: true,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloaded.uri, {
            mimeType: "application/pdf",
            dialogTitle: `Share ${filename}`,
          });
        } else {
          setToastMsg(`Saved PDF to ${downloaded.uri}`);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not download PDF document."
      );
    } finally {
      setDownloadingType(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.indigo} />
        <Text style={styles.centerText}>Loading Tailored Output Studio...</Text>
      </View>
    );
  }

  if (!output) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "Output not found."}</Text>
      </View>
    );
  }

  const chatHistory = Array.isArray(output.chat_history) ? output.chat_history : [];

  return (
    <View style={styles.root}>
      {/* Compact Header Summary */}
      <View style={styles.headerStrip}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.jobTitle} numberOfLines={1}>
            {output.job_title} @ {output.company}
          </Text>
          <View style={styles.scoreMiniRow}>
            <ScoreBadge label="Fit" score={output.overall_fit_score} compact />
            <ScoreBadge label="ATS" score={output.ats_keyword_score} compact />
            <Text style={styles.modelLabel}>
              {resolveModelDisplayName(output.model_used, availableModels)}
            </Text>
          </View>
        </View>
      </View>

      {/* Top Pill Carousel Switcher */}
      <View style={styles.pillBar}>
        {SLIDES.map((slide, idx) => {
          const Icon = slide.icon;
          const active = activeSlide === idx;
          return (
            <Pressable
              key={slide.key}
              onPress={() => goToSlide(idx)}
              style={[styles.pillTab, active && styles.pillTabActive]}
            >
              <Icon
                size={13}
                color={active ? "#FFFFFF" : colors.textSecondary}
              />
              <Text style={[styles.pillTabText, active && styles.pillTabTextActive]}>
                {slide.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {toastMsg ? (
        <View style={styles.toastBar}>
          <CheckCircle2 size={14} color={colors.emeraldText} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Swipeable Horizontal Carousel */}
      <View style={styles.carouselContainer} onLayout={handleLayout}>
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const nextIdx = Math.round(offsetX / Math.max(1, carouselWidth));
            if (nextIdx !== activeSlide && nextIdx >= 0 && nextIdx <= 2) {
              setActiveSlide(nextIdx);
              if (nextIdx === 0) setTargetDoc("cv");
              if (nextIdx === 1) setTargetDoc("cover_letter");
            }
          }}
        >
          {/* Slide 1: Tailored CV */}
          <View style={[styles.slidePage, { width: carouselWidth }]}>
            <HtmlDocumentViewer
              html={output.cv_html}
              markdownFallback={output.cv_markdown}
              title="Tailored CV (A4 Executive Modern)"
            />
          </View>

          {/* Slide 2: Tailored Cover Letter */}
          <View style={[styles.slidePage, { width: carouselWidth }]}>
            <HtmlDocumentViewer
              html={output.cover_letter_html}
              markdownFallback={output.cover_letter_markdown}
              title="Tailored Cover Letter (A4 Executive Modern)"
            />
          </View>

          {/* Slide 3: 4-Score Breakdown & Injected Keywords Inspector */}
          <ScrollView
            style={[styles.slidePage, { width: carouselWidth }]}
            contentContainerStyle={styles.inspectorScroll}
          >
            <View style={styles.card}>
              <Text style={styles.cardTitle}>4-Dimension Tailored Score</Text>
              <ScoreBar label="Overall Fit" score={output.overall_fit_score} />
              <ScoreBar label="Skills Match" score={output.skills_match_score} />
              <ScoreBar label="Experience Fit" score={output.experience_fit_score} />
              <ScoreBar label="ATS Keyword Score" score={output.ats_keyword_score} />
            </View>

            {/* Aggressive Keyword Injection Inspector */}
            <View style={[styles.card, styles.injectedCard]}>
              <View style={styles.cardTitleRow}>
                <Zap size={16} color={colors.purpleText} />
                <Text style={styles.cardTitle}>
                  Aggressively Injected Keywords ({output.injected_keywords?.length || 0})
                </Text>
              </View>
              <Text style={styles.injectedNote}>
                These missing job description keywords were naturally woven into your CV
                to maximize ATS alignment. Open Revision Studio if you don't know any
                of them and want them removed cleanly.
              </Text>
              <View style={styles.chipWrap}>
                {output.injected_keywords?.length ? (
                  output.injected_keywords.map((kw, idx) => (
                    <View key={`${kw}-${idx}`} style={styles.injectedChip}>
                      <Text style={styles.injectedChipText}>+ {kw}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>
                    No additional keywords needed to be injected.
                  </Text>
                )}
              </View>
            </View>

            {/* Matched & Missing Skills */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <CheckCircle2 size={15} color={colors.emerald} />
                <Text style={styles.cardTitle}>
                  Matched Skills ({output.matched_skills?.length || 0})
                </Text>
              </View>
              <View style={styles.chipWrap}>
                {output.matched_skills?.map((s, idx) => (
                  <View key={`${s}-${idx}`} style={styles.matchedChip}>
                    <Text style={styles.matchedText}>{s}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.cardTitleRow, { marginTop: 6 }]}>
                <XCircle size={15} color={colors.rose} />
                <Text style={styles.cardTitle}>
                  Remaining Missing Skills ({output.missing_skills?.length || 0})
                </Text>
              </View>
              <View style={styles.chipWrap}>
                {output.missing_skills?.length ? (
                  output.missing_skills.map((s, idx) => (
                    <View key={`${s}-${idx}`} style={styles.missingChip}>
                      <Text style={styles.missingText}>{s}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>Zero missing keywords remaining!</Text>
                )}
              </View>
            </View>

            {(output.match_reason || output.recommendation) ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Match Rationale & Strategy</Text>
                {output.match_reason ? (
                  <Text style={styles.bodyText}>{output.match_reason}</Text>
                ) : null}
                {output.recommendation ? (
                  <Text style={[styles.bodyText, { color: colors.purpleText }]}>
                    {output.recommendation}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </ScrollView>
      </View>

      {/* Bottom Action Bar: Download/Share PDFs + Open Revision Studio */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.pdfRow}>
          <Pressable
            onPress={() => void handleDownloadPdf("cv")}
            disabled={downloadingType !== null}
            style={styles.pdfBtn}
          >
            {downloadingType === "cv" ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Download size={14} color={colors.indigoText} />
            )}
            <Text style={styles.pdfBtnText}>CV PDF</Text>
          </Pressable>

          <Pressable
            onPress={() => void handleDownloadPdf("cover_letter")}
            disabled={downloadingType !== null}
            style={styles.pdfBtn}
          >
            {downloadingType === "cover_letter" ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Download size={14} color={colors.purpleText} />
            )}
            <Text style={styles.pdfBtnText}>Cover Letter PDF</Text>
          </Pressable>

          <Pressable
            onPress={() => setChatOpen(true)}
            style={styles.copilotBtn}
          >
            <MessageSquareText size={15} color="#FFFFFF" />
            <Text style={styles.copilotBtnText}>Quick Revise</Text>
          </Pressable>
        </View>
      </View>

      {/* Revision Chat Drawer / Modal */}
      <Modal
        visible={chatOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setReviseError(null);
          setChatOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          {/* Drawer Header */}
          <View
            style={[
              styles.drawerHeader,
              { paddingTop: Math.max(insets.top, 14) },
            ]}
          >
            <View style={styles.drawerTitleWrap}>
              <View style={styles.botAvatar}>
                <Bot size={16} color={colors.purpleText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerTitle}>Revision Studio</Text>
                <Text style={styles.drawerSub} numberOfLines={1}>
                  {output.job_title} @ {output.company} •{" "}
                  {resolveModelDisplayName(selectedModel, availableModels)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                setReviseError(null);
                setChatOpen(false);
              }}
              style={styles.closeBtn}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {reviseError ? (
            <View style={[styles.errorBanner, { marginTop: 8, marginBottom: 0 }]}>
              <Text style={styles.errorText}>{reviseError}</Text>
            </View>
          ) : null}

          {/* Target Document Toggle */}
          <View style={styles.docToggleRow}>
            <Pressable
              onPress={() => setTargetDoc("cv")}
              style={[
                styles.docToggleBtn,
                targetDoc === "cv" && styles.docToggleActive,
              ]}
            >
              <FileText
                size={13}
                color={targetDoc === "cv" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.docToggleText,
                  targetDoc === "cv" && styles.docToggleTextActive,
                ]}
              >
                Revise CV
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTargetDoc("cover_letter")}
              style={[
                styles.docToggleBtn,
                targetDoc === "cover_letter" && styles.docToggleActivePurple,
              ]}
            >
              <Mail
                size={13}
                color={targetDoc === "cover_letter" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.docToggleText,
                  targetDoc === "cover_letter" && styles.docToggleTextActive,
                ]}
              >
                Revise Cover Letter
              </Text>
            </Pressable>
          </View>

          {/* Chat Conversation History */}
          <ScrollView
            ref={chatScrollRef}
            style={styles.chatList}
            contentContainerStyle={styles.chatListContent}
          >
            {chatHistory.length === 0 ? (
              <View style={styles.emptyChat}>
                <Sparkles size={20} color={colors.purple} />
                <Text style={styles.emptyChatText}>
                  Describe how you want to refine bullets, remove injected keywords you don't
                  know, or adjust the Cover Letter hook.
                </Text>
              </View>
            ) : (
              chatHistory.map((msg, idx) => {
                const isUser = msg.role === "user";
                return (
                  <View
                    key={idx}
                    style={[
                      styles.msgRow,
                      isUser ? styles.msgRowUser : styles.msgRowAssistant,
                    ]}
                  >
                    {!isUser ? (
                      <View style={styles.msgIconBot}>
                        <Bot size={13} color={colors.purpleText} />
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.msgBubble,
                        isUser ? styles.msgBubbleUser : styles.msgBubbleBot,
                      ]}
                    >
                      <Text style={isUser ? styles.msgTextUser : styles.msgText}>
                        {msg.content}
                      </Text>
                      {msg.timestamp ? (
                        <Text style={isUser ? styles.msgTimeUser : styles.msgTime}>
                          {formatDisplayDate(msg.timestamp)}
                        </Text>
                      ) : null}
                    </View>
                    {isUser ? (
                      <View style={styles.msgIconUser}>
                        <UserIcon size={13} color={colors.textSecondary} />
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            {revising ? (
              <View style={styles.revisingRow}>
                <ActivityIndicator size="small" color={colors.purple} />
                <Text style={styles.revisingText}>
                  Updating & re-scoring your {targetDoc === "cv" ? "CV" : "Cover Letter"}...
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Quick-Action Chips */}
          <View style={styles.quickActionsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}
            >
              {QUICK_ACTIONS.map((qa) => (
                <Pressable
                  key={qa.label}
                  disabled={revising}
                  onPress={() => {
                    if (qa.docType) setTargetDoc(qa.docType);
                    void handleRevise(qa.label, qa.docType ?? targetDoc);
                  }}
                  style={styles.quickChip}
                >
                  <Sparkles size={11} color={colors.purpleText} />
                  <Text style={styles.quickChipText}>{qa.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Chat Input Bar */}
          <View
            style={[
              styles.chatInputBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={`Describe changes for your ${targetDoc === "cv" ? "CV" : "Cover Letter"}...`}
              placeholderTextColor={colors.textMuted}
              editable={!revising}
              style={styles.chatInput}
              onSubmitEditing={() => void handleRevise()}
            />
            <Pressable
              onPress={() => void handleRevise()}
              disabled={revising || !chatInput.trim()}
              style={[
                styles.sendBtn,
                (revising || !chatInput.trim()) && { opacity: 0.45 },
              ]}
            >
              <Send size={15} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 20,
    },
    centerText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    headerStrip: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    jobTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    scoreMiniRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    modelLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textMuted,
      marginLeft: 4,
    },
    pillBar: {
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.background,
    },
    pillTab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillTabActive: {
      backgroundColor: colors.indigo,
      borderColor: colors.indigo,
    },
    pillTabText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    pillTabTextActive: {
      color: "#FFFFFF",
    },
    toastBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginHorizontal: 14,
      marginBottom: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 9,
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    toastText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.emeraldText,
    },
    errorBanner: {
      marginHorizontal: 14,
      marginBottom: 4,
      padding: 9,
      borderRadius: 9,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    errorText: {
      fontSize: 12,
      color: colors.roseText,
      fontWeight: "600",
    },
    carouselContainer: {
      flex: 1,
    },
    slidePage: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    inspectorScroll: {
      gap: 12,
      paddingBottom: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 11,
      ...getCardElevation(isDark),
    },
    injectedCard: {
      borderColor: colors.purpleBorder,
      backgroundColor: isDark ? "rgba(168, 85, 247, 0.08)" : colors.purpleSoft,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    injectedNote: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    injectedChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
    },
    injectedChipText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.purpleText,
    },
    matchedChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    matchedText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.emeraldText,
    },
    missingChip: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    missingText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.roseText,
    },
    muted: {
      fontSize: 12,
      color: colors.textMuted,
    },
    bodyText: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    bottomBar: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.tabBarBg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    pdfRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    pdfBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 11,
      borderRadius: 11,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    pdfBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    copilotBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 15,
      paddingVertical: 11,
      borderRadius: 11,
      backgroundColor: colors.purple,
    },
    copilotBtnText: {
      fontSize: 12.5,
      fontWeight: "800",
      color: "#FFFFFF",
    },
    modalRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    drawerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    drawerTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    botAvatar: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    drawerTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    drawerSub: {
      fontSize: 11.5,
      color: colors.textSecondary,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    docToggleRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    docToggleBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    docToggleActive: {
      backgroundColor: colors.indigo,
      borderColor: colors.indigo,
    },
    docToggleActivePurple: {
      backgroundColor: colors.purple,
      borderColor: colors.purple,
    },
    docToggleText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    docToggleTextActive: {
      color: "#FFFFFF",
    },
    chatList: {
      flex: 1,
    },
    chatListContent: {
      padding: 14,
      gap: 12,
    },
    emptyChat: {
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
      gap: 6,
    },
    emptyChatText: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textPrimary,
    },
    msgRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    msgRowUser: {
      justifyContent: "flex-end",
    },
    msgRowAssistant: {
      justifyContent: "flex-start",
    },
    msgIconBot: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    msgIconUser: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    msgBubble: {
      maxWidth: "80%",
      padding: 11,
      borderRadius: 14,
      gap: 4,
    },
    msgBubbleBot: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 4,
      ...getCardElevation(isDark),
    },
    msgBubbleUser: {
      backgroundColor: colors.indigo,
      borderTopRightRadius: 4,
    },
    msgText: {
      fontSize: 13,
      lineHeight: 18.5,
      color: colors.textPrimary,
    },
    msgTextUser: {
      fontSize: 13,
      lineHeight: 18.5,
      color: "#FFFFFF",
    },
    msgTime: {
      fontSize: 10,
      color: colors.textMuted,
    },
    msgTimeUser: {
      fontSize: 10,
      color: "rgba(255,255,255,0.78)",
    },
    revisingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    revisingText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    quickActionsWrap: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      paddingVertical: 8,
    },
    quickActionsRow: {
      paddingHorizontal: 12,
      gap: 7,
    },
    quickChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.purpleSoft,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
    },
    quickChipText: {
      fontSize: 11.5,
      fontWeight: "600",
      color: colors.purpleText,
    },
    chatInputBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    chatInput: {
      flex: 1,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 11,
      backgroundColor: colors.purple,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}

