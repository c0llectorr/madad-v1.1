import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C, RADIUS } from "../theme";

/** Magnifier search input — used by admin Accounts and Centers pages. */
export function SearchBox({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={s.wrap}>
      <Text style={s.icon}>{"🔍"}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.outline}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceLowest,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    marginBottom: 14,
    minHeight: 46,
  },
  icon: { color: C.outline, marginRight: 8 },
  input: { flex: 1, color: C.onSurface, fontSize: 16, paddingVertical: 8 },
});
