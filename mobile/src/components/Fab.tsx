import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { C } from "../theme";

export function Fab({
  icon = "＋",
  onPress,
  color = C.primary,
  bottomOffset,
}: {
  icon?: string;
  onPress: () => void;
  color?: string;
  bottomOffset?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.fab,
        { backgroundColor: color },
        bottomOffset !== undefined && { bottom: bottomOffset },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={icon === "＋" ? "New report" : undefined}
    >
      <Text style={{ color: C.onPrimary, fontSize: 24, marginTop: -2 }}>
        {icon}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
