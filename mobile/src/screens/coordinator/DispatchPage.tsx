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
import { AssignCoordinatorList } from './components/AssignCoordinatorList';

export function DispatchPage({ centerId, sites, depots, dispatches, refresh, onOpenRoute }: {
  centerId: number; sites: Site[]; depots: Depot[]; dispatches: DispatchRow[];
  refresh: () => void; onOpenRoute: (d: DispatchRow) => void;
}) {
  const [assignFor, setAssignFor] = useState<Site | null>(null);

  const ready = sites.filter(s => s.status === 'unserved' || s.status === 'planned');
  const nearestDepot = (site: Site) => {
    if (depots.length === 0) return null;
    return depots.reduce((best, d) =>
      ((d.lat - site.lat) ** 2 + (d.lng - site.lng) ** 2) <
      ((best.lat - site.lat) ** 2 + (best.lng - site.lng) ** 2) ? d : best);
  };

  const setStatus = async (id: number, status: 'en_route' | 'delivered') => {
    try { await api(`/dispatch/${id}/status`, { method: 'PATCH', body: { status } }); refresh(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  if (assignFor) {
    const depot = nearestDepot(assignFor);
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppBar title="MADAD" onBack={() => setAssignFor(null)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <SectionTitle title="Start Dispatch"
            sub="From the nearest depot to the affected region — pick any worker of this center to drive it." />
          <Card barColor={SEVERITY_BAR[assignFor.severity ?? 'low'] ?? C.primary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>{assignFor.location_name}</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              Est. Pop ~{assignFor.estimated_population}
              {(assignFor.needs ?? []).length > 0 ? ` · Needs: ${assignFor.needs.join(', ')}` : ''}
            </Text>
            {depot && (
              <Text style={[T.labelLg, { color: C.primary, marginTop: 8 }]}>
                🏬 Nearest depot: {depot.name}
              </Text>
            )}
          </Card>

          <AssignCoordinatorList centerId={centerId} site={assignFor}
                                 onAssigned={() => { refresh(); }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <SectionTitle title="Dispatches"
          sub="Assign workers to affected regions and track active convoys." />

        <Text style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}>Ready to Dispatch</Text>
        {ready.length === 0 && (
          <Card>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 10 }]}>
              No regions waiting — confirmed reports appear here when they need a convoy.
            </Text>
          </Card>
        )}
        {ready.map(s => {
          const depot = nearestDepot(s);
          return (
            <Card key={s.id} barColor={SEVERITY_BAR[s.severity ?? 'low'] ?? C.primary}
                  onPress={() => setAssignFor(s)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{s.location_name}</Text>
                {s.severity && <StatusChip label={s.severity.toUpperCase()}
                  tone={s.severity === 'critical' ? 'critical' : s.severity === 'high' ? 'warning' : 'info'} />}
              </View>
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
                Est. Pop ~{s.estimated_population} · from {depot ? depot.name : 'nearest depot'}
              </Text>
              <Text style={[T.labelSm, { color: C.primary, marginTop: 6 }]}>Tap to start dispatch & assign a worker ›</Text>
            </Card>
          );
        })}

        <View style={{ height: 10 }} />
        <Text style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}>Active & Past Dispatches</Text>
        {dispatches.length === 0 && (
          <Card>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 10 }]}>
              No dispatches yet — start one from a region above.
            </Text>
          </Card>
        )}
        {dispatches.map(d => {
          const site = sites.find(s => s.id === d.site_id);
          return (
            <Card key={d.dispatch_id} barColor={d.status === 'delivered' ? C.tertiary : C.primary}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>#{d.dispatch_id} → {site?.location_name ?? `Site ${d.site_id}`}</Text>
                <StatusChip label={d.status.replace('_', ' ').toUpperCase()}
                  tone={d.status === 'delivered' ? 'ok' : d.status === 'en_route' ? 'info' : 'warning'} />
              </View>
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
                {d.distance_km != null ? `${d.distance_km.toFixed(1)} km` : '—'} · ETA {d.eta_minutes ?? '—'} min
                {d.assigned_to ? ` · worker #${d.assigned_to}` : ' · unassigned'}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                {d.status === 'planned' && (
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Button title="Mark en route" kind="outlined" onPress={() => setStatus(d.dispatch_id, 'en_route')} />
                  </View>
                )}
                {d.status === 'en_route' && (<>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Button title="Delivered" kind="tertiary" onPress={() => setStatus(d.dispatch_id, 'delivered')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Open route" kind="primary" onPress={() => onOpenRoute(d)} />
                  </View>
                </>)}
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ================= NEW REPORT ================= */
