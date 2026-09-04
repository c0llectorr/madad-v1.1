// Pure geometry helpers — no React, no API.
export interface Pt { lat: number; lng: number }

/** Convex hull (Andrew monotone chain) — the flood-zone shading. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower: Pt[] = [];
  for (const pt of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (const pt of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Great-circle distance in km. */
export function haversineKm(a: Pt, b: Pt): number {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Depot closest to a site (squared-distance compare — no sqrt needed). */
export function nearestDepot<T extends { lat: number; lng: number }>(site: Pt, depots: T[]): T | null {
  if (depots.length === 0) return null;
  return depots.reduce((best, d) =>
    ((d.lat - site.lat) ** 2 + (d.lng - site.lng) ** 2) <
    ((best.lat - site.lat) ** 2 + (best.lng - site.lng) ** 2) ? d : best);
}
