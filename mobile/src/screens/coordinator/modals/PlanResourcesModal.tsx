import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../../LeafletMap';
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from '../../../theme';
import { AppBar, Button, Card, Chip, Err, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../../utils/constants';

export function PlanResourcesModal({ centerId, currentUserId, alloc, site, depots, onBack, onDone }: {
  centerId: number; currentUserId: number; alloc: Allocation; site: Site | undefined; depots: Depot[];
  onBack: () => void; onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(alloc.resources.map(r => [r.resource_type, r.quantity])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [coordinators, setCoordinators] = useState<CoordinatorRow[]>([]);
  const [assignedName, setAssignedName] = useState<string | null>(null);

  const depot = depots.find(d => d.id === alloc.depot_id);
  const stock = useMemo(() => Object.fromEntries(
    (depot?.inventory ?? []).map(i => [i.resource_type, i.quantity])), [depot]);

  const dispatch = async () => {
    setBusy(true); setErr(null);
    try {
      const resources = Object.entries(qty).filter(([, q]) => q > 0)
        .map(([resource_type, quantity]) => ({ resource_type, quantity }));
      const res = await api<any>('/dispatch', { method: 'POST',
        body: { site_id: alloc.site_id, depot_id: alloc.depot_id, resources } });
      setCreatedId(res.dispatch_id);
      // Load available coordinators for assignment (one per destination)
      try {
        const list = await api<CoordinatorRow[]>(`/dispatch/available-coordinators?center_id=${centerId}`);
        setCoordinators(list.filter(u => u.is_active && u.user_id !== currentUserId));
      } catch (fe: any) {
        setErr('Could not load coordinators: ' + fe.message);
        setCoordinators([]);
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const assign = async (coordinatorId: number, name: string) => {
    if (!createdId) return;
    setErr(null);
    try {
      await api(`/dispatch/${createdId}/assign`, { method: 'POST', body: { coordinator_id: coordinatorId } });
      setAssignedName(name);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SectionTitle title="Plan Resources" sub="Adjust the resource quantities before dispatch." />
          <Err msg={err} />

          <Card barColor={SEVERITY_BAR[site?.severity ?? 'low'] ?? C.primary}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{site?.location_name ?? `Site #${alloc.site_id}`}</Text>
              {site?.severity && <StatusChip label={site.severity.toUpperCase()}
                tone={site.severity === 'critical' ? 'critical' : site.severity === 'high' ? 'warning' : 'info'} />}
            </View>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
              Est. population ~{site?.estimated_population ?? '—'} · {alloc.reasoning}
            </Text>
          </Card>

          <Card>
            <Text style={[T.titleLg, { color: C.onSurface }]}>Resource Allocation</Text>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2, marginBottom: 10 }]}>
              From depot: {depot?.name ?? `#${alloc.depot_id}`}
            </Text>
            {Object.entries(qty).map(([type, q]) => (
              <View key={type}>
                <Stepper label={`${type}  (stock: ${stock[type] ?? 0})`} value={q} onChange={v => setQty(s => ({ ...s, [type]: v }))} />
              </View>
            ))}
            {Object.keys(qty).length === 0 && (
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No planned resources for this site.</Text>
            )}

            {/* Add more resource types from depot stock */}
            {(() => {
              const extra = (depot?.inventory ?? []).filter(i => !(i.resource_type in qty) && i.quantity > 0);
              if (extra.length === 0) return null;
              return (
                <View style={{ marginTop: 8 }}>
                  <Text style={[T.labelLg, { color: C.onSurface }]}>Add from depot stock:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                    {extra.map(i => (
                      <Chip key={i.resource_type} label={`＋ ${i.resource_type} (${i.quantity} in stock)`}
                            color={C.tertiary}
                            onPress={() => setQty(s => ({ ...s, [i.resource_type]: 0 }))} />
                    ))}
                  </View>
                </View>
              );
            })()}
          </Card>

          {createdId ? (
            <Card barColor={C.tertiary}>
              {assignedName ? (
                <>
                  <Text style={[T.titleLg, { color: C.onSurface }]}>✓ Dispatch created & assigned</Text>
                  <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
                    {assignedName} is on route to {site?.location_name ?? `site #${alloc.site_id}`}.
                    The route is visible to every coordinator, and anyone can reroute
                    it if the driver hits trouble.
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <Button title="Go to dispatch screen" onPress={onDone} kind="tertiary" />
                  </View>
                </>
              ) : (
                <>
                  <Text style={[T.titleLg, { color: C.onSurface }]}>Dispatch #{createdId} created</Text>
                  <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
                    Assign a coordinator of this center to the destination — one coordinator
                    per destination; only those currently Available can be selected.
                  </Text>
                  {coordinators.length === 0 && (
                    <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 8 }]}>
                      No other coordinators are registered in this center yet.
                    </Text>
                  )}
                  {coordinators.map(u => (
                    <View key={u.user_id} style={{ flexDirection: 'row', alignItems: 'center',
                      backgroundColor: C.surfaceLow, borderRadius: 12, padding: 12, marginTop: 8 }}>
                      <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{u.username}</Text>
                      <View style={{ minWidth: 110 }}>
                        <Button title="Assign" kind="primary" icon="➤"
                                onPress={() => assign(u.user_id, u.username)} />
                      </View>
                    </View>
                  ))}
                  <View style={{ marginTop: 8 }}>
                    <Button title="Assign later — go to dispatch screen" kind="text" onPress={onDone} />
                  </View>
                </>
              )}
            </Card>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Button title="Cancel" kind="outlined" onPress={onBack} />
              </View>
              <View style={{ flex: 2 }}>
                <Button title="Confirm Dispatch" onPress={dispatch} icon="➤"
                        disabled={busy || Object.values(qty).every(q => q === 0)} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/* ================= ACTIVE ROUTE (driver mode) ================= */
