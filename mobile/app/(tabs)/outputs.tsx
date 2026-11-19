import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  Cpu,
  FileCheck2,
  Search,
  Sliders,
  Trash2,
  X,
} from "lucide-react-native";
import {
  formatDisplayDate,
  getCardElevation,
  type ThemeColors,
} from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { resolveModelDisplayName } from "../../src/lib/profileHelpers";
import { ScoreBadge } from "../../src/components/ScoreBadge";
import type { TailoredOutputSummary } from "../../src/types";

export default function OutputsScreen() {
  const router = useRouter();
  const { availableModels } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [outputs, setOutputs] = useState<TailoredOutputSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TailoredOutputSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadOutputs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const list = await apiClient.listOutputs();
      setOutputs(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load saved outputs."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOutputs(false);
    }, [loadOutputs])
  );

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    const targetId = deleteTarget.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.deleteOutput(targetId);
      setOutputs((prev) => prev.filter((item) => item.id !== targetId));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete saved output."
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting]);

  const filtered = outputs.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (item.job_title || "").toLowerCase().includes(q) ||
      (item.company || "").toLowerCase().includes(q) ||
      (item.tone || "").toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      {/* Search Filter */}
      <View style={styles.searchWrap}>
        <Search size={15} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Filter tailored applications by role, company, or tone..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && outputs.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.indigo} />
          <Text style={styles.muted}>Loading saved tailored outputs...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadOutputs(true)}
              tintColor={colors.indigo}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <FileCheck2 size={28} color={colors.indigo} />
              <Text style={styles.emptyTitle}>No Tailored Outputs Yet</Text>
              <Text style={styles.emptyBody}>
                Tailor a job from JobSpy Hunter or paste any JD in Instant Tailor Studio
                to inspect your interactive CV carousel, ATS scores, and PDFs here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/output/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.88 },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.jobTitle}>{item.job_title || "Untitled Role"}</Text>
                  <Text style={styles.company}>{item.company || "Target Company"}</Text>
                </View>
                <View style={styles.cardTopActions}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setDeleteError(null);
                      setDeleteTarget(item);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.job_title || "tailored output"}`}
                    style={({ pressed }) => [
                      styles.deleteIconBtn,
                      pressed && styles.deleteIconBtnPressed,
                    ]}
                  >
                    <Trash2 size={15} color={colors.textMuted} />
                  </Pressable>
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaBadge}>
                  <Calendar size={11.5} color={colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {formatDisplayDate(item.created_at)}
                  </Text>
                </View>

                <View style={styles.metaBadge}>
                  <Sliders size={11.5} color={colors.purpleText} />
                  <Text style={styles.metaText}>{item.tone || "Modern & Impactful"}</Text>
                </View>

                <View style={styles.metaBadge}>
                  <Cpu size={11.5} color={colors.indigoText} />
                  <Text style={styles.metaText}>{resolveModelDisplayName(item.model_used, availableModels)}</Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <ScoreBadge label="Overall Fit" score={item.overall_fit_score} compact />
                <ScoreBadge label="ATS" score={item.ats_keyword_score} compact />
                <ScoreBadge label="Skills" score={item.skills_match_score} compact />
                <ScoreBadge label="Experience" score={item.experience_fit_score} compact />
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <Pressable onPress={closeDeleteModal} style={styles.modalBackdrop}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.modalCard}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconWrap}>
                  <AlertTriangle size={18} color={colors.roseText} />
                </View>
                <Text style={styles.modalTitle}>Delete Saved Output?</Text>
              </View>
              <Pressable
                onPress={closeDeleteModal}
                disabled={deleting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close delete confirmation"
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  pressed && !deleting && { opacity: 0.75 },
                  deleting && { opacity: 0.45 },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            {deleteTarget ? (
              <View style={styles.modalTargetBox}>
                <Text style={styles.modalTargetTitle} numberOfLines={2}>
                  {deleteTarget.job_title || "Untitled Role"}
                </Text>
                <Text style={styles.modalTargetCompany} numberOfLines={1}>
                  {deleteTarget.company || "Target Company"}
                </Text>
              </View>
            ) : null}

            <Text style={styles.modalBody}>
              This will permanently delete the tailored CV, Cover Letter, and generated PDFs
              for{" "}
              <Text style={styles.modalBodyStrong}>
                {deleteTarget?.job_title || "Untitled Role"}
              </Text>{" "}
              at{" "}
              <Text style={styles.modalBodyStrong}>
                {deleteTarget?.company || "Target Company"}
              </Text>
              . This action cannot be undone.
            </Text>

            {deleteError ? (
              <View style={styles.modalErrorBanner}>
                <Text style={styles.errorText}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeDeleteModal}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel deletion"
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && !deleting && { opacity: 0.85 },
                  deleting && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleConfirmDelete()}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete saved output"
                style={({ pressed }) => [
                  styles.confirmDeleteBtn,
                  pressed && !deleting && { opacity: 0.85 },
                  deleting && { opacity: 0.7 },
                ]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Trash2 size={14} color="#FFFFFF" />
                )}
                <Text style={styles.confirmDeleteText}>
                  {deleting ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const cardElevation = getCardElevation(isDark);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 12,
      ...cardElevation,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.textPrimary,
    },
    errorBanner: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
    },
    errorText: {
      fontSize: 12.5,
      color: colors.roseText,
      fontWeight: "600",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    muted: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    list: {
      gap: 11,
      paddingBottom: 32,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
      gap: 8,
      marginTop: 20,
      ...cardElevation,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    emptyBody: {
      fontSize: 12.5,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
      ...cardElevation,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    cardTopActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    deleteIconBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : colors.surfaceElevated,
      borderWidth: 1,
      borderColor: isDark ? "transparent" : colors.border,
    },
    deleteIconBtnPressed: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
    },
    jobTitle: {
      fontSize: 15.5,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    company: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    metaBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    metaText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    scoreRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.modalBackdrop,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: 18,
      gap: 14,
      ...cardElevation,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    modalTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    modalIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: {
      fontSize: 16.5,
      fontWeight: "800",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    modalCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTargetBox: {
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    modalTargetTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    modalTargetCompany: {
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    modalBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    modalBodyStrong: {
      color: colors.textPrimary,
      fontWeight: "700",
    },
    modalErrorBanner: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 2,
    },
    cancelBtn: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    confirmDeleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.rose,
      borderWidth: 1,
      borderColor: colors.rose,
    },
    confirmDeleteText: {
      fontSize: 13,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}

