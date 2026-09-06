import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolygon } from '../../LeafletMap';
import { C, T } from '../../theme';
import { Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../components';
import { FilterChips } from '../../components/FilterChips';
import type { Center, Coordinator, Depot } from '../../types';
import { convexHull } from '../../utils/geo';

interface SiteRow { id: number; center_id: number; report_id?: number | null; location_name: string; lat: number; lng: number; estimated_population: number; needs: string[]; urgency_flags: string[]; severity: string | null; confidence: string; priority_score: number | null; status: string }
interface DamageRow { id: number; center_id: number; lat: number; lng: number; reason: string | null; edge_geometry: any; reported_at: string }

export function AdminMapPage({ centers, key2 }: { centers: Center[]; key2?: number }) {
  const [province, setProvince] = useState<string>('All Pakistan');
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [damaged, setDamaged] = useState<DamageRow[]>([]);
  const [depotsByCenter, setDepotsByCenter] = useState<Record<number, Depot[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [layers, setLayers] = useState(
    { sites: true, depots: true, damage: true, flood: true, centers: true });

  useEffect(() => {
    (async () => {
      try {
        const [s, d] = await Promise.all([
          api<SiteRow[]>('/sites'),
          api<DamageRow[]>('/roads/damaged'),
        ]);
        setSites(s); setDamaged(d);
        const results = await Promise.all(
          centers.map(c => api<Depot[]>(`/depots?center_id=${c.id}`)));
        setDepotsByCenter(Object.fromEntries(centers.map((c, i) => [c.id, results[i]])));
      } catch (e: any) { setErr(e.message); }
    })();
  }, [centers, key2]);

  const selectedCenter = province === 'All Pakistan'
    ? null : centers.find(c => c.region === province || c.name.includes(province));

  const allDepots = Object.entries(depotsByCenter).flatMap(([cid, ds]) =>
    ds.map(d => ({ ...d, center_id: Number(cid) })));

  const inScope = <T extends { center_id: number }>(rows: T[]) =>
    selectedCenter ? rows.filter(r => r.center_id === selectedCenter.id) : rows;

  const vDepots = inScope(allDepots);
  const vSites = inScope(sites).filter(s => s.lat !== 0 || s.lng !== 0);
  const vDamaged = inScope(damaged);
  const vCenters = selectedCenter ? [selectedCenter] : centers;

  const markers: LeafMarker[] = [
    ...(layers.centers ? vCenters.map(cn => ({
      id: `c${cn.id}`, lat: cn.lat, lng: cn.lng,
      title: cn.name, snippet: `Support Center · ${cn.code}`,
      color: C.secondary, label: 'C',
    })) : []),
    ...(layers.depots ? vDepots.map(d => ({
      id: `d${d.id}`, lat: d.lat, lng: d.lng, title: d.name, snippet: 'Depot',
      color: '#1565C0', label: 'D',
    })) : []),
    ...(layers.sites ? vSites.map(s => ({
      id: `s${s.id}`, lat: s.lat, lng: s.lng,
      title: s.location_name,
      snippet: `~${s.estimated_population} people · ${s.status}`,
      color: '#E65100', label: 'R',
    })) : []),
    ...(layers.damage ? vDamaged.map(dg => ({
      id: `dg${dg.id}`, lat: dg.lat, lng: dg.lng,
      title: '⚠️ Road Blocked', snippet: dg.reason || 'Damage reported',
      color: C.critical, label: '!',
    })) : []),
  ];

  const floodHull = convexHull(vSites.map(s => ({ lat: s.lat, lng: s.lng })));
  const floodPolygons: LeafPolygon[] = layers.flood && floodHull.length >= 3
    ? [{ id: 'floodzone', coords: floodHull, color: C.primary, fillOpacity: 0.12, dashed: true }]
    : [];
  const affectedPeople = vSites.reduce((sum, s) => sum + (s.estimated_population || 0), 0);
  const criticalCount = vSites.filter(s => s.severity === 'critical' || s.severity === 'high').length;

  const provinces = ['All Pakistan', ...Array.from(new Set(centers.map(c => c.region ?? c.name)))];

  return (
    <View style={{ flex: 1 }}>
      {/* Map fills all available space — OUTSIDE any ScrollView so pinch/pan work */}
      <View style={{ flex: 1, position: 'relative', minHeight: 200 }}>
        <LeafletMap
          markers={markers}
          polygons={floodPolygons}
          fit={!selectedCenter && (markers.length > 0 || floodPolygons.length > 0)}
          center={selectedCenter
            ? { lat: selectedCenter.lat, lng: selectedCenter.lng }
            : { lat: 30.3769, lng: 69.3451 }}
          zoom={selectedCenter ? 6 : 5}
        />
        {/* Flood impact summary overlay */}
        {layers.flood && vSites.length > 0 && (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
            <Card barColor={C.primary}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>🌊 Flood Impact Zone</Text>
                <StatusChip label={`${vSites.length} sites`} tone="info" />
              </View>
              <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
                ~{affectedPeople.toLocaleString()} people
                {criticalCount > 0 ? ` · ${criticalCount} high/critical` : ''}
              </Text>
            </Card>
          </View>
        )}
      </View>

      {/* Controls panel — fixed height, scrollable, doesn't steal map gestures */}
      <KeyboardAwareScrollView
        style={{ maxHeight: 330 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        nestedScrollEnabled
      >
        <Err msg={err} />

        <Card>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Map Layers</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            <Chip label="Relief Sites" selected={layers.sites} color='#E65100' onPress={() => setLayers(l => ({ ...l, sites: !l.sites }))} />
            <Chip label="Depots" selected={layers.depots} color='#1565C0' onPress={() => setLayers(l => ({ ...l, depots: !l.depots }))} />
            <Chip label="Road Damage" selected={layers.damage} color={C.critical} onPress={() => setLayers(l => ({ ...l, damage: !l.damage }))} />
            <Chip label="Flood Zone" selected={layers.flood} color={C.primary} onPress={() => setLayers(l => ({ ...l, flood: !l.flood }))} />
            <Chip label="Centers" selected={layers.centers} color={C.secondary} onPress={() => setLayers(l => ({ ...l, centers: !l.centers }))} />
          </View>
        </Card>

        <Card>
          <Text style={[T.titleLg, { color: C.onSurface }]}>Filter by Province</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            {provinces.map(pr => (
              <Chip key={pr} label={pr === 'Islamabad Capital Territory' ? 'Federal (ISB)' : pr}
                    selected={province === pr} color={C.secondary}
                    onPress={() => setProvince(pr)} />
            ))}
          </View>
        </Card>

        <Card barColor={C.primary}>
          <Text style={[T.titleLg, { color: C.onSurface }]}>{province}</Text>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}>
            {vCenters.length} support center{vCenters.length !== 1 ? 's' : ''} ·
            {' '}{vDepots.length} depot{vDepots.length !== 1 ? 's' : ''} ·
            {' '}{vSites.length} flood-affected site{vSites.length !== 1 ? 's' : ''}
            {vSites.length > 0 ? ` (~${affectedPeople.toLocaleString()} people)` : ''} ·
            {' '}{vDamaged.length} road damage report{vDamaged.length !== 1 ? 's' : ''}
          </Text>
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

import { cs } from './adminStyles';

