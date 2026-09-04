import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, RADIUS, T } from '../theme';

/** Numeric quantity input with ±10 nudge buttons. */
export function Stepper({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  React.useEffect(() => { setText(String(value)); }, [value]);
  const commit = (t: string) => {
    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
    onChange(isNaN(n) ? 0 : n);
  };
  return (
    <View style={s.stepperRow}>
      <View style={s.stepperIcon}><Text style={{ fontSize: 18 }}>{'📦'}</Text></View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={[T.bodyMd, { color: C.onSurface }]}>{label}</Text>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          onEndEditing={() => commit(text)}
          onSubmitEditing={() => commit(text)}
          onBlur={() => commit(text)}
          keyboardType="number-pad"
          selectTextOnFocus
        />
      </View>
      <View style={s.stepperBtns}>
        <Pressable onPress={() => onChange(Math.max(0, value - 10))} style={s.stepBtn}>
          <Text style={{ fontSize: 16, color: C.onSurface }}>{'−10'}</Text>
        </Pressable>
        <Pressable onPress={() => onChange(value + 10)} style={s.stepBtn}>
          <Text style={{ fontSize: 16, color: C.onSurface }}>{'+10'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
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
  input: {
    borderBottomWidth: 1, borderBottomColor: C.outlineVariant,
    color: C.onSurface, fontSize: 20, fontWeight: '600', paddingVertical: 2,
  },
});
