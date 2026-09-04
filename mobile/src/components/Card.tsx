import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { C, RADIUS } from '../theme';

export function Card({ children, onPress, barColor, style }: {
  children: React.ReactNode; onPress?: () => void; barColor?: string; style?: any;
}) {
  const body = <View style={[s.cardInner, style]}>{children}</View>;
  if (!onPress && !barColor) return <View style={s.card}>{body}</View>;
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [s.card, { flexDirection: 'row', overflow: 'hidden' }, pressed && { opacity: 0.9 }]}>
      {barColor ? <View style={{ width: 4, backgroundColor: barColor }} /> : null}
      <View style={{ flex: 1 }}>{body}</View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surfaceLowest, borderRadius: RADIUS.card, marginBottom: 12,
    elevation: 1, shadowColor: C.secondary, shadowOpacity: 0.08, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardInner: { padding: 16 },
});
