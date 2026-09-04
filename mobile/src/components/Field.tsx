import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { C, RADIUS, T } from '../theme';

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
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  editable?: boolean;
  inputRef?: React.RefObject<TextInput>;
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

const s = StyleSheet.create({
  fieldLabel: { color: C.onSurface, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.outlineVariant,
    borderRadius: RADIUS.md, minHeight: 48, paddingHorizontal: 12,
  },
  inputIcon: { fontSize: 15, marginRight: 8, color: C.onSurfaceVariant },
  input: { flex: 1, color: C.onSurface, fontSize: 16, paddingVertical: 10 },
});
