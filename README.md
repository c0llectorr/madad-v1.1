# MADAD — Flood Relief Coordination Platform

FastAPI backend + PostgreSQL + Expo React Native mobile app. Implements `API_CONTRACT.md` exactly (endpoints, field names, status codes), the `MADAD_DATABASE.md` schema verbatim, and the four-color palette (`#464B71`, `#118AB2`, `#7CD5C7`, `#F2F2ED`) on mobile.

## Stack

| Layer         | Tech                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Backend       | FastAPI 0.115, SQLAlchemy 2.0, JWT auth (python-jose), bcrypt               |
| Database      | PostgreSQL 16 (Docker), schema from `MADAD_DATABASE.md`                     |
| Routing       | OSMnx 1.9.4 + NetworkX 3.3 over a pre-fetched DG Khan → Rajanpur road graph |
| AI extraction | Groq (OpenAI-compatible tool calling) — swap to Gemini/Qwen via env         |
| Geocoding     | Google Geocoding API (server-side, extraction only)                         |
| Mobile        | Expo (TypeScript), react-native-maps, expo-location                         |

## 1. Database

```bash
docker compose up -d          # postgres on localhost:5433 (5432 is taken by a native Postgres on this machine)
```

Schema auto-applies on first start (`backend/postgres/schema.sql` is mounted into the container's init directory).

## 2. Backend

```bash
cd backend
python -m venv venv && ./venv/Scripts/pip install -r requirements.txt   # Windows
cp .env.example .env          # then fill in keys (see below)

# one-time: fetch the road graph (needs internet, ~5-10 min)
./venv/Scripts/python scripts/fetch_graph.py

# one-time: bootstrap the first administrator
./venv/Scripts/python scripts/bootstrap_admin.py admin admin123

./venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

> The backend **refuses to start** if `backend/database/geodata/demo_corridor.graphml` is missing — that's intentional (see `MADAD_BACKEND.md` Section 1).

### Environment keys (backend/.env)

| Key                               | Used for                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| `GROQ_API_KEY`                    | AI report extraction (default provider)                              |
| `GEMINI_API_KEY` / `QWEN_API_KEY` | Alternative providers — set `EXTRACTION_PROVIDER` to `gemini`/`qwen` |
| `GOOGLE_MAPS_API_KEY`             | Server-side geocoding after extraction                               |
| `JWT_SECRET`                      | Token signing                                                        |

## 3. Mobile app

```bash
cd mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL (see below)
npx expo start                # press a for Android emulator, or scan QR with Expo Go
```

- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api` (default)
- Physical device: use your PC's LAN IP, e.g. `http://192.168.1.10:8000/api`
- react-native-maps needs a Google Maps API key in the dev build for full tile control; Expo Go renders with the built-in key on Android.

## 4. Demo chain (matches MADAD_BACKEND.md Section 14)

1. Log in as `admin` → create center, depots, stock inventory, create coordinator account
2. Log in as coordinator → submit free-text report → run AI extraction → review/confirm
3. Or submit a structured form (confirmed directly)
4. Generate allocation plan → dispatch (inventory locks + deducts atomically)
5. Flag road damage (map tap or driver GPS) → routes avoid damaged edges
6. Mark dispatch `en_route` → **Driver mode**: flag damage from live GPS, reroute from current position (repeatable) → mark `delivered`
7. Trigger replan — site ranks recompute deterministically from the priority formula

## Project layout
```
backend/
├── app/
│   ├── main.py               # FastAPI app, graph-load-on-startup
│   ├── api/routes/           # auth, accounts, centers, depots, reports, sites, plan, roads, dispatch
│   ├── core/                 # config (env), security (JWT + bcrypt)
│   ├── services/             # extraction (groq/gemini/qwen), geocoding, prioritization, routing, replanning
│   ├── schemas/              # pydantic request models
│   └── db/session.py
├── database/geodata/         # demo_corridor.graphml (generated, committed)
├── postgres/                 # schema.sql + seed_dummy.sql (25 coordinators, 5 centers, 25 depots)
├── scripts/                  # fetch_graph.py, bootstrap_admin.py
└── tests/
mobile/src/
├── components/               # reusable primitives (Button, Field, SearchBox, FilterChips,
│                             #   Card, Chip, AppBar, Screen, BottomNav, Fab, Stepper…)
├── navigation/               # RoleRouter + per-role tab configs (coordinatorNav, adminNav)
├── screens/auth|coordinator|admin/   # ONE FILE PER SCREEN + per-role navigators
├── types.ts · utils/ · theme.ts · api.ts · LeafletMap.tsx
docker-compose.yml            # postgres:16 on 5433
```
Frontend architecture notes: see `FRONTEND_MAINTENANCE.md`.

docker-compose.yml            # postgres:16 on 5433
```
