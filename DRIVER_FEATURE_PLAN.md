# DRIVER FEATURE — Implementation Plan

**Status:** 📋 PLAN → implementing immediately after (per instruction: plan first, then build).

---

## 1. The scenario, decomposed into requirements

| # | Actor | Requirement |
|---|---|---|
| R1 | Coordinator | Report confirmed → **Generate Plan** calls the **same AI model** that did extraction; AI proposes resources + reasoning; a **draft plan is persisted** (not transient). |
| R2 | Coordinator | Plan editor: add/remove resource quantities **constrained to depot stock**; plan is editable **only while `draft`**. |
| R3 | Coordinator | **Finalize Plan** → `finalized` (still editable? NO — frozen for quantities; next step is assignment). |
| R4 | Coordinator | **Assign Driver screen**: all drivers of the center, with the **depot each driver works at**, **filter by depot / support center**, **search by name/depot**; assign → dispatch is created from that driver's depot with the plan's items. |
| R5 | System | Once assigned: plan → `assigned` (**locked**, no edit/delete); driver status → `on_route`; inventory deducted transactionally; site → `dispatched`. |
| R6 | Driver | Logs in (new role `driver`) → sees **only their assigned dispatches** → opens one → sees the **plan** (read-only) → **Start Journey** (after loading truck) → `en_route`. |
| R7 | Driver | Live street-following polyline from their GPS to destination, **auto-updating on movement**; **flag damage** (tap map / GPS button); **reroute** (auto + manual); **Delivered** ends the route. |
| R8 | Coordinator | Map shows routes **only of drivers he assigned** (dispatches he created). |
| R9 | Admin | User creation modal gains a **role picker** (coordinator / driver); driver requires a **depot**. |
| R10 | Data | 10 dummy drivers per depot (250 total) with real Pakistani names; all start `available`. |

## 2. Database changes

```sql
-- role extension
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('administrator', 'coordinator', 'driver'));

-- drivers: a user (role=driver) attached to exactly one depot
CREATE TABLE drivers (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  depot_id   INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  status     VARCHAR(20) NOT NULL DEFAULT 'available'
             CHECK (status IN ('available', 'on_route')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_drivers_depot ON drivers(depot_id);

-- plans are now FIRST-CLASS persisted rows (previously computed transiently)
CREATE TABLE plans (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  center_id    INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
  generated_by INTEGER REFERENCES users(id),
  source       VARCHAR(10) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  reasoning    TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'finalized', 'assigned')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plan_items (
  id            SERIAL PRIMARY KEY,
  plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  resource_type VARCHAR(40) NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  UNIQUE (plan_id, resource_type)
);

ALTER TABLE dispatches
  ADD COLUMN plan_id   INTEGER REFERENCES plans(id),
  ADD COLUMN driver_id INTEGER REFERENCES drivers(id);
CREATE INDEX idx_dispatches_driver ON dispatches(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX idx_plans_site ON plans(site_id);
```

`users.availability` is already gone; drivers get their own `drivers.status` (display-only — assignment is not gated by it, per your earlier direction).

## 3. Backend design (new/changed endpoints)

