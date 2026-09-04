import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../../api';
import LeafletMap, { LeafMarker, LeafPolygon, LeafletMapHandle } from '../../../LeafletMap';
import { C, T } from '../../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../../components';
import { FilterChips } from '../../../components/FilterChips';
import type { Center, Coordinator, Depot } from '../../../types';
import { convexHull } from '../../../utils/geo';

export function AddCoordinatorModal({ centers, onBack }: { centers: Center[]; onBack: () => void }) {
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

import { cs } from '../adminStyles';

