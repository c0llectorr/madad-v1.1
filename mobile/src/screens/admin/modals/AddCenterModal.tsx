import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { api } from "../../../api";
import LeafletMap, { LeafletMapHandle } from "../../../LeafletMap";
import { C, T } from "../../../theme";
import {
  AppBar,
  Button,
  Card,
  Err,
  Field,
  SectionTitle,
} from "../../../components";
import type { Center } from "../../../types";
import { checkSafeChars, sanitizeNameInput } from "../../../utils/sanitize";

/* ─── validation ─────────────────────────────────────────────────────────── */

function validateName(v: string): string | null {
  const t = v.trim();
  if (!t) return "Center name is required";
  if (t.length < 2) return "Must be at least 2 characters";
  if (t.length > 100) return "Too long (max 100 characters)";
  return checkSafeChars(t);
}

function validateCode(v: string): string | null {
  const t = v.trim();
  if (!t) return "Unique code is required";
  if (t.length < 2) return "Must be at least 2 characters";
  if (t.length > 20) return "Too long (max 20 characters)";
  // codes: letters, digits, hyphen only (no spaces/brackets needed)
  if (!/^[A-Z0-9\-]+$/i.test(t))
    return "Only letters, digits and - are allowed";
  return null;
}

function validateRegion(v: string): string | null {
  const t = v.trim();
  if (!t) return null; // optional
  return checkSafeChars(t);
}

function validateLat(v: string): string | null {
  if (!v.trim()) return "Latitude is required";
  const n = parseFloat(v);
  if (isNaN(n)) return "Must be a number";
  if (n < -90 || n > 90) return "Must be between −90 and 90";
  return null;
}

function validateLng(v: string): string | null {
  if (!v.trim()) return "Longitude is required";
  const n = parseFloat(v);
  if (isNaN(n)) return "Must be a number";
  if (n < -180 || n > 180) return "Must be between −180 and 180";
  return null;
}

/* ─── inline error label ─────────────────────────────────────────────────── */

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <Text style={s.fieldError}>⚠ {msg}</Text>;
}

/* ─── component ──────────────────────────────────────────────────────────── */