| Endpoint | Method | Role | Behavior |
|---|---|---|---|
| `/plan/generate` | POST | coordinator | **AI plan**: same Groq model, new `generate_relief_plan` tool → `{items:[{resource_type,quantity}], reasoning}` given site + depot stock; **persists** `plans(draft)` + `plan_items`; deterministic fallback if AI unavailable. One open draft per site. |
| `/plans/{id}` | GET | coord/driver | Plan + items + site + depot. |
| `/plans/{id}/items` | PATCH | coordinator | Replace quantities — **409 if plan not `draft`** (R5 lock). |
| `/plans/{id}/finalize` | POST | coordinator | `draft → finalized`. |
| `/plans?center_id&status` | GET | coordinator | List plans for the Dispatches tab. |
| `/plans/{id}/assign` | POST | coordinator | Body `{driver_id}`. Validates: plan `finalized`, site has no active dispatch, driver exists → **one transaction**: create dispatch (driver's depot, plan items, `driver_id`, `plan_id`), deduct inventory w/ row locks, `plan→assigned`, `driver→on_route`, `site→dispatched`. |
| `/drivers?center_id&depot_id&search` | GET | coordinator | Drivers w/ user + depot info (name/status/depot) — powers the Assign Driver screen filters. |
| `/drivers/my/dispatches` | GET | driver | Driver's own dispatches (with plan items). |
| `/dispatch/{id}/status` | PATCH | coord + **driver** | Drivers may update **only their own** dispatch. |
| `/dispatch/{id}/reroute` | POST | coord + **driver** | Drivers may reroute **only their own** dispatch. |
| `/roads/damage` | POST | coord + **driver** | Drivers flag damage (already the field use-case). |
| `/accounts/coordinators` | POST | admin | Accepts `role: coordinator|driver` (+ `depot_id` for drivers) → creates user **and** driver row. |
| `/accounts/coordinators` | GET | admin | Returns both roles w/ `role` + depot name. |

## 4. Frontend design (follows FRONTEND_MAINTENANCE.md structure)

**RoleRouter:** `driver → DriverNavigator`.

**Driver** (tabs: My Dispatches · Map · Profile):
- `DriverDispatchesPage` — assigned dispatches w/ status chips; tap → `DriverDispatchModal`:
  - plan items as a **loading checklist**, "Start Journey" button (`en_route`) → jumps into `ActiveRouteModal` (reused — live auto-reroute polyline already built), Delivered ends route.
- Driver Route = existing `ActiveRouteModal` (no changes needed — it already auto-recomputes on movement).
- Flagging: already in ActiveRouteModal (long-press/tap + GPS button).

**Coordinator:**
- Reports page: "Generate Plan" → AI plan → **`PlanEditorModal`** (new): steppers bounded by depot stock (`stock - qty` guard), "Finalize Plan" → **`AssignDriverModal`** (new): driver cards (name + depot), FilterChips by depot, SearchBox, Assign → done → Dispatches tab.
- `DispatchPage`: "Ready to Dispatch" now lists **plans** (draft → tap to edit; finalized → tap to assign driver); below, active/past dispatches (now showing assigned **driver name**).
- `MapPage`: routes layer filtered to `dispatched_by === me` (R8).

**Admin:**
- `AddCoordinatorModal` → renamed behavior: role picker (coordinator/driver); driver → depot selector (chips). Accounts list shows role chips.

## 5. Algorithms & efficiency

- AI plan quantities: bounded by `min(ai_qty, depot_stock)`; quantities scale with population & needs (AI prompt includes both + stock table so suggestions are realistic).
- Nearest-depot/driver: O(n) squared-distance compare (n ≤ 25) — no premature optimization.
- Auto-reroute throttle already in `ActiveRouteModal` (150 m / 45 s) — reused as-is for drivers.
- Driver list filtering: client-side over one fetch (≤250 rows) — no server round-trips per keystroke.

## 6. Execution order

1. DB migration (live DB + `schema.sql`).
2. Models (`Driver`, `Plan`, `PlanItem`) + schemas.
3. Backend: AI plan service + plan/driver/driver-permission endpoints.
4. Seed: 250 drivers + user accounts (append to `seed_dummy.sql`, run live).
5. Frontend: DriverNavigator + pages; coordinator PlanEditor + AssignDriver; admin AddUser; map filter.
6. Gates: `tsc` clean, bundle export, live API chain (report → AI plan → edit → finalize → assign → driver login → start → reroute → deliver), cleanup.

## 7. Out of scope (explicitly)
- Real-time driver GPS streaming to coordinator (polling via dispatch list refresh is used instead).
- Driver chat/notifications.
