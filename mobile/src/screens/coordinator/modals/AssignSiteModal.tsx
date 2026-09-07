import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { api } from "../../../api";
import LeafletMap, {
  LeafMarker,
  LeafPolyline,
  LeafPolygon,
  LeafletMapHandle,
} from "../../../LeafletMap";
import { C, T, SEVERITY_BAR, SEVERITY_COLORS } from "../../../theme";
import {
  AppBar,
  Button,
  Card,
  Chip,
  Err,
  Field,
  Loading,
  PillButton,
  Screen,
  SectionTitle,
  StatusChip,
  Stepper,
} from "../../../components";
import type {
  Allocation,
  CenterRow,
  CoordinatorRow,
  Damage,
  Depot,
  DispatchRow,
  ReportRow,
  Site,
} from "../../../types";
import {
  FLAG_API,
  FLAG_LABELS,
  FLAG_TYPES,
  NEED_API,
  NEED_LABELS,
  NEED_TYPES,
  SEV_API,
  SEVERITIES,
} from "../../../utils/constants";

export function AssignSiteModal({
  centerId,
  currentUserId,
  site,
  onBack,
}: {
  centerId: number;
  currentUserId: number;
  site: Site;
  onBack: () => void;
}) {
  const [coordinators, setCoordinators] = useState<CoordinatorRow[] | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    api<CoordinatorRow[]>(
      `/dispatch/available-coordinators?center_id=${centerId}`,
    )
      .then((list) =>
        setCoordinators(
          list.filter((u) => u.is_active && u.user_id !== currentUserId),
        ),
      )
      .catch((e) => {
        setErr(e.message);
        setCoordinators([]);
      });
  }, [centerId]);

  const assign = async (coordinatorId: number) => {
    setErr(null);
    setBusyId(coordinatorId);
    try {
      const res = await api<any>(`/sites/${site.id}/assign`, {
        method: "POST",
        body: { coordinator_id: coordinatorId },
      });
      setResult(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const assigned = coordinators?.find((u) => u.user_id === busyId);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        <SectionTitle
          title="Assign Coordinator"
          sub="Choose an available coordinator to respond to this flood-affected region."
        />

        <Card barColor={SEVERITY_BAR[site.severity ?? "low"] ?? C.primary}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>
              {site.location_name}
            </Text>
            {site.severity && (
              <StatusChip
                label={site.severity.toUpperCase()}
                tone={
                  site.severity === "critical"
                    ? "critical"
                    : site.severity === "high"
                      ? "warning"
                      : "info"
                }
              />
            )}
          </View>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>
            Est. Pop ~{site.estimated_population}
            {(site.needs ?? []).length > 0
              ? ` · Needs: ${site.needs.join(", ")}`
              : ""}
          </Text>
        </Card>

        <Err msg={err} />

        {result ? (
          <Card barColor={C.tertiary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>
              ✓ Coordinator assigned
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}
            >
              Dispatch #{result.dispatch_id} is created with a damage-aware
              route to {site.location_name}. ETA {result.eta_minutes} min ·{" "}
              {Number(result.distance_km).toFixed(1)} km.
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}
            >
              The coordinator's status is now{" "}
              <Text style={{ fontWeight: "700" }}>On Route</Text> and they can
              open the Active Route screen to navigate.
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
                <Text
                  style={[
                    T.bodyMd,
                    {
                      color: C.onSurfaceVariant,
                      textAlign: "center",
                      padding: 12,
                    },
                  ]}
                >
                  No other coordinators are registered in this center yet.
                </Text>
              </Card>
            )}
            {coordinators?.map((u) => (
              <Card key={u.user_id}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: C.surfaceHigh,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ color: C.primary, fontSize: 18 }}>
                      {"👤"}
                    </Text>
                  </View>
                  <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>
                    {u.username}
                  </Text>
                </View>
                <View style={{ marginTop: 10 }}>
                  <Button
                    title={
                      busyId === u.user_id
                        ? "Assigning…"
                        : `Assign to ${site.location_name}`
                    }
                    kind="primary"
                    icon="➤"
                    disabled={busyId !== null}
                    onPress={() => assign(u.user_id)}
                  />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
