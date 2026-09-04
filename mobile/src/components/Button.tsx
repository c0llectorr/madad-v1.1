import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { C, RADIUS, T } from '../theme';

export function Button({ title, onPress, kind = 'primary', disabled, icon }: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'outlined' | 'critical' | 'tertiary' | 'text';
  disabled?: boolean;
  icon?: string;
}) {
  const styles: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.primary, fg: C.onPrimary },
    outlined: { bg: 'transparent', fg: C.primary, border: C.outlineVariant },
    critical: { bg: C.critical, fg: C.onPrimary },
    tertiary: { bg: C.tertiary, fg: C.onTertiary },
    text: { bg: 'transparent', fg: C.primary },
  };
  const v = styles[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, { backgroundColor: v.bg },
        v.border && { borderWidth: 1, borderColor: v.border },
        pressed && { opacity: 0.85 }, disabled && { opacity: 0.45 }]}>
      {icon ? <Text style={[s.btnIcon, { color: v.fg }]}>{icon} </Text> : null}
      <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', marginBottom: 8, minHeight: 48,
  },
  btnText: { color: C.onPrimary, fontWeight: '600', fontSize: 15 },
  btnIcon: { fontSize: 14 },
});

export function PillButton({ title, onPress, kind = 'outlined', icon }: {
  title: string; onPress: () => void; kind?: 'outlined' | 'primary'; icon?: string;
}) {
  const filled = kind === 'primary';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      s2.pill, { backgroundColor: filled ? C.primary : C.surfaceLowest },
      !filled && { borderWidth: 1, borderColor: C.outlineVariant },
      pressed && { opacity: 0.85 }]}>
      {icon ? <Text style={{ color: filled ? C.onPrimary : C.primary, fontSize: 16 }}>{icon} </Text> : null}
      <Text style={[T.labelLg, { color: filled ? C.onPrimary : C.primary }]}>{title}</Text>
    </Pressable>
  );
}

const s2 = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 18, minHeight: 44,
  },
});
