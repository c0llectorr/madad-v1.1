import React from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable, Text, TextInput, TouchableOpacity, View,
  StyleSheet, ScrollView, StatusBar, TextInputProps,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, RADIUS, T } from './theme';

/* ---------- Buttons ---------- */
export function Button({ title, onPress, kind = 'primary', disabled, icon }: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'outlined' | 'critical' | 'tertiary' | 'text';
  disabled?: boolean;
  icon?: string;
}) {
  const styles: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.primary, fg: C.onPrimary },
    outlined: { bg: 'transparent', fg: C.primary, border: C.outlineVariant },
    critical: { bg: C.critical, fg: C.onPrimary },
    tertiary: { bg: C.tertiary, fg: C.onTertiary },
    text: { bg: 'transparent', fg: C.primary },
  };
  const v = styles[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, { backgroundColor: v.bg },
        v.border && { borderWidth: 1, borderColor: v.border },
        pressed && { opacity: 0.85 }, disabled && { opacity: 0.45 }]}>
      {icon ? <Text style={[s.btnIcon, { color: v.fg }]}>{icon} </Text> : null}
      <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

export function PillButton({ title, onPress, kind = 'outlined', icon }: {
  title: string; onPress: () => void; kind?: 'outlined' | 'primary'; icon?: string;
}) {
  const filled = kind === 'primary';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      s.pill, { backgroundColor: filled ? C.primary : C.surfaceLowest },
      !filled && { borderWidth: 1, borderColor: C.outlineVariant },
      pressed && { opacity: 0.85 }]}>
      {icon ? <Text style={{ color: filled ? C.onPrimary : C.primary, fontSize: 16 }}>{icon} </Text> : null}
      <Text style={[T.labelLg, { color: filled ? C.onPrimary : C.primary }]}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Inputs ---------- */
export interface FieldProps {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'phone-pad';
  multiline?: boolean;
  icon?: string;
  secure?: boolean;
  /** Disables auto-capitalisation. Defaults to 'sentences'; pass 'none' for usernames/codes. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  editable?: boolean;
  /** Forward a ref to the underlying TextInput (used for focus chaining between fields). */
  inputRef?: React.RefObject<TextInput>;
  /** Highlight the border red to indicate a validation error. */
  hasError?: boolean;
}

export function Field({
  label, value, onChangeText, onBlur, placeholder, keyboardType, multiline,
  icon, secure, autoCapitalize = 'sentences', autoCorrect = true, autoComplete,
  textContentType, returnKeyType, onSubmitEditing, blurOnSubmit, editable,
  inputRef, hasError,
}: FieldProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Text style={[T.labelLg, s.fieldLabel]}>{label}</Text> : null}
      <View style={[
        s.inputWrap,
        multiline && { height: 110, alignItems: 'flex-start' },
        hasError && { borderColor: C.error, backgroundColor: '#FFF8F8' },
      ]}>
        {icon ? <Text style={s.inputIcon}>{icon}</Text> : null}
        <TextInput
          ref={inputRef}
          style={[s.input, multiline && { textAlignVertical: 'top', paddingTop: 12 }]}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={C.outline}
          keyboardType={keyboardType}
          multiline={multiline}
          secureTextEntry={secure}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit ?? (multiline ? false : true)}
          editable={editable}
        />
      </View>
    </View>
  );
}

/* ---------- Cards ---------- */
export function Card({ children, onPress, barColor, style }: {
  children: React.ReactNode; onPress?: () => void; barColor?: string; style?: any;
}) {
  const body = <View style={[s.cardInner, style]}>{children}</View>;
  if (!onPress && !barColor) return <View style={s.card}>{body}</View>;
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [s.card, { flexDirection: 'row', overflow: 'hidden' }, pressed && { opacity: 0.9 }]}>
      {barColor ? <View style={{ width: 4, backgroundColor: barColor }} /> : null}
      <View style={{ flex: 1 }}>{body}</View>
    </Pressable>
  );
}

