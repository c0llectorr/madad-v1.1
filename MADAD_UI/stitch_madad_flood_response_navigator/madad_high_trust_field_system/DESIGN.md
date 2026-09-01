---
name: MADAD High-Trust Field System
colors:
  surface: '#fafaf4'
  surface-dim: '#dadad5'
  surface-bright: '#fafaf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4ef'
  surface-container: '#eeeee9'
  surface-container-high: '#e8e8e3'
  surface-container-highest: '#e3e3de'
  on-surface: '#1a1c19'
  on-surface-variant: '#44474E'
  inverse-surface: '#2f312e'
  inverse-on-surface: '#f1f1ec'
  outline: '#6f787f'
  outline-variant: '#bec8cf'
  surface-tint: '#006686'
  primary: '#006482'
  on-primary: '#ffffff'
  primary-container: '#007ea4'
  on-primary-container: '#fbfdff'
  inverse-primary: '#73d2fd'
  secondary: '#575c83'
  on-secondary: '#ffffff'
  secondary-container: '#cdd1ff'
  on-secondary-container: '#545980'
  tertiary: '#00685d'
  on-tertiary: '#ffffff'
  tertiary-container: '#1f8276'
  on-tertiary-container: '#f4fffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bfe8ff'
  primary-fixed-dim: '#73d2fd'
  on-primary-fixed: '#001f2a'
  on-primary-fixed-variant: '#004d65'
  secondary-fixed: '#dfe0ff'
  secondary-fixed-dim: '#bfc4f0'
  on-secondary-fixed: '#13183c'
  on-secondary-fixed-variant: '#3f446a'
  tertiary-fixed: '#99f3e4'
  tertiary-fixed-dim: '#7dd6c8'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005048'
  background: '#fafaf4'
  on-background: '#1a1c19'
  surface-variant: '#e3e3de'
  status-critical: '#D81B60'
  status-warning: '#FFB300'
  surface-dark: '#1A1C1E'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.5px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  baseline: 8px
  margin-mobile: 16px
  margin-tablet: 24px
  margin-desktop: 32px
  gutter: 16px
  touch-target-min: 48px
---

## Brand & Style

The design system for this application is built on a foundation of **Reliability, Urgency, and Clarity**. Designed for flood relief operations, the UI must function flawlessly in high-stress environment where users (Administrators and Coordinators) may be operating in harsh lighting or under extreme cognitive load.

The visual style is a specialized evolution of **Modern Material Design 3 (Material You)**, adapted for utility. It balances the softness of contemporary Android interfaces with the structural rigor required for logistics and emergency management.

### Key Pillars:
- **Calm Urgency:** Use of high-contrast typography and clear status indicators to convey critical information without inducing panic.
- **Field-Ready Ergonomics:** Large touch targets (minimum 48dp) and generous spacing to account for outdoor use and rapid interaction.
- **Trust-Oriented Hierarchy:** A deep navy and off-white foundation that feels institutional and authoritative, punctuated by action-oriented blues and success-oriented mints.

## Colors

The palette is optimized for legibility and professional trust. 

