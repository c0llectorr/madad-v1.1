import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../api";
import LeafletMap, { LeafMarker, LeafPolygon } from "../../LeafletMap";
import { C, T } from "../../theme";
import {
  Button,
  Card,
  Chip,
  Err,
  Fab,
  Field,
  Loading,
  PillButton,
  Screen,
  SearchBox,
  SectionTitle,
  StatusChip,
} from "../../components";
import { FilterChips } from "../../components/FilterChips";
import type { Center, Coordinator, Depot } from "../../types";
import { convexHull } from "../../utils/geo";

export function AccountsPage({
  key2,
  refresh,
  go,
}: {
  key2: number;
  refresh: () => void;
  go: (v: { name: "addCenter" | "addCoordinator" }) => void;
}) {
  const [list, setList] = useState<Coordinator[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [centerFilter, setCenterFilter] = useState<number | "all">("all");

  useEffect(() => {
    api<Coordinator[]>("/accounts/coordinators")
      .then(setList)
      .catch((e) => setErr(e.message));
    api<Center[]>("/centers")
      .then(setCenters)
      .catch(() => {});
  }, [key2]);

  const reactivate = async (id: number) => {
    setErr(null);
    try {
      await api(`/accounts/coordinators/${id}/reactivate`, { method: "PATCH" });
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const deactivate = async (id: number) => {
    setErr(null);
    try {
      await api(`/accounts/coordinators/${id}/deactivate`, { method: "PATCH" });
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const centerOf = (id: number | null) => centers.find((c) => c.id === id);
  const filtered = list.filter((u) => {
    if (centerFilter !== "all" && u.center_id !== centerFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const cn = centerOf(u.center_id);
    return (
      u.username.toLowerCase().includes(q) ||
      String(u.user_id) === q ||
      (cn &&
        (cn.name.toLowerCase().includes(q) ||
          cn.code.toLowerCase().includes(q)))
    );
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
      >
        <SectionTitle
          title="Manage Personnel"
          sub="Operational accounts assigned to support centers."
        />
        <Err msg={err} />

        <View style={cs.searchWrap}>
          <Text style={{ color: C.outline, marginRight: 8 }}>{"🔍"}</Text>
          <TextInput
            style={{
              flex: 1,
              color: C.onSurface,
              fontSize: 16,
              paddingVertical: 8,
            }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, ID, or center…"
            placeholderTextColor={C.outline}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <PillButton
            title="All Centers"
            kind={centerFilter === "all" ? "primary" : "outlined"}
            onPress={() => setCenterFilter("all")}
          />
          {centers.map((c) => (
            <PillButton
              key={c.id}
              title={c.code}
              kind={centerFilter === c.id ? "primary" : "outlined"}
              onPress={() => setCenterFilter(c.id)}
            />
          ))}
        </View>

        <Text
          style={[T.labelSm, { color: C.onSurfaceVariant, marginBottom: 8 }]}
        >
          Showing {filtered.length} of {list.length} coordinators
        </Text>

        {filtered.map((u) => {
          return (
            <Card
              key={u.user_id}
              barColor={u.is_active ? C.primary : C.warning}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={cs.avatar}>
                  <Text style={{ color: C.primary, fontSize: 20 }}>{"👤"}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[T.titleLg, { color: C.onSurface }]}>
                    {u.username}
                  </Text>
                  <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                    {u.role === "driver" ? "🚚 Driver" : "🧭 Coordinator"} · ID:{" "}
                    {u.user_id}
                    {u.depot_name ? ` · 🏬 ${u.depot_name}` : ""}
                  </Text>
                </View>
                <StatusChip
                  label={u.is_active ? "Active" : "Deactivated"}
                  tone={u.is_active ? "ok" : "warning"}
                />
              </View>
              {(() => {
                const cn = centerOf(u.center_id);
                return cn ? (
                  <Text
                    style={[
                      T.labelSm,
                      { color: C.onSurfaceVariant, marginTop: 4 },
                    ]}
                  >
                    ◎ {cn.name} ({cn.code}) · {cn.region}
                  </Text>
                ) : null;
              })()}
              <View style={{ marginTop: 12 }}>
                {u.is_active ? (
                  <Button
                    title="Deactivate"
                    onPress={() => deactivate(u.user_id)}
                    kind="critical"
                    icon="🗑"
                  />
                ) : (
                  <Button
                    title="Reactivate"
                    onPress={() => reactivate(u.user_id)}
                    kind="tertiary"
                  />
                )}
              </View>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
            No coordinators match your search.
          </Text>
        )}
      </ScrollView>

      {/* Anchored action bar */}
      <View style={cs.actionBar}>
        <Pressable
          style={({ pressed }) => [cs.actionBtn, pressed && { opacity: 0.85 }]}
          onPress={() => go({ name: "addCoordinator" })}
          accessibilityRole="button"
        >
          <Text style={cs.actionBtnIcon}>＋</Text>
          <Text style={cs.actionBtnLabel}>Add Coordinator</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- Settings tab ---------------- */
import { cs } from "./adminStyles";
