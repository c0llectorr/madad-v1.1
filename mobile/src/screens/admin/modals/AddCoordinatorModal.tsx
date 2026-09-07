import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../api";
import { C, T } from "../../../theme";
import {
  Button,
  Card,
  Err,
  Field,
  PillButton,
  Screen,
  SectionTitle,
} from "../../../components";
import type { Center } from "../../../types";
import { sanitizeNameInput } from "../../../utils/sanitize";

/* ─── validation ────────────────────────────────────────────────────────── */

function validateUsername(v: string): string | null {
  const t = v.trim();
  if (!t) return "Username is required";
  if (t.length < 3) return "Must be at least 3 characters";
  if (t.length > 60) return "Too long (max 60 characters)";
  // usernames: letters, digits, underscore, dot, hyphen only
  if (!/^[a-zA-Z0-9_.\-]+$/.test(t))
    return "Only letters, digits, _ . and - are allowed";
  return null;
}

function validatePassword(v: string): string | null {
  if (!v) return "Password is required";
  if (v.length < 6) return "Must be at least 6 characters";
  return null;
}

function validateCenter(id: number | null): string | null {
  if (id === null) return "Please assign a center";
  return null;
}

/* ─── inline error label ─────────────────────────────────────────────────── */

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <Text style={s.fieldError}>⚠ {msg}</Text>;
}

/* ─── component ──────────────────────────────────────────────────────────── */

export function AddCoordinatorModal({
  centers,
  onBack,
}: {
  centers: Center[];
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [centerId, setCenterId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // show inline errors only after the first submit attempt
  const [submitted, setSubmitted] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  /* ── derived validation ─────────────────────────────────────────────── */
  const usernameErr = submitted ? validateUsername(username) : null;
  const passwordErr = submitted ? validatePassword(password) : null;
  const centerErr = submitted ? validateCenter(centerId) : null;

  const isValid =
    !validateUsername(username) &&
    !validatePassword(password) &&
    !validateCenter(centerId);

  /* ── submit ─────────────────────────────────────────────────────────── */
  const submit = async () => {
    setSubmitted(true);
    if (!isValid) return;

    setBusy(true);
    setErr(null);
    try {
      await api("/accounts/coordinators", {
        method: "POST",
        body: { center_id: centerId, username: username.trim(), password },
      });
      onBack();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="MADAD" onBack={onBack}>
      <SectionTitle
        title="Add New Coordinator"
        sub="Create a new operational account for field management."
      />

      <Card barColor={C.primary}>
        {/* ── Username ─────────────────────────────────────────────── */}
        <Field
          label="Username"
          value={username}
          onChangeText={(t) => {
            // usernames use their own char set (no sanitizeNameInput here)
            setUsername(t);
            setErr(null);
          }}
          placeholder="e.g. coordinator_pk01"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
          hasError={!!usernameErr}
          editable={!busy}
          icon="👤"
        />
        <FieldError msg={usernameErr} />

        {/* ── Password ─────────────────────────────────────────────── */}
        <Field
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setErr(null);
          }}
          placeholder="Min. 6 characters"
          secure
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={submit}
          inputRef={passwordRef}
          hasError={!!passwordErr}
          editable={!busy}
          icon="🔒"
        />
        <FieldError msg={passwordErr} />

        {/* ── Center picker ─────────────────────────────────────────── */}
        <Text
          style={[
            T.labelLg,
            {
              color: centerErr ? C.error : C.onSurface,
              marginTop: 8,
              marginBottom: 8,
            },
          ]}
        >
          Assigned Center {centerErr ? "— required" : ""}
        </Text>
        <View style={cs.pickerRow}>
          {centers.map((c) => (
            <PillButton
              key={c.id}
              title={`${c.code}`}
              kind={centerId === c.id ? "primary" : "outlined"}
              onPress={() => setCenterId(c.id)}
            />
          ))}
          {centers.length === 0 && (
            <Text style={[T.bodyMd, { color: C.onSurfaceVariant }]}>
              Create a center first.
            </Text>
          )}
        </View>
        <FieldError msg={centerErr} />

        {/* ── Info panel ───────────────────────────────────────────── */}
        <View style={cs.infoPanel}>
          <Text style={{ color: C.primary, marginRight: 8 }}>{"ℹ️"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[T.labelLg, { color: C.onSurface }]}>
              Coordinator Access Level
            </Text>
            <Text
              style={[T.bodyMd, { color: C.onSurfaceVariant, marginTop: 2 }]}
            >
              This account will have field-level access to report issues,
              request resources, and update statuses for the assigned center
              only.
            </Text>
          </View>
        </View>
      </Card>

      <Err msg={err} />

      <Button
        title={busy ? "Creating…" : "Create Account"}
        onPress={submit}
        kind="primary"
        icon="👤"
        disabled={busy}
      />
      <Button title="Cancel" onPress={onBack} kind="outlined" />
    </Screen>
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

import { cs } from "../adminStyles";
