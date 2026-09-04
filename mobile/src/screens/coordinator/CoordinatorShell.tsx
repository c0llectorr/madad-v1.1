import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api, LoginResponse } from '../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../LeafletMap';
import {
  AppBar, BottomNav, Button, Card, Chip, Err, Fab, Field, Loading, PillButton,
  SectionTitle, StatusChip, Stepper, NavTab,
} from '../../ui';
import { C, T, RADIUS, SEVERITY_BAR, SEVERITY_COLORS } from '../../theme';

const NAV: NavTab[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'reports', label: 'Reports', icon: '▤' },
  { key: 'dispatches', label: 'Dispatches', icon: '🚚' },
  { key: 'map', label: 'Map', icon: '🗺' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];

interface Site { id: number; report_id?: number | null; location_name: string; lat: number; lng: number; estimated_population: number; needs: string[]; urgency_flags: string[]; severity: string | null; confidence: string; priority_score: number | null; status: string }
interface Depot { id: number; name: string; lat: number; lng: number; inventory: { resource_type: string; quantity: number }[] }
interface CenterRow { id: number; code: string; name: string; region: string | null; lat: number; lng: number }
interface Damage { id: number; lat: number; lng: number; reason: string | null; edge_geometry: any; reported_at: string }
interface ReportRow {
  report_id: number;
  raw_text: string | null;
  status: string;
  created_at: string;
  structured_fields: {
    location_name: string;
    headcount: number;
    severity: string | null;
    needs: string[];
  } | null;
}
interface DispatchRow { dispatch_id: number; site_id: number; depot_id: number; status: string; distance_km: number | null; eta_minutes: number | null; route_geojson: any; resources_loaded: any[]; assigned_to?: number | null }
interface CoordinatorRow { user_id: number; username: string; center_id: number | null; is_active: boolean }
interface Allocation { site_id: number; depot_id: number | null; rank: number; priority_score: number; resources: { resource_type: string; quantity: number }[]; reasoning: string }

const NEED_TYPES = ['Food', 'Water', 'Medical Evac', 'Shelter', 'Medicine', 'Gen. Evac'];
const NEED_API: Record<string, string> = {
  Food: 'food', Water: 'water', 'Medical Evac': 'medical_evacuation',
  Shelter: 'shelter', Medicine: 'medicine', 'Gen. Evac': 'general_evacuation',
};
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const SEV_API: Record<string, string> = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' };
const FLAG_TYPES = ['Elderly Present', 'Children Present', 'Pregnancy', 'Injury Reported', 'Water Rising Fast', 'Stranded / No Exit'];
const FLAG_API: Record<string, string> = {
  'Elderly Present': 'elderly_present', 'Children Present': 'children_present',
  Pregnancy: 'pregnancy', 'Injury Reported': 'injury_reported',
  'Water Rising Fast': 'water_rising', 'Stranded / No Exit': 'stranded_no_exit',
};
const NEED_LABELS: Record<string, string> = Object.fromEntries(Object.entries(NEED_API).map(([label, api]) => [api, label]));
const FLAG_LABELS: Record<string, string> = Object.fromEntries(Object.entries(FLAG_API).map(([label, api]) => [api, label]));

type Sub = null | { name: 'newReport'; edit?: { report_id: number; site: Site } } | { name: 'plan'; alloc: Allocation; site: Site | undefined } | { name: 'assignSite'; site: Site }
  | { name: 'route'; dispatch: DispatchRow };

