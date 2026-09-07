import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, setToken, LoginResponse } from "../api";
import { C, RADIUS, T } from "../theme";

/* ─── validation ──────────────────────────────────────────────────────────── */

function validateUsername(v: string): string | null {
  const trimmed = v.trim();
  if (!trimmed) return "Username is required";
  if (trimmed.length < 3) return "Must be at least 3 characters";
  if (trimmed.length > 60) return "Too long (max 60 characters)";
  return null;
}

function validatePassword(v: string): string | null {
  if (!v) return "Password is required";
  if (v.length < 4) return "Must be at least 4 characters";
  return null;
}

/**
 * Maps backend HTTP error detail strings to human-readable copy.
 * Mirrors the exact strings raised in auth.py.
 */
function mapApiError(raw: string): string {
  const l = raw.toLowerCase();
  if (l.includes("incorrect username or password")) {
    return "Incorrect username or password. Please try again.";
  }
  if (l.includes("deactivated")) {
    return "This account has been deactivated. Contact your administrator.";
  }
  if (l.includes("request timed out") || l.includes("login timed out")) {
    return "The server didn't respond in time. Please check your connection and try again.";
  }
  if (
    l.includes("cannot reach the server") ||
    l.includes("network request failed") ||
    l.includes("failed to fetch") ||
    l.includes("econnrefused") ||
    l.includes("unexpected end of stream") ||
    l.includes("java.ioexception") ||
    l.includes("connection reset") ||
    l.includes("socket hang up") ||
    l.includes("timeout")
  ) {
    return "Cannot reach the server. Check your connection and try again.";
  }
  return raw; // surface unexpected errors as-is
}

/* ─── small inline-error label ───────────────────────────────────────────── */

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <Text style={s.fieldError}>
      {"⚠  "}
      {msg}
    </Text>
  );
}

/* ─── login screen ───────────────────────────────────────────────────────── */

