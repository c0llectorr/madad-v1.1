// MADAD High-Trust Field System — Material 3 design tokens (DESIGN.md)
export const C = {
  // Surfaces
  background: '#FAFAF4',
  surfaceDim: '#DADAD5',
  surfaceLowest: '#FFFFFF',
  surfaceLow: '#F4F4EF',
  surfaceContainer: '#EEEEE9',
  surfaceHigh: '#E8E8E3',
  surfaceHighest: '#E3E3DE',
  surfaceVariant: '#E3E3DE',

  // Text
  onSurface: '#1A1C19',
  onSurfaceVariant: '#44474E',
  outline: '#6F787F',
  outlineVariant: '#BEC8CF',
  inverseSurface: '#2F312E',
  inverseOnSurface: '#F1F1EC',

  // Primary — actions
  primary: '#006482',
  onPrimary: '#FFFFFF',
  primaryContainer: '#007EA4',
  onPrimaryContainer: '#FBFDFF',
  inversePrimary: '#73D2FD',
  primaryFixed: '#BFE8FF',
  primaryFixedDim: '#73D2FD',
  onPrimaryFixed: '#001F2A',
  primaryFixedVariant: '#004D65',

  // Secondary — structure / app bar
  secondary: '#575C83',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#CDD1FF',
  onSecondaryContainer: '#545980',

  // Tertiary — success / inventory
  tertiary: '#00685D',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#1F8276',
  onTertiaryContainer: '#F4FFFB',
  tertiaryFixed: '#99F3E4',
  tertiaryFixedDim: '#7DD6C8',
  onTertiaryFixed: '#00201C',

  // Status
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#93000A',
  critical: '#D81B60',
  criticalContainer: '#FFD9E2',
  warning: '#FFB300',
  warningContainer: '#FFF3D6',

  // Legacy aliases (map pieces still referencing old palette)
  accent: '#006482',
  secondary_old: '#464B71',
  textMuted: '#6F787F',
  border: '#E3E3DE',
} as const;

export const SEVERITY_COLORS: Record<string, string> = {
  critical: C.critical,
  high: C.warning,
  medium: C.primary,
  low: C.tertiaryContainer,
};

export const SEVERITY_BAR: Record<string, string> = {
  critical: C.critical,
  high: C.warning,
  medium: C.primary,
  low: C.tertiary,
};

export const T = {
  headlineLg: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  headlineMd: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
  titleLg: { fontSize: 20, fontWeight: '600' as const, lineHeight: 26 },
  bodyLg: { fontSize: 18, fontWeight: '400' as const, lineHeight: 28 },
  bodyMd: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  labelLg: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  labelSm: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
};

// font family — Inter via expo-font isn't bundled; RN default (Roboto on Android) is
// an acceptable stand-in. Import Inter here later if added as an asset.
export const FONT = undefined;

export const RADIUS = { sm: 4, md: 8, card: 16, xl: 24, pill: 999 };
export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24 };