export function AddCenterModal({
  centers,
  onBack,
}: {
  centers: Center[];
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // show inline errors only after first submit attempt
  const [submitted, setSubmitted] = useState(false);

  // field refs for Next-key chain
  const codeRef = useRef<TextInput>(null);
  const regionRef = useRef<TextInput>(null);
  const latRef = useRef<TextInput>(null);
  const lngRef = useRef<TextInput>(null);

  const mapRef = useRef<LeafletMapHandle>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── fly to coords when both become valid ─────────────────────────── */
  useEffect(() => {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (
      !isNaN(la) &&
      !isNaN(lo) &&
      la >= -90 &&
      la <= 90 &&
      lo >= -180 &&
      lo <= 180
    ) {
      mapRef.current?.flyTo(la, lo, 14);
    }
  }, [lat, lng]);

  /* ── auto-geocode by name/region (debounced 700 ms) ──────────────── */
  useEffect(() => {
    if (geoTimer.current) clearTimeout(geoTimer.current);
    const q = (name + " " + region).trim();
    if (q.length < 3 || (lat && lng)) return;
    geoTimer.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
          {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "MADAD-FloodResponse/1.0",
            },
          },
        );
        const data = await res.json();
        if (data.length > 0) {
          setLat(parseFloat(data[0].lat).toFixed(6));
          setLng(parseFloat(data[0].lon).toFixed(6));
        }
      } catch {
        /* silent */
      } finally {
        setGeocoding(false);
      }
    }, 700);
    return () => {
      if (geoTimer.current) clearTimeout(geoTimer.current);
    };
  }, [name, region]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derived ─────────────────────────────────────────────────────── */
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  const nameErr = submitted ? validateName(name) : null;
  const codeErr = submitted ? validateCode(code) : null;
  const regionErr = submitted ? validateRegion(region) : null;
  const latErr = submitted ? validateLat(lat) : null;
  const lngErr = submitted ? validateLng(lng) : null;

  const isValid =
    !validateName(name) &&
    !validateCode(code) &&
    !validateRegion(region) &&
    !validateLat(lat) &&
    !validateLng(lng);

  /* ── submit ──────────────────────────────────────────────────────── */
  const submit = async () => {
    setSubmitted(true);
    if (!isValid) return;

    setBusy(true);
    setErr(null);
    try {
      await api("/centers", {
        method: "POST",
        body: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          region: region.trim() || null,
          lat: parsedLat,
          lng: parsedLng,
        },
      });
      onBack();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="Add New Center" onBack={onBack} />

      {/* ── Live map preview ─────────────────────────────────────────── */}
      <View style={cs.previewWrap}>
        <LeafletMap
          ref={mapRef}
          height={180}
          markers={
            hasCoords
              ? [
                  {
                    id: "center",
                    lat: parsedLat,
                    lng: parsedLng,
                    title: name || "New center",
                    color: C.primary,
                  },
                ]
              : []
          }
        />
        <View style={cs.previewBadgeWrap} pointerEvents="none">
          <View
            style={[
              cs.previewBadge,
              geocoding && {
                backgroundColor: "rgba(0,80,150,0.7)",
              },
            ]}
          >
            {geocoding ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginRight: 6 }}
              />
            ) : null}
            <Text style={cs.previewBadgeText}>
              {geocoding
                ? "Looking up location…"
                : hasCoords
                  ? `📍 ${name || `${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}`}`
                  : "🗺 Enter name or coordinates below"}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        <SectionTitle
          title="Add New Center"
          sub="Register a new support center. The map updates as you type."
        />

        {/* ── Center Information ──────────────────────────────────────── */}
        <Card barColor={C.primary}>
          <Text style={[T.titleLg, { color: C.onSurface }]}>
            Center Information
          </Text>
          <View style={{ height: 12 }} />

          <Field
            label="Center Name *"
            value={name}
            onChangeText={(t) => {
              setName(sanitizeNameInput(t));
              setErr(null);
            }}
            placeholder="e.g. Jampur Flood Relief Center"
            returnKeyType="next"
            onSubmitEditing={() => codeRef.current?.focus()}
            blurOnSubmit={false}
            hasError={!!nameErr}
            editable={!busy}
          />
          <FieldError msg={nameErr} />

          <Field
            label="Unique Code *"
            value={code}
            onChangeText={(t) => {
              setCode(t);
              setErr(null);
            }}
            placeholder="e.g. C-104"
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmitEditing={() => regionRef.current?.focus()}
            blurOnSubmit={false}
            inputRef={codeRef}
            hasError={!!codeErr}
            editable={!busy}
          />
          <FieldError msg={codeErr} />

          {/* ── Location Details ────────────────────────────────────── */}
          <Text style={[T.titleLg, { color: C.onSurface, marginTop: 8 }]}>
            Location Details
          </Text>
          <View style={{ height: 12 }} />

          <Field
            label="Province / Region"
            value={region}
            onChangeText={(t) => {
              setRegion(sanitizeNameInput(t));
              setErr(null);
            }}
            placeholder="e.g. Punjab"
            returnKeyType="next"
            onSubmitEditing={() => latRef.current?.focus()}
            blurOnSubmit={false}
            inputRef={regionRef}
            hasError={!!regionErr}
            editable={!busy}
          />
          <FieldError msg={regionErr} />

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
                editable={!busy}
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
                onSubmitEditing={submit}
                inputRef={lngRef}
                hasError={!!lngErr}
                editable={!busy}
              />
              <FieldError msg={lngErr} />
            </View>
          </View>

          {hasCoords && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <Text style={[T.labelSm, { color: C.tertiary, flex: 1 }]}>
                ✓ Location set — map updated above
              </Text>
              <Pressable
                onPress={() => {
                  setLat("");
                  setLng("");
                }}
                hitSlop={8}
              >
                <Text style={[T.labelSm, { color: C.outline }]}>Clear</Text>
              </Pressable>
            </View>
          )}
        </Card>

        <Err msg={err} />

        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Button title="Cancel" onPress={onBack} kind="outlined" />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              title={busy ? "Registering…" : "Register Center"}
              onPress={submit}
              icon="＋"
              disabled={busy}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fieldError: {
    color: C.error,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 2,
  },
});

/* ---------------- Add Coordinator screen ---------------- */
import { cs } from "../adminStyles";
