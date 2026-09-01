import React from 'react';
import { StyleSheet, Text, View, StatusBar, Pressable } from 'react-native';
import { C, T } from '../theme';
import { Button } from '../ui';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      {/* Circular map medallion with floating icon chips */}
      <View style={s.heroWrap}>
        <View style={s.medallion}>
          {/* simplified map artwork built from shapes */}
          <View style={[s.mapBg]} />
          <View style={[s.road, { top: '30%', left: 0, right: 0, height: 10 }]} />
          <View style={[s.road, { top: '58%', left: 0, right: 0, height: 14 }]} />
          <View style={[s.road, { left: '28%', top: 0, bottom: 0, width: 10 }]} />
          <View style={[s.road, { left: '62%', top: 0, bottom: 0, width: 14 }]} />
          <View style={[s.river]} />
          <View style={[s.block, { top: '12%', left: '10%', width: 40, height: 26 }]} />
          <View style={[s.block, { top: '16%', right: '12%', width: 52, height: 30 }]} />
          <View style={[s.block, { bottom: '18%', left: '16%', width: 60, height: 34 }]} />
          <View style={[s.block, { bottom: '12%', right: '10%', width: 44, height: 24 }]} />
          <View style={[s.park, { top: '36%', left: '40%', width: 56, height: 40 }]} />
        </View>

        <View style={[s.floatChip, { top: '18%', left: '12%' }]}>
          <Text style={s.floatIcon}>{'🚚'}</Text>
        </View>
        <View style={[s.floatChip, { bottom: '26%', right: '14%' }]}>
          <Text style={s.floatIcon}>{'⚠️'}</Text>
        </View>
        <View style={s.targetChip}>
          <Text style={{ color: C.onPrimary, fontSize: 30 }}>{'◎'}</Text>
        </View>
      </View>

      {/* Brand block */}
      <View style={s.brandRow}>
        <Text style={[s.brandIcon, { color: C.primary }]}>{'ᯤ'}</Text>
        <Text style={[T.headlineLg, { color: C.primary }]}>MADAD</Text>
      </View>

      <Text style={[T.headlineLg, s.headline]}>Precision Relief,{'\n'}Real-Time Response.</Text>
      <Text style={[T.bodyLg, s.sub]}>
        Coordinating support centers, depots, and field teams for efficient flood response.
      </Text>

      <View style={{ flex: 1 }} />
      <Pressable onPress={onDone} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
        <Text style={[T.labelLg, { color: C.onPrimary, fontSize: 16 }]}>Get Started</Text>
        <Text style={{ color: C.onPrimary, fontSize: 18 }}>{' →'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, padding: 16, paddingTop: 40 },
  heroWrap: { height: 400, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  medallion: {
    width: 340, height: 340, borderRadius: 170, overflow: 'hidden',
    backgroundColor: C.surfaceContainer, elevation: 2,
  },
  mapBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#EFEFE7' },
  road: { position: 'absolute', backgroundColor: '#8FC6DB', borderRadius: 6 },
  river: {
    position: 'absolute', right: -30, top: '40%', width: 80, height: 300,
    backgroundColor: '#B7DCE8', transform: [{ rotate: '30deg' }], borderRadius: 40,
  },
  block: { position: 'absolute', backgroundColor: '#D8D8CC', borderRadius: 4 },
  park: { position: 'absolute', backgroundColor: '#CBE3C0', borderRadius: 8 },
  floatChip: {
    position: 'absolute', width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.surfaceLowest, alignItems: 'center', justifyContent: 'center', elevation: 3,
  },
  floatIcon: { fontSize: 22 },
  targetChip: {
    position: 'absolute', width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#0E5E79', alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32 },
  brandIcon: { fontSize: 24, marginRight: 8 },
  headline: { color: C.onSurface, textAlign: 'center', marginTop: 16 },
  sub: { color: C.onSurfaceVariant, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
  cta: {
    backgroundColor: C.primary, borderRadius: 999, minHeight: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
});

