import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { api, LoginResponse } from '../../api';
import LeafletMap, { LeafMarker, LeafPolyline } from '../../LeafletMap';
import {
  AppBar, BottomNav, Button, Card, Chip, Err, Fab, Field, Loading, PillButton,
  SectionTitle, StatusChip, Stepper, NavTab,
} from '../../ui';
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from '../../theme';

const NAV: NavTab[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'reports', label: 'Reports', icon: '▤' },
  { key: 'map', label: 'Map', icon: '🗺' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];

interface Site { id: number; location_name: string; lat: number; lng: number; estimated_population: number; needs: string[]; urgency_flags: string[]; severity: string | null; confidence: string; priority_score: number | null; status: string }
interface Depot { id: number; name: string; lat: number; lng: number; inventory: { resource_type: string; quantity: number }[] }
interface Damage { id: number; lat: number; lng: number; reason: string | null; edge_geometry: any; reported_at: string }
interface ReportRow { report_id: number; raw_text: string | null; status: string; created_at: string }
interface DispatchRow { dispatch_id: number; site_id: number; depot_id: number; status: string; distance_km: number | null; eta_minutes: number | null; route_geojson: any; resources_loaded: any[] }
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

type Sub = null | { name: 'newReport' } | { name: 'plan'; alloc: Allocation; site: Site | undefined }
  | { name: 'route'; dispatch: DispatchRow };

