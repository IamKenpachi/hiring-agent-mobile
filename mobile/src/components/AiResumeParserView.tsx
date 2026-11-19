import React, { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, FileText, Plus, X } from "lucide-react-native";
import { getCardElevation } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import type { WorkPreference, WizardDraftState } from "../lib/profileHelpers";
import { AuthButtonGradient, WEB_SANS } from "./OnboardingGraphics";
import { ThemeToggleButton } from "./ThemeToggleButton";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AiResumeParserViewProps {
  filename: string;
  fileSizeBytes: number;
  draft: WizardDraftState;
  onChange: (next: WizardDraftState) => void;
  onBack: () => void;
  onSaveMasterProfile: () => void;
  saving?: boolean;
  error?: string | null;
}

type SectionKey = "contact" | "skills" | "experience" | "projectsEdu";

export function AiResumeParserView({
  filename,
  fileSizeBytes,
  draft,
  onChange,
  onBack,
  onSaveMasterProfile,
  saving = false,
  error = null,
}: AiResumeParserViewProps) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  const [skillInput, setSkillInput] = useState("");

  const toggleSection = (key: SectionKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => (prev === key ? null : key));
  };

  const sizeKb = Math.max(1, Math.round(fileSizeBytes / 1024));
  const roleHeadline = draft.profileName.trim() || draft.fullName.trim() || "Master Profile";
  const locationLine = draft.location.trim()
    ? `${draft.location.trim()} / ${draft.workPreference}`
    : draft.workPreference;

  const skillsPreview =
    draft.skills.length > 0
      ? `${draft.skills.slice(0, 6).join(", ")}${draft.skills.length > 6 ? ", ..." : ""}`
      : "No skills extracted yet — tap to add";

  const expCount = draft.experiences.filter((e) => e.title.trim() || e.company.trim()).length;
  const projCount = draft.projects.filter((p) => p.name.trim() || p.description.trim()).length;
  const firstDegree = draft.educationList.find((ed) => ed.degree.trim())?.degree.trim();
  const projEduSubtitle = [
    `${projCount} Project${projCount === 1 ? "" : "s"}`,
    firstDegree || "Tap to review education",
  ].join(" • ");

  const addSkill = () => {
    const clean = skillInput.trim();
    if (!clean) return;
    if (!draft.skills.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      onChange({ ...draft, skills: [...draft.skills, clean] });
    }
    setSkillInput("");
  };

  const removeSkill = (idx: number) => {
    onChange({ ...draft, skills: draft.skills.filter((_, i) => i !== idx) });
  };

  const inputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: isDark ? colors.border : colors.borderStrong,
    color: colors.textPrimary,
  };

  const cardStyle = [
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    getCardElevation(isDark),
  ];

  return (
    <View className="flex-1">
      {/* Clean top bar without extra step progress bar, matching Mockup Screen 4 */}
      <View className="px-5 pt-3 pb-1 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={{
            backgroundColor: colors.headerBtnBg,
            borderColor: colors.headerBtnBorder,
          }}
          className="h-8 w-8 items-center justify-center rounded-full border active:opacity-75"
        >
          <ArrowLeft size={16} color={colors.textPrimary} />
        </Pressable>

        <ThemeToggleButton size="compact" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[WEB_SANS, { color: colors.textPrimary }]}
          className="text-center text-[22px] font-bold tracking-[-0.4px] mb-6"
        >
          Resume Parser
        </Text>

        {/* Extracted file banner */}
        <View
          style={cardStyle}
          className="rounded-2xl border p-3.5 mb-3.5 flex-row items-center gap-3"
        >
          <View
            style={{
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            }}
            className="h-11 w-9 items-center justify-center rounded-lg border"
          >
            <FileText size={18} color={colors.textSecondary} />
          </View>
          <View className="flex-1">
            <Text
              style={[WEB_SANS, { color: colors.textPrimary }]}
              numberOfLines={1}
              className="text-[13px] font-semibold"
            >
              {filename}{" "}
              <Text style={{ color: colors.textSecondary }} className="font-normal">
                ({sizeKb} KB)
              </Text>
            </Text>
            <View
              style={{
                backgroundColor: colors.emeraldSoft,
                borderColor: colors.emeraldBorder,
              }}
              className="mt-1.5 self-start flex-row items-center gap-1 rounded-full border px-2.5 py-0.5"
            >
              <CheckCircle2 size={11} color={colors.emeraldText} />
              <Text
                style={[WEB_SANS, { color: colors.emeraldText }]}
                className="text-[11px] font-semibold"
              >
                Resume Details Extracted
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View
            style={{
              backgroundColor: colors.roseSoft,
              borderColor: colors.roseBorder,
            }}
            className="mb-3 rounded-xl border px-3.5 py-2.5"
          >
            <Text style={{ color: colors.roseText }} className="text-xs font-medium">
              {error}
            </Text>
          </View>
        ) : null}

        {/* 1. Contact & Links */}
        <View style={cardStyle} className="rounded-xl border mb-2.5 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("contact")}
            className="p-3.5 flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color={colors.emerald} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                  Contact & Links
                </Text>
              </View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                numberOfLines={1}
                className="mt-1 text-[12px]"
              >
                {roleHeadline} • {locationLine}
              </Text>
            </View>
            {expanded === "contact" ? (
              <ChevronUp size={16} color={colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={colors.textMuted} />
            )}
          </Pressable>

          {expanded === "contact" ? (
            <View
              style={{ borderTopColor: colors.border }}
              className="border-t px-3.5 pb-3.5 pt-3 gap-2.5"
            >
              <TextInput
                value={draft.profileName}
                onChangeText={(v) => onChange({ ...draft, profileName: v })}
                placeholder="Target Role / Profile Name"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                className="rounded-lg border px-3 py-2 text-xs"
              />
              <TextInput
                value={draft.fullName}
                onChangeText={(v) => onChange({ ...draft, fullName: v })}
                placeholder="Full Name"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                className="rounded-lg border px-3 py-2 text-xs"
              />
              <View className="flex-row gap-2">
                <TextInput
                  value={draft.email}
                  onChangeText={(v) => onChange({ ...draft, email: v })}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  style={inputStyle}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs"
                />
                <TextInput
                  value={draft.phone}
                  onChangeText={(v) => onChange({ ...draft, phone: v })}
                  placeholder="Phone"
                  placeholderTextColor={colors.textMuted}
                  style={inputStyle}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs"
                />
              </View>
              <TextInput
                value={draft.location}
                onChangeText={(v) => onChange({ ...draft, location: v })}
                placeholder="Location"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                className="rounded-lg border px-3 py-2 text-xs"
              />
              <View className="flex-row gap-2">
                {(["Remote", "Hybrid", "On-Site"] as WorkPreference[]).map((pref) => {
                  const active = draft.workPreference === pref;
                  return (
                    <Pressable
                      key={pref}
                      onPress={() => onChange({ ...draft, workPreference: pref })}
                      style={{
                        backgroundColor: active ? colors.indigoSoft : colors.inputBg,
                        borderColor: active ? colors.indigo : colors.border,
                      }}
                      className="flex-1 items-center rounded-full border py-1.5"
                    >
                      <Text
                        style={{ color: active ? colors.indigoText : colors.textSecondary }}
                        className="text-[11px] font-semibold"
                      >
                        {pref}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={draft.linkedinUrl}
                onChangeText={(v) => onChange({ ...draft, linkedinUrl: v })}
                placeholder="LinkedIn URL"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                className="rounded-lg border px-3 py-2 text-xs"
              />
            </View>
          ) : null}
        </View>

        {/* 2. Core Skills */}
        <View style={cardStyle} className="rounded-xl border mb-2.5 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("skills")}
            className="p-3.5 flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color={colors.emerald} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                  Core Skills ({draft.skills.length})
                </Text>
              </View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                numberOfLines={1}
                className="mt-1 text-[12px]"
              >
                {skillsPreview}
              </Text>
            </View>
            {expanded === "skills" ? (
              <ChevronUp size={16} color={colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={colors.textMuted} />
            )}
          </Pressable>

          {expanded === "skills" ? (
            <View
              style={{ borderTopColor: colors.border }}
              className="border-t px-3.5 pb-3.5 pt-3 gap-2.5"
            >
              <View className="flex-row gap-2">
                <TextInput
                  value={skillInput}
                  onChangeText={setSkillInput}
                  onSubmitEditing={addSkill}
                  placeholder="Add Skill"
                  placeholderTextColor={colors.textMuted}
                  style={inputStyle}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs"
                />
                <Pressable
                  onPress={addSkill}
                  style={{
                    backgroundColor: colors.indigoSoft,
                    borderColor: colors.indigoBorder,
                  }}
                  className="items-center justify-center rounded-lg border px-3"
                >
                  <Plus size={15} color={colors.indigoText} />
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {draft.skills.map((skill, idx) => (
                  <Pressable
                    key={`${skill}-${idx}`}
                    onPress={() => removeSkill(idx)}
                    style={{
                      backgroundColor: colors.emeraldSoft,
                      borderColor: colors.emeraldBorder,
                    }}
                    className="flex-row items-center gap-1 rounded-full border px-2.5 py-1"
                  >
                    <Text style={{ color: colors.emeraldText }} className="text-[11px] font-semibold">
                      {skill}
                    </Text>
                    <X size={11} color={colors.emeraldText} />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={draft.summary}
                onChangeText={(v) => onChange({ ...draft, summary: v })}
                placeholder="Executive summary..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={inputStyle}
                className="min-h-[76px] rounded-lg border px-3 py-2 text-xs"
                textAlignVertical="top"
              />
            </View>
          ) : null}
        </View>

        {/* 3. Work Experience */}
        <View style={cardStyle} className="rounded-xl border mb-2.5 overflow-hidden">
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleSection("experience")}
            className="p-3.5 flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color={colors.emerald} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                  Work Experience
                </Text>
              </View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                numberOfLines={1}
                className="mt-1 text-[12px]"
              >
                {expCount} {expCount === 1 ? "Role" : "Roles"} extracted
              </Text>
            </View>
            {expanded === "experience" ? (
              <ChevronUp size={16} color={colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={colors.textMuted} />
            )}
          </Pressable>

          {expanded === "experience" ? (
            <View
              style={{ borderTopColor: colors.border }}
              className="border-t px-3.5 pb-3.5 pt-3 gap-3"
            >
              {draft.experiences.map((exp, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  }}
                  className="rounded-lg border p-2.5 gap-2"
                >
                  <TextInput
                    value={exp.title}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], title: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Role Title"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.textPrimary }}
                    className="text-xs font-semibold"
                  />
                  <TextInput
                    value={exp.company}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], company: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Company & Dates"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.textSecondary }}
                    className="text-xs"
                  />
                  <TextInput
                    value={exp.bulletsText}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], bulletsText: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Impact bullets (one per line)"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{ color: colors.textSecondary }}
                    className="min-h-[60px] text-xs"
                    textAlignVertical="top"
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* 4. Projects & Education */}
        <View style={cardStyle} className="rounded-xl border mb-3 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("projectsEdu")}
            className="p-3.5 flex-row items-center justify-between active:opacity-80"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color={colors.emerald} />
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                  Projects & Education
                </Text>
              </View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                numberOfLines={1}
                className="mt-1 text-[12px]"
              >
                {projEduSubtitle}
              </Text>
            </View>
            {expanded === "projectsEdu" ? (
              <ChevronUp size={16} color={colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={colors.textMuted} />
            )}
          </Pressable>

          {expanded === "projectsEdu" ? (
            <View
              style={{ borderTopColor: colors.border }}
              className="border-t px-3.5 pb-3.5 pt-3 gap-3"
            >
              {draft.projects.map((proj, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  }}
                  className="rounded-lg border p-2.5 gap-1.5"
                >
                  <TextInput
                    value={proj.name}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], name: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Project Title"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.textPrimary }}
                    className="text-xs font-semibold"
                  />
                  <TextInput
                    value={proj.description}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], description: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Project impact..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{ color: colors.textSecondary }}
                    className="text-xs"
                  />
                </View>
              ))}
              {draft.educationList.map((ed, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  }}
                  className="rounded-lg border p-2.5 gap-1.5"
                >
                  <TextInput
                    value={ed.degree}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], degree: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="Degree"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.textPrimary }}
                    className="text-xs font-semibold"
                  />
                  <TextInput
                    value={ed.institutionAndYear}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], institutionAndYear: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="University & Graduation Year"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.textSecondary }}
                    className="text-xs"
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View className="px-6 pb-6 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save Master Profile"
          disabled={saving}
          onPress={onSaveMasterProfile}
          className="h-[50px] w-full items-center justify-center overflow-hidden rounded-full active:opacity-90"
        >
          <AuthButtonGradient />
          <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[15.5px] font-semibold">
            {saving ? "Saving Master Profile..." : "Save Master Profile"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
