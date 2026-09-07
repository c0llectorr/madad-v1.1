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
import { C, T, RADIUS, SEVERITY_BAR, SEVERITY_COLORS } from "../../../theme";
import {
  AppBar,
  Button,
  Card,
  Chip,
  Err,
  Fab,
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
import { convexHull, nearestDepot } from "../../../utils/geo";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export function PlaceSearch({
  onSelect,
}: {
  onSelect: (lat: number, lng: number, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchErr(null);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(text.trim())}` +
        `&format=json&limit=5&addressdetails=0&countrycodes=pk`;
      const res = await fetch(url, {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "MADAD-FloodResponse/1.0",
        },
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data: NominatimResult[] = await res.json();
      setResults(data);
      if (data.length === 0)
        setSearchErr("No places found. Try a different name.");
    } catch (e: any) {
      setSearchErr("Search unavailable — check your connection.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setResults([]);
    setSearchErr(null);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (text.trim().length >= 3) {
      debounceTimer.current = setTimeout(() => search(text), 600);
    }
  };

  const pick = (r: NominatimResult) => {
    onSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    setQuery(r.display_name.split(",")[0]); // show short name in input
    setResults([]);
  };

  return (
    <View style={ps.wrap}>
      <View style={ps.inputRow}>
        <Text style={ps.icon}>🔍</Text>
        <TextInput
          style={ps.input}
          value={query}
          onChangeText={handleChange}
          placeholder="Search road, area or landmark…"
          placeholderTextColor={C.outline}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => search(query)}
          clearButtonMode="while-editing"
        />
        {searching && (
          <ActivityIndicator
            size="small"
            color={C.primary}
            style={{ marginLeft: 8 }}
          />
        )}
      </View>

      {searchErr && <Text style={ps.noResult}>{searchErr}</Text>}

      {results.length > 0 && (
        <View style={ps.dropdown}>
          {results.map((r, i) => (
            <Pressable
              key={r.place_id}
              onPress={() => pick(r)}
              style={({ pressed }) => [
                ps.resultRow,
                i < results.length - 1 && ps.resultBorder,
                pressed && { backgroundColor: C.surfaceHigh },
              ]}
            >
              <Text style={ps.resultText} numberOfLines={2}>
                {r.display_name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { marginTop: 12, marginBottom: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceLowest,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  icon: { fontSize: 15, marginRight: 8, color: C.onSurfaceVariant },
  input: { flex: 1, color: C.onSurface, fontSize: 15, paddingVertical: 10 },
  noResult: {
    ...T.labelSm,
    color: C.onSurfaceVariant,
    marginTop: 6,
    marginLeft: 4,
  },
  dropdown: {
    backgroundColor: C.surfaceLowest,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    borderRadius: RADIUS.md,
    marginTop: 4,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  resultRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surfaceLowest,
  },
  resultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceVariant,
  },
  resultText: {
    ...T.bodyMd,
    color: C.onSurface,
  },
});

/* ================= FLOOD ZONE ANALYSIS ================= */
/** Convex hull (Andrew monotone chain) over affected-site coordinates — the
 *  shaded region visualizes the flood's current extent and spread direction. */
