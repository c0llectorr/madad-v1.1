import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api';
import { AppBar, BottomNav, Button, Card, Fab, SectionTitle } from '../../components';
import { C, T } from '../../theme';
import type { Allocation, CenterRow, Damage, Depot, DispatchRow, LoginResponse, ReportRow, Site } from '../../types';
import { COORDINATOR_TABS } from '../../navigation/coordinatorNav';
import { HomePage } from './HomePage';
import { ReportsPage } from './ReportsPage';
import { DispatchPage } from './DispatchPage';
import { MapPage } from './MapPage';
import { NewReportModal } from './modals/NewReportModal';
import { PlanResourcesModal } from './modals/PlanResourcesModal';
import { ActiveRouteModal } from './modals/ActiveRouteModal';
import { AssignSiteModal } from './modals/AssignSiteModal';
import PlanEditorModal from './modals/PlanEditorModal';
import AssignDriverModal from './modals/AssignDriverModal';
import FlagDamageScreen from '../../components/FlagDamageScreen';
import type { PlanT } from '../../types';

type Sub = null
  | { name: 'flagDamage' }
  | { name: 'newReport'; edit?: { report_id: number; site: Site } }
  | { name: 'planEditor'; plan: PlanT }
  | { name: 'assignDriver'; plan: PlanT }
  | { name: 'assignSite'; site: Site }
  | { name: 'route'; dispatch: DispatchRow };

/** Coordinator role navigator — owns tab state, the modal stack, and the
 *  center-scoped data fetches. Pages are prop-driven and independent. */
export default function CoordinatorNavigator({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  const centerId = session.center_id;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState<Sub>(null);
  const [key, setKey] = useState(0);
  const refresh = useCallback(() => setKey(k => k + 1), []);

  const [sites, setSites] = useState<Site[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [damaged, setDamaged] = useState<Damage[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRow[]>([]);
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [plans, setPlans] = useState<PlanT[]>([]);
  const [planningReportId, setPlanningReportId] = useState<number | null>(null);

  // Single source of truth for "Generate Plan": generates, stores, and opens.
  const generatePlanFor = useCallback(async (site: Site, reportId: number) => {
    if (centerId == null) return;
    setPlanningReportId(reportId);
    try {
      const plan = await api<PlanT>('/plan/generate',
        { method: 'POST', body: { site_id: site.id, center_id: centerId } });
      setSub({ name: 'planEditor', plan });
    } catch (e: any) {
      Alert.alert('Plan failed', e.message);
    } finally {
      setPlanningReportId(null);
    }
  }, [centerId]);

  // Routes are public: any coordinator can view, follow, or reroute any
  // dispatch (field fallback when the assigned driver loses connectivity).
  const openRoute = useCallback((d: DispatchRow) => {
    setSub({ name: 'route', dispatch: d });
  }, []);

  const load = useCallback(() => {
    if (centerId == null) return;
    api<Site[]>(`/sites?center_id=${centerId}`).then(setSites).catch(() => {});
    api<Depot[]>(`/depots?center_id=${centerId}`).then(setDepots).catch(() => {});
    api<Damage[]>(`/roads/damaged?center_id=${centerId}`).then(setDamaged).catch(() => {});
    api<ReportRow[]>(`/reports?center_id=${centerId}`).then(setReports).catch(() => {});
    api<DispatchRow[]>(`/dispatch?center_id=${centerId}`).then(setDispatches).catch(() => {});
    api<CenterRow[]>('/centers').then(setCenters).catch(() => {});
    api<PlanT[]>(`/plans?center_id=${centerId}`).then(setPlans).catch(() => {});
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

  if (sub?.name === 'flagDamage') {
    return <FlagDamageScreen centerId={centerId} userRole={session.role}
                             onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'newReport') {
    return <NewReportModal centerId={centerId} edit={sub.edit}
                           onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'assignSite') {
    return <AssignSiteModal centerId={centerId} currentUserId={session.user_id} site={sub.site}
                            onBack={() => { setSub(null); refresh(); }} />;
  }
  if (sub?.name === 'planEditor') {
    return <PlanEditorModal plan={sub.plan} centerId={centerId}
                            onBack={() => { setSub(null); refresh(); }}
                            onFinalized={(plan) => setSub({ name: 'assignDriver', plan })} />;
  }
  if (sub?.name === 'assignDriver') {
    return <AssignDriverModal plan={sub.plan}
                              onBack={() => { setSub(null); setTab('dispatches'); refresh(); }}
                              onAssigned={() => {}} />;
  }
  if (sub?.name === 'route') {
    return <ActiveRouteModal centerId={centerId} dispatchRow={sub.dispatch} sites={sites}
                             onBack={() => { setSub(null); refresh(); }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarSm}><Text style={{ fontSize: 16 }}>{'👤'}</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>Support Center</Text>
          <Text style={[T.titleLg, { color: C.onSurface }]}>{session.center_name ?? `Center #${centerId}`}</Text>
        </View>
        <Text style={{ fontSize: 20, padding: 6 }}>{'🔔'}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomePage centerId={centerId} sites={sites} reports={reports} dispatches={dispatches} depots={depots}
                    onNewReport={() => setSub({ name: 'newReport' })}
                    onPendingReports={() => setTab('reports')}
                    onDispatch={() => {}}
                    onAssignSite={(site: Site) => setSub({ name: 'assignSite', site })} />
        )}
        {tab === 'reports' && (
          <ReportsPage centerId={centerId} reports={reports} sites={sites}
            onNewReport={() => setSub({ name: 'newReport' })}
            onEditReport={(report_id: number, site: Site) => setSub({ name: 'newReport', edit: { report_id, site } })}
            onPlanSite={generatePlanFor}
            planningReportId={planningReportId}
            refresh={refresh} />
        )}
        {tab === 'dispatches' && (
          <DispatchPage centerId={centerId} sites={sites} depots={depots} dispatches={dispatches}
                        plans={plans} refresh={refresh} onOpenRoute={openRoute}
                        onEditPlan={(plan: PlanT) => setSub({ name: 'planEditor', plan })}
                        onAssignPlan={(plan: PlanT) => setSub({ name: 'assignDriver', plan })} />
        )}
        {tab === 'map' && (
          <MapPage centerId={centerId} sites={sites} depots={depots} damaged={damaged}
                   centers={centers}
                   dispatches={dispatches.filter(d => d.dispatched_by === session.user_id)} refresh={refresh}
                   currentUserId={session.user_id}
                   onOpenRoute={openRoute}
                   onFlagDamage={() => setSub({ name: 'flagDamage' })} />
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

      <BottomNav tabs={COORDINATOR_TABS} active={tab} onChange={setTab} />
      {(tab === 'home' || tab === 'reports') &&
        <Fab
          onPress={() => setSub({ name: 'newReport' })}
          bottomOffset={Math.max(10, insets.bottom) + 70 + 16}
        />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 52, paddingBottom: 12, backgroundColor: C.background,
  },
  avatarSm: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
});
