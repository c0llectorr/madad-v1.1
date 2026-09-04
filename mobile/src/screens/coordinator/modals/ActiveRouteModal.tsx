import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../../LeafletMap';
import { C, T, RADIUS, SEVERITY_BAR, SEVERITY_COLORS } from '../../../theme';
import { AppBar, Button, Card, Chip, Err, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../../utils/constants';

export function ActiveRouteModal({ centerId, dispatchRow, sites, onBack }: {
  centerId: number; dispatchRow: DispatchRow; sites: Site[]; onBack: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState<any>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') { setErr('Location permission denied — enable it in app settings'); return; }
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          p => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }));
        if (cancelled) { watcher.remove(); return; }
        sub = watcher;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!cancelled) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (e: any) {
        if (!cancelled) setErr(`GPS unavailable: ${e?.message ?? e}`);
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  const flagHere = async () => {
    if (!coords) return;
    setErr(null);
    try {
      await api('/roads/damage', { method: 'POST',
        body: { center_id: centerId, lat: coords.lat, lng: coords.lng, reason: reason || 'Dead end — driver report' } });
      setFlagged(true);
    } catch (e: any) { setErr(e.message); }
  };

  const reroute = async (silent = false) => {
    if (!coords) return;
    if (!silent) setErr(null);
    try { setRoute(await api(`/dispatch/${dispatchRow.dispatch_id}/reroute`, {
      method: 'POST', body: { current_lat: coords.lat, current_lng: coords.lng, reason: reason || null } })); }
    catch (e: any) { if (!silent) setErr(e.message); }
  };

  // LIVE ROUTING: while en route, silently recompute the road-following path
  // from the device's position whenever it moves >=150 m (max once per 45 s).
  // This is what keeps the polyline on real streets as the driver advances.
  const lastAuto = useRef<{ lat: number; lng: number; at: number } | null>(null);
  useEffect(() => {
    if (!coords) return;
    const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const last = lastAuto.current;
    const movedFar = !last || dist(last, coords) * 1000 >= 150;
    const cooled = !last || Date.now() - last.at >= 45000;
    if (movedFar && cooled && !flagged) {
      lastAuto.current = { ...coords, at: Date.now() };
      reroute(true);
    }
  }, [coords]);

  const markDelivered = async () => {
    setErr(null);
    try {
      await api(`/dispatch/${dispatchRow.dispatch_id}/status`, { method: 'PATCH', body: { status: 'delivered' } });
      onBack();
    } catch (e: any) { setErr(e.message); }
  };

  const site = sites.find(s => s.id === dispatchRow.site_id);
  const eta = route?.eta_minutes ?? dispatchRow.eta_minutes;
  const dist = route?.distance_km ?? dispatchRow.distance_km;
  const routeLine = route?.geojson ?? dispatchRow.route_geojson;

  // Live leg: from the device's current GPS fix to the destination. Rebuilds
  // on every coords update from the watcher, so the line follows the device.
  const dest = routeLine?.coordinates?.length > 0
    ? { lat: routeLine.coordinates[routeLine.coordinates.length - 1][1],
        lng: routeLine.coordinates[routeLine.coordinates.length - 1][0] }
    : site ? { lat: site.lat, lng: site.lng } : null;

  const livePolylines: LeafPolyline[] = useMemo(() => {
    const lines: LeafPolyline[] = [];
    if (routeLine?.coordinates?.length > 1) {
      lines.push({ id: 'route',
        coords: routeLine.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
        color: C.tertiary, width: 5 });
    }
    if (coords && dest) {
      lines.push({ id: 'live',
        coords: [{ lat: coords.lat, lng: coords.lng }, { lat: dest.lat, lng: dest.lng }],
        color: C.critical, width: 3, dashed: true });
    }
    return lines;
  }, [routeLine, coords, dest]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="Active Route" onBack={onBack} />
      <View style={{ flex: 1 }}>
        {/* Map lives outside the ScrollView so touch events aren't stolen */}
        <LeafletMap
          height={240}
          fit
          markers={[
            ...(coords ? [{ id: 'me', lat: coords.lat, lng: coords.lng, title: 'Me (live)', color: C.secondary, icon: 'dot' as const }] : []),
            ...(dest ? [{ id: 'dst', lat: dest.lat, lng: dest.lng,
                          title: site?.location_name ?? 'Destination', color: C.primary }] : []),
          ]}
          polylines={livePolylines}
        />
        <Text style={[T.labelSm, { color: C.onSurfaceVariant, textAlign: 'center', marginTop: 4 }]}>
          Live position → destination updates as the device moves
        </Text>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={24}
          nestedScrollEnabled
        >
          <Err msg={err} />

          {flagged && !route && (
            <Card barColor={C.critical}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[ns.sevDot, { backgroundColor: C.critical }]} />
                <Text style={[T.titleLg, { color: C.onSurface, flex: 1, marginLeft: 10 }]}>Road Blocked</Text>
              </View>
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
                {reason || 'Dead end — driver report'} — damage recorded at your GPS position.
              </Text>
              <View style={ns.etaPanel}>
                <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textDecorationLine: 'line-through' }]}>
                  Original ETA: {dispatchRow.eta_minutes} mins
                </Text>
                <Text style={[T.titleLg, { color: C.onSurface, marginTop: 4 }]}>
                  Recalculating…
                </Text>
              </View>
              <Button title="Update Route" onPress={reroute} icon="➤" disabled={!coords} />
            </Card>
          )}

          {/* Current target */}
          <Card barColor={C.primary}>
            <Text style={[T.labelLg, { color: C.primary }]}>CURRENT TARGET</Text>
            <Text style={[T.titleLg, { color: C.onSurface, marginTop: 2 }]}>{site?.location_name ?? `Site #${dispatchRow.site_id}`}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={ns.etaTile}>
                <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>Distance</Text>
                <Text style={[T.titleLg, { color: C.onSurface }]}>{dist != null ? dist.toFixed(1) : '—'} km</Text>
              </View>
              <View style={ns.etaTile}>
                <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>ETA</Text>
                <Text style={[T.titleLg, { color: C.onSurface }]}>{eta ?? '—'} mins</Text>
              </View>
            </View>
            {route && (
              <Text style={[T.labelSm, { color: C.tertiary, marginTop: 8 }]}>
                Recalculated · Δ{route.delta_minutes_vs_direct} min vs direct
              </Text>
            )}
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 8 }]}>
              Cargo: {dispatchRow.resources_loaded.map((r: any) => `${r.resource_type}×${r.quantity}`).join(', ')}
            </Text>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              GPS: {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'acquiring…'}
            </Text>
          </Card>

          <Field label="Damage reason (optional)" value={reason} onChangeText={setReason} placeholder="Road flooded" />
          <Button title="Report Road Damage" kind="outlined" onPress={flagHere} icon="⚠" disabled={!coords} />
          <Button title="Mark as Delivered" onPress={markDelivered} icon="✓" />
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}



