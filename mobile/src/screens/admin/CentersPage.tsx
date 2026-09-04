import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolygon } from '../../LeafletMap';
import { C, T } from '../../theme';
import { Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../components';
import { FilterChips } from '../../components/FilterChips';
import type { Center, Coordinator, Depot } from '../../types';
import { convexHull } from '../../utils/geo';

export function CentersPage({ centers, key2, refresh, go }: {
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
import { cs } from './adminStyles';

