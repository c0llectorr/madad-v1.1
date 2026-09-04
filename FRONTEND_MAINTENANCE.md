# FRONTEND_MAINTENANCE.md — MADAD Mobile Frontend Refactoring Plan

**Goal:** Decompose the two monolithic screen files into independent, single-responsibility screens with a shared component library and a formal role-based router — **without breaking any working functionality**.

**Status:** 📋 PLAN — awaiting approval before implementation.

---

## 1. Why (current-state analysis)

| File | Lines | Functions crammed inside | Problems |
|---|---|---|---|
| `screens/coordinator/CoordinatorShell.tsx` | **2,095** | Shell + HomeTab + ReportsTab + MapTab + DispatchesTab + NewReportScreen + PlanResourcesScreen + ActiveRouteScreen + AssignSiteScreen + AssignCoordinatorList + convexHull + PressableRow | One file re-renders everything; every fix risks unrelated screens; hooks/state are entangled; impossible to test one screen |
| `screens/admin/AdminShell.tsx` | **797** | Shell + ResourcesTab + MapTab + CentersTab + CenterDepots + AccountsTab + SettingsTab + AdminMapTab + AddCenterScreen + AddCoordinatorScreen | Same: mixed page + form + modal + map logic |
| `ui.tsx` | 548 | 14 components in one file | Fine to keep temporarily; gets split into `components/` |
| `App.tsx` | 43 | Top-level session state + role switch | Role routing logic buried here |

Root causes of our recent bugs: state declared in one tab used in another, shared mutable props (`planningId` vs `planningSiteId`), patch-scripts failing on string mismatches inside giant files.

## 2. Principles we are applying (S.I.M.P.L.E.)

