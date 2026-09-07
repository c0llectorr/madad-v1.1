import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../api";
import {
  AppBar,
  BottomNav,
  Button,
  Card,
  Err,
  Loading,
  SectionTitle,
  StatusChip,
} from "../../components";
import { C, T } from "../../theme";
import { ActiveRouteModal } from "../coordinator/modals/ActiveRouteModal";
import FlagDamageScreen from "../../components/FlagDamageScreen";
import type { LoginResponse } from "../../types";

interface DriverDispatch {
  dispatch_id: number;
  status: string;
  site_name: string | null;
  site_lat: number | null;
  site_lng: number | null;
  depot_name: string | null;
  distance_km: number | null;
  eta_minutes: number | null;
  route_geojson: any;
  plan_items: { resource_type: string; quantity: number }[];
  resources_loaded: any[];
}

/** Driver role navigator — tabs: My Dispatches · Map · Profile. */
export default function DriverNavigator({
  session,
  onLogout,
}: {
  session: LoginResponse;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("dispatches");
  const [dispatches, setDispatches] = useState<DriverDispatch[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<DriverDispatch | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [key, setKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    api<DriverDispatch[]>("/drivers/my/dispatches")
      .then(setDispatches)
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load, key]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const setStatus = async (id: number, action: "start" | "complete") => {
    setErr(null);
    try {
      await api(`/drivers/my/dispatches/${id}/${action}`, { method: "POST" });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  if (flagging) {
    return (
      <FlagDamageScreen
        centerId={1}
        userRole="driver"
        onBack={() => {
          setFlagging(false);
          load();
        }}
      />
    );
  }
  if (active) {
    return (
      <ActiveRouteModal
        centerId={-1}
        dispatchRow={{
          dispatch_id: active.dispatch_id,
          site_id: -1,
          depot_id: -1,
          status: active.status,
          distance_km: active.distance_km,
          eta_minutes: active.eta_minutes,
          route_geojson: active.route_geojson,
          resources_loaded: active.resources_loaded,
        }}
        sites={[
          {
            id: -1,
            location_name: active.site_name ?? "Destination",
            lat: active.site_lat ?? 0,
            lng: active.site_lng ?? 0,
            estimated_population: 0,
            needs: [],
            urgency_flags: [],
            severity: null,
            confidence: "",
            priority_score: null,
            status: "",
          },
        ]}
        onBack={() => {
          setActive(null);
          load();
        }}
      />
    );
  }

  const activeDispatches = (dispatches ?? []).filter(
    (d) => d.status !== "delivered",
  );
  const delivered = (dispatches ?? []).filter((d) => d.status === "delivered");

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar
        title="MADAD"
        right={
          <Pressable onPress={onLogout} hitSlop={8} style={{ padding: 6 }}>
            <Text style={[T.labelLg, { color: C.primary }]}>Logout</Text>
          </Pressable>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              load();
              setRefreshing(false);
            }}
          />
        }
      >
        <SectionTitle
          title={tab === "dispatches" ? "My Dispatches" : "Profile"}
        />
        <Err msg={err} />

        {tab === "dispatches" && (
          <>
            {dispatches === null && <Loading />}
            {activeDispatches.length === 0 &&
              delivered.length === 0 &&
              dispatches !== null && (
                <Card>
                  <Text
                    style={[
                      T.bodyMd,
                      {
                        color: C.onSurfaceVariant,
                        textAlign: "center",
                        padding: 10,
                      },
                    ]}
                  >
                    No dispatches assigned yet — your coordinator will assign
                    one shortly.
                  </Text>
                </Card>
              )}
            {activeDispatches.map((d) => (
              <Card key={d.dispatch_id} barColor={C.primary}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>
                    {d.site_name}
                  </Text>
                  <StatusChip
                    label={d.status.replace("_", " ").toUpperCase()}
                    tone={d.status === "en_route" ? "info" : "warning"}
                  />
                </View>
                <Text
                  style={[
                    T.bodyMd,
                    { color: C.onSurfaceVariant, marginTop: 4 },
                  ]}
                >
                  From {d.depot_name} ·{" "}
                  {d.distance_km != null
                    ? `${d.distance_km.toFixed(1)} km`
                    : "—"}{" "}
                  · ETA {d.eta_minutes ?? "—"} min
                </Text>

                {/* Truck loading checklist from the plan */}
                {d.plan_items.length > 0 && (
                  <View
                    style={{
                      marginTop: 10,
                      backgroundColor: C.surfaceLow,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={[T.labelLg, { color: C.onSurface }]}>
                      Load checklist
                    </Text>
                    {d.plan_items.map((i) => {
                      const done =
                        loaded[`${d.dispatch_id}:${i.resource_type}`];
                      return (
                        <Pressable
                          key={i.resource_type}
                          onPress={() =>
                            setLoaded((s) => ({
                              ...s,
                              [`${d.dispatch_id}:${i.resource_type}`]: !done,
                            }))
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: done ? C.tertiary : C.onSurfaceVariant,
                              marginRight: 8,
                            }}
                          >
                            {done ? "☑" : "▢"}
                          </Text>
                          <Text
                            style={[
                              T.bodyMd,
                              { color: done ? C.tertiary : C.onSurfaceVariant },
                            ]}
                          >
                            {i.resource_type} × {i.quantity}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  {d.status === "planned" && (
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Start Journey"
                        kind="primary"
                        icon="➤"
                        onPress={() => setStatus(d.dispatch_id, "start")}
                      />
                    </View>
                  )}
                  {d.status === "en_route" && (
                    <>
                      <View style={{ flex: 1, marginRight: 6 }}>
                        <Button
                          title="Open Route"
                          kind="primary"
                          icon="🗺"
                          onPress={() => setActive(d)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Delivered"
                          kind="tertiary"
                          onPress={() => setStatus(d.dispatch_id, "complete")}
                        />
                      </View>
                    </>
                  )}
                  {d.status === "en_route" && (
                    <View style={{ marginTop: 6 }}>
                      <Button
                        title="Flag Road Damage"
                        kind="critical"
                        icon="⚠"
                        onPress={() => setFlagging(true)}
                      />
                    </View>
                  )}
                </View>
              </Card>
            ))}

            {delivered.length > 0 && (
              <>
                <View style={{ height: 10 }} />
                <Text
                  style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}
                >
                  Completed
                </Text>
                {delivered.map((d) => (
                  <Card key={d.dispatch_id} barColor={C.tertiary}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={[T.titleLg, { color: C.onSurface, flex: 1 }]}
                      >
                        {d.site_name}
                      </Text>
                      <StatusChip label="DELIVERED" tone="ok" />
                    </View>
                    <Text
                      style={[
                        T.bodyMd,
                        { color: C.onSurfaceVariant, marginTop: 4 },
                      ]}
                    >
                      From {d.depot_name}
                    </Text>
                  </Card>
                ))}
              </>
            )}
          </>
        )}

        {tab === "profile" && (
          <Card barColor={C.secondary}>
            <Text style={[T.titleLg, { color: C.onSurface }]}>
              {session.username}
            </Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
              Truck Driver
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Driver bottom nav — shared component, proper 48dp targets */}
      <BottomNav
        tabs={[
          { key: "dispatches", label: "Dispatches", icon: "🚚" },
          { key: "profile", label: "Profile", icon: "👤" },
        ]}
        active={tab}
        onChange={setTab}
      />
    </View>
  );
}

const s = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    backgroundColor: C.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
    paddingTop: 10,
    paddingBottom: 14,
  },
});
