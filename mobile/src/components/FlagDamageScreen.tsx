import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { api } from "../api";
import LeafletMap from "../LeafletMap";
import { AppBar, Button, Err, Field } from "./";
import { C, T } from "../theme";
import { checkSafeChars, sanitizeNameInput } from "../utils/sanitize";

type Stage = "locate" | "start" | "end" | "confirm" | "saving";

/** Shared full-screen damage-flagging flow — identical for coordinator and driver.
 *  Tap the START of the damaged section, then the END. The segment is marked
 *  as a red line and sent to the backend to exclude those edges from routing. */
export default function FlagDamageScreen({
  centerId,
  userRole,
  onBack,
}: {
  centerId: number;
  userRole: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>("locate");
  const [startPt, setStartPt] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [endPt, setEndPt] = useState<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<
    { lat: string; lng: string; label: string }[] | null
  >(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const useGps = async () => {
    setGpsLoading(true);
    setErr(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErr("Location permission denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setStage("start");
    } catch (e: any) {
      setErr(`GPS unavailable: ${e?.message ?? e}`);
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 3) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text.trim())}&format=json&limit=5&countrycodes=pk`;
        const res = await fetch(url, {
          headers: { "User-Agent": "MADAD-FloodResponse/1.0" },
        });
        if (!res.ok) throw new Error("Search unavailable");
        setResults(await res.json());
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
  };
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const handleMapTap = (lat: number, lng: number) => {
    if (stage === "start") {
      setStartPt({ lat, lng });
      setStage("end");
    } else if (stage === "end") {
      setEndPt({ lat, lng });
      setStage("confirm");
    }
  };

  const submit = async () => {
    if (!startPt || !endPt) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/roads/damage", {
        method: "POST",
        body: {
          center_id: centerId,
          lat: startPt.lat,
          lng: startPt.lng,
          end_lat: endPt.lat,
          end_lng: endPt.lng,
          reason: reason || undefined,
        },
      });
      onBack();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Build markers for the current stage
  const markers: {
    id: string;
    lat: number;
    lng: number;
    color: string;
    title: string;
    label?: string;
    icon?: "pin" | "dot";
  }[] = [];
  if (gps)
    markers.push({
      id: "gps",
      lat: gps.lat,
      lng: gps.lng,
      color: C.tertiary,
      title: "You",
      icon: "dot" as const,
    });
  if (startPt)
    markers.push({
      id: "start",
      lat: startPt.lat,
      lng: startPt.lng,
      title: "Start of damage",
      color: C.warning,
      label: "A",
    });
  if (endPt)
    markers.push({
      id: "end",
      lat: endPt.lat,
      lng: endPt.lng,
      title: "End of damage",
      color: C.critical,
      label: "B",
    });
  if (results) {
    results.forEach((r, i) =>
      markers.push({
        id: `sr${i}`,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        title: r.label.split(",")[0],
        color: C.secondary,
      }),
    );
  }

  const stageMsg: Record<Stage, string> = {
    locate: "Search for a location or use your GPS to get started.",
    start: "📍 Tap the map where the damaged section STARTS",
    end: "📍 Now tap the map where the damaged section ENDS",
    confirm: "✅ Damage segment marked. Add a reason and confirm.",
    saving: "Saving…",
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar title="MADAD" onBack={onBack} />
      {/* Map fills the screen */}
      <View style={{ flex: 1, position: "relative" }}>
        <LeafletMap
          markers={markers}
          polylines={
            startPt && endPt
              ? [
                  {
                    id: "damage",
                    color: C.critical,
                    width: 5,
                    coords: [startPt, endPt],
                  },
                ]
              : []
          }
          center={gps ?? startPt ?? { lat: 31.55, lng: 74.35 }}
          zoom={stage === "locate" ? 10 : 14}
          fit={false}
          onMapPress={handleMapTap}
        />
      </View>

      {/* Controls panel below the map */}
      <ScrollView
        style={{ maxHeight: 320 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[T.headlineMd, { color: C.onSurface }]}>
          Flag Damaged Road
        </Text>
        <Text
          style={[
            T.bodyMd,
            {
              color: C.onSurfaceVariant,
              marginTop: 4,
              marginBottom: 12,
            },
          ]}
        >
          {stageMsg[stage]}
        </Text>
        <Err msg={err} />

        {/* Search — always available */}
        {stage === "locate" && (
          <>
            <Field
              label="Search for a location"
              value={searchText}
              onChangeText={handleSearch}
              placeholder="e.g. Shahdara, Kasur, Jampur…"
              icon="🔍"
            />
            {searching && (
              <ActivityIndicator
                color={C.primary}
                style={{ marginBottom: 8 }}
              />
            )}
            {results && results.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                {results.map((r, i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      setGps({
                        lat: parseFloat(r.lat),
                        lng: parseFloat(r.lng),
                      });
                      setStage("start");
                      setResults(null);
                      setSearchText("");
                    }}
                    style={{
                      padding: 12,
                      backgroundColor: C.surfaceLowest,
                      borderRadius: 8,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor: C.outlineVariant,
                    }}
                  >
                    <Text
                      style={{
                        color: C.onSurface,
                        fontSize: 14,
                      }}
                      numberOfLines={1}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {results && results.length === 0 && !searching && (
              <Text
                style={{
                  color: C.onSurfaceVariant,
                  marginBottom: 8,
                }}
              >
                No results found.
              </Text>
            )}
            <Button
              title="Use My Current Location"
              onPress={useGps}
              kind="outlined"
              icon="◎"
              disabled={gpsLoading}
            />
            {gpsLoading && (
              <ActivityIndicator
                color={C.primary}
                style={{ marginBottom: 8 }}
              />
            )}
          </>
        )}

        {(stage === "start" || stage === "end") && (
          <Button
            title="Cancel"
            kind="outlined"
            onPress={() => {
              setStage("locate");
              setStartPt(null);
              setEndPt(null);
            }}
          />
        )}

        {stage === "confirm" && startPt && endPt && (
          <>
            <Field
              label="Damage Reason (optional)"
              value={reason}
              onChangeText={(t) => setReason(sanitizeNameInput(t))}
              placeholder="e.g. Bridge flooded, Road washed out…"
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!busy}
            />
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Button
                  title="Undo"
                  kind="outlined"
                  onPress={() => {
                    setEndPt(null);
                    setStage("end");
                  }}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  title={busy ? "Reporting…" : "Confirm Damage"}
                  kind="critical"
                  onPress={submit}
                  disabled={busy}
                  icon="⚠"
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
