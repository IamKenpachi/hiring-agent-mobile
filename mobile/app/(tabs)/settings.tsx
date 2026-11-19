import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
  X,
  Zap,
} from "lucide-react-native";
import {
  formatDisplayDate,
  getCardElevation,
  type ThemeColors,
} from "../../src/constants/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { apiClient, ApiError, PRIVACY_POLICY_URL } from "../../src/lib/api";
import { resolveModelDisplayName } from "../../src/lib/profileHelpers";
import { ModelPickerList } from "../../src/components/ModelPickerList";
import { ProfileCreator } from "../../src/components/ProfileCreator";
import type { Profile, User } from "../../src/types";

export default function SettingsScreen() {
  const {
    user,
    geminiApiKey,
    trialMode,
    selectedModel,
    availableModels,
    profiles,
    tokenTelemetry,
    setGeminiKey,
    setTrialMode,
    setSelectedModel,
    refreshProfiles,
    activateProfile,
    refreshTelemetry,
    signOut,
    deleteAccount,
  } = useAuth();
  const { mode, isDark, colors, setThemeMode } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [meDetails, setMeDetails] = useState<User | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setApiKeyInput(geminiApiKey);
      setModelMessage(null);
      void refreshTelemetry();
      void refreshProfiles();
      void apiClient
        .getMe()
        .then((me) => setMeDetails(me))
        .catch(() => {});
    }, [geminiApiKey, refreshTelemetry, refreshProfiles])
  );

  const handleSelectModel = (modelId: string) => {
    void setSelectedModel(modelId);
    setModelMessage(
      `Tailoring mode switched to ${resolveModelDisplayName(modelId, availableModels)} — ready immediately across Home, Hunt & Studio.`
    );
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfiles(),
      refreshTelemetry(),
      apiClient
        .getMe()
        .then((me) => setMeDetails(me))
        .catch(() => {}),
    ]);
    setRefreshing(false);
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      setError(`Could not open Privacy Policy (${PRIVACY_POLICY_URL}).`);
    }
  };

  const closeDeleteAccountModal = () => {
    if (deletingAccount) return;
    setDeleteModalVisible(false);
    setDeleteAccountError(null);
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteAccountError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount();
      setDeleteModalVisible(false);
    } catch (err) {
      setDeleteAccountError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not delete account. Please try again."
      );
    } finally {
      setDeletingAccount(false);
    }
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
      if (trialMode) {
        await setTrialMode(false);
      }
      setKeyMessage("Gemini API Key live-verified & saved — unlimited BYOK mode active.");
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
  const hasPersonalKey = Boolean(geminiApiKey.trim());
  const trialCallsUsed = meDetails?.trial_calls_used ?? user?.trial_calls_used;
  const trialCallsLimit = meDetails?.trial_calls_limit ?? user?.trial_calls_limit;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefreshAll()}
          tintColor={colors.indigo}
        />
      }
    >
      {/* Account Card */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.accountIdentity}>
            <Text style={styles.kicker}>SIGNED IN ACCOUNT</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>
              {user?.email || "Authenticated User"}
            </Text>
          </View>
          <Pressable onPress={() => void signOut()} style={styles.signOutBtn}>
            <LogOut size={14} color={colors.roseText} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {hasPersonalKey ? (
          <View style={styles.byokStatusRow}>
            <KeyRound size={14} color={colors.emeraldText} />
            <Text style={styles.byokStatusText}>
              Personal Gemini API Key • Unlimited BYOK
            </Text>
          </View>
        ) : (
          <View style={styles.trialStatusBox}>
            <View style={styles.trialBadgeRow}>
              <View style={styles.trialBadge}>
                <Zap size={12} color={colors.amberText} />
                <Text style={styles.trialBadgeText}>
                  {trialMode ? "Starter Trial Mode" : "No Personal API Key"}
                </Text>
              </View>
              {typeof trialCallsUsed === "number" &&
              typeof trialCallsLimit === "number" ? (
                <Text style={styles.trialQuotaText}>
                  {trialCallsUsed} / {trialCallsLimit} trial calls used
                </Text>
              ) : null}
            </View>
            <Text style={styles.trialHelperText}>
              {trialMode
                ? "Using Starter Trial quota without a personal key. Save your Gemini API key below anytime to switch to unlimited BYOK."
                : "Save your personal Gemini API key below to unlock unlimited BYOK usage."}
            </Text>
          </View>
        )}

        <View style={styles.accountFooterActions}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            onPress={() => void handleOpenPrivacyPolicy()}
            className="active:opacity-80"
            style={styles.accountActionRow}
          >
            <View style={styles.titleIconRow}>
              <ShieldCheck size={15} color={colors.indigoText} />
              <Text style={styles.accountActionText}>Privacy Policy</Text>
            </View>
            <ExternalLink size={14} color={colors.textMuted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete Account"
            onPress={() => {
              setDeleteAccountError(null);
              setDeleteModalVisible(true);
            }}
            className="active:opacity-85"
            style={styles.deleteAccountBtn}
          >
            <Trash2 size={14} color={colors.roseText} />
            <Text style={styles.deleteAccountBtnText}>Delete Account</Text>
          </Pressable>
        </View>
      </View>

      {/* Appearance Card */}
      <View style={styles.card}>
        <View style={styles.appearanceHeader}>
          <View style={styles.titleIconRow}>
            {isDark ? (
              <Moon size={17} color={colors.indigoText} />
            ) : (
              <Sun size={17} color="#D97706" />
            )}
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>
          <Text style={styles.appearanceSubtitle}>
            Switch between Dark and Light mode across all screens
          </Text>
        </View>

        <View style={styles.segmentedRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dark mode"
            accessibilityState={{ selected: mode === "dark" }}
            onPress={() => void setThemeMode("dark")}
            className="active:opacity-85"
            style={[
              styles.segmentBtn,
              mode === "dark" && styles.segmentBtnActive,
            ]}
          >
            <Moon
              size={14}
              color={mode === "dark" ? colors.indigoText : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                mode === "dark" && styles.segmentTextActive,
              ]}
            >
              Dark
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Light mode"
            accessibilityState={{ selected: mode === "light" }}
            onPress={() => void setThemeMode("light")}
            className="active:opacity-85"
            style={[
              styles.segmentBtn,
              mode === "light" && styles.segmentBtnActive,
            ]}
          >
            <Sun
              size={14}
              color={mode === "light" ? colors.indigoText : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                mode === "light" && styles.segmentTextActive,
              ]}
            >
              Light
            </Text>
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
            <Zap size={17} color={colors.amber} />
            <Text style={styles.sectionTitle}>Token & Cost Telemetry</Text>
          </View>
          <Pressable onPress={() => void refreshTelemetry()} style={styles.refreshBtn}>
            <RefreshCw size={13} color={colors.textSecondary} />
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
            <Text style={[styles.metricLabel, { color: colors.emeraldText }]}>
              Estimated Cost
            </Text>
            <Text style={[styles.metricValue, { color: colors.emeraldText }]}>
              {tokenTelemetry?.est_cost_formatted || "$0.0000"}
            </Text>
          </View>
        </View>

        {perModelEntries.length > 0 ? (
          <View style={styles.breakdownBox}>
            <Text style={styles.subLabel}>PER-MODEL BREAKDOWN</Text>
            {perModelEntries.map(([modelId, stats]) => (
              <View key={modelId} style={styles.modelStatRow}>
                <Text style={styles.modelStatName}>
                  {resolveModelDisplayName(modelId, availableModels)}
                </Text>
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
                  {op.operation_type} ({resolveModelDisplayName(op.model_name, availableModels)})
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
            <UserCheck size={17} color={colors.emerald} />
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
                    <CheckCircle2 size={13} color={colors.emeraldText} />
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
                  <Edit3 size={13} color={colors.indigoText} />
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
                      <Trash2 size={13} color={colors.roseText} />
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
          <KeyRound size={17} color={colors.purple} />
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
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.keyInput}
          />
          <Pressable onPress={() => setShowKey((s) => !s)} style={{ padding: 6 }}>
            {showKey ? (
              <EyeOff size={17} color={colors.textSecondary} />
            ) : (
              <Eye size={17} color={colors.textSecondary} />
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

      {/* Active Tailoring Mode Picker */}
      <View style={styles.card}>
        <View style={styles.modelHeader}>
          <View style={styles.rowBetween}>
            <View style={[styles.titleIconRow, styles.modelHeaderLeft]}>
              <Cpu size={17} color={colors.indigo} />
              <Text style={[styles.sectionTitle, styles.modelHeaderTitle]}>
                Active Tailoring Mode
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
            Tap any mode to switch immediately — no key re-validation required.
          </Text>
        </View>

        {modelMessage ? (
          <View style={[styles.successBanner, styles.successBannerRow]}>
            <CheckCircle2 size={15} color={colors.emeraldText} />
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

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteAccountModal}
      >
        <Pressable
          onPress={closeDeleteAccountModal}
          style={styles.deleteModalBackdrop}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.deleteModalCard}
          >
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteModalTitleRow}>
                <View style={styles.deleteModalIconWrap}>
                  <AlertTriangle size={18} color={colors.roseText} />
                </View>
                <Text style={styles.deleteModalTitle}>
                  Delete Account & All Data?
                </Text>
              </View>
              <Pressable
                onPress={closeDeleteAccountModal}
                disabled={deletingAccount}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close delete account confirmation"
                className={deletingAccount ? undefined : "active:opacity-75"}
                style={[
                  styles.deleteModalCloseBtn,
                  deletingAccount && { opacity: 0.45 },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.deleteModalBody}>
              This will permanently remove your account, master profile, job hunts,
              tailored CVs, cover letters, and generated PDFs. This action cannot be
              undone.
            </Text>

            {deleteAccountError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{deleteAccountError}</Text>
              </View>
            ) : null}

            <View style={styles.deleteModalActions}>
              <Pressable
                onPress={closeDeleteAccountModal}
                disabled={deletingAccount}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
                className={deletingAccount ? undefined : "active:opacity-85"}
                style={[
                  styles.deleteCancelBtn,
                  deletingAccount && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleConfirmDeleteAccount()}
                disabled={deletingAccount}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete account"
                className={deletingAccount ? undefined : "active:opacity-85"}
                style={[
                  styles.deleteConfirmBtn,
                  deletingAccount && { opacity: 0.7 },
                ]}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Trash2 size={14} color="#FFFFFF" />
                )}
                <Text style={styles.deleteConfirmText}>
                  {deletingAccount ? "Deleting..." : "Delete Forever"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const cardElevation = getCardElevation(isDark);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: 16,
      paddingBottom: 40,
      gap: 14,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 15,
      gap: 12,
      ...cardElevation,
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
      color: colors.textMuted,
      letterSpacing: 0.7,
    },
    accountIdentity: {
      flex: 1,
      minWidth: 0,
    },
    accountEmail: {
      fontSize: 14.5,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 2,
    },
    byokStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9,
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    byokStatusText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.emeraldText,
    },
    trialStatusBox: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 10,
      gap: 6,
    },
    trialBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
    },
    trialBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: colors.amberBorder,
    },
    trialBadgeText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.amberText,
    },
    trialQuotaText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    trialHelperText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    accountFooterActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingTop: 2,
    },
    accountActionRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    accountActionText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    deleteAccountBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    deleteAccountBtnText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.roseText,
    },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 9,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    signOutText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.roseText,
    },
    appearanceHeader: {
      gap: 3,
    },
    appearanceSubtitle: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    segmentedRow: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "transparent",
    },
    segmentBtnActive: {
      backgroundColor: colors.indigoSoft,
      borderColor: colors.indigoBorder,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.indigoText,
      fontWeight: "700",
    },
    errorBanner: {
      backgroundColor: colors.roseSoft,
      borderColor: colors.roseBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    errorText: {
      fontSize: 12.5,
      color: colors.roseText,
      fontWeight: "600",
    },
    sectionTitle: {
      fontSize: 14.5,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    refreshBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshText: {
      fontSize: 11.5,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    telemetryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    metricTile: {
      flexBasis: "48%",
      flexGrow: 1,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 11,
      gap: 4,
    },
    costTile: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    metricValue: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textPrimary,
      fontVariant: ["tabular-nums"],
    },
    breakdownBox: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      padding: 10,
      gap: 6,
    },
    subLabel: {
      fontSize: 10.5,
      fontWeight: "700",
      color: colors.textMuted,
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
      color: colors.textPrimary,
      flex: 1,
    },
    modelStatVal: {
      fontSize: 11.5,
      color: colors.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9,
      backgroundColor: colors.indigo,
    },
    addBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    profileCard: {
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 8,
    },
    profileCardActive: {
      borderColor: colors.emeraldBorder,
      backgroundColor: isDark ? "rgba(16, 185, 129, 0.06)" : colors.emeraldSoft,
    },
    profileName: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    activeBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    activeBadgeText: {
      fontSize: 9.5,
      fontWeight: "800",
      color: colors.emeraldText,
    },
    profileMeta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    profileSummary: {
      fontSize: 12,
      color: colors.textMuted,
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
      backgroundColor: colors.emeraldSoft,
      borderWidth: 1,
      borderColor: colors.emeraldBorder,
    },
    activateBtnText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.emeraldText,
    },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.indigoSoft,
      borderWidth: 1,
      borderColor: colors.indigoBorder,
    },
    editBtnText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.indigoText,
    },
    deleteBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
    },
    confirmRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    confirmDelete: {
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.roseText,
    },
    cancelDelete: {
      fontSize: 11.5,
      color: colors.textSecondary,
    },
    keyInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      paddingHorizontal: 11,
    },
    keyInput: {
      flex: 1,
      paddingVertical: 11,
      fontSize: 13.5,
      color: colors.textPrimary,
    },
    successBanner: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emeraldBorder,
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
      color: colors.emeraldText,
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
      backgroundColor: colors.indigoSoft,
      borderWidth: 1,
      borderColor: colors.indigoBorder,
    },
    activeModelBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.indigoText,
      flexShrink: 1,
    },
    modelHelperText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    saveKeyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor: colors.indigo,
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
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    modalCloseBtn: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalCloseText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    modalScroll: {
      padding: 16,
      paddingBottom: 40,
    },
    deleteModalBackdrop: {
      flex: 1,
      backgroundColor: colors.modalBackdrop,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    deleteModalCard: {
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
    deleteModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    deleteModalTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    deleteModalIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.roseSoft,
      borderWidth: 1,
      borderColor: colors.roseBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteModalTitle: {
      fontSize: 16.5,
      fontWeight: "800",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    deleteModalCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteModalBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    deleteModalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 2,
    },
    deleteCancelBtn: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteCancelText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    deleteConfirmBtn: {
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
    deleteConfirmText: {
      fontSize: 13,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}
