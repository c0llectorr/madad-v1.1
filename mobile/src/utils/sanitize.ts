/**
 * Input sanitization rules for all name-type text fields.
 *
 * Allowed characters: letters (a-z, A-Z), digits (0-9), round brackets (),
 * spaces, hyphens, and dots (for codes/abbreviations like "C-104", "Dept. A").
 *
 * Rejected: quotes, angle brackets, braces, slashes, backticks, semicolons,
 * equals signs, and any other character that could form an injection payload
 * regardless of the target (SQL, HTML, JSON, shell).
 */

/** Regex that matches the FULL string if it is clean. */
export const SAFE_NAME_RE = /^[a-zA-Z0-9()\s.\-]+$/;

/**
 * Returns an error message if the value contains disallowed characters,
 * or null if it is clean. Use inside your validate* functions.
 */
export function checkSafeChars(v: string): string | null {
  const t = v.trim();
  if (!t) return null; // length/required checks are handled separately
  if (!SAFE_NAME_RE.test(t))
    return "Only letters, digits, spaces, ( ) . and - are allowed";
  return null;
}

/**
 * Strips every character that is NOT in the allowed set, in real-time.
 * Plug this into onChangeText to silently drop bad chars as the user types
 * rather than waiting until submit.
 */
export function sanitizeNameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9()\s.\-]/g, "");
}

/**
 * For resource-type fields (food, water…) — same rule but also
 * allows underscores and forward-slash for compound types like "medical/food".
 * Rejects HTML, SQL operators, braces, quotes, etc.
 */
export const SAFE_RESOURCE_RE = /^[a-zA-Z0-9()\s._\-/]+$/;

export function checkSafeResourceChars(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!SAFE_RESOURCE_RE.test(t))
    return "Only letters, digits, spaces, ( ) . _ - and / are allowed";
  return null;
}

export function sanitizeResourceInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9()\s._\-/]/g, "");
}
