import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadStoredToken, setToken, LoginResponse } from './src/api';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import AdminShell from './src/screens/admin/AdminShell';
import CoordinatorShell from './src/screens/coordinator/CoordinatorShell';
import { C } from './src/theme';

type Session = LoginResponse | null | 'loading' | 'onboarding';

export default function App() {
  const [session, setSession] = useState<Session>('loading');

  useEffect(() => {
    // Fresh login each launch — the token store only persists within a session.
    loadStoredToken().then(() => setSession('onboarding'));
  }, []);

  const logout = async () => {
    await setToken(null);
    setSession('onboarding');
  };

  if (session === 'loading') return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
      {session === 'onboarding'
        ? <OnboardingScreen onDone={() => setSession(null)} />
        : session === null
          ? <LoginScreen onLogin={setSession} />
          : session.role === 'administrator'
            ? <AdminShell session={session} onLogout={logout} />
            : <CoordinatorShell session={session} onLogout={logout} />}
    </SafeAreaProvider>
  );
}
