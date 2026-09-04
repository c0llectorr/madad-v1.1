import type { NavTab } from '../components';

/** Coordinator role-scoped navigation — the BottomNav renders ONLY these tabs. */
export const COORDINATOR_TABS: NavTab[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'reports', label: 'Reports', icon: '▤' },
  { key: 'dispatches', label: 'Dispatches', icon: '🚚' },
  { key: 'map', label: 'Map', icon: '🗺' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];
