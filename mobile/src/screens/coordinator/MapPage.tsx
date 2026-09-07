import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../LeafletMap';
import { C, T, RADIUS, SEVERITY_BAR, SEVERITY_COLORS } from '../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../utils/constants';
import { convexHull, nearestDepot } from '../../utils/geo';
import { PlaceSearch } from './components/PlaceSearch';

export function MapPage({ centerId, sites, depots, damaged, centers, dispatches, currentUserId, refresh, onOpenRoute, onFlagDamage }: {
  centerId: number; sites: Site[]; depots: Depot[]; damaged: Damage[]; centers: CenterRow[];
  dispatches: DispatchRow[]; currentUserId: number; refresh: () => void; onOpenRoute: (d: DispatchRow) => void; onFlagDamage: () => void;
}) {
  const [layers, setLayers] = useState({ sites: true, depots: true, damage: true, routes: true, flood: true, centers: true });
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search result (yellow pin) — set when user picks a Nominatim result
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  // Red mark — set when user taps map OR confirms yellow pin; triggers confirm panel
  const [redMark, setRedMark] = useState<{ lat: number; lng: number } | null>(null);

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<LeafletMapHandle>(null);

  /**
   * Four-stage state machine (all derived from the above):
   *   idle        – flagging=false, no marks
   *   searching   – flagging=true,  redMark=null   (user searching / panning)
   *   confirming  – flagging=true,  redMark≠null,  saving=false
   *   saving      – flagging=true,  redMark≠null,  saving=true
   */
  const [flagging, setFlagging] = useState(false);
  const [saving, setSaving] = useState(false);

  const stage: 'idle' | 'searching' | 'confirming' | 'saving' =
    !flagging ? 'idle'
    : saving ? 'saving'
    : redMark ? 'confirming'
    : 'searching';

  // ── GPS on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(loc);
        mapRef.current?.flyTo(loc.lat, loc.lng, 13);
      } catch { /* GPS unavailable — silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const recenter = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyLocation(loc);
      mapRef.current?.flyTo(loc.lat, loc.lng, 14);
    } catch { /* silent */ } finally { setLocating(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showToast = (kind: 'ok' | 'err', msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, msg });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const resetFlagging = () => {
    setFlagging(false);
    setRedMark(null);
    setSearchPin(null);
    setReason('');
    setSaving(false);
  };

  // Called when user taps the map while in searching or confirming stage.
  // In searching: places the red mark and moves to confirming.
  // In confirming: moves the red mark to the new tap position.
  const handleMapTap = (lat: number, lng: number) => {
    if (stage === 'saving') return;
    if (stage === 'searching' || stage === 'confirming') {
      setRedMark({ lat, lng });
      // Clear search pin once user has placed their own mark
      setSearchPin(null);
    }
  };

  // Called when user confirms the yellow search-pin ("Yes, this road")
  const useSearchPin = () => {
    if (!searchPin) return;
    setRedMark({ lat: searchPin.lat, lng: searchPin.lng });
    setSearchPin(null);
  };

  // Final submit — only called when stage === 'confirming'
  const submitReport = async () => {
    if (!redMark) return;
    setSaving(true);
    try {
      await api('/roads/damage', {
        method: 'POST',
        body: { center_id: centerId, lat: redMark.lat, lng: redMark.lng, reason: reason || null },
      });
      resetFlagging();
      refresh();
      showToast('ok', '✓ Road blockage reported and saved to the server.');
    } catch (e: any) {
      setSaving(false);
      showToast('err', `Report failed: ${e.message}`);
    }
  };

  // ── Flood zone: hull over all reported (affected) sites + impact stats ──
  const affectedSites = useMemo(() =>
    sites.filter(s => (s.lat !== 0 || s.lng !== 0)), [sites]);
  const floodHull = useMemo(() => convexHull(
    affectedSites.map(s => ({ lat: s.lat, lng: s.lng }))), [affectedSites]);
  const floodPolygons: LeafPolygon[] = useMemo(() => {
    if (!layers.flood || floodHull.length < 3) return [];
    return [{ id: 'floodzone', coords: floodHull, color: C.primary, fillOpacity: 0.12, dashed: true }];
  }, [layers.flood, floodHull]);
  const affectedPeople = affectedSites.reduce((sum, s) => sum + (s.estimated_population || 0), 0);
  const criticalCount = affectedSites.filter(s => s.severity === 'critical' || s.severity === 'high').length;

  // ── Markers ───────────────────────────────────────────────────────────────
  const markers: LeafMarker[] = useMemo(() => [
    ...(layers.sites ? sites.map(site => ({
      id: `s${site.id}`, lat: site.lat, lng: site.lng,
      title: site.location_name,
      snippet: `~${site.estimated_population} people · ${site.status}`,
      color: '#E65100',  // deep orange — colorblind-safe, distinct from blue
      label: 'R',
    })) : []),
    // Flood-report flags — the exact points inside the shaded Flood Zone
    ...(layers.flood ? affectedSites.map(site => ({
      id: `f${site.id}`, lat: site.lat, lng: site.lng,
      title: `🌊 Flood reported — ${site.location_name}`,
      snippet: `~${site.estimated_population} people`
        + (site.severity ? ` · severity: ${site.severity}` : '')
        + (site.estimated_population ? '' : ''),
      color: C.primary,
      label: '🌊',
    })) : []),
    ...(layers.depots ? depots.map(d => ({
      id: `d${d.id}`, lat: d.lat, lng: d.lng, title: d.name, snippet: 'Depot',
      color: '#1565C0',  // strong blue — safe contrast against orange
      label: 'D',
    })) : []),
    // Support/relief centers — administrative hubs, visible nationwide
    ...(layers.centers ? centers.map(cn => ({
      id: `c${cn.id}`, lat: cn.lat, lng: cn.lng,
      title: cn.name, snippet: `Support Center · ${cn.code} · ${cn.region ?? ''}`,
      color: C.secondary, label: 'C',
    })) : []),
    // Road damage = POINT flags at the reported location, not path segments
    ...(layers.damage ? damaged.map(dg => ({
      id: `dg${dg.id}`, lat: dg.lat, lng: dg.lng,
      title: '⚠️ Road Blocked',
      snippet: dg.reason || 'Severe flooding / damage reported here',
      color: C.critical,
      label: '!',
    })) : []),
    ...(myLocation ? [{
      id: 'me', lat: myLocation.lat, lng: myLocation.lng,
      title: 'My location', color: C.tertiary, icon: 'dot' as const,
    }] : []),
    // Yellow search pin — shows where Nominatim found the place
    ...(searchPin ? [{
      id: 'search', lat: searchPin.lat, lng: searchPin.lng,
      title: searchPin.label,
      snippet: 'Tap "Yes, this road" to mark it, or tap the map for a precise point',
      color: C.warning,
    }] : []),
    // Red mark — the confirmed blockage location, waiting for submit
    ...(redMark ? [{
      id: 'redmark', lat: redMark.lat, lng: redMark.lng,
      title: '🔴 Blockage marked here',
      snippet: saving ? 'Reporting…' : 'Tap "Confirm & Report" to submit, or "Clear mark" to redo',
      color: C.critical,
    }] : []),
  ], [sites, depots, layers, myLocation, searchPin, redMark, saving, damaged, affectedSites]);

  const polylines: LeafPolyline[] = useMemo(() => [
    ...(layers.routes ? dispatches.filter(d => d.dispatched_by === currentUserId && d.route_geojson?.coordinates?.length > 1).map(d => ({
      id: `r${d.dispatch_id}`,
      coords: d.route_geojson.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
      color: C.primaryFixedDim, width: 4, dashed: true,
      tooltip: `🚚 ${d.driver_username ?? 'Unassigned'} → ${sites.find(s => s.id === d.site_id)?.location_name ?? 'destination'}`,
    })) : []),
  ], [damaged, dispatches, layers]);


  const activeDispatches = dispatches.filter(d => d.status === 'en_route');

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Map fills all available space above the controls panel */}
      <View style={{ flex: 1, position: 'relative', minHeight: 200 }}>
        <LeafletMap
          ref={mapRef}
          markers={markers}
          polylines={polylines}
          polygons={floodPolygons}
          center={myLocation ?? { lat: 29.85, lng: 70.45 }}
          zoom={myLocation ? 12 : 8}
          fit={markers.length > 0 || polylines.length > 0 || floodPolygons.length > 0}
          onMapPress={handleMapTap}
        />
        {/* Flood impact summary — extent & direction of the flood so far */}
        {layers.flood && affectedSites.length > 0 && (
          <Card barColor={C.primary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>🌊 Flood Impact Zone</Text>
              <StatusChip label={`${affectedSites.length} sites affected`} tone="info" />
            </View>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
              ~{affectedPeople.toLocaleString()} people inside the affected region
              {criticalCount > 0 ? ` · ${criticalCount} high/critical site${criticalCount > 1 ? 's' : ''}` : ''}
            </Text>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              The shaded area spans every reported site — its spread shows the flood's
              direction; unreported settlements on the fringe are the ones to watch next.
            </Text>
          </Card>
        )}
        {/* Locate-me overlay */}
        <Pressable
          onPress={recenter}
          disabled={locating || stage === 'saving'}
          style={({ pressed }) => [mt.locateBtn, pressed && { opacity: 0.8 }, locating && { opacity: 0.5 }]}
          accessibilityLabel="Center map on my location"
        >
          <Text style={mt.locateIcon}>{locating ? '…' : '◎'}</Text>
        </Pressable>
      </View>

      {/* Controls panel — fixed height so map always gets the majority of space */}
      <KeyboardAwareScrollView
        style={{ maxHeight: 340 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
        nestedScrollEnabled
      >

        {/* Layer toggles — always visible */}
        <Card>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Map Layers</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            <Chip label="Relief Sites" selected={layers.sites} color='#E65100' onPress={() => setLayers(l => ({ ...l, sites: !l.sites }))} />
            <Chip label="Depots" selected={layers.depots} color='#1565C0' onPress={() => setLayers(l => ({ ...l, depots: !l.depots }))} />
            <Chip label="Road Damage" selected={layers.damage} color={C.critical} onPress={() => setLayers(l => ({ ...l, damage: !l.damage }))} />
            <Chip label="Flood Zone" selected={layers.flood} color={C.primary} onPress={() => setLayers(l => ({ ...l, flood: !l.flood }))} />
            <Chip label="Centers" selected={layers.centers} color={C.secondary} onPress={() => setLayers(l => ({ ...l, centers: !l.centers }))} />
            <Chip label="Routes" selected={layers.routes} color={C.primaryFixedDim} onPress={() => setLayers(l => ({ ...l, routes: !l.routes }))} />
          </View>
        </Card>

        {/* Toast feedback */}
        {toast && (
          <View style={[mt.toast, toast.kind === 'ok' ? mt.toastOk : mt.toastErr]}>
            <Text style={mt.toastText}>{toast.msg}</Text>
          </View>
        )}

        {/* ── STAGE: searching ── */}
        {stage === 'searching' && (
          <Card barColor={C.warning}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>Report Road Blockage</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              Search for the blocked road by name, or tap any point on the map to drop a red mark.
            </Text>

            <PlaceSearch
              onSelect={(lat, lng, label) => {
                setSearchPin({ lat, lng, label });
                mapRef.current?.flyTo(lat, lng, 15);
              }}
            />

            {/* Yellow pin confirmation row */}
            {searchPin && (
              <View style={mt.yellowConfirm}>
                <Text style={mt.yellowConfirmTitle}>📍 {searchPin.label.split(',')[0]}</Text>
                <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2, marginBottom: 10 }]}>
                  Is this the road you meant? Tap below to mark it, or tap a different point on the map.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Yes, mark this road" kind="primary" onPress={useSearchPin} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Clear" kind="outlined" onPress={() => setSearchPin(null)} />
                  </View>
                </View>
              </View>
            )}

            <View style={{ marginTop: 4 }}>
              <Button title="Cancel" kind="text" onPress={resetFlagging} />
            </View>
          </Card>
        )}

        {/* ── STAGE: confirming ── */}
        {stage === 'confirming' && (
          <Card barColor={C.critical}>
            <View style={mt.confirmHeader}>
              <View style={mt.redDot} />
              <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>Red mark placed</Text>
            </View>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              The red pin shows where the blockage will be reported. If it's wrong, tap "Clear mark" and re-tap the correct spot, or search again.
            </Text>

            <View style={mt.coordRow}>
              <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                📍 {redMark!.lat.toFixed(5)}, {redMark!.lng.toFixed(5)}
              </Text>
            </View>

            <Field
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Bridge flooded, Road washed out"
              returnKeyType="done"
              autoCapitalize="sentences"
            />

            <Button title="Confirm & Report" kind="critical" icon="➤" onPress={submitReport} />
            <Button
              title="Clear mark — redo"
              kind="outlined"
              onPress={() => { setRedMark(null); setSearchPin(null); }}
            />
            <Button title="Cancel entirely" kind="text" onPress={resetFlagging} />
          </Card>
        )}

        {/* ── STAGE: saving ── */}
        {stage === 'saving' && (
          <Card barColor={C.critical}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator color={C.critical} />
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant, flex: 1 }]}>
                Sending report to server…
              </Text>
            </View>
          </Card>
        )}

        {/* Report Road Blockage entry button — only visible when idle */}
        {stage === 'idle' && (
          <Button
            title="Report Road Blockage"
            kind="critical"
            icon="⚠"
            onPress={() => setFlagging(true)}
          />
        )}

        {/* Active dispatch routes */}
        {activeDispatches.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            <Text style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}>Active Routes</Text>
            {activeDispatches.map(d => (
              <Card key={d.dispatch_id} barColor={C.primary} onPress={() => onOpenRoute(d)}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>Dispatch #{d.dispatch_id}</Text>
                <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
                  {d.distance_km?.toFixed(1) ?? '—'} km · ETA {d.eta_minutes ?? '—'} min
                </Text>
                <Text style={[T.labelSm, { color: C.primary, marginTop: 6 }]}>Open driver view ›</Text>
              </Card>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}



/* ================= COORDINATOR PICKER (shared) ================= */

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
