import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../../LeafletMap';
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from '../../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../../utils/constants';
import { convexHull, nearestDepot } from '../../../utils/geo';

export function AssignCoordinatorList({ centerId, site, onAssigned }: {
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
