import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { api } from "../../api";
import { C, T, RADIUS } from "../../theme";
import {
  Button,
  Card,
  Err,
  Field,
  SearchBox,
  SectionTitle,
} from "../../components";
import type { Center, Depot } from "../../types";
import {
  checkSafeChars,
  checkSafeResourceChars,
  sanitizeNameInput,
  sanitizeResourceInput,
} from "../../utils/sanitize";

/* ─── validation helpers ─────────────────────────────────────────────────── */

function validateDepotName(v: string): string | null {
  const t = v.trim();
  if (!t) return "Depot name is required";
  if (t.length < 2) return "Must be at least 2 characters";
  return checkSafeChars(t);
}

function validateLat(v: string): string | null {
  if (!v.trim()) return "Required";
  const n = parseFloat(v);
  if (isNaN(n)) return "Must be a number";
  if (n < -90 || n > 90) return "−90 to 90";
  return null;
}

function validateLng(v: string): string | null {
  if (!v.trim()) return "Required";
  const n = parseFloat(v);
  if (isNaN(n)) return "Must be a number";
  if (n < -180 || n > 180) return "−180 to 180";
  return null;
}

function validateResType(v: string): string | null {
  if (!v.trim()) return "Resource type is required";
  return checkSafeResourceChars(v);
}

function validateDelta(v: string): string | null {
  if (!v.trim()) return "Quantity is required";
  const n = parseInt(v, 10);
  if (isNaN(n) || n <= 0) return "Must be a positive whole number";
  return null;
}

/* ─── inline error label ─────────────────────────────────────────────────── */

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <Text style={s.fieldError}>⚠ {msg}</Text>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CentersPage
   ═══════════════════════════════════════════════════════════════════════════ */

export function CentersPage({
  centers,
  key2,
  refresh,
  go,
}: {
  centers: Center[];
  key2: number;
  refresh: () => void;
  go: (v: { name: "addCenter" | "addCoordinator" }) => void;
}) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = centers.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={16}
      >
        <SectionTitle
          title="Manage Centers"
          sub="View and manage operational relief centers."
        />

        <SearchBox
          value={search}
          onChangeText={setSearch}
          placeholder="Search by Name or Unique Code.."
        />

        {filtered.map((c) => (
          <Card
            key={c.id}
            barColor={C.primary}
            onPress={() => setOpenId(openId === c.id ? null : c.id)}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>
                {c.name}
              </Text>
              <Text style={{ color: C.outline, fontSize: 18 }}>
                {openId === c.id ? "▾" : "›"}
              </Text>
            </View>
            <Text
              style={[T.labelSm, { color: C.onSurfaceVariant, marginTop: 2 }]}
            >
              CODE: {c.code}
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 6 }]}
            >
              {"◎"} {c.region ?? "Region not set"}
            </Text>
            {openId === c.id && <CenterDepots centerId={c.id} key2={key2} />}
          </Card>
        ))}
        {filtered.length === 0 && (
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
            No centers found.
          </Text>
        )}
      </KeyboardAwareScrollView>

      {/* Anchored action bar */}
      <View style={cs.actionBar}>
        <Pressable
          style={({ pressed }) => [cs.actionBtn, pressed && { opacity: 0.85 }]}
          onPress={() => go({ name: "addCenter" })}
          accessibilityRole="button"
        >
          <Text style={cs.actionBtnIcon}>＋</Text>
          <Text style={cs.actionBtnLabel}>Add New Center</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DepotInventoryForm
   Slides open below a depot card when that depot is tapped.
   ═══════════════════════════════════════════════════════════════════════════ */

