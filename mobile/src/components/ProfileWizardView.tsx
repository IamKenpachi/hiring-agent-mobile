import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Plus, Trash2, X } from "lucide-react-native";
import { getCardElevation } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import type { WorkPreference, WizardDraftState } from "../lib/profileHelpers";
import { AuthButtonGradient, StepProgressHeader, WEB_SANS } from "./OnboardingGraphics";
import { ThemeToggleButton } from "./ThemeToggleButton";

interface ProfileWizardViewProps {
  draft: WizardDraftState;
  onChange: (next: WizardDraftState) => void;
  step: 1 | 2 | 3 | 4;
  onStepChange: (step: 1 | 2 | 3 | 4) => void;
  onExitWizard: () => void;
  onComplete: () => void;
  submitting?: boolean;
  error?: string | null;
}

export function ProfileWizardView({
  draft,
  onChange,
  step,
  onStepChange,
  onExitWizard,
  onComplete,
  submitting = false,
  error = null,
}: ProfileWizardViewProps) {
  const { colors, isDark } = useTheme();
  const [skillInput, setSkillInput] = useState("");
  const [techInputs, setTechInputs] = useState<Record<number, string>>({});

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

  const addProjectTech = (projIdx: number) => {
    const clean = (techInputs[projIdx] || "").trim();
    if (!clean) return;
    const next = [...draft.projects];
    if (!next[projIdx].technologies.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      next[projIdx] = {
        ...next[projIdx],
        technologies: [...next[projIdx].technologies, clean],
      };
      onChange({ ...draft, projects: next });
    }
    setTechInputs((prev) => ({ ...prev, [projIdx]: "" }));
  };

  const handleBack = () => {
    if (step === 1) {
      onExitWizard();
    } else {
      onStepChange((step - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handlePrimaryCta = () => {
    if (step < 4) {
      onStepChange((step + 1) as 1 | 2 | 3 | 4);
    } else {
      onComplete();
    }
  };

  const ctaLabel =
    step === 1
      ? "Next: Skills & Summary"
      : step === 2
        ? "Next: Work Experience"
        : step === 3
          ? "Next: Projects & Education"
          : submitting
            ? "Saving..."
            : "Complete Setup & Start Hunting";

  const stepHeading =
    step === 1
      ? "Basic Info & Target Role"
      : step === 2
        ? "Core Skills & Summary"
        : step === 3
          ? "Work Experience"
          : "Key Projects & Education";

  const topInputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: isDark ? colors.border : colors.borderStrong,
    color: colors.textPrimary,
  };

  const nestedInputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    color: colors.textPrimary,
  };

  const cardContainerStyle = [
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    getCardElevation(isDark),
  ];

  return (
    <View className="flex-1">
      <StepProgressHeader
        label={`Wizard Step ${step} of 4`}
        totalSteps={4}
        currentStep={step}
        onBack={handleBack}
        rightSlot={<ThemeToggleButton size="compact" />}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[WEB_SANS, { color: colors.textPrimary }]}
          className="text-center text-[21px] font-bold tracking-[-0.4px] mb-4"
        >
          {stepHeading}
        </Text>

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

        {step === 1 ? (
          <View className="gap-3">
            <View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                className="text-[12px] font-medium mb-1.5"
              >
                Profile Name
              </Text>
              <TextInput
                value={draft.profileName}
                onChangeText={(v) => onChange({ ...draft, profileName: v })}
                placeholder="Senior Data Analyst"
                placeholderTextColor={colors.textMuted}
                style={topInputStyle}
                className="h-[42px] rounded-xl border px-3.5 text-[13.5px]"
              />
            </View>

            <View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                className="text-[12px] font-medium mb-1.5"
              >
                Full Name
              </Text>
              <TextInput
                value={draft.fullName}
                onChangeText={(v) => onChange({ ...draft, fullName: v })}
                placeholder="Alex Morgan"
                placeholderTextColor={colors.textMuted}
                style={topInputStyle}
                className="h-[42px] rounded-xl border px-3.5 text-[13.5px]"
              />
            </View>

            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="text-[12px] font-medium mb-1.5"
                >
                  Email
                </Text>
                <TextInput
                  value={draft.email}
                  onChangeText={(v) => onChange({ ...draft, email: v })}
                  placeholder="alex@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={topInputStyle}
                  className="h-[42px] rounded-xl border px-3 text-[13px]"
                />
              </View>
              <View className="flex-1">
                <Text
                  style={[WEB_SANS, { color: colors.textSecondary }]}
                  className="text-[12px] font-medium mb-1.5"
                >
                  Phone
                </Text>
                <TextInput
                  value={draft.phone}
                  onChangeText={(v) => onChange({ ...draft, phone: v })}
                  placeholder="+44 7700 900123"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  style={topInputStyle}
                  className="h-[42px] rounded-xl border px-3 text-[13px]"
                />
              </View>
            </View>

            <View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                className="text-[12px] font-medium mb-1.5"
              >
                Location
              </Text>
              <TextInput
                value={draft.location}
                onChangeText={(v) => onChange({ ...draft, location: v })}
                placeholder="London, UK"
                placeholderTextColor={colors.textMuted}
                style={topInputStyle}
                className="h-[42px] rounded-xl border px-3.5 text-[13.5px]"
              />
            </View>

            <View>
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                className="text-[12px] font-medium mb-1.5"
              >
                Work Preference
              </Text>
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
                      className="h-[34px] flex-1 items-center justify-center rounded-full border"
                    >
                      <Text
                        style={[
                          WEB_SANS,
                          { color: active ? colors.indigoText : colors.textSecondary },
                        ]}
                        className="text-[12.5px] font-semibold"
                      >
                        {pref}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <TextInput
                value={draft.linkedinUrl}
                onChangeText={(v) => onChange({ ...draft, linkedinUrl: v })}
                placeholder="LinkedIn URL"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={topInputStyle}
                className="h-[42px] rounded-xl border px-3.5 text-[13px]"
              />
            </View>

            <View>
              <TextInput
                value={draft.githubUrl}
                onChangeText={(v) => onChange({ ...draft, githubUrl: v })}
                placeholder="GitHub / Portfolio URL"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={topInputStyle}
                className="h-[42px] rounded-xl border px-3.5 text-[13px]"
              />
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-3.5">
            <View className="flex-row gap-2">
              <TextInput
                value={skillInput}
                onChangeText={setSkillInput}
                onSubmitEditing={addSkill}
                returnKeyType="done"
                placeholder="Add Skill (e.g. Python, SQL, dbt)"
                placeholderTextColor={colors.textMuted}
                style={topInputStyle}
                className="h-[42px] flex-1 rounded-xl border px-3.5 text-[13.5px]"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add skill"
                onPress={addSkill}
                style={{
                  backgroundColor: colors.indigoSoft,
                  borderColor: colors.indigoBorder,
                }}
                className="h-[42px] w-[42px] items-center justify-center rounded-xl border active:opacity-80"
              >
                <Plus size={18} color={colors.indigoText} />
              </Pressable>
            </View>

            {draft.skills.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {draft.skills.map((skill, idx) => (
                  <Pressable
                    key={`${skill}-${idx}`}
                    onPress={() => removeSkill(idx)}
                    style={{
                      backgroundColor: colors.emeraldSoft,
                      borderColor: colors.emeraldBorder,
                    }}
                    className="flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
                  >
                    <Text
                      style={[WEB_SANS, { color: colors.emeraldText }]}
                      className="text-[12px] font-semibold"
                    >
                      {skill}
                    </Text>
                    <X size={12} color={colors.emeraldText} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.textMuted }} className="text-xs">
                Add skills one by one to generate ATS skill tags.
              </Text>
            )}

            <View className="mt-1">
              <Text
                style={[WEB_SANS, { color: colors.textSecondary }]}
                className="text-[12.5px] font-medium mb-2"
              >
                Summary
              </Text>
              <TextInput
                value={draft.summary}
                onChangeText={(v) => onChange({ ...draft, summary: v })}
                placeholder="Experienced Senior Data Analyst with 5+ years in fintech, specializing in scalable data pipelines (dbt, Snowflake) and executive BI dashboards..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={topInputStyle}
                className="min-h-[180px] rounded-2xl border p-3.5 text-[13px] leading-[20px]"
              />
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View className="gap-3.5">
            {draft.experiences.map((exp, idx) => (
              <View key={idx} style={cardContainerStyle} className="rounded-2xl border p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                    Experience Card {draft.experiences.length > 1 ? `#${idx + 1}` : ""}
                  </Text>
                  {draft.experiences.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        onChange({
                          ...draft,
                          experiences: draft.experiences.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <Trash2 size={15} color={colors.rose} />
                    </Pressable>
                  ) : null}
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Role Title
                  </Text>
                  <TextInput
                    value={exp.title}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], title: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="Data Analyst"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Company
                  </Text>
                  <TextInput
                    value={exp.company}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], company: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="FinTech Corp"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Dates
                  </Text>
                  <TextInput
                    value={exp.duration}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], duration: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder="2023 – Present"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Impact Bullets
                  </Text>
                  <TextInput
                    value={exp.bulletsText}
                    onChangeText={(v) => {
                      const next = [...draft.experiences];
                      next[idx] = { ...next[idx], bulletsText: v };
                      onChange({ ...draft, experiences: next });
                    }}
                    placeholder={"• Built 15+ dbt models in Snowflake reducing query latency by 40%.\n• Automated executive KPI dashboards in Tableau for 50+ stakeholders."}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    style={nestedInputStyle}
                    className="min-h-[96px] rounded-lg border px-3 py-2.5 text-[12.5px] leading-[18px]"
                  />
                </View>
              </View>
            ))}

            <Pressable
              onPress={() =>
                onChange({
                  ...draft,
                  experiences: [
                    ...draft.experiences,
                    { title: "", company: "", duration: "", bulletsText: "" },
                  ],
                })
              }
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
              }}
              className="h-[44px] flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed active:opacity-80"
            >
              <Plus size={15} color={colors.textSecondary} />
              <Text style={[WEB_SANS, { color: colors.textSecondary }]} className="text-[13px] font-semibold">
                Add Another Role
              </Text>
            </Pressable>
          </View>
        ) : null}

        {step === 4 ? (
          <View className="gap-3.5">
            {/* Key Project Card(s) */}
            {draft.projects.map((proj, idx) => (
              <View key={idx} style={cardContainerStyle} className="rounded-2xl border p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                    Key Project Card {draft.projects.length > 1 ? `#${idx + 1}` : ""}
                  </Text>
                  {draft.projects.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        onChange({
                          ...draft,
                          projects: draft.projects.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <Trash2 size={15} color={colors.rose} />
                    </Pressable>
                  ) : null}
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Project Title
                  </Text>
                  <TextInput
                    value={proj.name}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], name: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Customer Churn Analytics Pipeline"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1.5">
                    Tech Stack
                  </Text>
                  {proj.technologies.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5 mb-2">
                      {proj.technologies.map((tech, tIdx) => (
                        <Pressable
                          key={`${tech}-${tIdx}`}
                          onPress={() => {
                            const next = [...draft.projects];
                            next[idx] = {
                              ...next[idx],
                              technologies: next[idx].technologies.filter((_, i) => i !== tIdx),
                            };
                            onChange({ ...draft, projects: next });
                          }}
                          style={{
                            backgroundColor: colors.emeraldSoft,
                            borderColor: colors.emeraldBorder,
                          }}
                          className="flex-row items-center gap-1 rounded-md border px-2.5 py-1"
                        >
                          <Text style={{ color: colors.emeraldText }} className="text-[11px] font-semibold">
                            {tech}
                          </Text>
                          <X size={10} color={colors.emeraldText} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  <View className="flex-row gap-2">
                    <TextInput
                      value={techInputs[idx] || ""}
                      onChangeText={(v) => setTechInputs((prev) => ({ ...prev, [idx]: v }))}
                      onSubmitEditing={() => addProjectTech(idx)}
                      placeholder="Add tech (e.g. Python, FastAPI)"
                      placeholderTextColor={colors.textMuted}
                      style={nestedInputStyle}
                      className="flex-1 rounded-lg border px-3 py-2 text-xs"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add tech"
                      onPress={() => addProjectTech(idx)}
                      style={{
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.borderStrong,
                      }}
                      className="items-center justify-center rounded-lg border px-2.5"
                    >
                      <Plus size={14} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Impact
                  </Text>
                  <TextInput
                    value={proj.description}
                    onChangeText={(v) => {
                      const next = [...draft.projects];
                      next[idx] = { ...next[idx], description: v };
                      onChange({ ...draft, projects: next });
                    }}
                    placeholder="Automated executive KPI reporting and cohort retention dashboards."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={nestedInputStyle}
                    className="min-h-[54px] rounded-lg border px-3 py-2 text-[12.5px]"
                    textAlignVertical="top"
                  />
                </View>
              </View>
            ))}

            {/* Education Card */}
            {draft.educationList.map((ed, idx) => (
              <View key={idx} style={cardContainerStyle} className="rounded-2xl border p-4 gap-2.5">
                <Text style={[WEB_SANS, { color: colors.textPrimary }]} className="text-[14px] font-semibold">
                  Education Card
                </Text>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    Degree
                  </Text>
                  <TextInput
                    value={ed.degree}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], degree: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="B.Sc. in Data Science & Analytics"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>

                <View>
                  <Text style={{ color: colors.textMuted }} className="text-[11px] font-medium mb-1">
                    University & Graduation Year
                  </Text>
                  <TextInput
                    value={ed.institutionAndYear}
                    onChangeText={(v) => {
                      const next = [...draft.educationList];
                      next[idx] = { ...next[idx], institutionAndYear: v };
                      onChange({ ...draft, educationList: next });
                    }}
                    placeholder="University of Manchester • 2023"
                    placeholderTextColor={colors.textMuted}
                    style={nestedInputStyle}
                    className="rounded-lg border px-3 py-2 text-[13px]"
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Gradient CTA */}
      <View className="px-6 pb-6 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          disabled={submitting}
          onPress={handlePrimaryCta}
          className="h-[50px] w-full items-center justify-center overflow-hidden rounded-full active:opacity-90"
        >
          <AuthButtonGradient />
          <Text style={[WEB_SANS, { color: "#FFFFFF" }]} className="text-[15.5px] font-semibold">
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