/* ---------- Chips ---------- */
export function Chip({ label, color, selected, onPress }: {
  label: string; color?: string; selected?: boolean; onPress?: () => void;
}) {
  const accent = color ?? C.primary;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [
      s.chip, onPress && pressed && { opacity: 0.8 },
      selected
        ? { backgroundColor: accent, borderColor: accent }
        : { backgroundColor: 'transparent', borderColor: C.outlineVariant }]}>
      <Text style={[T.labelLg, { color: selected ? C.onPrimary : accent }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusChip({ label, tone }: { label: string; tone: 'critical' | 'warning' | 'ok' | 'info' }) {
  const map = {
    critical: { bg: C.criticalContainer, fg: C.onErrorContainer },
    warning: { bg: C.warningContainer, fg: '#8A6D00' },
    ok: { bg: C.tertiaryFixed, fg: C.onTertiaryFixed },
    info: { bg: C.surfaceHigh, fg: C.onSurfaceVariant },
  }[tone];
  return (
    <View style={[s.statusChip, { backgroundColor: map.bg }]}>
      <Text style={[T.labelSm, { color: map.fg, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

/* ---------- App bar ---------- */
export function AppBar({ title, onBack, onMenu, right }: {
  title: string; onBack?: () => void; onMenu?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.appBar, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={s.appBarIcon} hitSlop={12} accessibilityLabel="Go back">
          <Text style={s.appBarGlyph}>‹</Text>
        </Pressable>
      ) : null}
      {onMenu ? (
        <Pressable onPress={onMenu} style={s.appBarIcon} hitSlop={12} accessibilityLabel="Menu">
          <Text style={s.appBarGlyph}>☰</Text>
        </Pressable>
      ) : null}
      <Text style={[T.titleLg, { color: C.primary, flex: 1, marginLeft: onBack || onMenu ? 8 : 0 }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

/* ---------- Screen scaffold ---------- */
export function Screen({ children, title, onBack, onMenu, onLogout, right, padded = true }: {
  children: React.ReactNode; title: string; onBack?: () => void; onMenu?: () => void;
  onLogout?: () => void; right?: React.ReactNode; padded?: boolean;
}) {
  return (
    <View style={s.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
      <AppBar title={title} onBack={onBack} onMenu={onMenu}
        right={onLogout
          ? <Pressable onPress={onLogout} hitSlop={8}><Text style={[T.labelLg, { color: C.primary }]}>Logout</Text></Pressable>
          : right} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: 40, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

/* ---------- Bottom navigation ---------- */
export interface NavTab { key: string; label: string; icon: string }
export function BottomNav({ tabs, active, onChange }: {
  tabs: NavTab[]; active: string; onChange: (k: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[nb.bar, { paddingBottom: Math.max(12, insets.bottom) }]}>
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <NavItem key={t.key} tab={t} active={on} onPress={() => onChange(t.key)} />
        );
      })}
    </View>
  );
}

function NavItem({ tab, active, onPress }: { tab: NavTab; active: boolean; onPress: () => void }) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={nb.item} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      {/* Active indicator bar along the top edge */}
      <View style={[nb.indicator, active ? nb.indicatorActive : nb.indicatorInactive]} />

      <Animated.View style={[nb.content, { transform: [{ scale }] }]}>
        {/* Icon — color only, no background */}
        <View style={nb.iconWrap}>
          <Text style={[nb.icon, { color: active ? C.primary : C.onSurfaceVariant }]}>
            {tab.icon}
          </Text>
        </View>
        <Text
          style={[
            nb.label,
            active ? nb.labelActive : nb.labelInactive,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* ---------- FAB ---------- */
export function Fab({ icon = '＋', onPress, color = C.primary, bottomOffset }: {
  icon?: string; onPress: () => void; color?: string;
  /** Distance from the bottom of the screen. Defaults to 88 — override this
   *  when the FAB lives above a tab bar with a safe-area-aware height. */
  bottomOffset?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.fab,
        { backgroundColor: color },
        bottomOffset !== undefined && { bottom: bottomOffset },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={icon === '＋' ? 'New report' : undefined}
    >
      <Text style={{ color: C.onPrimary, fontSize: 24, marginTop: -2 }}>{icon}</Text>
    </Pressable>
  );
}

/* ---------- Stepper (plan resources) ---------- */
export function Stepper({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <View style={s.stepperRow}>
      <View style={s.stepperIcon}><Text style={{ fontSize: 18 }}>{'📦'}</Text></View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={[T.bodyMd, { color: C.onSurface }]}>{label}</Text>
        <Text style={[T.titleLg, { color: C.onSurface }]}>{value}</Text>
      </View>
      <View style={s.stepperBtns}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={s.stepBtn}>
          <Text style={{ fontSize: 20, color: C.onSurface }}>{'−'}</Text>
        </Pressable>
        <Pressable onPress={() => onChange(value + 1)} style={s.stepBtn}>
          <Text style={{ fontSize: 20, color: C.onSurface }}>{'＋'}</Text>
        </Pressable>
      </View>
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

/* ---------- Misc ---------- */
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  appBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.background,
  },
  appBarIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarGlyph: { fontSize: 22, color: C.onSurface },
  btn: {
    borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', marginBottom: 8, minHeight: 48,
  },
  btnText: { color: C.onPrimary, fontWeight: '600', fontSize: 15 },
  btnIcon: { fontSize: 14 },
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 18, minHeight: 44,
  },
  fieldLabel: { color: C.onSurface, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.outlineVariant,
    borderRadius: RADIUS.md, minHeight: 48, paddingHorizontal: 12,
  },
  inputIcon: { fontSize: 15, marginRight: 8, color: C.onSurfaceVariant },
  input: { flex: 1, color: C.onSurface, fontSize: 16, paddingVertical: 10 },
  card: {
    backgroundColor: C.surfaceLowest, borderRadius: RADIUS.card, marginBottom: 12,
    elevation: 1, shadowColor: C.secondary, shadowOpacity: 0.08, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardInner: { padding: 16 },
  chip: {
    borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 7, marginRight: 8, marginBottom: 8, alignSelf: 'flex-start',
  },
  statusChip: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  nav: {
    flexDirection: 'row', backgroundColor: C.surfaceLowest, borderTopWidth: 1,
    borderTopColor: C.surfaceVariant, paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navPill: { borderRadius: RADIUS.pill, paddingHorizontal: 22, paddingVertical: 4, marginBottom: 2 },
  fab: {
    position: 'absolute', right: 20, bottom: 88, width: 56, height: 56,
    borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceLowest,
    borderRadius: RADIUS.md, padding: 12, marginBottom: 10,
  },
  stepperIcon: {
    width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtns: { flexDirection: 'row' },
  stepBtn: {
    width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
});

/* ---------- Bottom nav stylesheet ---------- */
const nb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },

  item: {
    flex: 1,
    alignItems: 'center',
  },

  // Top edge indicator bar — primary on active, invisible on inactive
  indicator: {
    height: 3,
    width: '50%',
    borderRadius: 2,
    marginBottom: 8,
  },
  indicatorActive: {
    backgroundColor: C.primary,
  },
  indicatorInactive: {
    backgroundColor: 'transparent',
  },

  content: {
    alignItems: 'center',
    paddingBottom: 6,
  },

  // No background on the icon — just color change
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    height: 28,
  },

  icon: {
    fontSize: 20,
  },

  label: {
    fontSize: 11,
    lineHeight: 14,
  },
  labelActive: {
    color: C.primary,
    fontWeight: '700',
  },
  labelInactive: {
    color: C.onSurfaceVariant,
    fontWeight: '400',
  },
});
