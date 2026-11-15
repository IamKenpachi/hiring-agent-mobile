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
import { AuthButtonGradient, WEB_SANS } from "./OnboardingGraphics";
import type { WorkPreference, WizardDraftState } from "../lib/profileHelpers";

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

  return (
    <View className="flex-1">
      {/* Clean top bar without extra step progress bar, matching Mockup Screen 4 */}
      <View className="px-5 pt-3 pb-1 flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          className="h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] active:bg-white/10"
        >
          <ArrowLeft size={16} color="#CBD5E1" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={WEB_SANS}
          className="text-center text-[22px] font-bold tracking-[-0.4px] text-white mb-6"
        >
          AI Resume Parser
        </Text>

        {/* Extracted file banner */}
        <View className="rounded-2xl border border-white/10 bg-[#0F1524] p-3.5 mb-3.5 flex-row items-center gap-3">
          <View className="h-11 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
            <FileText size={18} color="#94A3B8" />
          </View>
          <View className="flex-1">
            <Text style={WEB_SANS} numberOfLines={1} className="text-[13px] font-semibold text-white">
              {filename}{" "}
              <Text className="font-normal text-[#94A3B8]">({sizeKb} KB)</Text>
            </Text>
            <View className="mt-1.5 self-start flex-row items-center gap-1 rounded-full border border-[#10B981]/35 bg-[#10B981]/15 px-2.5 py-0.5">
              <CheckCircle2 size={11} color="#34D399" />
              <Text style={WEB_SANS} className="text-[11px] font-semibold text-[#34D399]">
                Extracted by Gemini
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <View className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5">
            <Text className="text-xs font-medium text-red-200">{error}</Text>
          </View>
        ) : null}

        {/* 1. Contact & Links */}
        <View className="rounded-xl border border-white/10 bg-[#0D121F] mb-2.5 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("contact")}
            className="p-3.5 flex-row items-center justify-between active:bg-white/[0.03]"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color="#10B981" />
                <Text style={WEB_SANS} className="text-[14px] font-semibold text-white">
                  Contact & Links
                </Text>
              </View>
              <Text style={WEB_SANS} numberOfLines={1} className="mt-1 text-[12px] text-[#94A3B8]">
                {roleHeadline} • {locationLine}
              </Text>
            </View>
            {expanded === "contact" ? (
              <ChevronUp size={16} color="#64748B" />
            ) : (
              <ChevronDown size={16} color="#64748B" />
            )}
          </Pressable>

          {expanded === "contact" ? (
            <View className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3 gap-2.5">
              <TextInput
                value={draft.profileName}
                onChangeText={(v) => onChange({ ...draft, profileName: v })}
                placeholder="Target Role / Profile Name"
                placeholderTextColor="#64748B"
                className="rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
              />
              <TextInput
                value={draft.fullName}
                onChangeText={(v) => onChange({ ...draft, fullName: v })}
                placeholder="Full Name"
                placeholderTextColor="#64748B"
                className="rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
              />
              <View className="flex-row gap-2">
                <TextInput
                  value={draft.email}
                  onChangeText={(v) => onChange({ ...draft, email: v })}
                  placeholder="Email"
                  placeholderTextColor="#64748B"
                  className="flex-1 rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
                />
                <TextInput
                  value={draft.phone}
                  onChangeText={(v) => onChange({ ...draft, phone: v })}
                  placeholder="Phone"
                  placeholderTextColor="#64748B"
                  className="flex-1 rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
                />
              </View>
              <TextInput
                value={draft.location}
                onChangeText={(v) => onChange({ ...draft, location: v })}
                placeholder="Location"
                placeholderTextColor="#64748B"
                className="rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
              />
              <View className="flex-row gap-2">
                {(["Remote", "Hybrid", "On-Site"] as WorkPreference[]).map((pref) => (
                  <Pressable
                    key={pref}
                    onPress={() => onChange({ ...draft, workPreference: pref })}
                    className={`flex-1 items-center rounded-full border py-1.5 ${
                      draft.workPreference === pref
                        ? "border-[#6366F1] bg-[#6366F1]/25"
                        : "border-white/10 bg-[#080C16]"
                    }`}
                  >
                    <Text className="text-[11px] font-semibold text-white">{pref}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={draft.linkedinUrl}
                onChangeText={(v) => onChange({ ...draft, linkedinUrl: v })}
                placeholder="LinkedIn URL"
                placeholderTextColor="#64748B"
                className="rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
              />
            </View>
          ) : null}
        </View>

        {/* 2. Core Skills */}
        <View className="rounded-xl border border-white/10 bg-[#0D121F] mb-2.5 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("skills")}
            className="p-3.5 flex-row items-center justify-between active:bg-white/[0.03]"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color="#10B981" />
                <Text style={WEB_SANS} className="text-[14px] font-semibold text-white">
                  Core Skills ({draft.skills.length})
                </Text>
              </View>
              <Text style={WEB_SANS} numberOfLines={1} className="mt-1 text-[12px] text-[#94A3B8]">
                {skillsPreview}
              </Text>
            </View>
            {expanded === "skills" ? (
              <ChevronUp size={16} color="#64748B" />
            ) : (
              <ChevronDown size={16} color="#64748B" />
            )}
          </Pressable>

          {expanded === "skills" ? (
            <View className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3 gap-2.5">
              <View className="flex-row gap-2">
                <TextInput
                  value={skillInput}
                  onChangeText={setSkillInput}
                  onSubmitEditing={addSkill}
                  placeholder="Add Skill"
                  placeholderTextColor="#64748B"
                  className="flex-1 rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
                />
                <Pressable
                  onPress={addSkill}
                  className="items-center justify-center rounded-lg border border-[#6366F1]/50 bg-[#6366F1]/25 px-3"
                >
                  <Plus size={15} color="#C7D2FE" />
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {draft.skills.map((skill, idx) => (
                  <Pressable
                    key={`${skill}-${idx}`}
                    onPress={() => removeSkill(idx)}
                    className="flex-row items-center gap-1 rounded-full border border-[#14B8A6]/45 bg-[#0D9488]/20 px-2.5 py-1"
                  >
                    <Text className="text-[11px] font-semibold text-[#5EEAD4]">{skill}</Text>
                    <X size={11} color="#5EEAD4" />
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={draft.summary}
                onChangeText={(v) => onChange({ ...draft, summary: v })}
                placeholder="Executive summary..."
                placeholderTextColor="#64748B"
                multiline
                className="min-h-[76px] rounded-lg border border-white/10 bg-[#080C16] px-3 py-2 text-xs text-white"
                textAlignVertical="top"
              />
            </View>
          ) : null}
        </View>

        {/* 3. Work Experience */}
        <View className="rounded-xl border border-white/10 bg-[#0D121F] mb-2.5 overflow-hidden">
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleSection("experience")}
            className="p-3.5 flex-row items-center justify-between active:bg-white/[0.03]"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color="#10B981" />
                <Text style={WEB_SANS} className="text-[14px] font-semibold text-white">
                  Work Experience
                </Text>
              </View>
              <Text style={WEB_SANS} numberOfLines={1} className="mt-1 text-[12px] text-[#94A3B8]">
                {expCount} {expCount === 1 ? "Role" : "Roles"} extracted
              </Text>
            </View>
            {expanded === "experience" ? (
              <ChevronUp size={16} color="#64748B" />
            ) : (
              <ChevronDown size={16} color="#64748B" />
            )}
          </Pressable>

          {expanded === "experience" ? (
            <View className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3 gap-3">
              {draft.experiences.map((exp, idx) => (
                <View key={idx} className="rounded-lg border border-white/10 bg-[#080C16] p-2.5 gap-2">
                  <TextInput
                    value={exp.title}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], title: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Role Title"
                    placeholderTextColor="#64748B"
                    className="text-xs font-semibold text-white"
                  />
                  <TextInput
                    value={exp.company}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], company: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Company & Dates"
                    placeholderTextColor="#64748B"
                    className="text-xs text-[#CBD5E1]"
                  />
                  <TextInput
                    value={exp.bulletsText}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], bulletsText: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Impact bullets (one per line)"
                    placeholderTextColor="#64748B"
                    multiline
                    className="min-h-[60px] text-xs text-[#94A3B8]"
                    textAlignVertical="top"
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* 4. Projects & Education */}
        <View className="rounded-xl border border-white/10 bg-[#0D121F] mb-3 overflow-hidden">
          <Pressable
            onPress={() => toggleSection("projectsEdu")}
            className="p-3.5 flex-row items-center justify-between active:bg-white/[0.03]"
          >
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={15} color="#10B981" />
                <Text style={WEB_SANS} className="text-[14px] font-semibold text-white">
                  Projects & Education
                </Text>
              </View>
              <Text style={WEB_SANS} numberOfLines={1} className="mt-1 text-[12px] text-[#94A3B8]">
                {projEduSubtitle}
              </Text>
            </View>
            {expanded === "projectsEdu" ? (
              <ChevronUp size={16} color="#64748B" />
            ) : (
              <ChevronDown size={16} color="#64748B" />
            )}
          </Pressable>

          {expanded === "projectsEdu" ? (
            <View className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-3 gap-3">
              {draft.projects.map((proj, idx) => (
                <View key={idx} className="rounded-lg border border-white/10 bg-[#080C16] p-2.5 gap-1.5">
                  <TextInput
                    value={proj.name}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], name: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Project Title"
                    placeholderTextColor="#64748B"
                    className="text-xs font-semibold text-white"
                  />
                  <TextInput
                    value={proj.description}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], description: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Project impact..."
                    placeholderTextColor="#64748B"
                    multiline
                    className="text-xs text-[#94A3B8]"
                  />
                </View>
              ))}
              {draft.educationList.map((ed, idx) => (
                <View key={idx} className="rounded-lg border border-white/10 bg-[#080C16] p-2.5 gap-1.5">
                  <TextInput
                    value={ed.degree}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], degree: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="Degree"
                    placeholderTextColor="#64748B"
                    className="text-xs font-semibold text-white"
                  />
                  <TextInput
                    value={ed.institutionAndYear}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], institutionAndYear: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="University & Graduation Year"
                    placeholderTextColor="#64748B"
                    className="text-xs text-[#94A3B8]"
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
          <Text style={WEB_SANS} className="text-[15.5px] font-semibold text-white">
            {saving ? "Saving Master Profile..." : "Save Master Profile"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