| Letter | Rule in this codebase |
|---|---|
| **S — Single responsibility** | One file = one screen OR one component. A page file never contains another page. |
| **I — Independent** | Screens receive data via props (or fetch in their own hook) and never import each other's internals. |
| **M — Modest components** | Generic UI primitives (Button, Field, SearchBox…) carry **zero business logic** and zero API calls. |
| **P — Pure logic extracted** | Algorithms (convex hull, nearest depot, haversine, label maps) live in `utils/` — testable without React. |
| **L — Limited, explicit routing** | Each role has ONE navigator that owns its tab state + modal stack, defined by a **role-scoped nav config** (the navigation bar can only ever show that role's permitted pages). |
| **E — Explicit contracts** | All shared TypeScript interfaces move to `src/types.ts`; screen props are typed interfaces; backend enums/maps live in `utils/constants.ts`. |

Security note: page access per role is a **UX boundary**; the real authorization stays backend-enforced (`require_role`) and is unchanged.

## 3. Target structure

```
mobile/src/
├── App.tsx                          # onboarding/login/session state only
├── theme.ts                         # design tokens (unchanged)
├── api.ts                           # fetch client (unchanged)
├── types.ts                         # NEW: Site, ReportRow, DispatchRow, CoordinatorRow,
│                                    #      Center, Depot, LoginResponse, Allocation, Damage
├── utils/
│   ├── geo.ts                       # NEW: convexHull, haversineKm, nearestDepot
│   └── constants.ts                 # NEW: NEED_API/NEED_LABELS, FLAG_API/FLAG_LABELS,
│                                    #      SEV_API, SEVERITIES, FLAG_TYPES, SEVERITY_BAR
├── components/                      # NEW: generic primitives — no API calls, no business logic
│   ├── Button.tsx                   # filled/outlined/critical/tertiary/text
│   ├── PillButton.tsx
│   ├── Card.tsx                     # severity edge-bar card
│   ├── Chip.tsx + StatusChip.tsx
│   ├── Field.tsx                    # labeled input (text/numeric/multiline/icon)
│   ├── SearchBox.tsx                # NEW: magnifier + TextInput (admin search reuse)
│   ├── FilterChips.tsx              # NEW: single-select chip row (province/center filters)
│   ├── Stepper.tsx                  # numeric input + ±10
│   ├── AppBar.tsx
│   ├── Screen.tsx                   # page scaffold (appbar + scroll container)
│   ├── BottomNav.tsx                # renders ONLY the tabs passed by the role config
│   ├── Fab.tsx
│   └── feedback.tsx                 # Loading, Err, SectionTitle, Toast
├── navigation/
│   ├── RoleRouter.tsx               # NEW: role → navigator switch (extracted from App.tsx)
│   ├── coordinatorNav.ts            # 5 tabs: Home, Reports, Dispatches, Map, Profile
│   └── adminNav.ts                  # 5 tabs: Resources, Map, Centers, Accounts, Settings
├── screens/auth/
│   ├── OnboardingScreen.tsx         # moved
│   └── LoginScreen.tsx              # moved (keep your autofill edits verbatim)
├── screens/coordinator/
│   ├── CoordinatorNavigator.tsx     # tab state + modal stack + data fetching (shell)
│   ├── HomePage.tsx                 # dashboard: ACTION REQUIRED, stat tiles, top sites
│   ├── ReportsPage.tsx              # report list, AI extraction + review, edit entry
│   ├── DispatchPage.tsx             # ready-to-dispatch sites + dispatch list + assignment
│   ├── MapPage.tsx                  # map, layers, flagging, flood zone, active routes
│   ├── ProfilePage.tsx              # account info + logout
│   └── modals/
│       ├── NewReportModal.tsx       # free text / structured form + geocode picker
│       ├── PlanResourcesModal.tsx   # steppers → dispatch → coordinator assignment
│       ├── ActiveRouteModal.tsx     # driver screen + auto-reroute + GPS
│       └── AssignSiteScreen.tsx     # site → nearest depot → worker assignment
├── screens/admin/
│   ├── AdminNavigator.tsx           # tab state + modal stack + data fetching
│   ├── ResourcesPage.tsx            # global inventory cards + quick actions
│   ├── MapPage.tsx                  # national map + province FilterChips
│   ├── CentersPage.tsx              # centers + expandable depot/inventory management
│   ├── AccountsPage.tsx             # SearchBox + FilterChips + coordinator cards
│   ├── SettingsPage.tsx             # profile + logout
│   └── modals/
│       ├── AddCenterModal.tsx       # form + live map preview (keeps your geocoding)
│       └── AddCoordinatorModal.tsx  # form + access-level panel
└── LeafletMap.tsx                   # map engine (unchanged — already isolated)
```

**Import direction (no cycles):**
`theme/api/types/utils → components → navigation config → screens → navigator → App.tsx`
Screens may import `components`, `utils`, `types`, `api`. Components may import only `theme` + `types`. Nothing imports from a screen.

## 4. Role-scoped routing design

- `coordinatorNav.ts` / `adminNav.ts` each export `{ tabs: NavTab[], modals: [...] }` — the **BottomNav is rendered from this config**, so a role physically cannot show another role's tab.
- Each navigator is a thin component: holds `const [tab, setTab]` + `const [modal, setModal]` (typed union), performs the shared data fetches once (`load()`), and passes data+callbacks to page components as props. Pages stay prop-driven → trivially testable and independently editable.
- RoleRouter (from `App.tsx`): `session.role === 'administrator' ? <AdminNavigator/> : <CoordinatorNavigator/>` — the only place that knows about both roles.
- Cross-tab navigation (e.g. "Generate Plan" → Plan modal, "Go to dispatch screen" → Map tab) becomes explicit navigator callbacks (`openPlan(alloc, site)`, `goToTab('map')`) instead of ad-hoc state.

## 5. Performance rules applied during the move

- `useMemo` for every derived list (filters, sorting, hull) — already partially done, made systematic.
- `useCallback` for all callbacks passed down (prevents child re-renders).
- `React.memo` on heavy leaf components (site cards, worker cards, map marker arrays).
- Stable keys; no inline object/array literals inside `map` renders.
- No new libraries; the bundle stays the same size or smaller.

## 6. Migration plan — phases with verification gates

> Rule: **move code verbatim first, improve later.** Every phase ends with all gates green.

**Phase 0 — Baseline (5 min)**
- `npx tsc --noEmit` clean → git commit as checkpoint.

**Phase 1 — `types.ts` + `utils/` (pure extraction)**
- Move all interfaces out of the shells; move `convexHull`, haversine/nearestDepot, and all label maps.
- Gates: `tsc` clean, `expo export` OK, app behavior unchanged.

**Phase 2 — Component library (`components/`)**
- Split `ui.tsx` into one file per component; `ui.tsx` becomes a 1-line re-export barrel so existing imports keep working mid-migration.
- Add `SearchBox.tsx` + `FilterChips.tsx` (extracted from admin Accounts/Map pages).
- Gates: `tsc` clean, barrel re-exports verified.

**Phase 3 — Coordinator decomposition (the big one)**
- 3a: Create `CoordinatorNavigator.tsx` as a copy of the current shell (identical behavior).
- 3b: Move each tab/modal into its own file **verbatim**, converting tab props into a typed `PageProps` interface. One commit per screen so a regression is bisectable.
- 3c: Switch imports from barrel to explicit components; delete moved code from the shell; shell shrinks to ~120 lines.
- Gates after each screen: `tsc` clean; manual smoke: report → extract → confirm → plan → dispatch → assign → driver route → map flags.

**Phase 4 — Admin decomposition**
- Same as Phase 3: Resources, Map (province FilterChips), Centers (+depot panel), Accounts (SearchBox + FilterChips), Settings, Add modals.
- Gates: `tsc` clean; manual smoke: create center → depot → stock → coordinator → national map filter.

**Phase 5 — RoleRouter + nav configs**
- Extract role switch from `App.tsx` into `navigation/RoleRouter.tsx`; BottomNav renders from `coordinatorNav`/`adminNav` configs.
- Gates: both roles' tab bars match today's tabs exactly; deep navigation (plan→map) still works.

**Phase 6 — Cleanup**
- Delete `ui.tsx` barrel + the two monolith shells; final `tsc` + `expo export` + full API smoke chain; update `README.md` project-structure section; git commit/tag.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| String-patch breakage while moving code | Files are **rewritten whole**, not patched — no more sed/assert patch failures |
| Cross-screen state (e.g. plan → map navigation) | Modal stack types + explicit navigator callbacks defined up front (Phase 3a) |
| Your recent manual edits (login autofill, geocode picker, toasts) get lost | Migration moves files verbatim — your code is carried over, not rewritten |
| Regression in a working screen | One-commit-per-screen + smoke checklist per phase |
| Stale bundle confusion on device | Version marker in Profile/Settings page (`v` + build date) so "did I reload?" is visible |

## 8. What will NOT change

- Every API endpoint, request/response shape, and the backend — untouched.
- Theme tokens, colors, screen layouts, and all current user-facing behavior.
- `LeafletMap.tsx` internals (already isolated) — only its import sites change.
- Your `.env` files, API keys, and the seed data.
