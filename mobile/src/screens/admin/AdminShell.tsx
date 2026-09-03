import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, Text, View, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { api, LoginResponse } from '../../api';
import LeafletMap, { LeafletMapHandle } from '../../LeafletMap';
import {
  AppBar, BottomNav, Button, Card, Err, Field, Loading, PillButton,
  Screen, SectionTitle, StatusChip, NavTab,
} from '../../ui';
import { C, T, RADIUS } from '../../theme';

const NAV: NavTab[] = [
  { key: 'resources', label: 'Resources', icon: '▦' },
  { key: 'centers', label: 'Centers', icon: '◎' },
  { key: 'accounts', label: 'Accounts', icon: '👤' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

interface Center { id: number; code: string; name: string; region: string | null; lat: number; lng: number }
interface Depot { id: number; name: string; lat: number; lng: number; inventory: { resource_type: string; quantity: number }[] }
interface Coordinator { user_id: number; username: string; center_id: number; is_active: boolean; created_at: string }

export default function AdminShell({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  const [tab, setTab] = useState('resources');
  const [view, setView] = useState<{ name: 'addCenter' | 'addCoordinator' } | null>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [key, setKey] = useState(0);
  const refresh = () => setKey(k => k + 1);

  useEffect(() => {
    api<Center[]>('/centers').then(setCenters).catch(() => {});
  }, [key]);

  if (view?.name === 'addCenter') {
    return <AddCenterScreen centers={centers} onBack={() => { setView(null); refresh(); }} />;
  }
  if (view?.name === 'addCoordinator') {
    return <AddCoordinatorScreen centers={centers} onBack={() => { setView(null); refresh(); }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" right={<PressableBell />} />
      <View style={{ flex: 1 }}>
        {tab === 'resources' && <ResourcesTab centers={centers} key2={key} />}
        {tab === 'centers' && <CentersTab centers={centers} key2={key} refresh={refresh} go={setView} />}
        {tab === 'accounts' && <AccountsTab key2={key} refresh={refresh} go={setView} />}
        {tab === 'settings' && <SettingsTab session={session} onLogout={onLogout} />}
      </View>
      <BottomNav tabs={NAV} active={tab} onChange={setTab} />
    </View>
  );
}

function PressableBell() {
  return <Text style={{ fontSize: 20, padding: 6 }}>{'🔔'}</Text>;
}

/* ---------------- Resources tab ---------------- */
function ResourcesTab({ centers, key2 }: {
  centers: Center[]; key2: number;
}) {
  const [depotsByCenter, setDepotsByCenter] = useState<Record<number, Depot[]>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result: Record<number, Depot[]> = {};
        for (const c of centers) {
          result[c.id] = await api<Depot[]>(`/depots?center_id=${c.id}`);
        }
        setDepotsByCenter(result);
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

      {centers.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No centers yet — add one to begin.</Text>}

      {totals.map(([type, qty], idx) => {
        const low = qty < 100;
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
            {/* mini bar chart */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, marginTop: 14, gap: 6 }}>
              {Array.from({ length: 6 }).map((_, i) => {
                const h = Math.max(10, (qty / maxQty) * 64 * (1 - i * 0.12));
                return <View key={i} style={{ flex: 1, height: i === 0 ? h : h * 0.8, backgroundColor: tone, opacity: 0.85, borderRadius: 4 }} />;
              })}
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
function CentersTab({ centers, key2, refresh, go }: {
  centers: Center[]; key2: number; refresh: () => void;
  go: (v: { name: 'addCenter' | 'addCoordinator' }) => void;
}) {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = centers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={16}
      >
        <SectionTitle title="Manage Centers" sub="View and manage operational relief centers." />

        <View style={cs.searchWrap}>
          <Text style={{ color: C.outline, marginRight: 8 }}>{'🔍'}</Text>
          <TextInput style={{ flex: 1, color: C.onSurface, fontSize: 16, paddingVertical: 8 }}
            value={search} onChangeText={setSearch}
            placeholder="Search by Name or Unique Code.." placeholderTextColor={C.outline} />
        </View>

        {centers.map(c => (
          <Card key={c.id} barColor={C.primary} onPress={() => setOpenId(openId === c.id ? null : c.id)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>{c.name}</Text>
              <Text style={{ color: C.outline, fontSize: 18 }}>{openId === c.id ? '▾' : '›'}</Text>
            </View>
            <Text style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}>CODE: {c.code}</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>{'◎'} {c.region ?? 'Region not set'}</Text>
            {openId === c.id && <CenterDepots centerId={c.id} key2={key2} />}
          </Card>
        ))}
        {filtered.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No centers found.</Text>}
      </KeyboardAwareScrollView>

      {/* Anchored action bar — always visible at the bottom of this tab */}
      <View style={cs.actionBar}>
        <Pressable
          style={({ pressed }) => [cs.actionBtn, pressed && { opacity: 0.85 }]}
          onPress={() => go({ name: 'addCenter' })}
          accessibilityRole="button"
        >
          <Text style={cs.actionBtnIcon}>＋</Text>
          <Text style={cs.actionBtnLabel}>Add New Center</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CenterDepots({ centerId, key2 }: { centerId: number; key2: number }) {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [name, setName] = useState(''); const [lat, setLat] = useState(''); const [lng, setLng] = useState('');
  const [resType, setResType] = useState(''); const [delta, setDelta] = useState('');
  const [depotId, setDepotId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Depot[]>(`/depots?center_id=${centerId}`).then(setDepots).catch(e => setErr(e.message));
  }, [centerId]);
  useEffect(load, [load, key2]);

  const createDepot = async () => {
    setErr(null);
    try {
      await api('/depots', { method: 'POST', body: { center_id: centerId, name, lat: parseFloat(lat), lng: parseFloat(lng) } });
      setName(''); setLat(''); setLng(''); load();
    } catch (e: any) { setErr(e.message); }
  };

  const adjust = async (sign: 1 | -1) => {
    if (!depotId || !resType) return;
    setErr(null);
    try {
      await api(`/depots/${depotId}/inventory`, { method: 'PATCH',
        body: { resource_type: resType, quantity_delta: sign * parseInt(delta || '0', 10) } });
      setResType(''); setDelta(''); load();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.surfaceVariant, paddingTop: 12 }}>
      <Err msg={err} />
      {depots.map(d => (
        <Card key={d.id} barColor={depotId === d.id ? C.tertiary : undefined} onPress={() => setDepotId(d.id)}>
          <Text style={[T.titleLg, { color: C.onSurface }]}>{d.name} {depotId === d.id ? '· selected' : ''}</Text>
          {d.inventory.map(i => (
            <Text key={i.resource_type} style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
              {i.resource_type}: {i.quantity}
            </Text>
          ))}
          {d.inventory.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No stock yet</Text>}
        </Card>
      ))}

      <Text style={[T.labelLg, { color: C.onSurface, marginTop: 8 }]}>New depot</Text>
      <Field value={name} onChangeText={setName} placeholder="Depot name" />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field value={lat} onChangeText={setLat} placeholder="Latitude" keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field value={lng} onChangeText={setLng} placeholder="Longitude" keyboardType="decimal-pad" />
        </View>
      </View>
      <Button title="Create depot" onPress={createDepot} kind="outlined" disabled={!name || !lat || !lng} />

      <Text style={[T.labelLg, { color: C.onSurface, marginTop: 12 }]}>
        Inventory {depotId ? `(depot #${depotId})` : '(select a depot above)'}
      </Text>
      <Field value={resType} onChangeText={setResType} placeholder="Resource type (food, water…)" />
      <Field value={delta} onChangeText={setDelta} placeholder="Quantity delta" keyboardType="numeric" />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Button title="Add stock" onPress={() => adjust(1)} kind="tertiary" disabled={!depotId || !resType} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Remove" onPress={() => adjust(-1)} kind="critical" disabled={!depotId || !resType} />
        </View>
      </View>
    </View>
  );
}

/* ---------------- Accounts tab ---------------- */
function AccountsTab({ key2, refresh, go }: {
  key2: number; refresh: () => void;
  go: (v: { name: 'addCenter' | 'addCoordinator' }) => void;
}) {
  const [list, setList] = useState<Coordinator[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Coordinator[]>('/accounts/coordinators').then(setList).catch(e => setErr(e.message));
  }, [key2]);

  const deactivate = async (id: number) => {
    setErr(null);
    try { await api(`/accounts/coordinators/${id}/deactivate`, { method: 'PATCH' }); refresh(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 16 }}>
        <SectionTitle title="Manage Coordinators" sub="Operational accounts assigned to support centers." />
        <Err msg={err} />
        {list.map(u => (
          <Card key={u.user_id} barColor={u.is_active ? C.primary : C.warning}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={cs.avatar}>
                <Text style={{ color: C.primary, fontSize: 20 }}>{'👤'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>{u.username}</Text>
                <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                  ID: CORD-{u.user_id} · center #{u.center_id}
                </Text>
              </View>
              <StatusChip label={u.is_active ? 'Active' : 'Deactivated'} tone={u.is_active ? 'ok' : 'warning'} />
            </View>
            {u.is_active && (
              <View style={{ marginTop: 12 }}>
                <Button title="Remove" onPress={() => deactivate(u.user_id)} kind="critical" icon="🗑" />
              </View>
            )}
          </Card>
        ))}
        {list.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No coordinators yet.</Text>}
      </ScrollView>

      {/* Anchored action bar */}
      <View style={cs.actionBar}>
        <Pressable
          style={({ pressed }) => [cs.actionBtn, pressed && { opacity: 0.85 }]}
          onPress={() => go({ name: 'addCoordinator' })}
          accessibilityRole="button"
        >
          <Text style={cs.actionBtnIcon}>＋</Text>
          <Text style={cs.actionBtnLabel}>Add Coordinator</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- Settings tab ---------------- */
function SettingsTab({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <SectionTitle title="Settings" />
      <Card barColor={C.secondary}>
        <Text style={[T.titleLg, { color: C.onSurface }]}>Signed in as {session.user_id}</Text>
        <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>Role: {session.role}</Text>
      </Card>
      <Button title="Logout" onPress={onLogout} kind="critical" />
    </ScrollView>
  );
}

/* ---------------- Add Center screen ---------------- */
function AddCenterScreen({ centers, onBack }: { centers: Center[]; onBack: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [region, setRegion] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const mapRef = useRef<LeafletMapHandle>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fly to coordinates whenever both become valid numbers
  useEffect(() => {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (!isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
      mapRef.current?.flyTo(la, lo, 14);
    }
  }, [lat, lng]);

  // Geocode by name when coords are empty — debounced 700 ms
  useEffect(() => {
    if (geoTimer.current) clearTimeout(geoTimer.current);
    const q = (name + ' ' + region).trim();
    if (q.length < 3 || (lat && lng)) return;
    geoTimer.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'MADAD-FloodResponse/1.0' } },
        );
        const data = await res.json();
        if (data.length > 0) {
          setLat(parseFloat(data[0].lat).toFixed(6));
          setLng(parseFloat(data[0].lon).toFixed(6));
        }
      } catch { /* silent */ } finally { setGeocoding(false); }
    }, 700);
    return () => { if (geoTimer.current) clearTimeout(geoTimer.current); };
  }, [name, region]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/centers', { method: 'POST', body: { code, name, region: region || null, lat: parsedLat, lng: parsedLng } });
      onBack();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="Add New Center" onBack={onBack} />

      {/* Live map preview — always outside ScrollView */}
      <View style={cs.previewWrap}>
        <LeafletMap
          ref={mapRef}
          height={180}
          markers={hasCoords ? [{
            id: 'center',
            lat: parsedLat,
            lng: parsedLng,
            title: name || 'New center',
            color: C.primary,
          }] : []}
        />
        <View style={cs.previewBadgeWrap} pointerEvents="none">
          <View style={[cs.previewBadge, geocoding && { backgroundColor: 'rgba(0,80,150,0.7)' }]}>
            {geocoding
              ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
              : null}
            <Text style={cs.previewBadgeText}>
              {geocoding
                ? 'Looking up location…'
                : hasCoords
                  ? `📍 ${name || `${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}`}`
                  : '🗺 Enter name or coordinates below'}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        <SectionTitle title="Add New Center"
          sub="Register a new support center. The map updates as you type." />

        <Card barColor={C.primary}>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Center Information</Text>
          <View style={{ height: 12 }} />
          <Field value={name} onChangeText={setName} placeholder="Center Name" />
          <Field value={code} onChangeText={setCode} placeholder="Unique Code (e.g., C-104)"
            autoCapitalize="characters" />

          <Text style={[T.titleLg, { color: C.onSurface, marginTop: 8 }]}>Location Details</Text>
          <View style={{ height: 12 }} />
          <Field value={region} onChangeText={setRegion} placeholder="Province / Region" />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Field value={lat} onChangeText={setLat} placeholder="Latitude" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field value={lng} onChangeText={setLng} placeholder="Longitude" keyboardType="decimal-pad" />
            </View>
          </View>
          {hasCoords && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Text style={[T.labelSm, { color: C.tertiary, flex: 1 }]}>
                ✓ Location set — map updated above
              </Text>
              <Pressable onPress={() => { setLat(''); setLng(''); }} hitSlop={8}>
                <Text style={[T.labelSm, { color: C.outline }]}>Clear</Text>
              </Pressable>
            </View>
          )}
        </Card>

        <Err msg={err} />
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Button title="Cancel" onPress={onBack} kind="outlined" />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="Register Center" onPress={submit} icon="＋"
              disabled={busy || !name || !code || !hasCoords} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

/* ---------------- Add Coordinator screen ---------------- */
function AddCoordinatorScreen({ centers, onBack }: { centers: Center[]; onBack: () => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [centerId, setCenterId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/accounts/coordinators', { method: 'POST', body: { center_id: centerId, username, password } });
      onBack();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen title="MADAD" onBack={onBack}>
      <SectionTitle title="Add New Coordinator" sub="Create a new operational account for field management." />
      <Card barColor={C.primary}>
        <Field value={username} onChangeText={setUsername} placeholder="Username" />
        <Field value={password} onChangeText={setPassword} placeholder="Password" secure />
        <Text style={[T.labelLg, { color: C.onSurface, marginTop: 4, marginBottom: 8 }]}>Assigned Center</Text>
        <View style={cs.pickerRow}>
          {centers.map(c => (
            <PillButton key={c.id} title={`${c.code}`} kind={centerId === c.id ? 'primary' : 'outlined'}
              onPress={() => setCenterId(c.id)} />
          ))}
          {centers.length === 0 && <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>Create a center first.</Text>}
        </View>
        <View style={cs.infoPanel}>
          <Text style={{ color: C.primary, marginRight: 8 }}>{'ℹ️'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[T.labelLg, { color: C.onSurface }]}>Coordinator Access Level</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 2 }]}>
              This account will have field-level access to report issues, request resources, and update statuses for the assigned center only.
            </Text>
          </View>
        </View>
      </Card>
      <Err msg={err} />
      <Button title="Create Account" onPress={submit} kind="primary" icon="👤"
              disabled={busy || !centerId || !username || !password} />
      <Button title="Cancel" onPress={onBack} kind="outlined" />
    </Screen>
  );
}

const cs = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceLowest, borderWidth: 1, borderColor: C.outlineVariant, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, minHeight: 46 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  infoPanel: {
    flexDirection: 'row', backgroundColor: C.surfaceLow, borderRadius: 12,
    padding: 14, marginTop: 12,
  },
  mapPreview: {
    backgroundColor: C.surfaceContainer, borderRadius: 12, height: 120,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },

  // Add Center live map preview
  previewWrap: {
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  previewBadgeWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },

  // Sticky bottom action bar replacing the floating FAB
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
  },
  actionBtn: {
    backgroundColor: C.primary,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionBtnIcon: {
    color: C.onPrimary,
    fontSize: 20,
    lineHeight: 22,
  },
  actionBtnLabel: {
    color: C.onPrimary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
