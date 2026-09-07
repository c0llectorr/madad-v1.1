import type { NavTab } from "../components";

/** Administrator role-scoped navigation — the BottomNav renders ONLY these tabs. */
export const ADMIN_TABS: NavTab[] = [
  { key: "resources", label: "Resources", icon: "▦" },
  { key: "map", label: "Map", icon: "🗺" },
  { key: "centers", label: "Centers", icon: "◎" },
  { key: "accounts", label: "Accounts", icon: "👤" },
  { key: "settings", label: "Settings", icon: "⚙" },
];
