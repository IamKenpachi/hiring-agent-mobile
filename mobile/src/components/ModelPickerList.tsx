import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Cpu } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import type { ModelOption } from "../types";

interface ModelPickerListProps {
  models: ModelOption[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
}

export function ModelPickerList({
  models,
  selectedModel,
  onSelect,
}: ModelPickerListProps) {
  return (
    <View style={styles.list}>
      {models.map((model) => {
        const isSelected = model.id === selectedModel;
        return (
          <Pressable
            key={model.id}
            onPress={() => onSelect(model.id)}
            style={({ pressed }) => [
              styles.card,
              isSelected && styles.cardSelected,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.leftIcon}>
              <Cpu
                size={16}
                color={isSelected ? COLORS.indigo : COLORS.textSecondary}
              />
            </View>

            <View style={styles.content}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{model.name}</Text>
                {model.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{model.badge}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.description} numberOfLines={2}>
                {model.description}
              </Text>

              <View style={styles.pricingRow}>
                <Text style={styles.pricingText}>
                  ${model.input_cost_per_m}/1M in • ${model.output_cost_per_m}/1M out
                </Text>
              </View>
            </View>

            <View style={[styles.radio, isSelected && styles.radioSelected]}>
              {isSelected ? <Check size={13} color="#FFFFFF" /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardSelected: {
    backgroundColor: COLORS.indigoSoft,
    borderColor: COLORS.indigoBorder,
  },
  cardPressed: {
    opacity: 0.85,
  },
  leftIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: COLORS.purpleSoft,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#E9D5FF",
  },
  description: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  pricingRow: {
    marginTop: 2,
  },
  pricingText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.emerald,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    backgroundColor: COLORS.indigo,
    borderColor: COLORS.indigo,
  },
});