export default function CoordinatorShell({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  const centerId = session.center_id;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState<Sub>(null);
  const [key, setKey] = useState(0);
  const refresh = () => setKey(k => k + 1);

  const [sites, setSites] = useState<Site[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [damaged, setDamaged] = useState<Damage[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [planAllocations, setPlanAllocations] = useState<Allocation[] | null>(null);
  const [planningReportId, setPlanningReportId] = useState<number | null>(null);

  // Single source of truth for "Generate Plan": generates, stores, and opens.
  const generatePlanFor = async (site: Site, reportId: number) => {
    setPlanningReportId(reportId);
    try {
      const res = await api<{ allocations: Allocation[] }>('/plan/generate',
        { method: 'POST', body: { center_id: centerId } });
      setPlanAllocations(res.allocations);
      const alloc = res.allocations.find(a => a.site_id === site.id);
      if (alloc) {
        setSub({ name: 'plan', alloc, site });
      } else {
        Alert.alert('Nothing to allocate',
          `No resources could be allocated for ${site.location_name} — check depot stock and the site's needs.`);
      }
    } catch (e: any) {
      Alert.alert('Plan failed', e.message);
    } finally {
      setPlanningReportId(null);
    }
  };

  // Routes are public: any coordinator can view, follow, or reroute any
  // dispatch (field fallback when the assigned driver loses connectivity).
  const checkOpenRoute = (d: DispatchRow) => {
    setSub({ name: 'route', dispatch: d });
  };

  const load = useCallback(() => {
    if (centerId == null) return;
    api<Site[]>(`/sites?center_id=${centerId}`).then(setSites).catch(() => {});
    api<Depot[]>(`/depots?center_id=${centerId}`).then(setDepots).catch(() => {});
    api<Damage[]>(`/roads/damaged?center_id=${centerId}`).then(setDamaged).catch(() => {});
    api<ReportRow[]>(`/reports?center_id=${centerId}`).then(setReports).catch(() => {});
    api<DispatchRow[]>(`/dispatch?center_id=${centerId}`).then(setDispatches).catch(() => {});
    api<CenterRow[]>('/centers').then(setCenters).catch(() => {});
  }, [centerId]);
  useEffect(load, [load, key]);

  if (centerId == null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppBar title="MADAD" right={
          <Text style={[T.labelLg, { color: C.primary }]} onPress={onLogout}>Logout</Text>
        } />
        <View style={{ padding: 16 }}>
          <Text style={[T.bodyLg, { color: C.onSurfaceVariant }]}>No center assigned to this account.</Text>
        </View>
      </View>
    );
  }

  if (sub?.name === 'newReport') {
    return <NewReportScreen centerId={centerId} edit={sub.edit}
                            onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'assignSite') {
    return <AssignSiteScreen centerId={centerId} currentUserId={session.user_id} site={sub.site}
                             onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'plan') {
    return <PlanResourcesScreen centerId={centerId} currentUserId={session.user_id} alloc={sub.alloc} site={sub.site}
                                depots={depots} onBack={() => { setSub(null); refresh(); }}
                                onDone={() => { setSub(null); setTab('map'); refresh(); }} />;
  }
  if (sub?.name === 'route') {
    return <ActiveRouteScreen centerId={centerId} dispatchRow={sub.dispatch} sites={sites}
                              onBack={() => { setSub(null); refresh(); }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={hs.header}>
        <View style={hs.avatarSm}><Text style={{ fontSize: 16 }}>{'👤'}</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>Support Center</Text>
          <Text style={[T.titleLg, { color: C.onSurface }]}>{session.center_name ?? `Center #${centerId}`}</Text>
        </View>
        <Text style={{ fontSize: 20, padding: 6 }}>{'🔔'}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeTab centerId={centerId} sites={sites} reports={reports} dispatches={dispatches} depots={depots}
                   onNewReport={() => setSub({ name: 'newReport' })} onPendingReports={() => setTab('reports')} onDispatch={(alloc) => setSub({ name: 'plan', alloc, site: sites.find(s => s.id === alloc.site_id) })} onAssignSite={(site) => setSub({ name: 'assignSite', site })} />
        )}
        {tab === 'reports' && (
          <ReportsTab centerId={centerId} reports={reports} sites={sites}
            onNewReport={() => setSub({ name: 'newReport' })}
            onEditReport={(report_id, site) => setSub({ name: 'newReport', edit: { report_id, site } })}
            onPlanSite={generatePlanFor}
            planningReportId={planningReportId}
            refresh={refresh} />
        )}
        {tab === 'dispatches' && (
          <DispatchesTab centerId={centerId} sites={sites} depots={depots} dispatches={dispatches}
                         refresh={refresh} onOpenRoute={d => checkOpenRoute(d)} />
        )}
        {tab === 'map' && (
          <MapTab centerId={centerId} sites={sites} depots={depots} damaged={damaged}
                  centers={centers.filter(cn => cn.id === centerId)}
                  dispatches={dispatches} refresh={refresh}
                  onOpenRoute={d => checkOpenRoute(d)} />
        )}
        {tab === 'profile' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <SectionTitle title="Profile" />
            <Card barColor={C.secondary}>
              <Text style={[T.titleLg, { color: C.onSurface }]}>{session.user_id}</Text>
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>Coordinator · {session.center_name ?? `Center #${centerId}`}</Text>
            </Card>
            <Button title="Logout" onPress={onLogout} kind="critical" />
          </ScrollView>
        )}
      </View>

      <BottomNav tabs={NAV} active={tab} onChange={setTab} />
      {(tab === 'home' || tab === 'reports') &&
        <Fab
          onPress={() => setSub({ name: 'newReport' })}
          bottomOffset={Math.max(10, insets.bottom) + 70 + 16}
        />}
    </View>
  );
}

