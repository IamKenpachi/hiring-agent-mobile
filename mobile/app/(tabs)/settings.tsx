import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react-native";
import { COLORS, formatDisplayDate } from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { apiClient, ApiError } from "../../src/lib/api";
import { resolveModelDisplayName } from "../../src/lib/profileHelpers";
import { ModelPickerList } from "../../src/components/ModelPickerList";
import { ProfileCreator } from "../../src/components/ProfileCreator";
import type { Profile } from "../../src/types";

export default function SettingsScreen() {
  const {
    user,
    geminiApiKey,
    selectedModel,
    availableModels,
    profiles,
    tokenTelemetry,
    setGeminiKey,
    setSelectedModel,
    refreshProfiles,
    activateProfile,
    refreshTelemetry,
    signOut,
  } = useAuth();

  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setApiKeyInput(geminiApiKey);
      setModelMessage(null);
      void refreshTelemetry();
      void refreshProfiles();
    }, [geminiApiKey, refreshTelemetry, refreshProfiles])
  );

  const handleSelectModel = (modelId: string) => {
    void setSelectedModel(modelId);
    setModelMessage(
      `Active engine switched to ${resolveModelDisplayName(modelId, availableModels)} — ready immediately across Home, Hunt & Studio.`
    );
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfiles(), refreshTelemetry()]);
    setRefreshing(false);
  };

  const handleSaveKey = async () => {
    const clean = apiKeyInput.trim();
    if (!clean) {
      setKeyError("Gemini API Key cannot be empty.");
      return;
    }
    setSavingKey(true);
    setKeyError(null);
    setError(null);
    setKeyMessage(null);
    try {
      const res = await apiClient.validateGeminiKey(clean, selectedModel, true);
      if (!res.valid) {
        setKeyError(
          res.detail ||
            "Gemini API key was rejected by Google. Check or regenerate your key in Google AI Studio."
        );
        return;
      }
      await setGeminiKey(clean);
      setKeyMessage("Gemini API Key live-verified & saved to device storage.");
    } catch (err) {
      setKeyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save key."
      );
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setError(null);
    try {
      await apiClient.deleteProfile(profileId);
      setConfirmDeleteId(null);
      await refreshProfiles();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not delete profile."
      );
    }
  };

  const perModelEntries = Object.entries(tokenTelemetry?.per_model || {});

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefreshAll()}
          tintColor={COLORS.indigo}
        />
      }
    >
      {/* Account Card */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.kicker}>SIGNED IN ACCOUNT</Text>
            <Text style={styles.accountEmail}>{user?.email || "Authenticated User"}</Text>
          </View>
          <Pressable onPress={() => void signOut()} style={styles.signOutBtn}>
            <LogOut size={14} color={COLORS.rose} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Real-Time Token & Cost Telemetry */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.titleIconRow}>
            <Zap size={17} color={COLORS.amber} />
            <Text style={styles.sectionTitle}>Token & Cost Telemetry</Text>
          </View>
          <Pressable onPress={() => void refreshTelemetry()} style={styles.refreshBtn}>
            <RefreshCw size={13} color={COLORS.textSecondary} />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        <View style={styles.telemetryGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Input Tokens</Text>
            <Text style={styles.metricValue}>
              {(tokenTelemetry?.input_tokens || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Output Tokens</Text>
            <Text style={styles.metricValue}>
              {(tokenTelemetry?.output_tokens || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>API Calls</Text>
            <Text style={styles.metricValue}>{tokenTelemetry?.calls || 0}</Text>
          </View>
          <View style={[styles.metricTile, styles.costTile]}>
            <Text style={[styles.metricLabel, { color: COLORS.emerald }]}>
              Estimated Cost
            </Text>
            <Text style={[styles.metricValue, { color: "#6EE7B7" }]}>
              {tokenTelemetry?.est_cost_formatted || "$0.0000"}
            </Text>
          </View>
        </View>

        {perModelEntries.length > 0 ? (
          <View style={styles.breakdownBox}>
            <Text style={styles.subLabel}>PER-MODEL BREAKDOWN</Text>
            {perModelEntries.map(([modelId, stats]) => (
              <View key={modelId} style={styles.modelStatRow}>
                <Text style={styles.modelStatName}>{modelId}</Text>
                <Text style={styles.modelStatVal}>
                  {stats.total_tokens.toLocaleString()} tok • {stats.calls} calls
                  {typeof stats.est_cost_usd === "number"
                    ? ` • $${stats.est_cost_usd.toFixed(4)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {tokenTelemetry?.recent_operations &&
        tokenTelemetry.recent_operations.length > 0 ? (
          <View style={styles.breakdownBox}>
            <Text style={styles.subLabel}>RECENT OPERATIONS</Text>
            {tokenTelemetry.recent_operations.slice(0, 4).map((op, idx) => (
              <View key={op.id || idx} style={styles.modelStatRow}>
                <Text style={styles.modelStatName}>
                  {op.operation_type} ({op.model_name})
                </Text>
                <Text style={styles.modelStatVal}>
                  {op.input_tokens + op.output_tokens} tok •{" "}
                  {formatDisplayDate(op.created_at)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Multi-Profile Career Manager */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.titleIconRow}>
            <UserCheck size={17} color={COLORS.emerald} />
            <Text style={styles.sectionTitle}>Multi-Profile Career Manager</Text>
          </View>
          <Pressable
            onPress={() => {
              setEditingProfile(null);
              setModalVisible(true);
            }}
            style={styles.addBtn}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Profile</Text>
          </Pressable>
        </View>

        {profiles.map((prof) => {
          const isActive = prof.is_default;
          return (
            <View
              key={prof.id}
              style={[styles.profileCard, isActive && styles.profileCardActive]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.titleIconRow}>
                    <Text style={styles.profileName}>{prof.profile_name}</Text>
                    {isActive ? (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.profileMeta}>
                    {prof.full_name} • {prof.skills?.length || 0} skills •{" "}
                    {prof.experience?.length || 0} roles
                  </Text>
                </View>
              </View>

              {prof.summary ? (
                <Text style={styles.profileSummary} numberOfLines={2}>
                  {prof.summary}
                </Text>
              ) : null}

              <View style={styles.profileActions}>
                {!isActive ? (
                  <Pressable
                    onPress={() => void activateProfile(prof.id)}
                    style={styles.activateBtn}
                  >
                    <CheckCircle2 size={13} color={COLORS.emerald} />
                    <Text style={styles.activateBtnText}>Set Active</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    setEditingProfile(prof);
                    setModalVisible(true);
                  }}
                  style={styles.editBtn}
                >
                  <Edit3 size={13} color={COLORS.indigo} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>

                {profiles.length > 1 ? (
                  confirmDeleteId === prof.id ? (
                    <View style={styles.confirmRow}>
                      <Pressable onPress={() => void handleDeleteProfile(prof.id)}>
                        <Text style={styles.confirmDelete}>Confirm Delete</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(null)}>
                        <Text style={styles.cancelDelete}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setConfirmDeleteId(prof.id)}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={13} color={COLORS.rose} />
                    </Pressable>
                  )
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* Gemini API Key */}
      <View style={styles.card}>
        <View style={styles.titleIconRow}>
          <KeyRound size={17} color={COLORS.purple} />
          <Text style={styles.sectionTitle}>Gemini API Key (SecureStore)</Text>
        </View>

        <View style={styles.keyInputWrap}>
          <TextInput
            value={apiKeyInput}
            onChangeText={(val) => {
              setApiKeyInput(val);
              if (keyError) setKeyError(null);
              if (keyMessage) setKeyMessage(null);
            }}
            placeholder="AIzaSy..."
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.keyInput}
          />
          <Pressable onPress={() => setShowKey((s) => !s)} style={{ padding: 6 }}>
            {showKey ? (
              <EyeOff size={17} color={COLORS.textSecondary} />
            ) : (
              <Eye size={17} color={COLORS.textSecondary} />
            )}
          </Pressable>
        </View>

        {keyError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{keyError}</Text>
          </View>
        ) : null}

        {keyMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{keyMessage}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSaveKey}
          disabled={savingKey}
          style={[styles.saveKeyBtn, savingKey && { opacity: 0.6 }]}
        >
          {savingKey ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <CheckCircle2 size={15} color="#FFFFFF" />
          )}
          <Text style={styles.saveKeyText}>
            {savingKey ? "Validating..." : "Validate & Update Key"}
          </Text>
        </Pressable>
      </View>

      {/* Active Gemini Model Picker */}
      <View style={styles.card}>
        <View style={styles.modelHeader}>
          <View style={styles.rowBetween}>
            <View style={[styles.titleIconRow, styles.modelHeaderLeft]}>
              <Cpu size={17} color={COLORS.indigo} />
              <Text style={[styles.sectionTitle, styles.modelHeaderTitle]}>
                Active Gemini Intelligence Model
              </Text>
            </View>
            <View style={styles.activeModelBadge}>
              <Text
                style={styles.activeModelBadgeText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {resolveModelDisplayName(selectedModel, availableModels)}
              </Text>
            </View>
          </View>
          <Text style={styles.modelHelperText}>
            Tap any model to switch immediately — no key re-validation required.
          </Text>
        </View>

        {modelMessage ? (
          <View style={[styles.successBanner, styles.successBannerRow]}>
            <CheckCircle2 size={15} color={COLORS.emerald} />
            <Text style={[styles.successText, styles.successBannerText]}>
              {modelMessage}
            </Text>
          </View>
        ) : null}

        <ModelPickerList
          models={availableModels}
          selectedModel={selectedModel}
          onSelect={handleSelectModel}
        />
      </View>

      {/* Add / Edit Profile Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingProfile ? `Edit ${editingProfile.profile_name}` : "Add New CV Profile"}
            </Text>
            <Pressable
              onPress={() => {
                setModalVisible(false);
                setEditingProfile(null);
              }}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            <ProfileCreator
              initialProfile={editingProfile}
              defaultIsPrimary={profiles.length === 0}
              onSuccess={async () => {
                await refreshProfiles();
                setModalVisible(false);
                setEditingProfile(null);
              }}
              onCancel={() => {
                setModalVisible(false);
                setEditingProfile(null);
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 12,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  kicker: {
    fontSize: 10.5,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.7,
  },
  accountEmail: {
    fontSize: 14.5,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FDA4AF",
  },
  errorBanner: {
    backgroundColor: COLORS.roseSoft,
    borderColor: COLORS.roseBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: 12.5,
    color: "#FDA4AF",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  refreshText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  telemetryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 11,
    gap: 4,
  },
  costTile: {
    backgroundColor: COLORS.emeraldSoft,
    borderColor: COLORS.emeraldBorder,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  breakdownBox: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: 10,
    gap: 6,
  },
  subLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  modelStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modelStatName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
    flex: 1,
  },
  modelStatVal: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: COLORS.indigo,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  profileCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  profileCardActive: {
    borderColor: COLORS.emeraldBorder,
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
  profileName: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: COLORS.emeraldSoft,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
  },
  activeBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#6EE7B7",
  },
  profileMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  profileSummary: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  profileActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  activateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.emeraldSoft,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
  },
  activateBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#6EE7B7",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
  },
  editBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#C7D2FE",
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confirmDelete: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#FDA4AF",
  },
  cancelDelete: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  keyInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  keyInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  successBanner: {
    backgroundColor: COLORS.emeraldSoft,
    borderColor: COLORS.emeraldBorder,
    borderWidth: 1,
    borderRadius: 9,
    padding: 9,
  },
  successBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6EE7B7",
  },
  successBannerText: {
    flex: 1,
  },
  modelHeader: {
    gap: 5,
  },
  modelHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  modelHeaderTitle: {
    flexShrink: 1,
  },
  activeModelBadge: {
    flexShrink: 1,
    maxWidth: "48%",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: COLORS.indigoBorder,
  },
  activeModelBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C7D2FE",
    flexShrink: 1,
  },
  modelHelperText: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  saveKeyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.indigo,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveKeyText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  modalCloseBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalCloseText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  modalScroll: {
    padding: 16,
    paddingBottom: 40,
  },
});
