import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, RADIUS, T } from '../theme';

export function Loading() {
  return <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={C.primary} /></View>;
}

export function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <View style={{ backgroundColor: C.errorContainer, borderRadius: RADIUS.md, padding: 12, marginBottom: 12 }}>
      <Text style={[T.labelLg, { color: C.onErrorContainer }]}>{msg}</Text>
    </View>
  );
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[T.headlineMd, { color: C.onSurface }]}>{title}</Text>
      {sub ? <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 4 }]}>{sub}</Text> : null}
    </View>
  );
}

/* ---------- Notifications modal ---------- */
export interface NotificationItem { id: string | number; title: string; body: string; time?: string }

export function NotificationsModal({ visible, items, onClose }: {
  visible: boolean;
  items: NotificationItem[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={nm.backdrop} onPress={onClose} />
      <View style={nm.sheet}>
        <View style={nm.handle} />
        <View style={nm.header}>
          <Text style={[T.titleLg, { color: C.onSurface, flex: 1 }]}>Notifications</Text>
          <Pressable onPress={onClose} hitSlop={12} style={nm.closeBtn}>
            <Text style={{ fontSize: 18, color: C.onSurfaceVariant }}>{'✕'}</Text>
          </Pressable>
        </View>
        {items.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>{'🔔'}</Text>
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>No new notifications</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {items.map(n => (
              <View key={n.id} style={nm.item}>
                <View style={nm.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={[T.labelLg, { color: C.onSurface }]}>{n.title}</Text>
                  <Text style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 2 }]}>{n.body}</Text>
                  {n.time ? <Text style={[T.labelSm, { color: C.outline, marginTop: 4 }]}>{n.time}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const nm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '65%', paddingHorizontal: 16, paddingBottom: 8,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant,
    alignSelf: 'center', marginVertical: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  item: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.surfaceVariant,
    gap: 12,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary,
    marginTop: 6, flexShrink: 0,
  },
});