/* ================= HOME ================= */
function HomeTab({ centerId, sites, reports, dispatches, depots, onNewReport, onPendingReports, onDispatch, onAssignSite }: {
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

/* ================= REPORTS ================= */
function ReportsTab({ centerId, reports, sites, onNewReport, onEditReport, onPlanSite, planningReportId, refresh }: {
  centerId: number; reports: ReportRow[]; sites: Site[];
  onNewReport: () => void;
  onEditReport: (report_id: number, site: Site) => void;
  onPlanSite: (site: Site, reportId: number) => void;
  planningReportId: number | null;
  refresh: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [review, setReview] = useState<{ report_id: number; extracted: any; geocode_status: string } | null>(null);
  const [revLoc, setRevLoc] = useState(''); const [revLat, setRevLat] = useState('');
  const [revLng, setRevLng] = useState(''); const [revPop, setRevPop] = useState('');

  const extract = async (id: number) => {
    setErr(null);
    setExtractingId(id);
    try {
      const res = await api<any>(`/reports/${id}/extract`, { method: 'POST' });
      setReview(res);
      setRevLoc(res.extracted.location_name ?? '');
      setRevPop(String(res.extracted.estimated_population ?? ''));
      setRevLat(res.extracted.lat != null ? String(res.extracted.lat) : '');
      setRevLng(res.extracted.lng != null ? String(res.extracted.lng) : '');
    } catch (e: any) { setErr(e.message); } finally { setExtractingId(null); }
  };

  const reviewSubmit = async (status: 'confirmed' | 'rejected') => {
    if (!review) return;
    setErr(null);
    try {
      const body: any = {
        location_name: revLoc || undefined,
        estimated_population: revPop ? parseInt(revPop, 10) : undefined,
        status,
      };
      if (revLat) body.lat = parseFloat(revLat);
      if (revLng) body.lng = parseFloat(revLng);
      await api(`/reports/${review.report_id}`, { method: 'PATCH', body });
      setReview(null); refresh();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={24}
    >
      <SectionTitle title="Field Reports" sub={`${reports.length} total · ${reports.filter(r => r.status === 'pending_extraction').length} awaiting extraction`} />
      <Err msg={err} />

      {review && (
        <Card barColor={C.primary}>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Review Extraction</Text>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>
            Geocode: {review.geocode_status === 'matched' ? '✅ matched' : '⚠️ unmatched — enter coordinates'}
          </Text>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
            Needs: {review.extracted.needs?.join(', ')}
          </Text>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
            Flags: {review.extracted.urgency_flags?.join(', ') || '—'}
          </Text>
          <View style={{ marginTop: 8 }} />
          <Field label="Location name" value={revLoc} onChangeText={setRevLoc} />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Field label="Latitude" value={revLat} onChangeText={setRevLat} keyboardType="decimal-pad" placeholder="required" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Longitude" value={revLng} onChangeText={setRevLng} keyboardType="decimal-pad" placeholder="required" />
            </View>
          </View>
          <Field label="Population" value={revPop} onChangeText={setRevPop} keyboardType="numeric" />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Button title="Confirm" kind="tertiary" onPress={() => reviewSubmit('confirmed')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Reject" kind="critical" onPress={() => reviewSubmit('rejected')} />
            </View>
          </View>
        </Card>
      )}

      {reports.map(r => (
        <Card key={r.report_id} barColor={r.status === 'pending_extraction' ? C.warning : r.status === 'confirmed' ? C.tertiary : C.primary}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>#{r.report_id}</Text>
            <StatusChip label={r.status.replace('_', ' ').toUpperCase()}
              tone={r.status === 'pending_extraction' ? 'warning' : r.status === 'confirmed' ? 'ok' : 'info'} />
          </View>
          {r.raw_text && <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]} numberOfLines={2}>{r.raw_text}</Text>}
          {!r.raw_text && r.structured_fields && (
            <View style={{ marginTop: 6 }}>
              <Text style={[T.bodyMd, { color: C.onSurface }]}>{r.structured_fields.location_name}</Text>
              {r.structured_fields.severity && (
                <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>
                  Severity: {r.structured_fields.severity.toUpperCase()}
                  {r.structured_fields.headcount ? `  ·  ~${r.structured_fields.headcount} people` : ''}
                </Text>
              )}
              {r.structured_fields.needs.length > 0 && (
                <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>
                  Needs: {r.structured_fields.needs.join(', ')}
                </Text>
              )}
            </View>
          )}
          {r.status === 'pending_extraction' && r.raw_text && (
            <View style={{ marginTop: 8 }}>
              <Button
                title={extractingId === r.report_id ? 'Extracting… AI is reading the report' : 'Run AI Extraction'}
                kind="outlined"
                icon={extractingId === r.report_id ? '⏳' : '✦'}
                disabled={extractingId !== null}
                onPress={() => extract(r.report_id)} />
              {extractingId === r.report_id && (
                <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 4, textAlign: 'center' }]}>
                  This usually takes a few seconds — please wait.
                </Text>
              )}
            </View>
          )}
          {(r.status === 'extracted' || r.status === 'confirmed') && (() => {
            const site = sites.find(s => s.report_id === r.report_id);
            return (
              <View style={{ marginTop: 8 }}>
                <Button title="Edit Extracted Data" kind="outlined" icon="✎"
                        onPress={() => {
                          if (!site) { setErr('No site record found for this report yet — confirm it first.'); return; }
                          onEditReport(r.report_id, site);
                        }} />
                {site && (
                  <Button
                    title={planningReportId === r.report_id ? 'Generating plan…' : 'Generate Plan for this Report'}
                    kind="tertiary"
                    icon={planningReportId === r.report_id ? '⏳' : '⚙'}
                    disabled={planningReportId !== null}
                    onPress={() => onPlanSite(site, r.report_id)} />
                )}
              </View>
            );
          })()}
        </Card>
      ))}
      {reports.length === 0 && (
        <Card>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 12 }]}>
            No reports yet. Use the + button to file your first field report.
          </Text>
        </Card>
      )}
    </KeyboardAwareScrollView>
  );
}

