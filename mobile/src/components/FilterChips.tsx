import React from 'react';
import { View } from 'react-native';
import { Chip } from './Chip';

/** Single-select chip row — used for province/center/severity filters. */
export function FilterChips<T extends string | number>({ options, value, onChange, colors }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  colors?: Record<string, string>;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {options.map(o => (
        <Chip key={String(o.value)} label={o.label} selected={value === o.value}
              color={colors?.[String(o.value)]}
              onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}
