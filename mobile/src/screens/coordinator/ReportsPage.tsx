import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolyline, LeafPolygon, LeafletMapHandle } from '../../LeafletMap';
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from '../../theme';
import { AppBar, Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SectionTitle, StatusChip, Stepper } from '../../components';
import type { Allocation, CenterRow, CoordinatorRow, Damage, Depot, DispatchRow, ReportRow, Site } from '../../types';
import { FLAG_API, FLAG_LABELS, FLAG_TYPES, NEED_API, NEED_LABELS, NEED_TYPES, SEV_API, SEVERITIES } from '../../utils/constants';
import { convexHull, nearestDepot } from '../../utils/geo';

export function ReportsPage({ centerId, reports, sites, onNewReport, onEditReport, onPlanSite, planningReportId, refresh }: {
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