/* ================= PLACE SEARCH (Nominatim / OSM) ================= */
/**
 * Geocodes a free-text query using Nominatim (OpenStreetMap).
 * No API key required — same data source as the map tiles.
 * Results are shown as a dropdown list; selecting one calls onSelect
 * with the lat/lng so the caller can fly the map there.
 */
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function PlaceSearch({ onSelect }: {
  onSelect: (lat: number, lng: number, label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (text: string) => {
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);
    setSearchErr(null);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(text.trim())}` +
        `&format=json&limit=5&addressdetails=0&countrycodes=pk`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'MADAD-FloodResponse/1.0' },
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data: NominatimResult[] = await res.json();
      setResults(data);
      if (data.length === 0) setSearchErr('No places found. Try a different name.');
    } catch (e: any) {
      setSearchErr('Search unavailable — check your connection.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setResults([]);
    setSearchErr(null);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (text.trim().length >= 3) {
      debounceTimer.current = setTimeout(() => search(text), 600);
    }
  };

  const pick = (r: NominatimResult) => {
    onSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    setQuery(r.display_name.split(',')[0]); // show short name in input
    setResults([]);
  };

  return (
    <View style={ps.wrap}>
      <View style={ps.inputRow}>
        <Text style={ps.icon}>🔍</Text>
        <TextInput
          style={ps.input}
          value={query}
          onChangeText={handleChange}
          placeholder="Search road, area or landmark…"
          placeholderTextColor={C.outline}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => search(query)}
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />}
      </View>

      {searchErr && (
        <Text style={ps.noResult}>{searchErr}</Text>
      )}

      {results.length > 0 && (
        <View style={ps.dropdown}>
          {results.map((r, i) => (
            <Pressable
              key={r.place_id}
              onPress={() => pick(r)}
              style={({ pressed }) => [
                ps.resultRow,
                i < results.length - 1 && ps.resultBorder,
                pressed && { backgroundColor: C.surfaceHigh },
              ]}
            >
              <Text style={ps.resultText} numberOfLines={2}>{r.display_name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { marginTop: 12, marginBottom: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceLowest,
    borderWidth: 1, borderColor: C.outlineVariant,
    borderRadius: RADIUS.md, paddingHorizontal: 12, minHeight: 48,
  },
  icon: { fontSize: 15, marginRight: 8, color: C.onSurfaceVariant },
  input: { flex: 1, color: C.onSurface, fontSize: 15, paddingVertical: 10 },
  noResult: {
    ...T.labelSm,
    color: C.onSurfaceVariant,
    marginTop: 6,
    marginLeft: 4,
  },
  dropdown: {
    backgroundColor: C.surfaceLowest,
    borderWidth: 1, borderColor: C.outlineVariant,
    borderRadius: RADIUS.md,
    marginTop: 4,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  resultRow: {
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: C.surfaceLowest,
  },
  resultBorder: {
    borderBottomWidth: 1, borderBottomColor: C.surfaceVariant,
  },
  resultText: {
    ...T.bodyMd,
    color: C.onSurface,
  },
});

/* ================= FLOOD ZONE ANALYSIS ================= */
/** Convex hull (Andrew monotone chain) over affected-site coordinates — the
 *  shaded region visualizes the flood's current extent and spread direction. */
export function convexHull(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const cross = (o: any, a: any, b: any) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower: typeof pts = [];
  for (const pt of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: typeof pts = [];
  for (const pt of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/* ================= MAP ================= */
function MapTab({ centerId, sites, depots, damaged, centers, dispatches, refresh, onOpenRoute }: {
  centerId: number; sites: Site[]; depots: Depot[]; damaged: Damage[]; centers: CenterRow[];
  dispatches: DispatchRow[]; refresh: () => void; onOpenRoute: (d: DispatchRow) => void;
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
    ...(layers.routes ? dispatches.filter(d => d.route_geojson?.coordinates?.length > 1).map(d => ({
      id: `r${d.dispatch_id}`,
      coords: d.route_geojson.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
      color: C.primaryFixedDim, width: 4, dashed: true,
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
          fit={!myLocation && (markers.length > 0 || polylines.length > 0 || floodPolygons.length > 0)}
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
function AssignCoordinatorList({ centerId, site, onAssigned }: {
  centerId: number; site: Site; onAssigned: (username: string) => void;
}) {
  const [workers, setWorkers] = useState<CoordinatorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [doneUser, setDoneUser] = useState<string | null>(null);

  useEffect(() => {
    api<CoordinatorRow[]>(`/dispatch/available-coordinators?center_id=${centerId}`)
      .then(list => setWorkers(list.filter(u => u.is_active)))
      .catch(e => { setErr(e.message); setWorkers([]); });
  }, [centerId]);

  const assign = async (coordinatorId: number) => {
    setErr(null);
    setBusyId(coordinatorId);
    try {
      await api(`/sites/${site.id}/assign`, { method: 'POST', body: { coordinator_id: coordinatorId } });
      const u = workers?.find(w => w.user_id === coordinatorId);
      setDoneUser(u?.username ?? `#${coordinatorId}`);
      onAssigned(u?.username ?? '');
    } catch (e: any) { setErr(e.message); } finally { setBusyId(null); }
  };

  if (doneUser) {
    return (
      <Card barColor={C.tertiary}>
        <Text style={[T.titleLg, { color: C.onSurface }]}>✓ Dispatch started</Text>
        <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
          {doneUser} is assigned to {site.location_name}. The convoy route from the
          nearest depot is live — track it on the Map tab.
        </Text>
      </Card>
    );
  }

  return (
    <View>
      <Err msg={err} />
      <Text style={[T.labelLg, { color: C.onSurface, marginBottom: 8 }]}>
        Workers of this support center — pick one:
      </Text>
      {workers === null && <Loading />}
      {workers?.length === 0 && (
        <Card>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 10 }]}>
            No workers registered in this center yet.
          </Text>
        </Card>
      )}
      {workers?.map(u => (
        <Card key={u.user_id}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceHigh,
                          alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ color: C.primary, fontSize: 18 }}>{'👤'}</Text>
            </View>
            <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{u.username}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Button title={busyId === u.user_id ? 'Starting dispatch…' : `Start Dispatch with ${u.username}`}
                    kind="primary" icon="➤"
                    disabled={busyId !== null}
                    onPress={() => assign(u.user_id)} />
          </View>
        </Card>
      ))}
    </View>
  );
}

