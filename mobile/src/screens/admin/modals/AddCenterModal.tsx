import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { api } from '../../../api';
import LeafletMap, { LeafMarker, LeafPolygon, LeafletMapHandle } from '../../../LeafletMap';
import { C, T } from '../../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../../components';
import { FilterChips } from '../../../components/FilterChips';
import type { Center, Coordinator, Depot } from '../../../types';
import { convexHull } from '../../../utils/geo';

export function AddCenterModal({ centers, onBack }: { centers: Center[]; onBack: () => void }) {
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
import { cs } from '../adminStyles';

