import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, setToken, LoginResponse } from '../api';
import { Button, Err, Field } from '../ui';
import { C, T } from '../theme';

export default function LoginScreen({ onLogin }: { onLogin: (r: LoginResponse) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { username, password } });
      await setToken(res.access_token);
      onLogin(res);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={s.container}>
      <View style={s.card}>
        {/* Top brand band */}
        <View style={s.brandBand}>
          <View style={s.logoCircle}>
            <Text style={{ color: C.onPrimary, fontSize: 24 }}>{'🛡'}</Text>
          </View>
          <Text style={[T.headlineLg, { color: C.primary, marginTop: 12 }]}>MADAD</Text>
          <Text style={[T.bodyMd, { color: C.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }]}>
            Log in to access your Support Center dashboard.
          </Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Field label="Username" value={username} onChangeText={setUsername}
                 placeholder="Coordinator ID or Email" icon="👤" />
          <Field label="Password" value={password} onChangeText={setPassword}
                 placeholder="Enter your password" icon="🔒" secure />

          <Err msg={err} />

          <Button title={busy ? 'Signing in…' : 'Sign In'} onPress={login} icon="→"
                  disabled={busy || !username || !password} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, justifyContent: 'center', padding: 16 },
  card: {
    borderRadius: 24, overflow: 'hidden', elevation: 2,
    shadowColor: C.secondary, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  brandBand: { backgroundColor: C.surfaceLow, alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  form: { backgroundColor: C.surfaceLowest, padding: 24, paddingTop: 28 },
});
