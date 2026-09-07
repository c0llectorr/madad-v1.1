import AsyncStorage from "@react-native-async-storage/async-storage";

// Point this at your machine's LAN IP for a physical device,
// or 10.0.2.2 for the Android emulator.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000/api";

export interface LoginResponse {
  access_token: string;
  role: "administrator" | "coordinator";
  user_id: number;
  center_id: number | null;
  center_name: string | null;
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
/** Registered by App so an expired token returns the user to the login screen. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem("madad_token", t);
  else await AsyncStorage.removeItem("madad_token");
}

export async function loadStoredToken(): Promise<string | null> {
  token = await AsyncStorage.getItem("madad_token");
  return token;
}

function formatApiError(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const msg = (first as any)?.msg;
      const loc = (first as any)?.loc;
      if (typeof msg === "string") {
        const msgLower = msg.toLowerCase();
        if (
          msgLower.includes("value is not a valid integer") ||
          msgLower.includes("int_type") ||
          msgLower.includes("valid integer")
        ) {
          return "Please enter a whole number without commas or decimals.";
        }
        if (msg.toLowerCase().includes("field required")) {
          return "Please complete all required fields.";
        }
        return msg
          .replace(/^Value error, /i, "")
          .replace(/^Input should be/i, "Please enter");
      }
      if (Array.isArray(loc) && loc.length > 0) {
        const field = String(loc[loc.length - 1]);
        if (field === "quantity_delta") {
          return "Please enter a whole number without commas or decimals.";
        }
      }
    }
    return detail
      .map((item) => formatApiError(item))
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    const message = (detail as any)?.detail ?? (detail as any)?.message;
    if (typeof message === "string") return message;
    if (typeof (detail as any)?.msg === "string") return (detail as any).msg;
  }
  return "Request failed";
}

function normalizeFetchError(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : String(error ?? "Request failed");
  const lower = message.toLowerCase();
  const serviceUnavailable =
    "Cannot reach the server. Check your connection and try again.";

  if (
    lower.includes("unexpected end of stream") ||
    lower.includes("java.ioexception") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("socket hang up") ||
    lower.includes("connection reset") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("failed to connect")
  ) {
    return new Error(serviceUnavailable);
  }

  return new Error(message || "Request failed");
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; signal?: AbortSignal } = {},
): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.detail ?? `Request failed (${res.status})`;
      throw new Error(formatApiError(detail));
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeFetchError(error);
    }
    throw normalizeFetchError(error);
  }
}
