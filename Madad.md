# MADAD — Complete Technical Documentation

> **Audience:** the developer who will maintain and extend this application.
> **Scope:** everything — architecture, database, backend services, API contracts, mobile frontend, algorithms, environment, runbooks, and the reasoning behind every major decision.
> **Last verified against the codebase:** September 2026 (see `git log`; driver-role feature commit `2e43440`, refactor commit `b5275a1`).

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Problem Statement](#2-problem-statement)
3. [The Solution Implemented](#3-the-solution-implemented)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Repository Layout](#5-repository-layout)
6. [Database — Schema, Keys, Indexes](#6-database)
7. [Backend — Deep Dive](#7-backend)
8. [API Contracts — Every Endpoint](#8-api-contracts)
9. [Frontend (React Native / Expo) — Deep Dive](#9-frontend)
10. [The Map Engine](#10-the-map-engine)
11. [Algorithms](#11-algorithms)
12. [Roles & Permission Matrix](#12-roles--permission-matrix)
13. [Environment & Configuration](#13-environment--configuration)
14. [Runbooks — Running Everything](#14-runbooks)
15. [Connecting Frontend to Backend](#15-connecting-frontend-to-backend)
16. [Seeded Demo Data & Credentials](#16-seeded-demo-data--credentials)
17. [Testing & Verification](#17-testing--verification)
18. [Known Limitations & Design Decisions](#18-known-limitations--design-decisions)
19. [Troubleshooting — Field-Tested](#19-troubleshooting)
20. [Glossary](#20-glossary)

---

# 1. Introduction

**MADAD** (Urdu/Hindi: *مَدَد* — "help/aid") is a flood-relief coordination platform built for Pakistan. It connects three kinds of people during a flood emergency:

- **Administrators** who set up the relief network: support centers, depots, warehouse stock, and personnel accounts.
- **Coordinators** who ingest flood reports (free text or structured forms), let an LLM extract structured data, prioritize affected sites with a deterministic formula, generate resource plans (AI-assisted), and dispatch convoys from the nearest depot by assigning truck drivers.
- **Truck Drivers** who execute a dispatch: load the truck per the plan's checklist, drive the assigned route on a live street-following map, flag damaged/submerged roads they encounter, get re-routed around them automatically, and mark the delivery complete.

The mobile app is the primary interface (field coordinators and drivers work from phones); there is also an admin-capable view inside the same app (the administrator role sees a national operations map and resource/account management pages).

> **One-sentence summary:** *MADAD turns "a phone call saying 200 people are stranded near Jampur" into a prioritized, stocked, routed, driver-assigned relief convoy — with every step auditable and every road hazard shared across the whole network in real time.*

---

# 2. Problem Statement

During the 2022 Pakistan super-floods (33 million displaced), relief coordination failed in predictable ways:

1. **Information is unstructured.** Field reports arrive as phone calls and WhatsApp texts: *"220 log kot abdul malik phasy hue hain"*. Someone upstream must manually parse location, headcount, and needs — slowly and with errors.
2. **Prioritization is ad-hoc.** Who gets the last 400 food packs — the site with 500 people, or the one with 200 and an injury report? Without a formula, the loudest caller wins.
3. **Roads are collapsing in real time.** A convoy's planned route dies at a washed-out bridge. Nobody upstream knows, and rerouting happens by guesswork at the roadside.
4. **Inventory is opaque.** Two depots both promise the same 100 food packs because nobody holds a lock on the stock record.
5. **Accountability disappears.** After the flood, nobody can say which convoy was assigned to whom, what it carried, which roads were blocked, or how many times a route was changed.

MADAD addresses each of these directly (see §3).

---

# 3. The Solution Implemented

| Problem | MADAD's answer | Where it lives |
|---|---|---|
| Unstructured reports | **AI extraction**: free text → strict-JSON tool call returning location, headcount, needs, urgency flags; automatic geocoding constrained to Pakistan | Backend `services/planning_ai.py` sibling: `services/extraction/*`, route `POST /api/reports/{id}/extract` |
| Manual geocoding misses | Report review screen with interactive map, **place search (Nominatim, Pakistan-only)**, manual lat/lng entry | Mobile `screens/coordinator/ReportsPage.tsx`, `components/PlaceSearch.tsx` (admin AddCenter also geocodes) |
| Ad-hoc prioritization | **Deterministic priority score**: population + urgency-flag weights + severity weight + corroboration bonus + time decay. Rendered as a human-readable reasoning string. **The AI never ranks people.** | `services/prioritization.py` |
| Roads collapsing | **Damage-aware routing**: any user flags a point → snapped once to the nearest OSM road edge → that edge is *structurally excluded* from all future path computation (weight function returns `None`) | `services/routing.py`, `POST /api/roads/damage` |
| Inventory opacity | **Transactional dispatch**: `SELECT … FOR UPDATE` row locks on depot inventory, atomic deduction, DB-level `quantity >= 0` CHECK as the second line of defense | `POST /api/dispatch`, `POST /api/plans/{id}/assign` |
| Accountability | Append-only audit trail: reports (with `extracted_json`), sites (status machine), dispatches (driver, plan, items), `dispatch_reroutes` (every reroute with old/new ETA and position) | Database §6 |
| AI plans that humans control | Plan generation is AI-*proposed* but **persisted as an editable draft**; the coordinator adjusts quantities within depot stock, finalizes, then assigns a driver. Assignment **locks** the plan. | `plans`/`plan_items` tables, `POST /api/plan/generate`, `PATCH /api/plans/{id}/items`, `POST /api/plans/{id}/assign` |

---

# 4. High-Level Architecture

```
┌─────────────────────────────┐        HTTPS/JSON         ┌──────────────────────────────┐
│  Mobile app (Expo, RN 0.86) │ ◄──────────────────────► │  FastAPI backend (:8000)     │
│  TypeScript                 │   Bearer JWT per request  │                              │
│                             │                           │  ┌────────────────────────┐  │
│  components/  (primitives)  │                           │  │ api/routes/* (38 ep.)  │  │
│  navigation/  (role router) │                           │  │ services/* (domain)    │  │
│  screens/{coordinator,      │                           │  └───────────┬────────────┘  │
│            admin,driver}/   │                           │              │ SQLAlchemy 2.0│
└──────────────┬──────────────┘                           │  ┌───────────▼────────────┐  │
               │ WebView                                  │  │ PostgreSQL 16 (:5433)  │  │
│  Leaflet 1.9.4 + OSM tiles ◄┼── internet (tiles only) ──┤  └────────────────────────┘  │
└─────────────────────────────┘                           └──────────────┬───────────────┘
                                                                         │
                                            ┌────────────────────────────┼─────────────────┐
                                            │                            │                 │
                                  ┌─────────▼─────────┐       ┌──────────▼───────┐  ┌─────▼──────────┐
                                  │ OSMnx + NetworkX  │       │ Groq API (LLM)   │  │ Google Geocode │
                                  │ road graph in RAM │       │ extraction+plans │  │ API v4         │
                                  │ (184k nodes)      │       └──────────────────┘  └────────────────┘
                                  └───────────────────┘
```

**Key architectural decisions (and why):**

- **The road graph lives in RAM, loaded exactly once at startup.** Routing requests never touch the network for graph data. The 478,003-edge graph (184,270 OSM nodes — DG Khan→Rajanpur corridor + Lahore region) is loaded from a committed 208 MB GraphML file. Startup takes ~2 minutes; every route afterwards is milliseconds.
- **Damaged edges are structurally excluded, not penalized.** The path-weight function returns `None` for damaged edges, which NetworkX treats as "edge does not exist". A damaged-only path therefore *raises* `NetworkXNoPath` instead of quietly routing through it.
- **Maps in the mobile app are display-only** (OpenStreetMap tiles via Leaflet in a WebView — zero map API keys). The *routing* brain is entirely server-side over the in-memory graph.
- **AI proposes; humans decide.** The LLM extracts reports and drafts resource plans, but priority ranking is a pure formula and every AI quantity is capped by real depot stock and editable by the coordinator before assignment.
- **PostgreSQL only.** No SQLite, no offline sync — the team confirmed an always-connected operating assumption.

---

## 5. Repository Layout — only what's needed to run the app

Everything below is **required to run MADAD** (plus `Madad.md` itself for reference). Process documents, design sources, caches (`node_modules/`, `__pycache__/`), the Python `venv/`, and environment secrets (`.env`) are **not** committed — `.gitignore` excludes them, and §13 explains how to create the secrets from the shipped examples.

```
madad/
├── .gitignore                        # excludes secrets, caches, venv, node_modules, docs
├── .gitattributes                    # Git LFS tracking for *.graphml (the 208 MB road graph)
├── docker-compose.yml                # PostgreSQL 16 → host port 5433
├── Madad.md                          # this documentation
│
├── backend/
│   ├── .env.example  ← ① copy to backend/.env and fill in the API keys:
│   │        DATABASE_URL, GROQ_API_KEY (AI extraction + plans),
│   │        GOOGLE_MAPS_API_KEY (geocoding), JWT_SECRET
│   ├── requirements.txt              # pinned Python dependencies
│   ├── app/
│   │   ├── main.py                   # FastAPI app; registers all routers; loads the road graph
│   │   ├── models.py                 # all 11 SQLAlchemy ORM models
│   │   ├── api/
│   │   │   ├── deps.py               # JWT auth + require_role() permission gates
│   │   │   └── routes/               # 10 modules = the API surface (§8):
│   │   │       auth.py accounts.py centers.py depots.py reports.py sites.py
│   │   │       plan.py plans.py roads.py dispatch.py
│   │   ├── core/config.py            # pydantic-settings (reads backend/.env)
│   │   ├── core/security.py          # bcrypt hashing + JWT creation
│   │   ├── schemas/__init__.py       # pydantic request models
│   │   ├── db/session.py             # SQLAlchemy engine + session dependency
│   │   └── services/                 # domain logic:
│   │       routing.py                #   road-graph singleton, damage-aware paths
│   │       extraction/               #   AI report extraction (groq/gemini/qwen)
│   │       planning_ai.py            #   AI resource-plan generation
│   │       geocoding.py              #   Google Geocoding v4 (Pakistan filter)
│   │       prioritization.py         #   deterministic priority score
│   │       replanning.py             #   site re-ranking
│   ├── database/geodata/
│   │   └── demo_corridor.graphml     # ② the 208 MB OSM road graph (via Git LFS) — REQUIRED
│   ├── postgres/
│   │   ├── schema.sql                # ③ full DDL — auto-applied on first container start
│   │   ├── seed_dummy.sql            # ④ demo dataset (5 centers, 25 coordinators, 25 depots, stock)
│   │   └── seed_drivers.sql          # ⑤ 250 drivers (10 per depot)
│   └── scripts/
│       ├── bootstrap_admin.py        # ⑥ creates the first administrator account
│       └── fetch_graph.py            # ⑦ regenerates demo_corridor.graphml (if not via LFS)
│
└── mobile/
    ├── .env.example  ← ⑧ copy to mobile/.env and set EXPO_PUBLIC_API_URL
    │        (http://<PC-LAN-IP>:8000/api — connects the app to the backend)
    ├── app.json                      # Expo config (name, icons, Android map key slot)
    ├── index.ts · tsconfig.json · package.json
    ├── assets/                       # icons & splash images
    └── src/
        ├── App.tsx                   # session state: onboarding → login → RoleRouter
        ├── api.ts                    # fetch client (reads EXPO_PUBLIC_API_URL, Bearer token)
        ├── theme.ts                  # design tokens (colors, typography, radii)
        ├── types.ts                  # shared TypeScript interfaces
        ├── LeafletMap.tsx            # map engine (WebView + Leaflet + OSM tiles)
        ├── utils/                    # geo.ts (hull/haversine/nearest), constants.ts (label maps)
        ├── components/               # 14 reusable UI primitives + index.ts barrel
        ├── navigation/               # RoleRouter.tsx + coordinatorNav.ts + adminNav.ts
        └── screens/
            ├── OnboardingScreen.tsx · LoginScreen.tsx
            ├── coordinator/          # CoordinatorNavigator + 4 pages + Profile
            │   ├── components/       # PlaceSearch, AssignCoordinatorList
            │   └── modals/           # NewReport, PlanEditor, AssignDriver, ActiveRoute, AssignSite
            ├── admin/                # AdminNavigator + 5 pages + adminStyles
            │   └── modals/           # AddCenter, AddCoordinator (role picker)
            └── driver/               # DriverNavigator (driver role tabs)
```

**Numbered "setup touchpoints" (①–⑧) are the files you create or configure before the first run — they map 1:1 to the runbooks in §14.**

Notes:
- `backend/tests/` exists in the working tree for developers (unit + smoke tests, §17) but is **not** required to run the app, so it is omitted from this run-structure view.
- Process/design artifacts (`STATUS.md`, `WRITEUP.md`, `FRONTEND_MAINTENANCE.md`, `DRIVER_FEATURE_PLAN.md`, `MOBILE_TESTING_GUIDE.md`, `MADAD_UI/` design screens) are deliberately **not in the repository** — they live on the development machine only and are listed in `.gitignore`.
- `.env` files are never committed; the `.env.example` files (tracked) document every variable the app needs, including the API keys listed in §13.

---
# 6. Database

## 6.1 Engine & connection

- **PostgreSQL 16**, run in Docker (`docker-compose.yml`), exposed on **host port 5433** (5432 is occupied by a native Windows Postgres on the dev machine — documented quirk, see §19.2).
- Connection string lives in `backend/.env` → `DATABASE_URL=postgresql://madad:madad@localhost:5433/madad`.
- SQLAlchemy 2.0 typed ORM (`app/models.py`); `db/session.py` exposes `SessionLocal` and a `get_db()` FastAPI dependency (session per request, `finally: close()`).

## 6.2 Tables, primary keys, and purpose

All PKs are `SERIAL` (auto-increment integers). Every table also has `created_at`/`updated_at` style timestamps unless noted.

### `support_centers` — administrative hubs (one per province/federal area)
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | referenced by nearly everything |
| code | VARCHAR(20) UNIQUE NOT NULL | e.g. `PB-01` — shown in UI |
| name | VARCHAR(120) NOT NULL | e.g. *Punjab Provincial Relief Center* |
| region | VARCHAR(80) | e.g. `Punjab` — used by the admin map filter |
| lat, lng | DOUBLE PRECISION NOT NULL | center location (map pin) |

Purpose: the **organizational anchor**. Users, reports, sites, plans, dispatches all hang off a center; every coordinator query is center-scoped. A center holds **no inventory** — depots do.

### `users` — all human accounts, all three roles
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER FK → support_centers.id **ON DELETE CASCADE**, *nullable* | NULL **only** for administrators. A coordinator/driver must always have one — enforced in app code (`MADAD_BACKEND.md` Story A2 style), because one column can't carry two nullability rules for two roles. |
| username | VARCHAR(60) UNIQUE NOT NULL | login name |
| password_hash | VARCHAR(255) NOT NULL | bcrypt (passlib) |
| role | VARCHAR(20) NOT NULL CHECK (`'administrator' | 'coordinator' | 'driver'`) | |
| is_active | BOOLEAN NOT NULL DEFAULT true | deactivation instead of deletion (audit trail) |
| created_by | INTEGER FK → users.id, nullable | who created this account |

> **Data rule:** users are *never hard-deleted*. Deactivation flips `is_active`; the JWT check and every query filter on it.

### `reports` — raw and AI-processed field reports
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER NOT NULL FK → support_centers CASCADE | |
| submitted_by | INTEGER FK → users.id, nullable | |
| source | VARCHAR(20) CHECK (`'manual' | 'sms_stub'`) | SMS ingestion stubbed for the future |
| raw_text | TEXT, nullable | free-text reports |
| extracted_json | JSONB, nullable | AI output: location, population, needs[], flags[], lat/lng, confidence |
| status | VARCHAR(20) CHECK (`'pending_extraction' | 'extracted' | 'confirmed' | 'rejected'`) | state machine; `confirmed` creates/updates a site |

### `sites` — confirmed affected locations (the map's pins)
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER NOT NULL FK CASCADE | |
| report_id | INTEGER FK → reports.id **ON DELETE SET NULL** | report↔site link (edits flow back through it) |
| location_name | VARCHAR(150) NOT NULL | |
| lat, lng | DOUBLE PRECISION NOT NULL | from geocoder, map picker, or manual entry |
| estimated_population | INTEGER NOT NULL DEFAULT 0 | drives the priority score |
| needs | JSONB NOT NULL DEFAULT '[]' | e.g. `["food","water"]` |
| urgency_flags | JSONB NOT NULL DEFAULT '[]' | e.g. `["water_rising","children_present"]` |
| severity | VARCHAR(20) CHECK (`'low'|'medium'|'high'|'critical'` OR NULL) | |
| confidence | VARCHAR(20) CHECK (`'single_unverified'|'corroborated'`) | |
| priority_score | DOUBLE PRECISION, nullable | computed by `prioritization.py` |
| status | VARCHAR(20) CHECK (`'unserved'|'planned'|'dispatched'|'delivered'`) | forward-only machine |

### `depots` — physical warehouses (hold the stock)
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER NOT NULL FK CASCADE | belongs to one center; 5 per center in the seed |
| name | VARCHAR(120) NOT NULL | |
| lat, lng | DOUBLE PRECISION NOT NULL | dispatch origin for routing |

### `inventory` — stock lines, one row per (depot, resource)
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| depot_id | INTEGER NOT NULL FK CASCADE | |
| resource_type | VARCHAR(40) NOT NULL | free-text: `food`, `water`, `medicine`, `clothes`, `boats`, … |
| quantity | INTEGER NOT NULL DEFAULT 0 **CHECK (quantity >= 0)** | second line of defense behind the row-locked dispatch transaction |
| **UNIQUE (depot_id, resource_type)** | | one line per resource per depot |

### `plans` + `plan_items` — persisted, human-editable AI resource plans
| plans.column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| site_id | INTEGER NOT NULL FK CASCADE | one active plan lifecycle per site |
| center_id | INTEGER NOT NULL FK CASCADE | |
| generated_by | INTEGER FK → users.id, nullable | coordinator who generated it |
| source | VARCHAR(10) CHECK (`'ai' | 'manual'`) | `ai` = LLM proposal; `manual` = heuristic fallback |
| reasoning | TEXT, nullable | the model's justification — rendered in the UI |
| status | VARCHAR(20) CHECK (`'draft' | 'finalized' | 'assigned'`) | **edit-lock state machine**: quantities editable only in `draft`; `assigned` is terminal |

| plan_items.column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| plan_id | INTEGER NOT NULL FK CASCADE | |
| resource_type | VARCHAR(40) NOT NULL | |
| quantity | INTEGER NOT NULL CHECK (>= 0) | |
| **UNIQUE (plan_id, resource_type)** | | |

### `dispatches` — the convoy record
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER NOT NULL FK CASCADE | |
| site_id | INTEGER NOT NULL FK CASCADE | destination |
| depot_id | INTEGER NOT NULL FK CASCADE | origin |
| dispatched_by | INTEGER FK → users.id, nullable | **coordinator who created/assigned it** — powers the "my drivers" map filter (R8) |
| plan_id | INTEGER FK → plans.id, nullable | the plan being executed |
| driver_id | INTEGER FK → drivers.id, nullable | assigned driver |
| resources_loaded | JSONB NOT NULL | snapshot of quantities at dispatch time |
| route_geojson | JSONB, nullable | GeoJSON LineString of the route (streets or fallback) |
| distance_km | DOUBLE PRECISION, nullable | |
| eta_minutes | INTEGER, nullable | |
| status | VARCHAR(20) CHECK (`'planned' | 'en_route' | 'delivered'`) | forward-only |

### `damaged_roads` — snapped road hazards (shared network-wide)
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| center_id | INTEGER NOT NULL FK CASCADE | derived from the **driver's depot** or the coordinator's center |
| reported_by | INTEGER FK → users.id, nullable | |
| lat, lng | DOUBLE PRECISION NOT NULL | reported point (map flag) |
| edge_u, edge_v | BIGINT NOT NULL | **OSM node IDs — snapped ONCE at insert time, never recomputed** |
| edge_geometry | JSONB, nullable | GeoJSON of the severed segment (for drawing); straight-line fallback for straight edges |
| reason | VARCHAR(200), nullable | |
| active | BOOLEAN NOT NULL DEFAULT true | soft-deactivation |

> **Graph-generation caveat (documented in `MADAD_DATABASE.md`):** edge IDs are only valid against the graph file they were snapped against. Replacing `demo_corridor.graphml` requires reviewing active damage rows. OSM node IDs are globally stable, so rows survive graph *extensions* (like our Lahore addition) — but verify after any re-fetch.

### `drivers` — driver profile: user + home depot
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | this is the `dispatches.driver_id` value |
| user_id | INTEGER NOT NULL **UNIQUE** FK → users.id CASCADE | the login account (role must be `driver`) |
| depot_id | INTEGER NOT NULL FK → depots.id CASCADE | home depot — determines dispatch origin **and** damage-flag center |
| status | VARCHAR(20) CHECK (`'available' | 'on_route'`) | **display-only** — assignment is not gated by it (removed by user decision) |

### `dispatch_reroutes` — reroute audit log
| Column | Type | Notes |
|---|---|---|
| **id** | SERIAL PK | |
| dispatch_id | INTEGER NOT NULL FK CASCADE | |
| triggered_by | INTEGER FK → users.id, nullable | |
| current_lat, current_lng | DOUBLE PRECISION NOT NULL | where the vehicle was |
| old_eta_minutes, new_eta_minutes | INTEGER | the cost of the detour |
| reason | VARCHAR(200), nullable | |

> This table exists so a multi-hop journey (the DG Khan → Rajanpur demo story) can be replayed: *a convoy that rerouted three times and still arrived.*

## 6.3 Foreign keys — the relationship map

```
support_centers 1──* users            (center_id; NULL for admins)
support_centers 1──* reports          (CASCADE)
support_centers 1──* sites            (CASCADE)
support_centers 1──* depots           (CASCADE)
support_centers 1──* dispatches       (CASCADE)
support_centers 1──* plans            (CASCADE)
support_centers 1──* damaged_roads    (CASCADE)

users            1──1 drivers         (user_id UNIQUE CASCADE — a driver profile)
users            1──* reports         (submitted_by, SET NULL not used for delete)
users            1──* dispatches      (dispatched_by — "who assigned it")
users            1──* plans           (generated_by)

depots           1──* inventory       (CASCADE)
depots           1──* drivers         (CASCADE)
depots           1──* dispatches      (depot_id — origin)

reports          1──0..1 sites        (report_id ON DELETE SET NULL)
sites            1──* plans           (CASCADE)
plans            1──* plan_items      (CASCADE)
plans            1──* dispatches      (plan_id nullable — a dispatch executes one plan)
drivers          1──* dispatches      (driver_id nullable — who drives it)
dispatches       1──* dispatch_reroutes (CASCADE)
```

**Delete semantics summary:** operational records (reports, sites, dispatches, plans, reroutes) are never hard-deleted by the app; `ON DELETE CASCADE` exists only as a safety net for center-level cleanup. `sites.report_id` uses `SET NULL` so deleting a report doesn't destroy the site.

## 6.4 Indexes — and the query each serves

| Index | Columns | Query it serves |
|---|---|---|
| `idx_sites_center_status` | sites(center_id, status) | Coordinator map & dispatch lists: "all unserved sites in my center" |
| `idx_dispatches_center_status` | dispatches(center_id, status) | DispatchPage list, coordinator route filters |
| `idx_reports_center_status` | reports(center_id, status) | ReportsPage: "pending extraction" count |
| `idx_users_center_role` | users(center_id, role) | Roster fetches: coordinators/drivers of a center |
| `idx_damaged_roads_center_active` | damaged_roads(center_id, active) | Map damage layer + routing exclusion-set build |
| `idx_drivers_depot` | drivers(depot_id) | Assign-Driver screen's depot filter |
| `idx_dispatches_driver` (partial: WHERE driver_id IS NOT NULL) | dispatches(driver_id) | Driver app: "my dispatches" |
| `idx_plans_site` | plans(site_id) | "one open draft per site" check in plan/generate |
| (unique) users.username | | login lookups |
| (unique) inventory(depot_id, resource_type) | | stock adjustment + dispatch deduction |
| (unique) plan_items(plan_id, resource_type) | | quantity edits |
| (unique) drivers.user_id | | one profile per driver user |

---

# 7. Backend — Deep Dive

## 7.1 Stack & why

| Library | Version | Why it's here |
|---|---|---|
| FastAPI | 0.115.0 | async routes, automatic OpenAPI docs at `/docs`, pydantic validation, dependency injection for auth/db |
| uvicorn[standard] | 0.30.6 | ASGI server (httptools, watchfiles) |
| SQLAlchemy 2.0.35 | | typed ORM, `with_for_update()` row locks for inventory |
| psycopg2-binary | 2.9.9 | PostgreSQL driver |
| python-jose[cryptography] | 3.3.0 | JWT creation/validation (HS256) |
| passlib[bcrypt] | 1.7.4 | password hashing (**pinned `bcrypt==4.0.1`** — bcrypt 5.x breaks passlib's version probe) |
| osmnx | 1.9.4 | load GraphML, `nearest_nodes`/`nearest_edges`, `add_edge_speeds`/`add_edge_travel_times` |
| networkx | 3.3 | `shortest_path` with a custom weight function (the damage-exclusion trick) |
| httpx | 0.27.2 | async calls to Groq + Google Geocoding |
| shapely | 2.0.6 | convert OSM edge geometry to GeoJSON (`shapely.geometry.mapping`) |
| pydantic-settings | 2.5.2 | typed env config |
| google-generativeai | 0.8.3 | optional Gemini extraction provider |

## 7.2 Startup sequence — load the graph once, fail loudly

`app/main.py` lifespan hook:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_graph_on_startup()   # raises RuntimeError if the GraphML is missing → process exits
    yield
```

`services/routing.py`:

```python
_graph: nx.MultiDiGraph | None = None

def load_graph_on_startup() -> None:
    global _graph
    G = ox.load_graphml(settings.GRAPH_PATH)          # 208 MB file, ~2 min
    G = ox.add_edge_speeds(G, fallback=40)            # impute missing speeds
    G = ox.add_edge_travel_times(G)
    _graph = G
```

- **`fallback=40`** is required: real OSM data has edges without speed tags; without a fallback, `add_edge_speeds` raises.
- If `demo_corridor.graphml` is missing, startup **refuses to proceed** — a missing graph must be caught in development, never discovered mid-demo (spec §1).
- The graph is a **module-level singleton** — never copied, never re-fetched per request. Memory footprint ≈ 3 GB with speeds/travel times.

## 7.3 `services/routing.py` — the core technical module

```python
def compute_route(origin, dest, damaged_edge_pairs) -> dict | None:
    G = get_graph()
    orig_node = ox.nearest_nodes(G, origin[1], origin[0])   # (lng, lat)
    dest_node = ox.nearest_nodes(G, dest[1], dest[0])

    def weight_func(u, v, edge_data):
        if (u, v) in damaged_edge_pairs:
            return None          # ← structurally excludes the edge
        return edge_data.get("travel_time", 1)

    try:
        path_nodes = nx.shortest_path(G, orig_node, dest_node, weight=weight_func)
    except nx.NetworkXNoPath:
        return None
    if len(path_nodes) < 2:
        return None              # degenerate: both points snapped to the SAME node
    ...
```

Three properties that matter:

1. **Exclusion set built from the database, not re-snapping.** `get_damaged_edge_pairs(damage_rows)` just reads cached `edge_u/edge_v` (both directions added — a damaged bridge blocks both ways). No spatial search per request.
2. **`None` weight = structurally excluded.** A destination reachable *only* through a damaged edge raises `NetworkXNoPath` → the endpoint returns "no route" rather than an unsafe path.
3. **Degenerate-snap guard.** If origin and destination snap to the *same node* (destination far outside the loaded corridor), the "route" would be 0 km — the function returns `None` so callers fall back.

**`direct_fallback(origin, dest)`** — when the graph can't route (destination outside the corridor): haversine distance, straight-line GeoJSON, ETA at ~40 km/h. This keeps assignment/dispatch working **nationwide**; real street routing resumes inside the loaded regions. Callers check `result.get("geojson")` first because `path_to_geojson([])` would otherwise discard the fallback geometry.

**`get_damaged_edge_pairs(rows)`** builds the exclusion set; **`snap_to_edge`** is used *exactly once per damage report* (never during routing).

## 7.4 `services/extraction/` — swappable AI report extraction

- `base.py`: `EXTRACT_TOOL` (JSON-schema tool `extract_relief_need` with enum-constrained `needs` and `urgency_flags`) + `ExtractionProvider` ABC.
- `groq_provider.py` (default): OpenAI-compatible `chat/completions` with `tool_choice` forcing the tool; model from env (`openai/gpt-oss-120b`); typed errors (`ExtractionProviderError` with kind `rate_limited`/`auth`/`unavailable`) so the UI can say *"Daily quota reached"* vs *"retry in a moment"* — the distinction is made by inspecting the 429 body (Groq uses 429 for both RPM limits and quota exhaustion).
- `gemini_provider.py`, `qwen_provider.py`: same ABC, per the spec (Qwen for Alibaba Cloud submission scoring).
- Provider selected by `EXTRACTION_PROVIDER` env; cached after first creation.

## 7.5 `services/planning_ai.py` — AI resource planning

`ai_generate_plan(site, stock)` posts the site profile + a stock table to the same Groq model with a `generate_relief_plan` tool. Constraints baked into the prompt: never exceed stock, scale with population/severity, food/water ≈ 3 days of supply. The caller **caps every AI quantity by real stock** and persists to `plans`/`plan_items`.

`heuristic_plan(site, stock)` — deterministic fallback (severity multiplier × population-based baselines, capped by stock) so a dead AI never blocks a dispatch. Response `source` field tells the UI which one ran (`ai` vs `manual`).

## 7.6 `services/geocoding.py` — Geocoding v4 with a Pakistan guarantee

- Endpoint: `https://geocode.googleapis.com/v4/geocode/address/{query}` with the `X-Goog-Api-Key` **header** (v4 does not accept `?key=`).
- Works with **Google's no-billing demo key** — the legacy v3 Geocoding API does *not* (returns `REQUEST_DENIED` without billing).
- `" Pakistan"` is appended to every query, and candidates are **post-filtered**: Google matched *"Shahdra"* to **Shahdara, Delhi** despite the suffix, and returns Pakistani addresses in **Urdu script** (`جام پور، پاکستان`) — so text matching alone fails. Final filter: candidate coordinates must fall inside Pakistan's bounding box (lat 23.5–37.5, lng 60.0–78.5), falling back to Urdu-script text match.
- No candidates inside Pakistan → return `None` → the caller reports `geocode_status: "unmatched"` (structured reports then default the site to the **center's coordinates**, never `(0,0)`).

## 7.7 `services/prioritization.py` — the score, exactly

```python
score = population
      + Σ urgency_flag_weights   # injury_reported 50, pregnancy 40, water_rising 30,
                                 # stranded_no_exit 30, elderly_present 15, children_present 15
      + severity_weight          # critical 50, high 30, medium 10, low 0
      + 10 if confidence == 'corroborated'
      + hours_since_report × 5   # time decay pushes stale sites up
```

`format_reasoning()` renders: `"Priority score 240: population 175, flags: children_present, injury_reported"` — displayed verbatim in the app. **Deliberately not AI:** ranking people is a life-or-death decision that must be reproducible and explainable.

## 7.8 `services/replanning.py`

`replan_center(center_id, db)`: loads non-dispatched/non-delivered sites, snapshots their current rank order, recomputes scores, re-sorts, and reports `changed` (with old→new rank and reasoning) vs `unchanged`. Triggered from the UI after new reports or damage reports.

## 7.9 `core/security.py` + `api/deps.py` — auth

- Passwords: bcrypt via passlib (`CryptContext(schemes=["bcrypt"])`), **`bcrypt==4.0.1` pinned**.
- JWT: HS256, payload `{sub, role, center_id, exp}`, `JWT_EXPIRY_MINUTES=480` (8 h).
- `get_current_user` decodes and returns `{user_id, role, center_id}`; `require_role(*roles)` composes role checks; drivers additionally get **ownership checks** inside handlers (a driver may only start/reroute/complete **their own** dispatch — `dispatch.driver_id` must match their `drivers` row).

## 7.10 Transactional inventory — the one place with row locks

`POST /api/plans/{id}/assign` and legacy `POST /api/dispatch`:

```python
inventory_row = db.query(Inventory).filter(
    Inventory.depot_id == depot_id,
    Inventory.resource_type == resource["resource_type"],
).with_for_update().first()
if not inventory_row or inventory_row.quantity < resource["quantity"]:
    raise HTTPException(status_code=409, detail="Insufficient …")
inventory_row.quantity -= resource["quantity"]
```

Two simultaneous dispatches cannot oversubscribe the same stock line; the DB `CHECK (quantity >= 0)` is the backstop. Any failure → explicit `db.rollback()` → the 409 reaches the coordinator's screen.

---

# 8. API Contracts

**Base URL** `http://<host>:8000/api` · **Auth** `Authorization: Bearer <token>` on everything except `/auth/login` and `/health`.
**Error shape** `{"detail": "<human-readable>"}`.
**Roles:** `administrator`, `coordinator`, `driver`.

> Verification source: dumped from the live app's OpenAPI (`/openapi.json`). 38 routes.

## 8.1 Auth — `routes/auth.py`

| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/auth/login` | public | Body `{username, password}` → `200 {access_token, role, user_id, center_id, center_name}`; `401` bad credentials; `403` deactivated account |
| `GET /api/auth/me` | any | Token introspection → `{user_id, role, center_id}` |

## 8.2 Accounts — `routes/accounts.py` (administrator only)

| Endpoint | Behavior |
|---|---|
| `POST /api/accounts/coordinators` | Creates a **coordinator or driver**. Body `{username, password, center_id, role?, depot_id?}`. Drivers require a `depot_id` belonging to that center → also inserts a `drivers` row. Errors: 404 center/depot not found, 409 username exists, 422 bad role. |
| `GET /api/accounts/coordinators` | Lists **coordinators and drivers** with `{user_id, username, center_id, is_active, role, depot_id, depot_name, created_at}` |
| `PATCH /api/accounts/coordinators/{id}/deactivate` | Soft-disable; **enforced on every request** by `get_current_user` |
| `PATCH /api/accounts/coordinators/{id}/reactivate` | Re-enables a deactivated account |

## 8.3 Centers & Depots — `routes/centers.py`, `routes/depots.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `POST /api/centers` | admin | `{code, name, region, lat, lng}` → 201 `{id, code}`; 409 duplicate code |
| `GET /api/centers` | all | list (map pins + filters) |
| `POST /api/depots` | admin | `{center_id, name, lat, lng}` → 201 `{id}`; 404 center missing |
| `GET /api/depots?center_id=` | all | depots **with** embedded `inventory: [{resource_type, quantity}]` |
| `PATCH /api/depots/{id}/inventory` | admin | `{resource_type, quantity_delta}` — creates the line if missing; **409** if delta would go below zero |

## 8.4 Reports — `routes/reports.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `POST /api/reports` | coordinator | Body `{center_id, source: manual|sms_stub, raw_text?, structured_fields?}`. **422** if both texts empty. With `structured_fields` → geocodes (v4), creates a **confirmed site** (falls back to center coordinates if geocoding fails — never (0,0)). Returns `{report_id, status}`. |
| `POST /api/reports/{id}/extract` | coordinator | Runs AI extraction on `raw_text`; stores result + geocode in `extracted_json`; status → `extracted`. **503** with reason on provider failure (`"Daily quota limit reached…"` vs `"rate-limiting… retry in a moment"` vs key error). **409** if not `pending_extraction`. |
| `PATCH /api/reports/{id}` | coordinator | Review/edit: `{location_name?, lat?, lng?, estimated_population?, needs?, urgency_flags?, severity?, status}`. Works on `pending_extraction`/`extracted` (creates site) **and** `confirmed` (**updates the existing site in place** — no duplicates). **422** if confirming without lat/lng. Returns `{site_id, status}`. |
| `GET /api/reports?center_id=&status=` | coordinator | List, newest first, includes `structured_fields` when present |

## 8.5 Sites — `routes/sites.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `GET /api/sites?center_id=&status=` | coordinator + admin | Sites with `report_id`, scores, statuses; sorted by priority desc |
| `POST /api/sites/{site_id}/assign` | coordinator | **Quick assignment**: picks the **nearest depot**, computes the route (fallback to straight line), creates a dispatch with **empty resources** and assigns the coordinator/driver user in `{coordinator_id}`. 409 if site dispatched or coordinator busy-legacy. (Superseded by the plans flow but retained.) |

## 8.6 Plans — `routes/plan.py` + `routes/plans.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `POST /api/plan/generate` | coordinator | Body `{site_id, center_id}`. **AI plan** via `planning_ai` (heuristic fallback); **persists** a `draft` plan + items (re-opening an existing draft instead of duplicating); caps quantities by stock. Returns full plan dict `{plan_id, site_id, status, source, reasoning, items[], site_name, site_lat, …}`. 409 if site already dispatched. |
| `POST /api/plan/replan` | coordinator | Body `{center_id, trigger}` → deterministic replan of all active sites; returns `{changed[], unchanged[]}`. |
| `GET /api/plans?center_id=&status=` | coordinator + admin | Plans with items embedded. |
| `GET /api/plans/{plan_id}` | coordinator + driver + admin | Single plan (drivers read their dispatch's plan). |
| `PATCH /api/plans/{id}/items` | coordinator | Replace all quantities. **409 if not `draft`** (edit-lock) and **409 if any quantity exceeds the nearest depot's stock** — server-side, not just client UX. |
| `POST /api/plans/{id}/finalize` | coordinator | `draft → finalized`. 409 otherwise. |
| `POST /api/plans/{id}/assign` | coordinator | Body `{driver_id}`. One transaction: route from the **driver's depot** (damage-aware, straight-line fallback), `with_for_update` inventory deduction per plan item, dispatch created with `driver_id` + `plan_id`, `plan→assigned` (🔒), `driver→on_route`, `site→dispatched`. 409s: already assigned / site dispatched / insufficient stock. Returns `{dispatch_id, driver, depot, eta_minutes, distance_km}`. |

> Legacy note: `POST /api/plan/generate` used to return transient `{allocations: [...]}`; it now **delegates** to the persisted implementation, so old callers get the new behavior.

## 8.7 Roads — `routes/roads.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `POST /api/roads/damage` | coordinator + **driver** | Body `{center_id, lat, lng, reason?}`. **Drivers get their center derived from their depot** (ignores a bogus client `center_id`). Snaps to the nearest OSM edge **once**; stores `edge_u/edge_v` + segment GeoJSON (straight-line fallback for straight edges). 201 `{id, active, edge_geometry}`. |
| `GET /api/roads/damaged?center_id=` | coordinator + driver + admin | Active damage rows (center optional → nationwide for the admin map); **includes `center_id`** |
| `POST /api/roads/damage/{id}/reopen` | coordinator | Reopens a flagged road — the edge re-enters the routing graph. 409 if already open. |
| `GET /api/routes?from_depot_id=&to_site_id=` | coordinator | Preview route: damage-aware vs direct, returns `{distance_km, eta_minutes, geojson, avoided_damage, delta_minutes_vs_direct}`; 404 if disconnected |

## 8.8 Dispatch — `routes/dispatch.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `POST /api/dispatch` | coordinator | Body `{site_id, depot_id, resources:[{resource_type, quantity}]}`. Transactional: row-locked inventory deduction; damage-aware route; site → `dispatched`. 201 `{dispatch_id, status:"planned", route:{geojson, distance_km}, eta_minutes}`; 409 stock/site; 404. |
| `GET /api/dispatch?center_id=` | coordinator + admin | List with `driver_id`, `plan_id`, `dispatched_by`, statuses |
| `PATCH /api/dispatch/{id}/status` | coordinator + **driver** | Forward-only `planned → en_route → delivered` (**422** backward). Drivers restricted to **own** dispatch (403). Delivering also completes the site and frees the driver (both the coordinator and driver paths update `drivers.status`). |
| `POST /api/dispatch/{id}/cancel` | coordinator | Cancels a `planned` dispatch: **restocks** the deducted inventory, frees the driver, returns the site to `unserved`, marks the dispatch `cancelled`. 409 if already en_route/delivered. |
| `POST /api/dispatch/{id}/reroute` | coordinator + **driver** | Body `{current_lat, current_lng, reason?}`. Damage-aware route **from the current position**; logs to `dispatch_reroutes`; returns `{dispatch_id, distance_km, eta_minutes, geojson, delta_minutes_vs_direct}`. 409 on delivered. Drivers restricted to own dispatch. |
| `POST /api/dispatch/{id}/assign` / `unassign` | coordinator | Legacy coordinator-assignment (assigned_to user); still present. |
| `GET /api/dispatch/available-coordinators?center_id=` | coordinator | **Full roster** of the center's coordinators (any can be assigned; caller excluded client-side) |

## 8.9 Drivers — `routes/drivers.py`

| Endpoint | Role | Behavior |
|---|---|---|
| `GET /api/drivers?center_id=&depot_id=&search=` | coordinator + admin | Drivers joined with user + depot: `{driver_id, user_id, username, depot_id, depot_name, center_id, status}` |
| `GET /api/drivers/my/dispatches` | **driver** | The driver's own dispatches, each with `site_name/lat/lng`, `depot_name`, `plan_items` (the loading checklist), route, ETA |
| `POST /api/drivers/my/dispatches/{id}/start` | **driver** | Own dispatch only; `planned → en_route`; 409 otherwise |
| `POST /api/drivers/my/dispatches/{id}/complete` | **driver** | Own dispatch only; `en_route → delivered`; completes the site; frees nothing (availability removed) |

## 8.10 Health

| `GET /api/health` | public | `{"status":"ok"}` — use for readiness probes (returns only after the graph is loaded) |

---

# 9. Frontend (React Native / Expo) — Deep Dive

## 9.1 Stack & why

| Library | Why |
|---|---|
| Expo (SDK 57, RN 0.86, TypeScript) | fastest path to a working phone app; Expo Go removes the need for Xcode/Android Studio during development; `expo export` doubles as our CI bundle check |
| react-native-webview | hosts the Leaflet map — see §10 for why we do **not** use `react-native-maps` |
| leaflet 1.9.4 (CDN inside the WebView) | mature map lib: divIcon pins, dashed polylines, filled polygons, programmatic flyTo |
| expo-location | driver GPS (`watchPositionAsync`, 3 s / 5 m intervals) |
| @react-native-async-storage/async-storage | token persistence |
| react-native-keyboard-aware-scroll-view | forms that don't hide inputs behind the keyboard |
| react-native-safe-area-context | notch / tab-bar safe areas |
| No state-management library | deliberate: navigators own their data and pass props down; prop-driven pages are trivially inspectable |

## 9.2 The refactored structure (SIMPLE principles)

The app was refactored from two monoliths (2,095 and 797 lines) into the current layout — see `FRONTEND_MAINTENANCE.md` for the full rationale:

```
src/
├── api.ts              # fetch client — the ONLY place that knows the base URL
├── theme.ts            # Material-3 tokens: colors, type scale, radii
├── types.ts            # every shared interface (Site, PlanT, DriverRow, DispatchRow, …)
├── utils/
│   ├── geo.ts          # convexHull, haversineKm, nearestDepot — pure functions
│   └── constants.ts    # NEED_API/NEED_LABELS, FLAG_API/FLAG_LABELS, SEV_API maps
├── components/         # 14 primitives — zero business logic, zero API calls
│   ├── index.ts        # barrel re-export
│   ├── Button.tsx      # primary/outlined/critical/tertiary/text variants
│   ├── PillButton.tsx  # rounded filter/action pills
│   ├── Field.tsx       # labeled input: icons, numeric pads, secure, error states
│   ├── SearchBox.tsx   # magnifier TextInput (admin accounts/centers search)
│   ├── FilterChips.tsx # generic single-select chip row (depot/province filters)
│   ├── Card.tsx        # severity edge-bar card
│   ├── Chip.tsx        # Chip + StatusChip
│   ├── AppBar.tsx      # back/menu/title/right slot, safe-area aware
│   ├── Screen.tsx      # page scaffold (AppBar + KeyboardAwareScrollView)
│   ├── BottomNav.tsx   # role-scoped tab bar (animated, top indicator bar) + NavTab type
│   ├── Fab.tsx         # floating action button
│   ├── Stepper.tsx     # numeric quantity input + ±10 nudges (plan editor)
│   └── feedback.tsx    # Loading, Err, SectionTitle, NotificationsModal
├── navigation/
│   ├── RoleRouter.tsx  # session.role → one of three navigators (the ONLY cross-role switch)
│   ├── coordinatorNav.ts  # COORDINATOR_TABS (5 tabs)
│   └── adminNav.ts        # ADMIN_TABS (5 tabs)
└── screens/
    ├── OnboardingScreen.tsx · LoginScreen.tsx
    ├── coordinator/  CoordinatorNavigator.tsx + HomePage/ReportsPage/DispatchPage/MapPage
    │                 + components/(PlaceSearch, AssignCoordinatorList)
    │                 + modals/(NewReportModal, PlanEditorModal, AssignDriverModal,
    │                            ActiveRouteModal, AssignSiteModal)
    ├── admin/        AdminNavigator.tsx + ResourcesPage/MapPage/CentersPage/AccountsPage/
    │                 SettingsPage + adminStyles.ts + modals/(AddCenterModal, AddCoordinatorModal)
    └── driver/       DriverNavigator.tsx
```

**Import rule (no cycles):** `theme/api/types/utils → components → navigation-config → screens → navigators → App.tsx`. Screens never import screens; components never import `api`.

## 9.3 `api.ts` — the fetch client

```ts
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api';

let token: string | null = null;                       // module-level Bearer
export async function setToken(t) { … AsyncStorage … } // persists between launches
export async function api<T>(path, { method, body }) { … }
```

- The base URL comes from `.env` (`EXPO_PUBLIC_API_URL`) — **the only coupling point** between frontend and backend location (§15).
- Any non-2xx throws `Error(backend "detail" string)` so screens can show the message verbatim in an `Err` banner — this is why the backend's human-readable messages matter.

## 9.4 Role routing & navigators

`App.tsx` owns only the session state machine:
`'loading' → 'onboarding' → null (login) → LoginResponse (session) → logout → 'onboarding'`.

`navigation/RoleRouter.tsx` is the single cross-role switch:

```tsx
if (session.role === 'driver')      return <DriverNavigator … />;
return session.role === 'administrator'
  ? <AdminNavigator … />
  : <CoordinatorNavigator … />;
```

Each navigator has exactly three responsibilities:
1. **Tab state** — rendered from the role's config, so the BottomNav physically cannot show a foreign tab.
2. **Modal stack** — typed union of full-screen sub-routes (report form, plan editor, driver assignment, active route).
3. **Data fetching** — one `load()` fetches sites/depots/damage/reports/dispatches/centers; slices are passed down as props; `refresh()` bumps a key.

Pages are prop-driven and never fetch the shared data themselves (except detail rosters) → independently editable and testable.

### Coordinator pages (tabs: Home · Reports · Dispatches · Map · Profile)

| Page | Contents & logic |
|---|---|
| `HomePage.tsx` | ACTION-REQUIRED pending-reports card → Reports tab; stat tiles (active dispatches, low inventory <100 units); "Top Relief Sites" ranked by priority score with severity chips; **Assign Coordinator to this Region** on unserved sites (legacy quick path) |
| `ReportsPage.tsx` | report list w/ status chips; **Run AI Extraction** (busy state + disabled double-tap; provider errors surfaced verbatim); **review card** for extracted reports (edit location/lat/lng/population, confirm/reject — lat/lng required to confirm); **Edit Extracted Data** → NewReportModal in edit mode; **Generate Plan for this Report** → navigator `generatePlanFor` (spinner scoped per report id) |
| `DispatchPage.tsx` | **Plans** section (draft → PlanEditorModal; finalized → AssignDriverModal) and **Active & Past Dispatches** (status chips, en-route/delivered buttons, Open route) |
| `MapPage.tsx` | full-bleed Leaflet map + layer toggles (Relief Sites, Depots, Road Damage, Flood Zone, Centers, Routes); **flag damage**: tap/long-press the map → pending pin → `POST /roads/damage`; **Flood Impact Zone** hull + summary; active-routes list → driver route screen. **Routes shown = only dispatches this coordinator assigned** (`dispatched_by === me`) |
| Profile | account card + logout |

### Coordinator modals (full-screen sub-routes)

| Modal | Flow |
|---|---|
| `NewReportModal.tsx` | segmented **Free Text / Structured Form**. Free text → AI extraction on the backend. Structured: location name + lat/lng + headcount + severity chips + needs chips + urgency-flag checkboxes. Includes a **live mini-map that flies to geocoded coordinates**, debounced **PlaceSearch** (Nominatim, `countrycodes=pk`), "Use Current Location" GPS, and **edit mode** (prefills a site, saves via `PATCH /reports/{id}` in place — no duplicate sites). |
| `PlanEditorModal.tsx` | AI plan draft: reasoning card, **Stepper quantities** (numeric keypad, ±10) with per-resource depot stock, add-from-stock chips, total counter → **Finalize Plan & Assign Driver** (`PATCH items` → `POST finalize`). |
| `AssignDriverModal.tsx` | driver roster with **depot FilterChips + SearchBox**, status chips, **Assign Dispatch** per driver → success card (dispatch id, driver, depot). |
| `ActiveRouteModal.tsx` | the navigation screen — see §10.3. |
| `AssignSiteModal.tsx` | legacy quick path: site → nearest depot → worker list → `POST /sites/{id}/assign` (no plan). |

### Admin pages (tabs: Resources · Map · Centers · Accounts · Settings)

| Page | Contents |
|---|---|
| `ResourcesPage.tsx` | global inventory across depots: per-resource cards (Low Stock/Adequate chips, quantity, mini bar chart); **Add Center / Add Coordinator** pills |
| `MapPage.tsx` | **national operations map** (centers C, depots D, sites R, damage !, flood hull) with **province FilterChips**; per-province summary card; layout mirrors the coordinator map (map outside ScrollView so gestures work) |
| `CentersPage.tsx` | SearchBox + expandable center cards → depot management (create depot, add/remove stock via `quantity_delta`) |
| `AccountsPage.tsx` | SearchBox (name / id / center) + province FilterChips + coordinator/driver cards (role, depot, active/deactivated chip, Remove=deactivate); FAB → AddCoordinatorModal |
| `SettingsPage.tsx` | profile + logout |

### Admin modals
- `AddCenterModal.tsx` — Center Information / Location Details, **debounced Nominatim geocoding with a live map preview that flies to the result**.
- `AddCoordinatorModal.tsx` — **role picker (coordinator / driver)**; driver adds a depot selector; creates via `POST /accounts/coordinators` with `role` + `depot_id` (password policy 6–60, username 3–60 enforced client- and server-side).

## 9.5 Driver screens (`screens/driver/DriverNavigator.tsx`)

Tabs: **Dispatches · Map · Profile** (simple in-file tab bar).

- **My Dispatches**: assigned dispatches with status chips, origin depot, distance/ETA, and a **truck loading checklist rendered from the plan's items** (`▢ food × 250`). Buttons per status:
  - `planned` → **Start Journey** (`POST /drivers/my/dispatches/{id}/start`)
  - `en_route` → **Open Route** (jumps into `ActiveRouteModal`) + **Delivered** (`…/complete`)
- **Open Route** reuses the coordinator's `ActiveRouteModal` with a synthetic site row — drivers follow the same live street polyline, flag damage, and get auto-rerouted.
- Completed deliveries in their own section.
- Drivers can **never** touch another driver's dispatch: backend 403 ownership checks.

## 9.6 Auth screens

- `OnboardingScreen.tsx` — brand hero (shape-built map medallion), "Precision Relief, Real-Time Response.", Get Started.
- `LoginScreen.tsx` — Material-3 split card; username/password with autofill grouping; backend errors surfaced verbatim.

---

# 10. The Map Engine

## 10.1 Why Leaflet-in-a-WebView instead of `react-native-maps`

1. **Zero API keys.** Google's Maps SDK needs billing; the no-billing "demo key" doesn't cover the Android SDK. `react-native-maps` in Expo Go renders with Expo's rate-limited shared key → **black tiles** (this actually happened).
2. **Full control.** Leaflet gives divIcon pins with letter labels, dashed polylines, filled hull polygons, and programmatic flyTo — all driven from React via a tiny message protocol.
3. **OSM tiles** match the routing data source (OpenStreetMap), so map and graph agree.

Trade-offs: tiles load from the internet (first render needs connectivity); gestures inside a WebView require the map to **not** be wrapped in a ScrollView (a ScrollView steals drags — this caused the "can't zoom" bug on the admin map; the layout rule is now *map fills a fixed container, controls live below it*).

## 10.2 `LeafletMap.tsx` — architecture

One WebView loading inline HTML with Leaflet from unpkg. React talks to it through three channels:

| Channel | Direction | Purpose |
|---|---|---|
| `postMessage` → `onMessage` | WebView → RN | `{type:'click', lat, lng}` on tap/long-press; `{type:'ready'}` after Leaflet loads |
| `injectJavaScript(payload)` | RN → WebView | `window.__render({markers, polylines, polygons, fit})` — full redraw on every prop change |
| imperative handle | RN → WebView | `flyTo(lat, lng, zoom)`, `fitAll()` |

**Props:** `markers: LeafMarker[]` (id/lat/lng/title/snippet/color/label/icon), `polylines: LeafPolyline[]`, `polygons: LeafPolygon[]` (flood hull), `center`, `zoom`, `fit`, `onMapPress`.

**Camera rules (hard-won):**
- The camera is set **once** on `ready` (covers prefilled coordinates) — data re-injects **never** move it (this fixed the "map yanks back to DG Khan / locate button bounces" bug).
- A `center` prop change **after** load flies the camera (used by geocode results and GPS follow).
- `fit` fits bounds to all drawn elements.

**In-HTML features:** teardrop pins with letter labels (`R` relief, `D` depot, `C` center, `!` damage, `🌊` flood), tap **and** long-press (`contextmenu`) both emit clicks, `invalidateSize` on every inject, OSM attribution kept.

## 10.3 `ActiveRouteModal.tsx` — the navigation screen

- Draws the **planned route** (mint, street-following) and a **live dashed line from the device GPS fix to the destination** (critical color) that rebuilds on every GPS tick.
- **Auto-reroute**: while en route, if the device moves ≥150 m from the last route origin and ≥45 s have elapsed, the app **silently** calls `POST /dispatch/{id}/reroute` — the polyline then follows real streets from the new position. Manual reroute + reason remain available.
- Road-blocked flow: flag damage at GPS → original ETA struck through → "Update Route" → recalculated ETA + Δ vs direct.
- CURRENT TARGET card: destination, distance, ETA tiles, cargo manifest, live GPS readout.
- Mark as Delivered completes the dispatch.

---

# 11. Algorithms

## 11.1 Damage-aware shortest path
Dijkstra (NetworkX `shortest_path` with a weight callable) over the in-memory MultiDiGraph; weight = `travel_time` per edge; `None` weight for damaged edges (structural exclusion). O(E log V) per query on 184k nodes — milliseconds.

## 11.2 Priority score (deterministic)
See §7.7. Time decay `hours × 5` means a site re-ranks upward ~5 points/hour; `plan/replan` recomputes ranks for all active sites of a center in O(n log n).

## 11.3 Convex hull — flood zone
Andrew's monotone chain over affected-site coordinates (`utils/geo.ts`): O(n log n). Rendered as a filled Leaflet polygon (12% opacity, dashed border). The hull's fringe visually predicts the flood's next reachable settlements.

## 11.4 Nearest depot / driver
Squared-distance arg-min over ≤25 depots (`nearestDepot`) — O(n), no sqrt needed for comparison. The **driver's depot** (not the site's nearest) is the dispatch origin when assigning via a plan, because the truck is physically at the driver's home depot.

## 11.5 Auto-reroute throttling
Movement trigger: haversine ≥150 m from the last route origin AND ≥45 s since the last auto-call → silent `reroute`. Prevents API spam while keeping the polyline street-following (§10.3).

## 11.6 Geocode candidate filtering
Query = name + `", Pakistan"`; candidates filtered by bounding box (language-independent — Google returns Urdu addresses) then top candidate chosen; no candidate → `unmatched` (site falls back to center coordinates, editable later).

---

# 12. Roles & Permission Matrix

| Capability | administrator | coordinator | driver |
|---|:-:|:-:|:-:|
| Login / JWT | ✅ | ✅ | ✅ |
| Create centers / depots / inventory | ✅ | — | — |
| Create users (coordinator/driver) | ✅ | — | — |
| Deactivate accounts (kills active sessions on next request) | ✅ | — | — |
| View all depots + national map + filters | ✅ | own center scope | — |
| Submit reports (free text / structured) | — | ✅ | — |
| AI extraction + review/confirm/edit | — | ✅ | — |
| Generate AI plan | — | ✅ | — |
| Edit plan quantities (draft only) | — | ✅ | — |
| Finalize plan | — | ✅ | — |
| Assign driver to plan | — | ✅ | — |
| See routes (map) | all | **only dispatches they assigned** | — |
| Start journey / complete dispatch | — | any dispatch | **own dispatch only** (403 otherwise) |
| Reroute a dispatch | — | any dispatch | **own dispatch only** |
| Flag road damage | — | ✅ | ✅ (center derived from depot) |
| View driver roster | ✅ | ✅ (their center) | — |

> Backend-enforced via `require_role(...)` + in-handler ownership checks. The frontend nav config is a UX boundary, not the security boundary.

---

# 13. Environment & Configuration

## 13.1 `backend/.env` (from `.env.example`)

```ini
DATABASE_URL=postgresql://madad:madad@localhost:5433/madad
EXTRACTION_PROVIDER=groq            # groq (default) | gemini | qwen
GROQ_API_KEY=gsk_...                # required for AI extraction + AI plans
GROQ_MODEL=openai/gpt-oss-120b      # NOTE: llama-3.1-8b-instant was decommissioned by Groq
GROQ_BASE_URL=https://api.groq.com/openai/v1
GEMINI_API_KEY=                     # optional alternative provider
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
GOOGLE_MAPS_API_KEY=                # the no-billing DEMO key works — Geocoding v4 only
JWT_SECRET=change_me
JWT_EXPIRY_MINUTES=480
```

Loaded by `pydantic-settings` (`app/core/config.py`) with `lru_cache`. `GRAPH_PATH` defaults to `backend/database/geodata/demo_corridor.graphml`.

## 13.2 `mobile/.env`

```ini
EXPO_PUBLIC_API_URL=http://192.168.0.104:8000/api   # PC LAN IP; 10.0.2.2 for the Android emulator
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=                    # unused since the Leaflet switch
```

> The LAN IP changes with DHCP — if the phone can't reach the backend, re-run `ipconfig` and update. Env vars are baked at bundle time: after editing, reload Expo (`r`) or restart it.

## 13.3 The road graph file (Git LFS)

`backend/database/geodata/demo_corridor.graphml` — **208 MB**, 184,270 nodes / 478,003 edges, committed via **Git LFS** (`.gitattributes` tracks `*.graphml`; origin already has it).

- Cloning without LFS installed yields a pointer file — run `git lfs pull`.
- Regenerate from scratch: `python scripts/fetch_graph.py` — fetches 9 bbox segments (4 × DG Khan→Rajanpur corridor + 4 × Lahore quadrants) across 5 Overpass mirrors with retries, then `nx.compose` + `add_edge_speeds(fallback=40)` + `add_edge_travel_times`. Takes ~10 minutes; big-city segments fail on single large queries, hence the quadrant split.
- **Damage-row caveat:** `edge_u/edge_v` are OSM node IDs (globally stable), so rows survive graph *extensions*; review them after re-fetching *different* regions (per `MADAD_DATABASE.md`).

---

# 14. Runbooks — Running Everything

## 14.1 Database (Docker)

```powershell
docker compose up -d                                   # postgres:16 → localhost:5433
docker ps                                              # madad-db must show (healthy)
docker exec madad-db psql -U madad -d madad -c "\dt"   # verify 11 tables
```

- `backend/postgres/schema.sql` auto-applies on **first** container start (mounted into `/docker-entrypoint-initdb.d/`).
- To load the demo dataset:

```powershell
docker exec -i madad-db psql -U madad -d madad < backend\postgres\seed_dummy.sql
docker exec -i madad-db psql -U madad -d madad < backend\postgres\seed_drivers.sql
```

> ⚠️ `docker exec` **requires `-i`** when piping stdin — without it psql silently executes nothing (this bit us twice).

- To wipe operational data for a fresh test run:

```sql
TRUNCATE dispatch_reroutes, damaged_roads, dispatches, plan_items, plans, sites, reports RESTART IDENTITY CASCADE;
UPDATE drivers SET status = 'available';
```

## 14.2 Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
copy .env.example .env         # fill in GROQ_API_KEY + GOOGLE_MAPS_API_KEY
.\venv\Scripts\python scripts\bootstrap_admin.py admin admin123

.\venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- **Always the venv python** (`.\venv\Scripts\python`) — the system Python has an incompatible scipy/numpy pair (`AttributeError: module 'numpy' has no attribute 'long'`) and different package versions.
- **`--host 0.0.0.0` is mandatory** for phone access; bare `uvicorn` binds localhost only.
- First startup ≈ **2 minutes** (loads 478k edges + travel times). Wait for `Application startup complete.` The app **refuses to start** if the GraphML is missing (intentional, spec §1).
- Avoid `--reload` for testing sessions — an orphaned reload child holding :8000 with stale code was a real incident (§19).
- Swagger: `http://localhost:8000/docs`.

## 14.3 Mobile

```powershell
cd mobile
npm install
notepad .env                   # EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:8000/api
npx expo start --host lan      # scan QR with Expo Go; r = reload
```

## 14.4 One-time Windows firewall (admin PowerShell)

```powershell
New-NetFirewallRule -DisplayName "MADAD Backend 8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000
New-NetFirewallRule -DisplayName "Expo Metro 8081"   -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081
```

---

# 15. Connecting Frontend to Backend

1. Find the PC's Wi-Fi IPv4: `ipconfig` → *Wireless LAN adapter Wi-Fi → IPv4* (e.g. `192.168.0.104`).
2. `mobile/.env` → `EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:8000/api`.
3. Start the backend **with `--host 0.0.0.0`**, then Expo with `--host lan`.
4. **Sanity check in the phone's browser first**: `http://<PC-IP>:8000/api/health` must return `{"status":"ok"}` — this isolates network issues from app issues before you blame the code.
5. Env vars and code are baked at bundle time — after any change, reload Expo (`r`) or restart it.
6. Phone and PC on the same Wi-Fi; router must not have AP/client isolation enabled.

**Connection checklist when something fails** (in order): health URL in phone browser → firewall rules (8000 + 8081) → same SSID → IP changed? → backend bound to `0.0.0.0`? → stale Expo bundle?

---

# 16. Seeded Demo Data & Credentials

`seed_dummy.sql` + `seed_drivers.sql` produce:

| Entity | Count | Notes |
|---|---|---|
| support_centers | 5 | PB-01 Punjab (Lahore), SD-01 Sindh (Karachi), KP-01 KPK (Peshawar), BL-01 Balochistan (Quetta), IS-01 Federal (Islamabad) |
| users | 276 | 1 admin + 25 coordinators (5/center) + 250 drivers |
| depots | 25 | 5/center at real, spread towns — Punjab: Lahore, Faisalabad, Multan, Rawalpindi, Dera Ghazi Khan; Sindh: Karachi, Hyderabad, Sukkur, Larkana, Mirpur Khas; KPK: Peshawar, Mardan, Abbottabad, D.I. Khan, Mingora; Balochistan: Quetta, Gwadar, Turbat, Khuzdar, Chaman; Federal: Islamabad, Murree, Taxila, Attock, Haripur |
| inventory | 125 rows | 5 resource types × 25 depots |
| resource totals | | food 500K, water 500K, boats 500K, medicine 500K, clothes 500K — **20,000 per resource per depot** (testing config; the original spec totals were 10K food/water, 1K boats, 100K medicine, 100K clothes) |
| reports / sites / damage / dispatches | 0 | clean slate |

## 16.1 Logins

| Role | Username(s) | Password |
|---|---|---|
| administrator | `admin` | `admin123` |
| coordinator (Punjab) | `ahmed.raza`, `fatima.noor`, `bilal.chishti`, `ayesha.siddiqui`, `usman.bokhari` | `coord123` |
| coordinator (other provinces) | `sana.qureshi`… (Sindh), `kamran.yousafzai`… (KPK), `basit.rind`… (Balochistan), `hassan.jafferi`… (Federal) | `coord123` |
| driver | `driver01_1` … `driver25_10` (pattern: `driver{depot:02d}_{1..10}`) | `driver123` |

> The driver's depot follows the number: `driver01_*` → depot 1 (Lahore Central Warehouse), `driver05_*` → depot 5 (Dera Ghazi Khan Depot), `driver16_*` → Quetta Central Depot, etc.

---

# 17. Testing & Verification

## 17.1 Unit tests (no network, no DB)

```powershell
cd backend; .\venv\Scripts\python -m pytest tests\ -q
```

- `test_prioritization.py` — exact score math, time decay, reasoning strings.
- `test_routing.py` — synthetic 4-node graph: normal path, damaged-edge detour, fully-cut destination returns `None` (no unsafe path), GeoJSON `[lng, lat]` order. 4 tests.

## 17.2 Live smoke chain

```powershell
.\venv\Scripts\python tests\smoke_chain.py    # backend must be running
```

15-step end-to-end: admin login → center → depot → stock → **negative-inventory 409** → coordinator → **role walls both directions (403)** → structured report → free-text report → AI extraction (200 with key / 503 without) → sites → damage flag → plan generate → damage-aware route (Δ vs direct) → dispatch → **over-stock 409** → **backward-status 422** → driver reroute → replan. Assertions are DB-state-independent (safe on a used database).

## 17.3 Mobile gates

```powershell
cd mobile
npx tsc --noEmit                       # type gate — must be clean
npx expo export --platform android     # production bundle gate — must succeed
```

## 17.4 Manual demo checklist (full driver loop)

1. Coordinator: New Report (structured, e.g. *"Jampur"*, 200 people, high, food+water) → confirmed.
2. Reports → **Generate Plan for this Report** → AI plan opens → edit quantities → **Finalize Plan & Assign Driver**.
3. Assign Driver screen → filter/search → **Assign** → plan locks (re-edit returns 409).
4. Log in as the assigned driver → Dispatches → loading checklist → **Start Journey** → live street polyline → flag damage (long-press) → auto-reroute as you move → **Delivered**.
5. Coordinator Map → route visible (only for dispatches they assigned), damage flags visible network-wide.

---

# 18. Known Limitations & Design Decisions

1. **Graph coverage.** Street routing works inside the DG Khan→Rajanpur corridor + Lahore region. Elsewhere dispatches still work via the **straight-line fallback**. Extending coverage = more segments in `fetch_graph.py`; Overpass reliability is the constraint (mirror list + retries built in).
2. **No offline mode.** Always-connected assumption confirmed by the team; `source='sms_stub'` exists in the schema for future SMS ingestion.
3. **Driver `status` is informational.** Assignment is not gated by it (product decision — the gating caused false "nobody available" states). The column remains for display and future enforcement.
4. **`sites/{id}/assign` quick path is legacy.** It creates a dispatch with empty resources and assigns a user without a plan. The plan-driven flow (`/plan/generate` → editor → assign-driver) is the primary UX.
5. **Priority ranking is deterministic on purpose.** The LLM proposes *quantities* but never ranks people; the score formula is auditable and reproducible.
6. **Single-file `models.py`.** Deliberate — 11 tables in one place beats fragmenting an ORM this size.
7. **The 208 MB graph is committed via LFS.** Do not remove it from LFS or pushes will exceed GitHub's 100 MB hard limit.
8. **JWT only expires** (8 h); there is no refresh token or logout revocation — acceptable for the deployment scope.
9. **No pagination** on list endpoints — datasets are small (≤ hundreds); add LIMIT/OFFSET before scaling.

---

# 19. Troubleshooting — Field-Tested

Every entry below actually occurred during development; the fixes are in the code or the runbook.

| Symptom | Root cause | Fix |
|---|---|---|
| Backend crash on start: `np.long` / scipy errors | running **system Python** instead of the venv | `.\venv\Scripts\python -m uvicorn …` |
| `GET /api/plans` 404 while other routes work | **stale backend process** started before the plans router (often an orphaned `--reload` child) | Ctrl+C → `netstat -ano | findstr :8000` → `taskkill /F /PID <pid>` for every entry → start fresh **without** `--reload` |
| New backend fails: `Errno 10048 bind` | an old process still holds :8000 (sometimes invisible to non-elevated shells) | kill from an **admin** terminal, or Ctrl+C the elevated terminal that owns it |
| Phone: `java.net.ConnectException` | backend on localhost, or firewall | start with `--host 0.0.0.0`; firewall rules for 8000 + 8081 (§14.4) |
| Phone: "Cannot connect to Expo CLI" | stale LAN IP, Metro blocked, or AP isolation | update `.env` IP, reload; firewall 8081; or `npx expo start --tunnel` |
| Map black / tiles missing | `react-native-maps` + shared Google key (pre-refactor) | Leaflet/OSM replaced it — reload to a current bundle |
| Extraction 503 "Daily quota limit reached" | Groq quota exhausted (429 body contains quota/daily/billing) | wait for reset; transient 429s show "rate-limiting… retry in a moment" instead |
| Geocode returns a foreign location (e.g. Shahdara, Delhi) | fixed by the bounding-box candidate filter (Urdu-script addresses broke text matching) | ensure the backend runs current `geocoding.py` |
| Assign driver → 500 `'driver_id' is an invalid keyword` | Dispatch ORM model was missing plan_id/driver_id (fixed) | restart the backend to load the model |
| Assign driver → 409 | site already dispatched, or plan already assigned | correct behavior — use a fresh report/site |
| `docker exec psql < file` inserts nothing | missing `-i` flag | `docker exec -i madad-db psql …` |
| "password authentication failed" on 5432 | native Windows Postgres owns 5432 | MADAD uses **5433** |
| Passlib `ValueError: password cannot be longer than 72 bytes` / bcrypt probe crash | bcrypt 5.x vs passlib 1.7.4 | `bcrypt==4.0.1` pinned in requirements |
| Plan generation returns `source: "manual"` instead of `"ai"` | Groq call failed (quota/network) → heuristic fallback ran | check `GROQ_API_KEY`/quota; flow continues regardless |
| Plan editor shows empty roster / "no coordinators" | stale backend (old roster endpoint filtered by availability) or all workers genuinely busy | restart backend; complete deliveries to free drivers |
| Map can't be panned/zoomed | map wrapped in a ScrollView (steals gestures) | layout rule: map in a fixed container, controls below (both maps comply) |
| `osmnx` fetch: `Response ended prematurely` | big Overpass query dies mid-download | `fetch_graph.py` splits regions into small segments with 5 mirrors × retries; re-run |

---

# 20. Glossary

| Term | Meaning |
|---|---|
| **Support Center** | Administrative hub (one per province/federal area). Coordinates people; holds no stock. |
| **Depot** | Physical warehouse holding inventory; the origin of every convoy. |
| **Site** | A confirmed flood-affected location (created from a report). |
| **Plan** | A persisted, AI-drafted, human-editable resource allocation for a site. Lifecycle `draft → finalized → assigned` (locked). |
| **Plan item** | One resource line of a plan (`resource_type`, `quantity`). |
| **Dispatch** | A convoy execution record: depot → site, driver, items, route, ETA, status `planned → en_route → delivered`. |
| **Damage edge** | An OSM road segment (u, v) excluded from all routing after a flag. |
| **Priority score** | Deterministic urgency ranking of sites: population + urgency flags + severity + corroboration + age. |
| **Extraction** | LLM conversion of free text into structured report data via JSON tool-calling. |
| **Straight-line fallback** | Haversine route used when the road graph cannot reach a destination. |
| **Flood zone hull** | Convex-hull polygon over affected sites showing the flood's extent and spread direction. |
| **Driver mode** | The en-route experience: live GPS polyline, damage flagging, auto/manual rerouting, completion. |

---

## Appendix A — Key file quick-reference

| File | One-line purpose |
|---|---|
| `backend/app/services/routing.py` | Graph singleton, damage exclusion, fallbacks — the heart of the product |
| `backend/app/services/planning_ai.py` | AI plan proposal + deterministic fallback |
| `backend/app/api/routes/plans.py` | Plan lifecycle + the transactional driver assignment |
| `backend/app/api/routes/reports.py` | Report ingestion, AI extraction, in-place editing |
| `backend/app/models.py` | All 11 ORM models |
| `mobile/src/LeafletMap.tsx` | WebView map engine (markers/polylines/polygons/camera) |
| `mobile/src/screens/coordinator/modals/ActiveRouteModal.tsx` | Live driver navigation + auto-reroute |
| `mobile/src/screens/coordinator/modals/PlanEditorModal.tsx` | Editable AI plan |
| `mobile/src/navigation/RoleRouter.tsx` | Role → navigator switch |

## Appendix B — Where to add new things

- **New API endpoint** → create/extend a module in `app/api/routes/`, register the router in `app/main.py`, add pydantic models to `app/schemas/__init__.py`, role-gate with `require_role(...)`.
- **New table** → model in `app/models.py`, DDL in `postgres/schema.sql`, apply to the live DB with `ALTER TABLE` (mirror both, always).
- **New screen** → one file under `screens/<role>/`, add the tab to `<role>Nav.ts`, render it in the role's navigator, pass data via props.
- **New reusable UI** → a file in `components/`, export from `components/index.ts`, no API calls inside.
- **New resource type** → nothing to change; `inventory.resource_type` is free text and the UI reads stock dynamically.

---

*End of `Madad.md` — the single, complete handoff document for MADAD.*
