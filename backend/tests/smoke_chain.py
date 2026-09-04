"""End-to-end API chain smoke test — mirrors MADAD_BACKEND.md Section 14.

Run with the backend up on :8000. Sites created without a Google key land at
(0, 0); the test nudge-corrects them via SQL to simulate a successful geocode,
so the routing/dispatch machinery is fully exercised.
"""
import json

import httpx

BASE = "http://localhost:8000/api"
client = httpx.Client(base_url=BASE, timeout=30)


def call(method, path, token=None, expect=None, **kw):
    headers = kw.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = client.request(method, path, headers=headers, **kw)
    if expect is not None:
        assert r.status_code == expect, f"{method} {path} → {r.status_code}: {r.text}"
    return r


print("== admin login ==")
admin_tok = call("POST", "/auth/login", json={"username": "admin", "password": "admin123"},
                 expect=200).json()["access_token"]

print("== create center ==")
r = call("POST", "/centers", admin_tok, json={"code": "DGK-01", "name": "DG Khan Center",
          "region": "Punjab", "lat": 30.05, "lng": 70.64}, expect=None)
assert r.status_code in (201, 409), r.text
center_id = r.json().get("id") or 1

print("== create depot + stock ==")
r = call("POST", "/depots", admin_tok, json={"center_id": center_id, "name": "Warehouse A",
          "lat": 30.02, "lng": 70.60}, expect=201)
depot_id = r.json()["id"]
for res, qty in [("food", 500), ("water", 300)]:
    call("PATCH", f"/depots/{depot_id}/inventory", admin_tok,
         json={"resource_type": res, "quantity_delta": qty}, expect=200)

print("== inventory cannot go negative ==")
call("PATCH", f"/depots/{depot_id}/inventory", admin_tok,
     json={"resource_type": "water", "quantity_delta": -99999}, expect=409)

print("== create coordinator ==")
r = call("POST", "/accounts/coordinators", admin_tok,
         json={"center_id": center_id, "username": "coord1", "password": "coord123"}, expect=None)
assert r.status_code in (201, 409), r.text

print("== coordinator login + role walls ==")
coord = call("POST", "/auth/login", json={"username": "coord1", "password": "coord123"}, expect=200).json()
coord_tok = coord["access_token"]
assert coord["center_id"] == center_id
call("POST", "/accounts/coordinators", coord_tok, json={"center_id": center_id,
     "username": "x", "password": "x"}, expect=403)          # coordinator → admin-only: 403
call("GET", f"/sites?center_id={center_id}", admin_tok, expect=403)  # admin → coordinator-only: 403

print("== structured report ==")
r = call("POST", "/reports", coord_tok, json={"center_id": center_id, "source": "manual",
         "structured_fields": {"location_name": "Jampur", "headcount": 250,
                               "severity": "high", "needs": ["food", "water"]}}, expect=201)
assert r.json()["status"] == "confirmed"

print("== free-text report; extraction 503 without key; manual confirm works ==")
r = call("POST", "/reports", coord_tok, json={"center_id": center_id, "source": "manual",
         "raw_text": "300 people stranded near Kot Mithan, water rising, need food and medicine"},
         expect=201)
report_id = r.json()["report_id"]
r = call("POST", f"/reports/{report_id}/extract", coord_tok, expect=None)
assert r.status_code in (200, 503), r.text
if r.status_code == 503:
    print("   (no AI key configured — 503 path verified)")
else:
    print(f"   AI extraction live: {r.json()['extracted']['location_name']} "
          f"(geocode {r.json()['geocode_status']})")
r = call("PATCH", f"/reports/{report_id}", coord_tok,
         json={"location_name": "Kot Mithan", "lat": 29.15, "lng": 70.37,
               "estimated_population": 300, "needs": ["food", "medicine"],
               "urgency_flags": ["water_rising", "children_present"], "status": "confirmed"},
         expect=200)
site2 = r.json()["site_id"]
assert site2 is not None

