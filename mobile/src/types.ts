// Shared TypeScript contracts — single source of truth for all screens.
export interface LoginResponse {
  access_token: string;
  username?: string;
  role: "administrator" | "coordinator" | "driver";
  user_id: number;
  center_id: number | null;
  center_name: string | null;
}

export interface Center {
  id: number;
  code: string;
  name: string;
  region: string | null;
  lat: number;
  lng: number;
}
export interface CenterRow {
  id: number;
  code: string;
  name: string;
  region: string | null;
  lat: number;
  lng: number;
}
export interface Depot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  inventory: { resource_type: string; quantity: number }[];
}
export interface CoordinatorRow {
  user_id: number;
  username: string;
  center_id: number | null;
  is_active: boolean;
}
export interface Coordinator {
  user_id: number;
  username: string;
  center_id: number;
  is_active: boolean;
  role: "coordinator" | "driver";
  depot_id?: number | null;
  depot_name?: string | null;
  created_at: string;
}

export interface Site {
  id: number;
  report_id?: number | null;
  location_name: string;
  lat: number;
  lng: number;
  estimated_population: number;
  needs: string[];
  urgency_flags: string[];
  severity: string | null;
  confidence: string;
  priority_score: number | null;
  status: string;
}
export interface Damage {
  id: number;
  center_id?: number;
  lat: number;
  lng: number;
  reason: string | null;
  edge_geometry: any;
  reported_at: string;
}
export interface ReportRow {
  report_id: number;
  raw_text: string | null;
  status: string;
  created_at: string;
  structured_fields?: {
    location_name: string;
    headcount: number;
    severity?: string;
    needs: string[];
  } | null;
}
export interface DispatchRow {
  dispatch_id: number;
  site_id: number;
  depot_id: number;
  status: string;
  distance_km: number | null;
  eta_minutes: number | null;
  route_geojson: any;
  resources_loaded: any[];
  assigned_to?: number | null;
  driver_id?: number | null;
  plan_id?: number | null;
  dispatched_by?: number | null;
  driver_username?: string | null;
}
export interface PlanT {
  plan_id: number;
  site_id: number;
  center_id: number;
  status: "draft" | "finalized" | "assigned";
  source: string;
  reasoning: string | null;
  site_name: string | null;
  site_lat: number | null;
  site_lng: number | null;
  estimated_population: number;
  items: { resource_type: string; quantity: number }[];
  created_at?: string;
}
export interface DriverRow {
  driver_id: number;
  user_id: number;
  username: string;
  depot_id: number;
  depot_name: string;
  center_id: number;
  status: string;
}
export interface Allocation {
  site_id: number;
  depot_id: number | null;
  rank: number;
  priority_score: number;
  resources: { resource_type: string; quantity: number }[];
  reasoning: string;
}
export interface SiteRow extends Site {
  center_id: number;
}
export interface DamageRow extends Damage {
  center_id: number;
}
