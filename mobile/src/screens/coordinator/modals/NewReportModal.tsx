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
import { PlaceSearch } from '../components/PlaceSearch';

export function NewReportModal({ centerId, edit, onBack }: {
  centerId: number;
  edit?: { report_id: number; site: Site };
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'text' | 'form'>(edit ? 'form' : 'text');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // free text
  const [rawText, setRawText] = useState('');
  // structured
  const [locName, setLocName] = useState(edit?.site.location_name ?? '');
  const [lat, setLat] = useState(edit ? String(edit.site.lat) : '');
  const [lng, setLng] = useState(edit ? String(edit.site.lng) : '');
  const [headcount, setHeadcount] = useState(edit ? String(edit.site.estimated_population) : '');
  const [severity, setSeverity] = useState<string>(
    edit?.site.severity
      ? ({ low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' } as const)[edit.site.severity as 'low' | 'medium' | 'high' | 'critical'] ?? 'Medium'
      : 'Medium');
  const [needs, setNeeds] = useState<string[]>(
    edit ? (edit.site.needs ?? []).map((n: string) => NEED_LABELS[n] ?? n) : []);
  const [flags, setFlags] = useState<string[]>(
    edit ? (edit.site.urgency_flags ?? []).map((f: string) => FLAG_LABELS[f] ?? f) : []);

  const [geocoding, setGeocoding] = useState(false); // true while name→coords lookup running
  const mapRef = useRef<LeafletMapHandle>(null);
  const nameGeoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fly to coordinates whenever both lat & lng become valid ──────────────
  useEffect(() => {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (!isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
      mapRef.current?.flyTo(la, lo, 14);
    }
  }, [lat, lng]);

  // ── Geocode location name when coords are absent ─────────────────────────
  // Debounced: fires 700ms after the user stops typing in the name field.
  // If a result is found it auto-fills lat/lng (which in turn triggers flyTo above).
  useEffect(() => {
    if (nameGeoTimer.current) clearTimeout(nameGeoTimer.current);
    const trimmed = locName.trim();
    // Only geocode if name has substance AND coords are not already set
    if (trimmed.length < 3 || (lat && lng)) return;

    nameGeoTimer.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(trimmed)}&format=json&limit=1&countrycodes=pk`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'en', 'User-Agent': 'MADAD-FloodResponse/1.0' },
        });
        const data = await res.json();
        if (data.length > 0) {
          const r = data[0];
          setLat(parseFloat(r.lat).toFixed(6));
          setLng(parseFloat(r.lon).toFixed(6));
          // flyTo triggered by the lat/lng effect above
        }
      } catch { /* silent — user can enter coords manually */ } finally {
        setGeocoding(false);
      }
    }, 700);

    return () => { if (nameGeoTimer.current) clearTimeout(nameGeoTimer.current); };
  }, [locName]); // intentionally exclude lat/lng to avoid re-running when we set them

  const useCurrent = async () => {
    setErr(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setErr('Location permission denied'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(String(pos.coords.latitude.toFixed(6)));
      setLng(String(pos.coords.longitude.toFixed(6)));
    } catch (e: any) { setErr(`GPS unavailable: ${e?.message ?? e}`); }
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (edit) {
        // Edit path: update the report's site in place — no new report created.
        await api(`/reports/${edit.report_id}`, { method: 'PATCH', body: {
          location_name: locName,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          estimated_population: parseInt(headcount || '0', 10),
          severity: SEV_API[severity],
          needs: needs.map(n => NEED_API[n]),
          urgency_flags: flags.map(f => FLAG_API[f] ?? f),
          status: 'confirmed',
        } });
      } else if (mode === 'text') {
        await api('/reports', { method: 'POST', body: { center_id: centerId, source: 'manual', raw_text: rawText } });
      } else {
        await api('/reports', { method: 'POST', body: { center_id: centerId, source: 'manual',
          structured_fields: {
            location_name: locName,
            headcount: parseInt(headcount || '0', 10),
            severity: SEV_API[severity],
            needs: needs.map(n => NEED_API[n]),
          } } });
      }
      onBack();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  // Derived: do we have a valid coordinate pair to show a pin?
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />

      {/* ── Location preview map — always outside ScrollView ── */}
      {mode === 'form' && (
        <View style={ns.previewMapWrap}>
          {/* Map is always mounted so mapRef stays valid for flyTo calls */}
          <LeafletMap
            ref={mapRef}
            height={180}
            center={hasCoords ? { lat: parsedLat, lng: parsedLng } : { lat: 29.85, lng: 70.45 }}
            zoom={hasCoords ? 13 : 8}
            markers={hasCoords ? [{
              id: 'loc',
              lat: parsedLat,
              lng: parsedLng,
              title: locName || 'Incident location',
              color: C.primary,
            }] : []}
          />

          {/* Status badge overlaid bottom-left */}
          <View style={ns.previewOverlay} pointerEvents="none">
            <View style={[ns.previewBadge, geocoding && { backgroundColor: 'rgba(0,80,150,0.7)' }]}>
              <Text style={ns.previewBadgeText}>
                {geocoding
                  ? '🔍 Looking up location…'
                  : hasCoords
                    ? `📍 ${locName || `${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}`}`
                    : '🗺 Enter a name or coordinates below'}
              </Text>
            </View>
          </View>
        </View>
      )}

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        <SectionTitle title={edit ? `Edit Report #${edit.report_id}` : "New Report"}
                        sub={edit ? "Update the extracted data — the site record is updated in place, no new report is created." : "Report a situation on the ground — as free text or a structured form."} />

        {/* segmented control */}
        <View style={ns.segment}>
          <Pressable
            style={[ns.segItem, mode === 'text' && ns.segOn]}
            onPress={() => setMode('text')}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'text' }}
          >
            <Text style={[ns.segLabel, mode === 'text' && ns.segLabelOn]}>✏ Free Text</Text>
          </Pressable>
          <Pressable
            style={[ns.segItem, mode === 'form' && ns.segOn]}
            onPress={() => setMode('form')}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'form' }}
          >
            <Text style={[ns.segLabel, mode === 'form' && ns.segLabelOn]}>⊟ Structured Form</Text>
          </Pressable>
        </View>

        <Err msg={err} />

        {mode === 'text' ? (
          <Card barColor={C.primary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>Situation Narrative</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              Describe the situation — our AI will extract the key metrics (location, headcount, needs, urgency).
            </Text>
            <View style={{ marginTop: 12 }}>
              <Field value={rawText} onChangeText={setRawText} multiline
                     placeholder="e.g. 250 people stranded near Jampur bypass, water rising, children present, need food and medical evacuation…" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22 }}>{'🎙'}</Text>
              <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginLeft: 8 }]}>Voice input (coming soon)</Text>
            </View>
          </Card>
        ) : (
          <>
            <Card barColor={C.primary}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>Incident Location</Text>
              <View style={{ height: 12 }} />
              <Field value={locName} onChangeText={setLocName} placeholder="Location Name (e.g., Jampur)" />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Field value={lat} onChangeText={setLat} placeholder="Latitude" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field value={lng} onChangeText={setLng} placeholder="Longitude" keyboardType="decimal-pad" />
                </View>
              </View>
              {hasCoords ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={[T.labelSm, { color: C.tertiary, flex: 1 }]}>
                    ✓ {geocoding ? 'Updating…' : 'Location set — map updated above'}
                  </Text>
                  <Pressable onPress={() => { setLat(''); setLng(''); }} hitSlop={8}>
                    <Text style={[T.labelSm, { color: C.outline }]}>Clear</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  {geocoding && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <ActivityIndicator size="small" color={C.primary} />
                      <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                        Looking up "{locName}"…
                      </Text>
                    </View>
                  )}
                  <Button title="Use Current Location" kind="outlined" onPress={useCurrent} icon="◎" />
                </View>
              )}
            </Card>

            <Card barColor={C.warning}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>Impact Assessment</Text>
              <View style={{ height: 12 }} />
              <Field value={headcount} onChangeText={setHeadcount} placeholder="Estimated headcount" keyboardType="numeric" />
              <Text style={[T.labelLg, { color: C.onSurface, marginBottom: 8 }]}>Severity</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {SEVERITIES.map(sv => (
                  <Chip key={sv} label={sv} selected={severity === sv}
                        color={sv === 'Critical' ? C.critical : sv === 'High' ? C.warning : sv === 'Medium' ? C.primary : C.tertiaryContainer}
                        onPress={() => setSeverity(sv)} />
                ))}
              </View>
            </Card>

            <Card barColor={C.tertiary}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>Relief Needs</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                {NEED_TYPES.map(n => (
                  <Chip key={n} label={n} selected={needs.includes(n)} color={C.primary}
                        onPress={() => setNeeds(ns => ns.includes(n) ? ns.filter(x => x !== n) : [...ns, n])} />
                ))}
              </View>
            </Card>

            <Card barColor={C.critical}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>Urgency Flags</Text>
              <View style={{ marginTop: 10 }}>
                {FLAG_TYPES.map(f => {
                  const on = flags.includes(f);
                  return (
                    <PressableRow key={f} on={on} onPress={() => setFlags(fs => fs.includes(f) ? fs.filter(x => x !== f) : [...fs, f])}
                                  label={f} />
                  );
                })}
              </View>
            </Card>
          </>
        )}

        <Button title={busy ? 'Saving…' : edit ? 'Save Changes' : 'Submit Report'} onPress={submit} icon="➤"
                disabled={busy || (mode === 'text' ? !rawText : !locName)} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function PressableRow({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ns.flagRow, pressed && { opacity: 0.8 }]}>
      <View style={[ns.checkbox, on && { backgroundColor: C.critical, borderColor: C.critical }]}>
        {on && <Text style={{ color: C.onPrimary, fontSize: 12 }}>✓</Text>}
      </View>
      <Text style={[T.bodyMd, { color: C.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

/* ================= PLAN RESOURCES (dispatch) ================= */

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