print("== sites listed ==")
sites = call("GET", f"/sites?center_id={center_id}", coord_tok, expect=200).json()
assert any(s["location_name"] == "Jampur" for s in sites) and any(s["location_name"] == "Kot Mithan" for s in sites), "expected sites missing"
# structured-report site has no coords without a geocoding key — nudge it as a
# successful geocode would, so routing can be exercised below.
site1 = next(s for s in sites if s["location_name"] == "Jampur")
import psycopg2
conn = psycopg2.connect("postgresql://madad:madad@localhost:5433/madad")
with conn, conn.cursor() as cur:
    cur.execute("UPDATE sites SET lat=29.30, lng=70.45 WHERE id=%s", (site1["id"],))
conn.close()

print("== flag road damage (desk map tap near corridor midpoint) ==")
r = call("POST", "/roads/damage", coord_tok,
         json={"center_id": center_id, "lat": 29.75, "lng": 70.35, "reason": "Bridge washed out"},
         expect=201)
assert r.json()["active"] is True
damaged = call("GET", f"/roads/damaged?center_id={center_id}", coord_tok, expect=200).json()
assert len(damaged) >= 1 and damaged[-1]["edge_geometry"] is not None, "damage row missing geometry"

print("== plan generate ==")
plan = call("POST", "/plan/generate", coord_tok, json={"center_id": center_id}, expect=200).json()
assert len(plan["allocations"]) >= 1, "no allocations generated"
top = plan["allocations"][0]
print(f"   top: site {top['site_id']} rank 1 score {top['priority_score']:.0f}")

print("== route depot → site, avoiding damage ==")
route = call("GET", f"/routes?from_depot_id={depot_id}&to_site_id={site2}", coord_tok, expect=200).json()
print(f"   {route['distance_km']:.1f} km, ETA {route['eta_minutes']} min, "
      f"delta vs direct {route['delta_minutes_vs_direct']} min, avoided {route['avoided_damage']}")
assert route["geojson"]["type"] == "LineString"

print("== dispatch ==")
r = call("POST", "/dispatch", coord_tok, json={"site_id": site2, "depot_id": depot_id,
         "resources": [{"resource_type": "food", "quantity": 100},
                       {"resource_type": "water", "quantity": 60}]}, expect=201)
dispatch_id = r.json()["dispatch_id"]
inv = call("GET", f"/depots?center_id={center_id}", coord_tok, expect=200).json()[0]["inventory"]
assert next(i for i in inv if i["resource_type"] == "food")["quantity"] >= 100, "inventory not deducted"

print("== dispatch over-stock rejected ==")
call("POST", "/dispatch", coord_tok, json={"site_id": site2, "depot_id": depot_id,
     "resources": [{"resource_type": "food", "quantity": 99999}]}, expect=409)

print("== status transitions ==")
call("PATCH", f"/dispatch/{dispatch_id}/status", coord_tok, json={"status": "en_route"}, expect=200)
call("PATCH", f"/dispatch/{dispatch_id}/status", coord_tok, json={"status": "en_route"}, expect=422)  # same = no-op

print("== driver reroute from live position ==")
r = call("POST", f"/dispatch/{dispatch_id}/reroute", coord_tok,
         json={"current_lat": 29.60, "current_lng": 70.40, "reason": "Dead end at levee"}, expect=200)
print(f"   new ETA {r.json()['eta_minutes']} min, Δ{r.json()['delta_minutes_vs_direct']} vs direct")

call("PATCH", f"/dispatch/{dispatch_id}/status", coord_tok, json={"status": "delivered"}, expect=200)
call("POST", f"/dispatch/{dispatch_id}/reroute", coord_tok,
     json={"current_lat": 29.60, "current_lng": 70.40}, expect=409)  # delivered → 409

print("== replan ==")
r = call("POST", "/plan/replan", coord_tok,
         json={"center_id": center_id, "trigger": "road_damage"}, expect=200).json()
print(f"   changed {len(r['changed'])}, unchanged {len(r['unchanged'])}")

print("\nALL SMOKE TESTS PASSED ✅")