export default function LoginScreen({
  onLogin,
}: {
  onLogin: (r: LoginResponse) => void;
}) {
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // per-field errors (shown after first submit attempt)
  const [touched, setTouched] = useState({
    username: false,
    password: false,
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // counts down from LOGIN_TIMEOUT_SECS to 0 while a request is in-flight
  const [countdown, setCountdown] = useState<number | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const abortRef = useRef<AbortController | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const LOGIN_TIMEOUT_SECS = 60;

  /* ── derived validation ─────────────────────────────────────── */
  const usernameErr = touched.username ? validateUsername(username) : null;
  const passwordErr = touched.password ? validatePassword(password) : null;
  const canSubmit =
    !busy && !validateUsername(username) && !validatePassword(password);

  /* ── clean up countdown timer on unmount ────────────────────── */
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      abortRef.current?.abort();
    };
  }, []);

  /* ── shake on auth error ────────────────────────────────────── */
  const shake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /* ── submit ─────────────────────────────────────────────────── */
  const submit = async () => {
    // Trim both fields before any validation or API call
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    setUsername(trimmedUsername);
    setPassword(trimmedPassword);

    // Mark both fields touched so errors appear
    setTouched({ username: true, password: true });
    if (validateUsername(trimmedUsername) || validatePassword(trimmedPassword))
      return;

    setBusy(true);
    setApiError(null);

    // Set up AbortController for the 60-second timeout
    const controller = new AbortController();
    abortRef.current = controller;

    // Start visible countdown
    setCountdown(LOGIN_TIMEOUT_SECS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    // Hard-abort after 60 s
    const timeoutId = setTimeout(
      () => controller.abort(),
      LOGIN_TIMEOUT_SECS * 1000,
    );

    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { username: trimmedUsername, password: trimmedPassword },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      await setToken(res.access_token);
      onLogin(res);
    } catch (e: any) {
      clearTimeout(timeoutId);
      const isAbort = e?.name === "AbortError" || controller.signal.aborted;
      const raw = isAbort ? "Login timed out" : (e.message ?? "Unknown error");
      const msg = mapApiError(raw);
      setApiError(msg);
      shake();
    } finally {
      clearInterval(countdownRef.current!);
      countdownRef.current = null;
      setCountdown(null);
      abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={[
        s.scroll,
        { paddingBottom: Math.max(insets.bottom + 16, 32) },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      enableOnAndroid
      extraScrollHeight={24}
    >
      {/* ── brand band ──────────────────────────────────────── */}
      <View style={s.brandBand}>
        <View style={s.logoCircle}>
          <Text style={{ color: C.onPrimary, fontSize: 28 }}>🛡</Text>
        </View>
        <Text style={[T.headlineLg, { color: C.primary, marginTop: 14 }]}>
          MADAD
        </Text>
        <Text style={[T.bodyMd, s.subtitle]}>
          Sign in to access your Support Center dashboard.
        </Text>
      </View>

      {/* ── form card ───────────────────────────────────────── */}
      <Animated.View
        style={[s.card, { transform: [{ translateX: shakeAnim }] }]}
      >
        {/* importantForAutofill="yes" groups both fields so Android Autofill
              Framework treats them as a single credential form and offers to
              save / fill after a successful login. */}
        <View>
          {/* username */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Username</Text>
            <View style={[s.inputRow, usernameErr ? s.inputRowError : null]}>
              <Text style={s.inputIcon}>👤</Text>
              <TextInput
                style={s.input}
                value={username}
                onChangeText={(t) => {
                  setUsername(t);
                  setApiError(null);
                }}
                onBlur={() => {
                  setTouched((p) => ({
                    ...p,
                    username: true,
                  }));
                }}
                placeholder="Coordinator ID or username"
                placeholderTextColor={C.outline}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                importantForAutofill="yes"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!busy}
              />
            </View>
            <FieldError msg={usernameErr} />
          </View>

          {/* password */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Password</Text>
            <View style={[s.inputRow, passwordErr ? s.inputRowError : null]}>
              <Text style={s.inputIcon}>🔒</Text>
              <TextInput
                ref={passwordRef}
                style={[s.input, { flex: 1 }]}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setApiError(null);
                }}
                onBlur={() => {
                  setTouched((p) => ({
                    ...p,
                    password: true,
                  }));
                }}
                placeholder="Enter your password"
                placeholderTextColor={C.outline}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                importantForAutofill="yes"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={submit}
                editable={!busy}
              />
              {/* show / hide toggle */}
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
                style={s.eyeBtn}
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                <Text style={s.eyeIcon}>{showPassword ? "🙈" : "👁"}</Text>
              </Pressable>
            </View>
            <FieldError msg={passwordErr} />
          </View>

          {/* api-level error banner */}
          {apiError ? (
            <View style={s.apiBanner}>
              <Text style={s.apiBannerText}>{apiError}</Text>
            </View>
          ) : null}

          {/* submit */}
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              s.submitBtn,
              !canSubmit && s.submitBtnDisabled,
              pressed && canSubmit && s.submitBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            <Text style={s.submitText}>{busy ? "Signing in…" : "Sign In"}</Text>
            {!busy && <Text style={s.submitArrow}> →</Text>}
          </Pressable>

          {/* countdown shown while waiting for server response */}
          {countdown !== null ? (
            <Text style={s.countdown}>
              {countdown > 10
                ? `Waiting for server… (${countdown}s)`
                : countdown > 0
                  ? `Still waiting… timing out in ${countdown}s`
                  : "Request timed out."}
            </Text>
          ) : null}

          <Text style={s.hint}>
            Having trouble? Contact your MADAD administrator.
          </Text>
        </View>
        {/* end importantForAutofill group */}
      </Animated.View>
    </KeyboardAwareScrollView>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    padding: 20,
  },

  /* brand */
  brandBand: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: C.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  subtitle: {
    color: C.onSurfaceVariant,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 24,
  },

  /* card */
  card: {
    backgroundColor: C.surfaceLowest,
    borderRadius: RADIUS.xl,
    padding: 24,
    elevation: 2,
    shadowColor: C.secondary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },

  /* fields */
  fieldWrap: { marginBottom: 4 },
  label: {
    ...T.labelLg,
    color: C.onSurface,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    borderRadius: RADIUS.md,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputRowError: {
    borderColor: C.error,
    backgroundColor: "#FFF8F8",
  },
  inputIcon: { fontSize: 16, marginRight: 10, color: C.onSurfaceVariant },
  input: {
    flex: 1,
    color: C.onSurface,
    fontSize: 16,
    paddingVertical: 10,
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingRight: 2,
    paddingVertical: 6,
  },
  eyeIcon: { fontSize: 18 },

  /* errors */
  fieldError: {
    ...T.labelSm,
    color: C.error,
    marginTop: 5,
    marginBottom: 10,
    marginLeft: 2,
  },
  apiBanner: {
    backgroundColor: C.errorContainer,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  apiBannerText: {
    ...T.labelLg,
    color: C.onErrorContainer,
    flex: 1,
  },

  /* submit */
  submitBtn: {
    backgroundColor: C.primary,
    borderRadius: RADIUS.md,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 16,
    elevation: 1,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnPressed: { opacity: 0.85 },
  submitText: {
    color: C.onPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  submitArrow: {
    color: C.onPrimary,
    fontSize: 18,
  },

  hint: {
    ...T.labelSm,
    color: C.onSurfaceVariant,
    textAlign: "center",
  },

  countdown: {
    ...T.labelSm,
    color: C.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 12,
  },
});
