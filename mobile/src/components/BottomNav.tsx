import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';

export interface NavTab { key: string; label: string; icon: string }

/** Role-scoped bottom navigation — renders ONLY the tabs the navigator passes in. */
export function BottomNav({ tabs, active, onChange }: {
  tabs: NavTab[]; active: string; onChange: (k: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[nb.bar, { paddingBottom: Math.max(12, insets.bottom) }]}>
      {tabs.map(t => {
        const on = t.key === active;
        return <NavItem key={t.key} tab={t} active={on} onPress={() => onChange(t.key)} />;
      })}
    </View>
  );
}

function NavItem({ tab, active, onPress }: { tab: NavTab; active: boolean; onPress: () => void }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Pressable onPress={handlePress} style={nb.item} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View style={[nb.indicator, active ? nb.indicatorActive : nb.indicatorInactive]} />
      <Animated.View style={[nb.content, { transform: [{ scale }] }]}>
        <View style={nb.iconWrap}>
          <Text style={[nb.icon, { color: active ? C.primary : C.onSurfaceVariant }]}>{tab.icon}</Text>
        </View>
        <Text style={[nb.label, active ? nb.labelActive : nb.labelInactive]} numberOfLines={1}>{tab.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const nb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  item: { flex: 1, alignItems: 'center' },
  indicator: { height: 3, width: '50%', borderRadius: 2, marginBottom: 8 },
  indicatorActive: { backgroundColor: C.primary },
  indicatorInactive: { backgroundColor: 'transparent' },
  content: { alignItems: 'center', paddingBottom: 6 },
  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 3, height: 28 },
  icon: { fontSize: 20 },
  label: { fontSize: 11, lineHeight: 14 },
  labelActive: { color: C.primary, fontWeight: '700' },
  labelInactive: { color: C.onSurfaceVariant, fontWeight: '400' },
});