/* ================= DISPATCHES TAB ================= */
function DispatchesTab({ centerId, sites, depots, dispatches, refresh, onOpenRoute }: {
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
function NewReportScreen({ centerId, edit, onBack }: {
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
function PlanResourcesScreen({ centerId, currentUserId, alloc, site, depots, onBack, onDone }: {
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
function ActiveRouteScreen({ centerId, dispatchRow, sites, onBack }: {
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
function AssignSiteScreen({ centerId, currentUserId, site, onBack }: {
  centerId: number; currentUserId: number; site: Site; onBack: () => void;
}) {
  const [coordinators, setCoordinators] = useState<CoordinatorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    api<CoordinatorRow[]>(`/dispatch/available-coordinators?center_id=${centerId}`)
      .then(list => setCoordinators(list.filter(u => u.is_active && u.user_id !== currentUserId)))
      .catch(e => { setErr(e.message); setCoordinators([]); });
  }, [centerId]);

  const assign = async (coordinatorId: number) => {
    setErr(null);
    setBusyId(coordinatorId);
    try {
      const res = await api<any>(`/sites/${site.id}/assign`, {
        method: 'POST', body: { coordinator_id: coordinatorId } });
      setResult(res);
    } catch (e: any) { setErr(e.message); } finally { setBusyId(null); }
  };

  const assigned = coordinators?.find(u => u.user_id === busyId);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionTitle title="Assign Coordinator"
          sub="Choose an available coordinator to respond to this flood-affected region." />

        <Card barColor={SEVERITY_BAR[site.severity ?? 'low'] ?? C.primary}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{site.location_name}</Text>
            {site.severity && <StatusChip label={site.severity.toUpperCase()}
              tone={site.severity === 'critical' ? 'critical' : site.severity === 'high' ? 'warning' : 'info'} />}
          </View>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
            Est. Pop ~{site.estimated_population}
            {(site.needs ?? []).length > 0 ? ` · Needs: ${site.needs.join(', ')}` : ''}
          </Text>
        </Card>

        <Err msg={err} />

        {result ? (
          <Card barColor={C.tertiary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>✓ Coordinator assigned</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
              Dispatch #{result.dispatch_id} is created with a damage-aware route to
              {' '}{site.location_name}. ETA {result.eta_minutes} min ·
              {' '}{Number(result.distance_km).toFixed(1)} km.
            </Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
              The coordinator's status is now <Text style={{ fontWeight: '700' }}>On Route</Text> and
              they can open the Active Route screen to navigate.
            </Text>
            <View style={{ marginTop: 10 }}>
              <Button title="Done" onPress={onBack} kind="tertiary" />
            </View>
          </Card>
        ) : (
          <>
            <Text style={[T.labelLg, { color: C.onSurface, marginBottom: 8 }]}>
              Available Coordinators
            </Text>
            {coordinators === null && <Loading />}
            {coordinators?.length === 0 && (
              <Card>
                <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 12 }]}>
                  No other coordinators are registered in this center yet.
                </Text>
              </Card>
            )}
            {coordinators?.map(u => (
              <Card key={u.user_id}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceHigh,
                                alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ color: C.primary, fontSize: 18 }}>{'👤'}</Text>
                  </View>
                  <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{u.username}</Text>
                </View>
                <View style={{ marginTop: 10 }}>
                  <Button title={busyId === u.user_id ? 'Assigning…' : `Assign to ${site.location_name}`}
                          kind="primary" icon="➤"
                          disabled={busyId !== null}
                          onPress={() => assign(u.user_id)} />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