const ns = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: C.surfaceContainer,
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: 20,
    // subtle border so the track is visible on white backgrounds
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.outlineVariant,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.md - 3, // inset by the padding so it sits flush
  },
  segOn: {
    backgroundColor: C.surfaceLowest,
    // elevation/shadow gives the active pill a lifted look
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segLabel: {
    ...T.labelLg,
    color: C.onSurfaceVariant,
  },
  segLabelOn: {
    color: C.primary,
    fontWeight: '700' as const,
  },
  miniMap: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  previewMapWrap: {
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  previewOverlay: {
    position: 'absolute',
    top: 8, left: 8,
  },
  previewBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  flagRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.surfaceVariant,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.outlineVariant,
    marginRight: 12, alignItems: 'center', justifyContent: 'center',
  },
  sevDot: { width: 12, height: 12, borderRadius: 6 },
  etaPanel: {
    backgroundColor: C.surfaceLow, borderRadius: 12, padding: 14, marginVertical: 12,
  },
  etaTile: {
    flex: 1, backgroundColor: C.surfaceLow, borderRadius: 12, padding: 12,
    alignItems: 'center',
  },
});

const mt = StyleSheet.create({
  locateBtn: {
    position: 'absolute', bottom: 12, right: 12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.surfaceLowest,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  locateIcon: { fontSize: 22, color: C.primary },

  yellowConfirm: {
    backgroundColor: C.warningContainer,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  yellowConfirmTitle: {
    ...T.labelLg,
    color: C.onSurface,
    fontWeight: '700' as const,
  },

  confirmHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 4,
  },
  redDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.critical,
    flexShrink: 0,
  },
  coordRow: {
    backgroundColor: C.surfaceLow,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    marginTop: 8,
  },

  // Toast feedback banner
  toast: {
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  toastOk: {
    backgroundColor: C.tertiaryFixed,       // green tint
    borderLeftWidth: 4,
    borderLeftColor: C.tertiary,
  },
  toastErr: {
    backgroundColor: C.errorContainer,      // red tint
    borderLeftWidth: 4,
    borderLeftColor: C.error,
  },
  toastText: {
    ...T.labelLg,
    color: C.onSurface,
    flexShrink: 1,
  },
});


/* ================= ASSIGN COORDINATOR TO REGION ================= */