- **Primary (#118AB2):** Used for "Primary Actions" such as confirming reports, initiating dispatches, and submitting data.
- **Secondary (#464B71):** Used for the App Bar, navigation elements, and structural headers to provide a "grounded" institutional feel.
- **Tertiary (#7CD5C7):** Reserved for "Success" states, inventory availability, and "Delivered" status updates.
- **Background (#F2F2ED):** An off-white surface that reduces glare compared to pure white, making it more comfortable for extended field use.

**Functional Color Rules:**
- Use **Status-Critical** (derived) for "High" severity sites and "Road Severed" alerts.
- High contrast ratios (minimum 4.5:1) must be maintained for all text against backgrounds to ensure readability in sunlight.

## Typography

The system exclusively uses **Inter** for its neutral, highly legible character and excellent numerical rendering (critical for coordinates and inventory quantities).

- **Headlines:** Reserved for page titles and major dashboard metrics.
- **Titles:** Used for Site names (e.g., "Dera Ghazi Khan Site A") and Card headers.
- **Body:** Increased base size (16px-18px) to ensure coordinators can read instructions while on the move.
- **Labels:** Used for metadata like "Priority Score" or "ETA".

**Weight Usage:**
- Use **Bold (700)** or **SemiBold (600)** for critical data points (e.g., "Severity: CRITICAL").
- Use **Medium (500)** for secondary labels to maintain hierarchy without visual noise.

## Layout & Spacing

This design system follows an **8px grid system**. All padding and margins must be multiples of 8.

- **Grid Model:** 4-column fluid grid for mobile, 8-column for tablet, and 12-column fixed-max-width (1280px) for desktop.
- **Touch Targets:** A strict minimum of 48x48dp for all interactive elements to accommodate gloved hands or shaky environments.
- **Information Density:** Low density for Coordinator views (large cards, big buttons) and Medium density for Administrator views (tables and maps).

**Form Factors:**
- **Mobile (Coordinator/Driver):** Single column stack. Primary action buttons are persistent at the bottom of the screen (Floating Action Button or Full-width pinned button).
- **Desktop (Administrator):** Split-view layouts with a persistent map on the right and data list/filters on the left.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** supplemented by **Subtle Ambient Shadows**.

- **Level 0 (Background):** #F2F2ED. The base canvas.
- **Level 1 (Cards/Surface):** White (#FFFFFF) with a very soft shadow (4dp blur, 8% opacity secondary color tint). Used for standard information blocks.
- **Level 2 (Active/Interactive):** 8dp elevation. Used for elements currently being interacted with or high-priority alerts.
- **Modal/Overlays:** 16dp elevation with a 20% scrim (dimming) of the secondary color (#464B71).

**Outline Usage:** 
Use 1px borders in #464B71 (at 12% opacity) for input fields and non-elevated containers to maintain structure without adding "weight."

## Shapes

The shape language utilizes **Rounded (Level 2)** corners to align with Material 3 standards while maintaining a professional, non-playful appearance.

- **Small Components (Buttons, Inputs):** 8px (0.5rem) radius.
- **Medium Components (Cards, Dialogs):** 16px (1.0rem) radius.
- **Large Components (Navigation Drawers, Sheets):** 24px (1.5rem) radius.

**Standardization:**
- Status "Chips" (e.g., "Dispatched") should always use the **Pill-shape** (fully rounded) to distinguish them from interactive buttons.
- All "Site" and "Depot" pins on maps should use a consistent teardrop shape with sharp points at the bottom for coordinate precision.

## Components

### Buttons
- **Primary:** Filled with #118AB2, White text. High-emphasis for "Submit Report" or "Start Route."
- **Secondary:** Outlined with #464B71. Medium-emphasis for "Edit" or "View Details."
- **Urgent Action:** Filled with #D81B60 (Critical Red). Reserved for "Report Road Blockage."

### Cards
- Cards must feature a vertical color-bar on the left edge to indicate **Severity** (e.g., Red bar for Critical sites, Yellow for High).
- Card content should lead with a Title, followed by 2-3 key metrics (Population, Needs).

### Input Fields
- Use "Filled" style with a clear bottom stroke. Labels must remain visible as floating text when the field is active to ensure the user doesn't lose context during multi-step data entry.

### Icons (Material Symbols Design)
- **Outline Style:** Default state for navigation and non-essential UI.
- **Solid Style:** Active states (e.g., the selected tab in the bottom bar) or critical warnings.
- **Specific Icons:** 
    - *Medical:* `medical_services`
    - *Food:* `nutrition`
    - *Water:* `water_drop`
    - *Road-Warning:* `warning_amber`

### Lists
- Use high-contrast dividers (1px, #464B71 at 8% opacity).
- Each list item must have a minimum height of 72dp for the Coordinator role to ensure easy scrolling and selection.