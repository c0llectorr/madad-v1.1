import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../api";
import { Button, Card, Chip, Err, AppBar, Stepper } from "../../../components";
import { C, T } from "../../../theme";
import { nearestDepot } from "../../../utils/geo";
import type { Depot, PlanT } from "../../../types";

/** Editable AI plan (draft-only): adjust quantities within depot stock, then
 *  finalize to unlock driver assignment. */
export default function PlanEditorModal({
  plan,
  centerId,
  onBack,
  onFinalized,
}: {
  plan: PlanT;
  centerId: number;
  onBack: () => void;
  onFinalized: (plan: PlanT) => void;
}) {
  const insets = useSafeAreaInsets();
  const [depots, setDepots] = useState<Depot[]>([]);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(plan.items.map((i) => [i.resource_type, i.quantity])),
  );
  const [extraAdded, setExtraAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ── intercept Android hardware back button ─────────────────────────── */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    api<Depot[]>(`/depots?center_id=${centerId}`)
      .then(setDepots)
      .catch(() => {});
  }, [centerId]);

  const siteLoc = { lat: plan.site_lat ?? 0, lng: plan.site_lng ?? 0 };
  const depot = useMemo(
    () => nearestDepot(siteLoc, depots),
    [depots, plan.site_lat, plan.site_lng],
  );
  const stock = useMemo(
    () =>
      Object.fromEntries(
        (depot?.inventory ?? []).map((i) => [i.resource_type, i.quantity]),
      ),
    [depot],
  );
  const unusedStock = Object.keys(stock).filter(
    (r) => !(r in qty) && (stock[r] ?? 0) > 0,
  );

  const total = Object.values(qty).reduce((a, b) => a + b, 0);

  const saveAndFinalize = async () => {
    setBusy(true);
    setErr(null);
    try {
      const items = Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([resource_type, quantity]) => ({ resource_type, quantity }));
      await api(`/plans/${plan.plan_id}/items`, {
        method: "PATCH",
        body: { items },
      });
      const finalized = await api<PlanT>(`/plans/${plan.plan_id}/finalize`, {
        method: "POST",
      });
      onFinalized(finalized);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* AppBar handles the status-bar safe area and provides the back button */}
      <AppBar
        title={`Plan #${plan.plan_id} — ${plan.site_name}`}
        onBack={onBack}
      />

      {/* Depot context sub-header, safely below the AppBar */}
      {depot && (
        <View style={s.subHeader}>
          <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
            Nearest depot: {depot.name}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom + 16, 40),
        }}
      >
        <Err msg={err} />

        <Card barColor={C.primary}>
          <Text style={[T.labelLg, { color: C.primary }]}>
            🤖 AI {plan.source === "ai" ? "Generated" : "Assisted"} Plan
          </Text>
          {plan.reasoning && (
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}
            >
              {plan.reasoning}
            </Text>
          )}
          <Text
            style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 8 }]}
          >
            Est. population ~{plan.estimated_population} · adjust quantities
            below, then finalize.
          </Text>
        </Card>

        <Card>
          <Text style={[T.titleLg, { color: C.onSurface }]}>
            Resource Allocation
          </Text>
          <Text
            style={[
              T.labelSm,
              { color: C.onSurfaceVariant, marginTop: 2, marginBottom: 10 },
            ]}
          >
            Editable until a driver is assigned
          </Text>
          {Object.entries(qty).map(([type, q]) => (
            <Stepper
              key={type}
              label={`${type}  (stock: ${stock[type] ?? 0})`}
              value={q}
              onChange={(v) => setQty((s) => ({ ...s, [type]: v }))}
            />
          ))}
          {Object.keys(qty).length === 0 && (
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
              No resources in this plan.
            </Text>
          )}

          {!extraAdded && unusedStock.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={[T.labelLg, { color: C.onSurface }]}>
                Add from depot stock:
              </Text>
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}
              >
                {unusedStock.map((r) => (
                  <Chip
                    key={r}
                    label={`＋ ${r} (${stock[r]} in stock)`}
                    color={C.tertiary}
                    onPress={() => {
                      setQty((prev) => ({ ...prev, [r]: 0 }));
                      setExtraAdded(true);
                    }}
                  />
                ))}
              </View>
            </View>
          )}
        </Card>

        <View style={s.summaryRow}>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
            Total units: {total}
          </Text>
        </View>

        <Button
          title={busy ? "Finalizing…" : "Finalize Plan & Assign Driver"}
          onPress={saveAndFinalize}
          icon="➤"
          disabled={busy || total === 0}
        />
        <Button title="Back" kind="outlined" onPress={onBack} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: C.surfaceLow,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  summaryRow: {
    alignItems: "flex-end",
    marginBottom: 8,
  },
});
