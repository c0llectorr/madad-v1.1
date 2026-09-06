import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolygon } from '../../LeafletMap';
import { C, T } from '../../theme';
import { Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../components';
import { FilterChips } from '../../components/FilterChips';
import type { Center, Coordinator, Depot } from '../../types';
import { convexHull } from '../../utils/geo';

export function ResourcesPage({ centers, key2, go }: {
  centers: Center[]; key2: number;
  go: (v: { name: 'addCenter' | 'addCoordinator' }) => void;
}) {
  const [depotsByCenter, setDepotsByCenter] = useState<Record<number, Depot[]>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all(
          centers.map(c => api<Depot[]>(`/depots?center_id=${c.id}`)));
        setDepotsByCenter(Object.fromEntries(centers.map((c, i) => [c.id, results[i]])));
      } catch (e: any) { setErr(e.message); }
    })();
  }, [centers, key2]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(depotsByCenter).flat().forEach(d =>
      d.inventory.forEach(i => { map[i.resource_type] = (map[i.resource_type] ?? 0) + i.quantity; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [depotsByCenter]);

  const maxQty = Math.max(1, ...totals.map(t => t[1]));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle title="Resource Management"
        sub="Real-time status across all regional depots." />
      <Err msg={err} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <PillButton title="Add Center" onPress={() => go({ name: 'addCenter' })} icon="＋" />
        </View>
        <View style={{ flex: 1 }}>
          <PillButton title="Add Coordinator" kind="primary"
                      onPress={() => go({ name: 'addCoordinator' })} icon="👤" />
        </View>
      </View>

      {centers.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No centers yet — add one to begin.</Text>}

      {totals.map(([type, qty]) => {
        const mean = totals.length ? totals.reduce((s, t) => s + t[1], 0) / totals.length : 0;
        const low = qty < mean * 0.25;
        const tone = low ? C.critical : C.tertiary;
        return (
          <Card key={type} barColor={low ? C.critical : C.tertiary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>{'📦'} {type}</Text>
              <StatusChip label={low ? 'Low Stock' : 'Adequate'} tone={low ? 'critical' : 'ok'} />
            </View>
            <Text style={[T.headlineLg, { color: C.onSurface, marginTop: 10 }]}>
              {qty.toLocaleString()}
            </Text>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>units in stock</Text>
            {/* per-depot distribution — REAL quantities */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, marginTop: 14, gap: 6 }}>
              {(() => {
                const perDepot = Object.values(depotsByCenter).flat()
                  .flatMap(d => d.inventory.filter(i => i.resource_type === type)
                    .map(i => i.quantity));
                const cap = Math.max(1, ...perDepot);
                return perDepot.slice(0, 12).map((q, i) => (
                  <View key={i} style={{ flex: 1, height: Math.max(6, (q / cap) * 64),
                    backgroundColor: tone, opacity: 0.85, borderRadius: 4 }} />
                ));
              })()}
            </View>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 8 }]}>
              across {Object.values(depotsByCenter).flat().length} depots · {centers.length} centers
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

/* ---------------- Centers tab ---------------- */
import { cs } from './adminStyles';

