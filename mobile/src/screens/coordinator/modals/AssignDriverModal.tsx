import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../api";
import {
  AppBar,
  Button,
  Card,
  Err,
  Loading,
  SearchBox,
  StatusChip,
} from "../../../components";
import { FilterChips } from "../../../components/FilterChips";
import { C, T } from "../../../theme";
import type { DriverRow, PlanT } from "../../../types";

/** Pick a driver for a finalized plan — filter by depot, search by name. */
export default function AssignDriverModal({
  plan,
  onBack,
  onAssigned,
}: {
  plan: PlanT;
  onBack: () => void;
  onAssigned: (result: {
    dispatch_id: number;
    driver: string;
    depot: string;
  }) => void;
}) {
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [depotFilter, setDepotFilter] = useState<string>("All Depots");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [done, setDone] = useState<{
    dispatch_id: number;
    driver: string;
    depot: string;
  } | null>(null);

  /* ── intercept Android hardware back button ─────────────────────────── */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true; // prevent default (app exit)
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    api<DriverRow[]>(`/drivers?center_id=${plan.center_id}`)
      .then(setDrivers)
      .catch((e) => {
        setErr(e.message);
        setDrivers([]);
      });
  }, [plan.center_id]);

  const depotNames = useMemo(
    () => [
      "All Depots",
      ...Array.from(new Set((drivers ?? []).map((d) => d.depot_name))),
    ],
    [drivers],
  );

  const visible = useMemo(
    () =>
      (drivers ?? []).filter((d) => {
        if (depotFilter !== "All Depots" && d.depot_name !== depotFilter)
          return false;
        if (
          search.trim() &&
          !d.username.toLowerCase().includes(search.trim().toLowerCase())
        )
          return false;
        return true;
      }),
    [drivers, depotFilter, search],
  );

  const assign = async (driverId: number) => {
    setBusyId(driverId);
    setErr(null);
    try {
      const res = await api<any>(`/plans/${plan.plan_id}/assign`, {
        method: "POST",
        body: { driver_id: driverId },
      });
      setDone({
        dispatch_id: res.dispatch_id,
        driver: res.driver,
        depot: res.depot,
      });
      onAssigned(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  /* ── success state ──────────────────────────────────────────────────── */
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <AppBar title="MADAD" onBack={onBack} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card barColor={C.tertiary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>
              ✓ Dispatch #{done.dispatch_id} assigned
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}
            >
              {done.driver} will load the convoy at {done.depot} and drive it to{" "}
              {plan.site_name}. The plan is now locked and the route is live on
              the Map tab.
            </Text>
            <View style={{ marginTop: 12 }}>
              <Button title="Done" kind="tertiary" onPress={onBack} />
            </View>
          </Card>
        </ScrollView>
      </View>
    );
  }

  /* ── main screen ────────────────────────────────────────────────────── */
  const noDriversAtAll = drivers !== null && drivers.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[T.headlineMd, { color: C.onSurface }]}>
          Assign Driver
        </Text>
        <Text
          style={[
            T.bodyMd,
            { color: C.onSurfaceVariant, marginTop: 4, marginBottom: 12 },
          ]}
        >
          Plan #{plan.plan_id} → {plan.site_name}. Filter by depot or search,
          then assign any driver of this center.
        </Text>

        <Err msg={err} />

        {/* ── No drivers registered at all ──────────────────────────── */}
        {noDriversAtAll && (
          <Card barColor={C.warning}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>
              No drivers registered
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}
            >
              There are no driver accounts linked to this center yet. Ask the
              administrator to create driver accounts and assign them to a
              depot.
            </Text>
            <View style={{ marginTop: 12 }}>
              <Button
                title="Go Back"
                kind="outlined"
                onPress={onBack}
                icon="←"
              />
            </View>
          </Card>
        )}

        {/* ── Search + filter (only shown when drivers exist) ───────── */}
        {!noDriversAtAll && (
          <>
            <SearchBox
              value={search}
              onChangeText={setSearch}
              placeholder="Search driver by name…"
            />
            <FilterChips
              options={depotNames.map((d) => ({
                label:
                  d === "All Depots"
                    ? d
                    : d
                        .replace(" Depot", "")
                        .replace(" Warehouse", "")
                        .replace(" Central", ""),
                value: d,
              }))}
              value={depotFilter}
              onChange={setDepotFilter}
            />
          </>
        )}

        {drivers === null && <Loading />}

        {/* ── No results for current filter ─────────────────────────── */}
        {drivers !== null && !noDriversAtAll && visible.length === 0 && (
          <Card>
            <Text
              style={[
                T.bodyMd,
                { color: C.onSurfaceVariant, textAlign: "center", padding: 10 },
              ]}
            >
              No drivers match this filter. Try clearing the search or switching
              depot.
            </Text>
          </Card>
        )}

        {visible.map((d) => (
          <Card key={d.driver_id}>
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
                <Text style={{ fontSize: 18 }}>{"🚚"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>
                  {d.username}
                </Text>
                <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                  🏬 {d.depot_name}
                </Text>
              </View>
              <StatusChip
                label={d.status === "available" ? "AVAILABLE" : "ON ROUTE"}
                tone={d.status === "available" ? "ok" : "warning"}
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <Button
                title={
                  busyId === d.driver_id ? "Assigning…" : "Assign Dispatch"
                }
                kind="primary"
                icon="➤"
                disabled={busyId !== null}
                onPress={() => assign(d.driver_id)}
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const _s = StyleSheet.create({});