export default function CoordinatorShell({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  const centerId = session.center_id;
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState<Sub>(null);
  const [key, setKey] = useState(0);
  const refresh = () => setKey(k => k + 1);

  const [sites, setSites] = useState<Site[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [damaged, setDamaged] = useState<Damage[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);

  const load = useCallback(() => {
    if (centerId == null) return;
    api<Site[]>(`/sites?center_id=${centerId}`).then(setSites).catch(() => {});
    api<Depot[]>(`/depots?center_id=${centerId}`).then(setDepots).catch(() => {});
    api<Damage[]>(`/roads/damaged?center_id=${centerId}`).then(setDamaged).catch(() => {});
    api<ReportRow[]>(`/reports?center_id=${centerId}`).then(setReports).catch(() => {});
    api<DispatchRow[]>(`/dispatch?center_id=${centerId}`).then(setDispatches).catch(() => {});
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
    return <NewReportScreen centerId={centerId} onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'plan') {
    return <PlanResourcesScreen centerId={centerId} alloc={sub.alloc} site={sub.site}
                                depots={depots} onBack={() => { setSub(null); refresh(); }} />;
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
                   onNewReport={() => setSub({ name: 'newReport' })} onDispatch={(alloc) => setSub({ name: 'plan', alloc, site: sites.find(s => s.id === alloc.site_id) })} />
        )}
        {tab === 'reports' && (
          <ReportsTab centerId={centerId} reports={reports} onNewReport={() => setSub({ name: 'newReport' })} refresh={refresh} />
        )}
        {tab === 'map' && (
          <MapTab centerId={centerId} sites={sites} depots={depots} damaged={damaged}
                  dispatches={dispatches} refresh={refresh}
                  onOpenRoute={d => setSub({ name: 'route', dispatch: d })} />
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
        <Fab onPress={() => setSub({ name: 'newReport' })} />}
    </View>
  );
}

/* ================= HOME ================= */
function HomeTab({ centerId, sites, reports, dispatches, depots, onNewReport, onDispatch }: {
  centerId: number; sites: Site[]; reports: ReportRow[]; dispatches: DispatchRow[]; depots: Depot[];
  onNewReport: () => void; onDispatch: (a: Allocation) => void;
}) {
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = reports.filter(r => r.status === 'pending_extraction' || r.status === 'extracted').length;
  const activeDispatches = dispatches.filter(d => d.status !== 'delivered').length;
  const lowStock = depots.flatMap(d => d.inventory).filter(i => i.quantity < 100).length;

  const generateFor = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await api<{ allocations: Allocation[] }>('/plan/generate', { method: 'POST', body: { center_id: centerId } });
      setAllocations(res.allocations);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const top = [...sites].filter(s => s.status !== 'delivered')
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)).slice(0, 5);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <SectionTitle title="Operations Dashboard" />

      {pending > 0 && (
        <Card barColor={C.critical} onPress={onNewReport}>
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
        {busy ? <Loading /> : (
          <PillButton title="Generate Plan" onPress={generateFor} icon="⚙" />
        )}
      </View>
      <Err msg={err} />

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
        </Card>
      ))}
      {top.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No confirmed sites yet — submit a report.</Text>}

      {allocations && allocations.map(a => {
        const site = sites.find(s => s.id === a.site_id);
        return (
          <Card key={a.site_id} barColor={C.primary}>
            <Text style={[T.labelLg, { color: C.primary }]}>#{a.rank} {site?.location_name ?? `Site ${a.site_id}`}</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>{a.reasoning}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {a.resources.map(r => <Chip key={r.resource_type} label={`${r.resource_type} ×${r.quantity}`} />)}
            </View>
            {a.depot_id && a.resources.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Button title="Dispatch this" kind="outlined" onPress={() => onDispatch(a)} />
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

/* ================= REPORTS ================= */
function ReportsTab({ centerId, reports, onNewReport, refresh }: {
  centerId: number; reports: ReportRow[]; onNewReport: () => void; refresh: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<{ report_id: number; extracted: any; geocode_status: string } | null>(null);
  const [revLoc, setRevLoc] = useState(''); const [revLat, setRevLat] = useState('');
  const [revLng, setRevLng] = useState(''); const [revPop, setRevPop] = useState('');

  const extract = async (id: number) => {
    setErr(null);
    try {
      const res = await api<any>(`/reports/${id}/extract`, { method: 'POST' });
      setReview(res);
      setRevLoc(res.extracted.location_name ?? '');
      setRevPop(String(res.extracted.estimated_population ?? ''));
      setRevLat(res.extracted.lat != null ? String(res.extracted.lat) : '');
      setRevLng(res.extracted.lng != null ? String(res.extracted.lng) : '');
    } catch (e: any) { setErr(e.message); }
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
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
          {r.status === 'pending_extraction' && r.raw_text && (
            <View style={{ marginTop: 8 }}>
              <Button title="Run AI Extraction" kind="outlined" onPress={() => extract(r.report_id)} icon="✦" />
            </View>
          )}
        </Card>
      ))}
      {reports.length === 0 && (
        <Card>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', padding: 12 }]}>
            No reports yet. Use the + button to file your first field report.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

/* ================= MAP ================= */
function MapTab({ centerId, sites, depots, damaged, dispatches, refresh, onOpenRoute }: {
  centerId: number; sites: Site[]; depots: Depot[]; damaged: Damage[];
  dispatches: DispatchRow[]; refresh: () => void; onOpenRoute: (d: DispatchRow) => void;
}) {
  const [layers, setLayers] = useState({ sites: true, depots: true, damage: true, routes: true });
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const markers: LeafMarker[] = useMemo(() => [
    ...(layers.sites ? sites.map(site => ({
      id: `s${site.id}`, lat: site.lat, lng: site.lng,
      title: site.location_name,
      snippet: `~${site.estimated_population} people · ${site.status}`,
      color: SEVERITY_COLORS[site.severity ?? 'low'] ?? C.primary,
    })) : []),
    ...(layers.depots ? depots.map(d => ({
      id: `d${d.id}`, lat: d.lat, lng: d.lng, title: d.name, snippet: 'Depot',
      color: C.secondary, icon: 'dot' as const,
    })) : []),
    ...(pending ? [{ id: 'pending', lat: pending.lat, lng: pending.lng, title: 'Damage here?', color: C.critical }] : []),
  ], [sites, depots, layers, pending]);

  const polylines: LeafPolyline[] = useMemo(() => [
    ...(layers.damage ? damaged.flatMap(dg =>
      dg.edge_geometry?.coordinates?.length > 1
        ? [{ id: `g${dg.id}`, coords: dg.edge_geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })), color: C.critical, width: 4 }]
        : []) : []),
    ...(layers.routes ? dispatches.filter(d => d.route_geojson?.coordinates?.length > 1).map(d => ({
      id: `r${d.dispatch_id}`,
      coords: d.route_geojson.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
      color: C.primaryFixedDim, width: 4, dashed: true,
    })) : []),
  ], [damaged, dispatches, layers]);

  const flagDamageOnTap = async (lat: number, lng: number) => {
    setErr(null);
    setPending({ lat, lng });
    try {
      await api('/roads/damage', { method: 'POST',
        body: { center_id: centerId, lat, lng, reason: reason || null } });
      setPending(null); setFlagging(false); setReason(''); refresh();
    } catch (e: any) { setErr(e.message); }
  };

  const active = dispatches.filter(d => d.status === 'en_route');

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <LeafletMap
          height={360}
          fit
          center={{ lat: 29.85, lng: 70.45 }}
          zoom={8}
          markers={markers}
          polylines={polylines}
          onMapPress={(lat, lng) => { if (flagging) flagDamageOnTap(lat, lng); }}
        />

        {/* Layers card */}
        <Card>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Map Layers</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            <Chip label="Relief Sites" selected={layers.sites} color={C.primary} onPress={() => setLayers(l => ({ ...l, sites: !l.sites }))} />
            <Chip label="Depots" selected={layers.depots} color={C.secondary} onPress={() => setLayers(l => ({ ...l, depots: !l.depots }))} />
            <Chip label="Road Damage" selected={layers.damage} color={C.critical} onPress={() => setLayers(l => ({ ...l, damage: !l.damage }))} />
            <Chip label="Routes" selected={layers.routes} color={C.primaryFixedDim} onPress={() => setLayers(l => ({ ...l, routes: !l.routes }))} />
          </View>
        </Card>

        <Err msg={err} />
        {flagging && (
          <Card barColor={C.critical}>
            <Text style={[T.titleLg, { color: C.critical }]}>Flag Road Damage</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>Tap the map to mark the severed segment.</Text>
            <View style={{ marginTop: 8 }} />
            <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Bridge flooded" />
            <Button title="Cancel" kind="outlined" onPress={() => { setFlagging(false); setPending(null); }} />
          </Card>
        )}
        <Button title={flagging ? 'Tap map to flag…' : 'Report Road Blockage'} kind="critical" icon="⚠"
                onPress={() => setFlagging(f => !f)} />

        {/* Active routes list */}
        {active.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            <Text style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}>Active Routes</Text>
            {active.map(d => (
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
      </ScrollView>
    </View>
  );
}

/* ================= NEW REPORT ================= */
function NewReportScreen({ centerId, onBack }: { centerId: number; onBack: () => void }) {
  const [mode, setMode] = useState<'text' | 'form'>('text');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // free text
  const [rawText, setRawText] = useState('');
  // structured
  const [locName, setLocName] = useState(''); const [lat, setLat] = useState(''); const [lng, setLng] = useState('');
  const [headcount, setHeadcount] = useState(''); const [severity, setSeverity] = useState('Medium');
  const [needs, setNeeds] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);

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
      if (mode === 'text') {
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

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionTitle title="New Report" sub="Report a situation on the ground — as free text or a structured form." />

        {/* segmented control */}
        <View style={ns.segment}>
          <View style={[ns.segItem, mode === 'text' && ns.segOn]}>
            <Text style={[T.labelLg, { color: mode === 'text' ? C.onPrimary : C.onSurfaceVariant }]}
                  onPress={() => setMode('text')}>Free Text</Text>
          </View>
          <View style={[ns.segItem, mode === 'form' && ns.segOn]}>
            <Text style={[T.labelLg, { color: mode === 'form' ? C.onPrimary : C.onSurfaceVariant }]}
                  onPress={() => setMode('form')}>Structured Form</Text>
          </View>
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
              {lat && lng ? (
                <View style={ns.miniMap}>
                  <LeafletMap height={140} markers={[{ id: 'loc', lat: parseFloat(lat), lng: parseFloat(lng), title: locName || 'Incident', color: C.primary }]} />
                </View>
              ) : (
                <Button title="Use Current Location" kind="outlined" onPress={useCurrent} icon="◎" />
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

        <Button title={busy ? 'Submitting…' : 'Submit Report'} onPress={submit} icon="➤"
                disabled={busy || (mode === 'text' ? !rawText : !locName)} />
      </ScrollView>
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
function PlanResourcesScreen({ centerId, alloc, site, depots, onBack }: {
  centerId: number; alloc: Allocation; site: Site | undefined; depots: Depot[];
  onBack: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(alloc.resources.map(r => [r.resource_type, r.quantity])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const depot = depots.find(d => d.id === alloc.depot_id);
  const stock = useMemo(() => Object.fromEntries(
    (depot?.inventory ?? []).map(i => [i.resource_type, i.quantity])), [depot]);

  const dispatch = async () => {
    setBusy(true); setErr(null);
    try {
      const resources = Object.entries(qty).filter(([, q]) => q > 0)
        .map(([resource_type, quantity]) => ({ resource_type, quantity }));
      await api('/dispatch', { method: 'POST', body: { site_id: alloc.site_id, depot_id: alloc.depot_id, resources } });
      onBack();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
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
          </Card>

          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Button title="Cancel" kind="outlined" onPress={onBack} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title="Confirm Dispatch" onPress={dispatch} icon="➤"
                      disabled={busy || Object.values(qty).every(q => q === 0)} />
            </View>
          </View>
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

  const reroute = async () => {
    if (!coords) return;
    setErr(null);
    try { setRoute(await api(`/dispatch/${dispatchRow.dispatch_id}/reroute`, {
      method: 'POST', body: { current_lat: coords.lat, current_lng: coords.lng, reason: reason || null } })); }
    catch (e: any) { setErr(e.message); }
  };

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

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="Active Route" onBack={onBack} />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Err msg={err} />

          {routeLine?.coordinates?.length > 1 && (
            <LeafletMap
              height={240}
              fit
              markers={[
                ...(coords ? [{ id: 'me', lat: coords.lat, lng: coords.lng, title: 'My position', color: C.secondary, icon: 'dot' as const }] : []),
                { id: 'dst', lat: routeLine.coordinates[routeLine.coordinates.length - 1][1],
                  lng: routeLine.coordinates[routeLine.coordinates.length - 1][0],
                  title: site?.location_name ?? 'Destination', color: C.primary },
              ]}
              polylines={[{ id: 'route',
                            coords: routeLine.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
                            color: C.tertiary, width: 5 }]}
            />
          )}

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
        </ScrollView>
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
    flexDirection: 'row', backgroundColor: C.surfaceContainer, borderRadius: 12, padding: 4, marginBottom: 16,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  segOn: { backgroundColor: C.primary },
  miniMap: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
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