function DepotInventoryForm({
  depotId,
  onDone,
}: {
  depotId: number;
  onDone: () => void; // called after a successful adjust so parent reloads
}) {
  const [resType, setResType] = useState("");
  const [delta, setDelta] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deltaRef = useRef<TextInput>(null);

  const resTypeErr = submitted ? validateResType(resType) : null;
  const deltaErr = submitted ? validateDelta(delta) : null;
  const isValid = !validateResType(resType) && !validateDelta(delta);

  const adjust = async (sign: 1 | -1) => {
    setSubmitted(true);
    if (!isValid) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/depots/${depotId}/inventory`, {
        method: "PATCH",
        body: {
          resource_type: resType.trim(),
          quantity_delta: sign * parseInt(delta, 10),
        },
      });
      setResType("");
      setDelta("");
      setSubmitted(false);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.invPanel}>
      {/* header row */}
      <View style={s.invPanelHeader}>
        <Text style={[T.labelLg, { color: C.primary, flex: 1 }]}>
          📦 Manage Inventory
        </Text>
        <Pressable onPress={() => {}} hitSlop={8}>
          {/* tapping the depot card again collapses it; this label is just a hint */}
          <Text style={[T.labelSm, { color: C.outline }]}>
            tap depot to close
          </Text>
        </Pressable>
      </View>

      <Err msg={err} />

      <Field
        label="Resource Type *"
        value={resType}
        onChangeText={(t) => {
          setResType(sanitizeResourceInput(t));
          setErr(null);
        }}
        placeholder="e.g. food, water, medicine"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={() => deltaRef.current?.focus()}
        blurOnSubmit={false}
        hasError={!!resTypeErr}
        editable={!busy}
      />
      <FieldError msg={resTypeErr} />

      <Field
        label="Quantity *"
        value={delta}
        onChangeText={(t) => {
          setDelta(t);
          setErr(null);
        }}
        placeholder="e.g. 100"
        keyboardType="decimal-pad"
        returnKeyType="done"
        inputRef={deltaRef}
        hasError={!!deltaErr}
        editable={!busy}
      />
      <FieldError msg={deltaErr} />

      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Button
            title={busy ? "Saving…" : "Add Stock"}
            onPress={() => adjust(1)}
            kind="tertiary"
            disabled={busy}
            icon="＋"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={busy ? "Saving…" : "Remove Stock"}
            onPress={() => adjust(-1)}
            kind="critical"
            disabled={busy}
            icon="−"
          />
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CenterDepots
   ═══════════════════════════════════════════════════════════════════════════ */

function CenterDepots({ centerId, key2 }: { centerId: number; key2: number }) {
  const [depots, setDepots] = useState<Depot[]>([]);

  /* which depot's inventory panel is open */
  const [openDepotId, setOpenDepotId] = useState<number | null>(null);

  /* depot creation form */
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [depotSubmitted, setDepotSubmitted] = useState(false);
  const [depotBusy, setDepotBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* field refs */
  const latRef = useRef<TextInput>(null);
  const lngRef = useRef<TextInput>(null);

  const load = useCallback(() => {
    api<Depot[]>(`/depots?center_id=${centerId}`)
      .then(setDepots)
      .catch((e) => setErr(e.message));
  }, [centerId]);
  useEffect(load, [load, key2]);

  /* depot form validation */
  const nameErr = depotSubmitted ? validateDepotName(name) : null;
  const latErr = depotSubmitted ? validateLat(lat) : null;
  const lngErr = depotSubmitted ? validateLng(lng) : null;
  const depotIsValid =
    !validateDepotName(name) && !validateLat(lat) && !validateLng(lng);

  const createDepot = async () => {
    setDepotSubmitted(true);
    if (!depotIsValid) return;
    setDepotBusy(true);
    setErr(null);
    try {
      await api("/depots", {
        method: "POST",
        body: {
          center_id: centerId,
          name: name.trim(),
          lat: parseFloat(lat),
          lng: parseFloat(lng),
        },
      });
      setName("");
      setLat("");
      setLng("");
      setDepotSubmitted(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDepotBusy(false);
    }
  };

  return (
    <View
      style={{
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: C.surfaceVariant,
        paddingTop: 12,
      }}
    >
      <Err msg={err} />

      {/* ── Depot list — each tappable to expand inventory form ────────── */}
      {depots.length > 0 && (
        <Text
          style={[T.labelLg, { color: C.onSurfaceVariant, marginBottom: 6 }]}
        >
          Tap a depot to manage its inventory
        </Text>
      )}

      {depots.map((d) => {
        const isOpen = openDepotId === d.id;
        return (
          <View key={d.id} style={s.depotBlock}>
            {/* ── Depot header row ─────────────────────────────────────── */}
            <Pressable
              onPress={() => setOpenDepotId(isOpen ? null : d.id)}
              style={({ pressed }) => [
                s.depotRow,
                isOpen && s.depotRowOpen,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[T.titleLg, { color: C.onSurface }]}>
                  {d.name}
                </Text>
                <View style={s.stockRow}>
                  {d.inventory.length === 0 ? (
                    <Text style={[T.labelSm, { color: C.onSurfaceVariant }]}>
                      No stock yet
                    </Text>
                  ) : (
                    d.inventory.map((i) => (
                      <View key={i.resource_type} style={s.stockChip}>
                        <Text style={s.stockChipText}>
                          {i.resource_type}: {i.quantity}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
              <View style={[s.expandIcon, isOpen && s.expandIconOpen]}>
                <Text style={s.expandIconText}>{isOpen ? "▾" : "›"}</Text>
              </View>
            </Pressable>

            {/* ── Inventory form — slides in below when open ───────────── */}
            {isOpen && (
              <DepotInventoryForm
                depotId={d.id}
                onDone={() => {
                  load();
                  // keep panel open so user can do multiple adjustments
                }}
              />
            )}
          </View>
        );
      })}

      {depots.length === 0 && (
        <Text
          style={[T.bodyMd, { color: C.onSurfaceVariant, marginBottom: 8 }]}
        >
          No depots yet. Create one below.
        </Text>
      )}

      {/* ════════════════════════════════════════════════════════════════
          New Depot Form
          ════════════════════════════════════════════════════════════════ */}
      <View style={s.newDepotSection}>
        <Text style={[T.titleLg, { color: C.onSurface, marginBottom: 8 }]}>
          ＋ New Depot
        </Text>

        <Field
          label="Depot Name *"
          value={name}
          onChangeText={(t) => {
            setName(sanitizeNameInput(t));
            setErr(null);
          }}
          placeholder="e.g. North Warehouse"
          returnKeyType="next"
          onSubmitEditing={() => latRef.current?.focus()}
          blurOnSubmit={false}
          hasError={!!nameErr}
          editable={!depotBusy}
        />
        <FieldError msg={nameErr} />

        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Field
              label="Latitude *"
              value={lat}
              onChangeText={(t) => {
                setLat(t);
                setErr(null);
              }}
              placeholder="e.g. 29.6410"
              keyboardType="decimal-pad"
              returnKeyType="next"
              onSubmitEditing={() => lngRef.current?.focus()}
              blurOnSubmit={false}
              inputRef={latRef}
              hasError={!!latErr}
              editable={!depotBusy}
            />
            <FieldError msg={latErr} />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Longitude *"
              value={lng}
              onChangeText={(t) => {
                setLng(t);
                setErr(null);
              }}
              placeholder="e.g. 70.4574"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={createDepot}
              inputRef={lngRef}
              hasError={!!lngErr}
              editable={!depotBusy}
            />
            <FieldError msg={lngErr} />
          </View>
        </View>

        <Button
          title={depotBusy ? "Creating…" : "Create Depot"}
          onPress={createDepot}
          kind="outlined"
          disabled={depotBusy}
          icon="＋"
        />
      </View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  fieldError: {
    color: C.error,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 2,
  },

  /* depot accordion row */
  depotBlock: {
    marginBottom: 8,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.outlineVariant,
  },
  depotRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surfaceLow,
  },
  depotRowOpen: {
    backgroundColor: C.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: C.outlineVariant,
  },
  stockRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 4,
  },
  stockChip: {
    backgroundColor: C.surfaceVariant,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stockChipText: {
    fontSize: 11,
    color: C.onSurfaceVariant,
  },
  expandIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  expandIconOpen: {
    backgroundColor: C.primaryContainer,
  },
  expandIconText: {
    fontSize: 14,
    color: C.onSurface,
  },

  /* inventory panel (slides in below depot row) */
  invPanel: {
    backgroundColor: C.surfaceLowest,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  invPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  /* new depot section separator */
  newDepotSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.outlineVariant,
  },
});

/* ---------------- Accounts tab ---------------- */
import { cs } from "./adminStyles";
