# MADAD — Precision Relief, Real-Time Response
### Flood Relief Coordination Platform | Hackathon Submission Write-up

---

## The Problem

When floods hit Pakistan — as the 2022 super-floods did, displacing 33 million people — relief coordination collapses into phone calls, WhatsApp groups, and guesswork. Field coordinators text "400 people stranded near the bypass, water rising" and someone upstream must manually parse that, decide priority, find a depot with stock, and route a truck there — while roads are actively washing out beneath the convoy.

**MADAD** replaces that chaos with a single coordinated pipeline: **report → extract → prioritize → plan → dispatch → reroute → deliver**, with one map showing every site, depot, and blocked road in real time.

---

## What MADAD Does

### 1. AI-powered report ingestion
A field coordinator types (or dictates) a free-text report — *"250 people stranded near Jampur, water rising, children present, need food and medical evacuation"* — and an LLM (Groq / llama-class models, via function-calling with a strict JSON schema) extracts structured data: location, headcount, needs, and urgency flags (`water_rising`, `injury_reported`, `pregnancy`…). The extracted location is **automatically geocoded** (Google Geocoding API v4) so it lands on the map without anyone typing coordinates. A structured-form path exists for coordinators who prefer taps over prose — both produce the same site record.

### 2. Deterministic prioritization — never AI judgment
Every confirmed site gets a **priority score computed by a transparent, reproducible formula**: population + urgency-flag weights (injury 50, pregnancy 40, water rising 30…) + severity weight + corroboration bonus + time-decay bump (5 pts/hour waiting). Coordinators can always see *why* a site ranks where it does — the reasoning string is rendered in the UI. **The AI never decides who gets helped first; math does.**

### 3. Damage-aware routing — the core technical module
Coordinators (at a desk, or a driver from a moving truck) flag road damage by tapping the map or by pressing "Report Road Damage" using live GPS. The tapped point is **snapped to the nearest road segment in a real OSM road graph** (loaded once at startup into memory from a committed GraphML file — no per-request fetching). That edge is then **structurally excluded** from all future routing: our path-weight function returns `None` for damaged edges, so NetworkX treats them as if they don't exist — a damaged-only path raises "no route," never "expensive but passable." Routes report both the new ETA and the **delta vs. the direct route**, making the cost of the detour visible.

### 4. The driver scenario — multi-hop journeys
A driver mid-journey hits a dead end: one tap flags damage at their GPS position, one tap requests a reroute **from where they are now** (not the original depot). This repeats as many times as the journey demands — and every reroute is logged to an audit table, so the system can show a dispatch that rerouted three times and still arrived.

### 5. Transactional dispatch
Confirming a dispatch **locks the depot's inventory rows** (`SELECT … FOR UPDATE`), verifies stock, deducts atomically, and flips the site to `dispatched` — two simultaneous dispatches can never oversubscribe the same 100 food packs. Inventory can never go negative (checked in the transaction *and* enforced by a database constraint). Dispatches move `planned → en_route → delivered`, forward only.

### 6. Replanning
One tap recomputes every active site's priority and re-ranks them — showing which sites moved up, moved down, and why. A "new report" or "road damage" event anywhere in the district can trigger it.

---

## Architecture

| Layer | Technology |
|---|---|
| Mobile app | React Native (Expo, TypeScript) — custom Material 3 "High-Trust Field" design system, Leaflet/OpenStreetMap maps (zero map API keys) |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, JWT auth (two roles: administrator, coordinator) |
| Database | PostgreSQL 16 (Docker) — 9 tables, JSONB, CHECK constraints, audit trails |
| Routing engine | OSMnx + NetworkX over a pre-fetched Dera Ghazi Khan → Rajanpur corridor road graph |
| AI extraction | Groq (OpenAI-compatible tool-calling); swappable Gemini/Qwen providers behind one interface |
| Geocoding | Google Geocoding API v4, server-side, extraction-only |

**Trust & security posture:** bcrypt-hashed passwords, JWT with role claims, endpoint-level role walls in *both* directions (verified by tests), secrets in `.env` (git-ignored), and an API contract (`API_CONTRACT.md`) enforced to the exact endpoint, field name, and status code.

**Verified end-to-end** (automated smoke chain, all green): login → create center → depot + stock → negative-inventory rejected (409) → coordinator creation → role walls (403 both ways) → structured report → free-text report → **live AI extraction + geocode match** → damage flag → plan generation → damage-aware route (+90 min vs direct) → transactional dispatch → over-stock rejected (409) → backward status rejected (422) → driver reroute from live position → replan.

---

## Design for the field

The UI is a Material 3-derived **"High-Trust Field System"**: off-white glare-reducing surfaces, a strict 8px grid, ≥48dp touch targets, Inter typography, severity color-bars on every card, pill status chips, and pinned primary actions. Pink means critical, yellow means attention, mint means success — consistently, everywhere. Maps are real OpenStreetMap tiles with layer toggles (sites / depots / damage / routes).

## What we'd build next
- Offline-first field mode (report queue with sync) for connectivity blackspots
- District-scoped road graphs loaded per coordinator (the schema already scopes every table by center)
- SMS report ingestion (the `sms_stub` source type is already in the schema)
- Corroborated-confidence scoring when multiple reports name the same location

## Team & stack choices we defend
We chose **boring, verifiable technology**: PostgreSQL constraints over app-level hope, deterministic scoring over LLM judgment for life-or-death ranking, structural graph exclusion over edge-cost penalties, and a pinned API contract that the backend, tests, and frontend all speak identically. In disaster software, *predictable beats impressive*.

---

**Demo logins:** `admin / admin123` (administrator) · any provincial coordinator, e.g. `ahmed.raza / coord123` (Punjab), `sana.qureshi / coord123` (Sindh) — 25 coordinators seeded across all five centers
**Run it:** `docker compose up -d` → `backend: uvicorn app.main:app --host 0.0.0.0 --port 8000` (from the venv) → `mobile: npx expo start`
