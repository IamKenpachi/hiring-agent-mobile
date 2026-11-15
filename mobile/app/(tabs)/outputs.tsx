import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Calendar,
  ChevronRight,
  Cpu,
  FileCheck2,
  Search,
  Sliders,
} from "lucide-react-native";
import { COLORS, formatDisplayDate } from "../../src/constants/theme";
import { apiClient, ApiError } from "../../src/lib/api";
import { ScoreBadge } from "../../src/components/ScoreBadge";
import type { TailoredOutputSummary } from "../../src/types";

export default function OutputsScreen() {
  const router = useRouter();
  const [outputs, setOutputs] = useState<TailoredOutputSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        <Search size={15} color={COLORS.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Filter tailored applications by role, company, or tone..."
          placeholderTextColor={COLORS.textMuted}
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
          <ActivityIndicator size="large" color={COLORS.indigo} />
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
              tintColor={COLORS.indigo}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <FileCheck2 size={28} color={COLORS.indigo} />
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
                <ChevronRight size={18} color={COLORS.textMuted} />
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaBadge}>
                  <Calendar size={11.5} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>
                    {formatDisplayDate(item.created_at)}
                  </Text>
                </View>

                <View style={styles.metaBadge}>
                  <Sliders size={11.5} color={COLORS.purple} />
                  <Text style={styles.metaText}>{item.tone || "Modern & Impactful"}</Text>
                </View>

                <View style={styles.metaBadge}>
                  <Cpu size={11.5} color={COLORS.indigo} />
                  <Text style={styles.metaText}>{item.model_used || "gemini-3.7-flash"}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  errorBanner: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12.5,
    color: "#FDA4AF",
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
    color: COLORS.textSecondary,
  },
  list: {
    gap: 11,
    paddingBottom: 32,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  emptyBody: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  jobTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  company: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  scoreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});

