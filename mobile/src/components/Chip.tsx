import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, RADIUS, T } from "../theme";

export function Chip({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const accent = color ?? C.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.chip,
        onPress && pressed && { opacity: 0.8 },
        selected
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: "transparent", borderColor: C.outlineVariant },
      ]}
    >
      <Text style={[T.labelLg, { color: selected ? C.onPrimary : accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "critical" | "warning" | "ok" | "info";
}) {
  const map = {
    critical: { bg: C.criticalContainer, fg: C.onErrorContainer },
    warning: { bg: C.warningContainer, fg: "#8A6D00" },
    ok: { bg: C.tertiaryFixed, fg: C.onTertiaryFixed },
    info: { bg: C.surfaceHigh, fg: C.onSurfaceVariant },
  }[tone];
  return (
    <View style={[s.statusChip, { backgroundColor: map.bg }]}>
      <Text style={[T.labelSm, { color: map.fg, fontWeight: "700" }]}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  statusChip: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
});
