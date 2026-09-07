import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, T } from "../theme";
import { AppBar } from "./AppBar";

export function Screen({
  children,
  title,
  onBack,
  onMenu,
  onLogout,
  right,
  padded = true,
}: {
  children: React.ReactNode;
  title: string;
  onBack?: () => void;
  onMenu?: () => void;
  onLogout?: () => void;
  right?: React.ReactNode;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AppBar
        title={title}
        onBack={onBack}
        onMenu={onMenu}
        right={
          onLogout ? (
            <Pressable onPress={onLogout} hitSlop={8}>
              <Text style={[T.labelLg, { color: C.primary }]}>Logout</Text>
            </Pressable>
          ) : (
            right
          )
        }
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: padded ? 16 : 0,
          paddingBottom: 40,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
});
