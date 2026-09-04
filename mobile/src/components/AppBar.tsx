import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, T } from '../theme';

export function AppBar({ title, onBack, onMenu, right }: {
  title: string; onBack?: () => void; onMenu?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.appBar, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={s.appBarIcon} hitSlop={12} accessibilityLabel="Go back">
          <Text style={s.appBarGlyph}>‹</Text>
        </Pressable>
      ) : null}
      {onMenu ? (
        <Pressable onPress={onMenu} style={s.appBarIcon} hitSlop={12} accessibilityLabel="Menu">
          <Text style={s.appBarGlyph}>☰</Text>
        </Pressable>
      ) : null}
      <Text style={[T.titleLg, { color: C.primary, flex: 1, marginLeft: onBack || onMenu ? 8 : 0 }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  appBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.background,
  },
  appBarIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarGlyph: { fontSize: 22, color: C.onSurface },
});
