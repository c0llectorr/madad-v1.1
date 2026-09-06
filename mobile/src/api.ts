import AsyncStorage from '@react-native-async-storage/async-storage';

// Point this at your machine's LAN IP for a physical device,
// or 10.0.2.2 for the Android emulator.
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api';

export interface LoginResponse {
  access_token: string;
  role: 'administrator' | 'coordinator';
  user_id: number;
  center_id: number | null;
  center_name: string | null;
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
/** Registered by App so an expired token returns the user to the login screen. */
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem('madad_token', t);
  else await AsyncStorage.removeItem('madad_token');
}

export async function loadStoredToken(): Promise<string | null> {
  token = await AsyncStorage.getItem('madad_token');
  return token;
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith('/auth/')) {
      await setToken(null);
      onUnauthorized?.();
      throw new Error('Session expired — please log in again');
    }
    if (!res.ok) {
      const detail = data?.detail ?? `Request failed (${res.status})`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Request timed out — check your connection');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
