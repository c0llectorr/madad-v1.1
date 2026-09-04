import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api';
import LeafletMap, { LeafMarker, LeafPolygon } from '../../LeafletMap';
import { C, T } from '../../theme';
import { Button, Card, Chip, Err, Fab, Field, Loading, PillButton, Screen, SearchBox, SectionTitle, StatusChip } from '../../components';
import { FilterChips } from '../../components/FilterChips';
import type { Center, Coordinator, Depot, LoginResponse } from '../../types';
import { convexHull } from '../../utils/geo';

export function SettingsPage({ session, onLogout }: { session: LoginResponse; onLogout: () => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <SectionTitle title="Settings" />
      <Card barColor={C.secondary}>
        <Text style={[T.titleLg, { color: C.onSurface }]}>Signed in as {session.user_id}</Text>
        <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>Role: {session.role}</Text>
      </Card>
      <Button title="Logout" onPress={onLogout} kind="critical" />
    </ScrollView>
  );
}

/* ---------------- Add Center screen ---------------- */
import { cs } from './adminStyles';

