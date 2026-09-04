import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../LeafletMap';
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from '../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../utils/constants';
import { convexHull, nearestDepot } from '../../utils/geo';

export function HomePage({ centerId, sites, reports, dispatches, depots, onNewReport, onPendingReports, onDispatch, onAssignSite }: {
  centerId: number; sites: Site[]; reports: ReportRow[]; dispatches: DispatchRow[]; depots: Depot[];
  onNewReport: () => void; onPendingReports: () => void; onDispatch: (a: Allocation) => void;
  onAssignSite: (site: Site) => void;
}) {
  const pending = reports.filter(r => r.status === 'pending_extraction' || r.status === 'extracted').length;
  const activeDispatches = dispatches.filter(d => d.status !== 'delivered').length;
  const lowStock = depots.flatMap(d => d.inventory).filter(i => i.quantity < 100).length;

  const top = [...sites].filter(s => s.status !== 'delivered')
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)).slice(0, 5);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <SectionTitle title="Operations Dashboard" />

      {pending > 0 && (
        <Card barColor={C.critical} onPress={onPendingReports}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 26, marginRight: 12 }}>{'🚨'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[T.labelLg, { color: C.critical }]}>ACTION REQUIRED</Text>
              <Text style={[T.titleLg, { color: C.onSurface }]}>{pending} Pending Reports</Text>
              <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>Tap to review & submit</Text>
            </View>
            <Text style={{ color: C.outline, fontSize: 18 }}>{'›'}</Text>
          </View>
        </Card>
      )}

      {/* Stat tiles */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 16 }}>
        <View style={hs.tile}>
          <Text style={[T.labelLg, { color: C.onSurfaceVariant }]}>Active Dispatches</Text>
          <Text style={[T.headlineLg, { color: C.primary }]}>{String(activeDispatches).padStart(2, '0')}</Text>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>en route operations</Text>
        </View>
        <View style={hs.tile}>
          <Text style={[T.labelLg, { color: C.onSurfaceVariant }]}>Low Inventory</Text>
          <Text style={[T.headlineLg, { color: lowStock > 0 ? C.warning : C.tertiary }]}>{String(lowStock).padStart(2, '0')}</Text>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>items below 100 units</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>Top Relief Sites</Text>
      </View>

      {top.map((s, i) => (
        <Card key={s.id} barColor={SEVERITY_BAR[s.severity ?? 'low'] ?? C.primary}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{i + 1}. {s.location_name}</Text>
            {s.severity && <StatusChip label={s.severity.toUpperCase()}
              tone={s.severity === 'critical' ? 'critical' : s.severity === 'high' ? 'warning' : 'info'} />}
          </View>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
            Est. Pop ~{s.estimated_population} · Priority: {(s.priority_score ?? 0).toFixed(1)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {(s.needs ?? []).slice(0, 4).map(n => <Chip key={n} label={n} />)}
          </View>
          {(s.status === 'unserved' || s.status === 'planned') && (
            <View style={{ marginTop: 10 }}>
              <Button title="Assign Coordinator to this Region" kind="outlined" icon="👤"
                      onPress={() => onAssignSite(s)} />
            </View>
          )}
        </Card>
      ))}
      {top.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No confirmed sites yet — submit a report.</Text>}

    </ScrollView>
  );
}

const hs = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 52, paddingBottom: 12, backgroundColor: C.background,
  },
  avatarSm: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  tile: {
    flex: 1, backgroundColor: C.surfaceLowest, borderRadius: 16, padding: 14, elevation: 1,
  },
});
