"""
Full demo seed — richly populated mock data for all roles.

Run from the backend/ directory:
    python scripts/seed_demo.py

Safe to re-run: skips any record whose unique key already exists.
Prints a credential summary at the end.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    DamagedRoad,
    Depot,
    Driver,
    Inventory,
    Report,
    Site,
    SupportCenter,
    User,
)
from app.services.prioritization import priority_score


# ─── helpers ──────────────────────────────────────────────────────────────────

def upsert_center(db, code, **kw):
    obj = db.query(SupportCenter).filter(SupportCenter.code == code).first()
    if obj:
        print(f"  [skip] center {code}")
        return obj
    obj = SupportCenter(code=code, **kw)
    db.add(obj); db.flush()
    print(f"  [+] center {code} — {obj.name}")
    return obj


def upsert_user(db, username, plain_pw, role, center_id, created_by=None):
    obj = db.query(User).filter(User.username == username).first()
    if obj:
        print(f"  [skip] user '{username}'")
        return obj
    obj = User(username=username, password_hash=hash_password(plain_pw),
               role=role, center_id=center_id, is_active=True,
               created_by=created_by)
    db.add(obj); db.flush()
    print(f"  [+] {role} '{username}'")
    return obj


def upsert_depot(db, center_id, name, lat, lng, created_by):
    obj = db.query(Depot).filter(
        Depot.center_id == center_id, Depot.name == name).first()
    if obj:
        print(f"  [skip] depot '{name}'")
        return obj
    obj = Depot(center_id=center_id, name=name, lat=lat, lng=lng,
                created_by=created_by)
    db.add(obj); db.flush()
    print(f"  [+] depot '{name}'")
    return obj


def stock(db, depot_id, resource_type, quantity):
    obj = db.query(Inventory).filter(
        Inventory.depot_id == depot_id,
        Inventory.resource_type == resource_type).first()
    if obj:
        obj.quantity = quantity
    else:
        db.add(Inventory(depot_id=depot_id, resource_type=resource_type,
                         quantity=quantity))
    db.flush()


def upsert_driver(db, user_id, depot_id, status="available"):
    obj = db.query(Driver).filter(Driver.user_id == user_id).first()
    if obj:
        print(f"  [skip] driver record uid={user_id}")
        return obj
    obj = Driver(user_id=user_id, depot_id=depot_id, status=status)
    db.add(obj); db.flush()
    print(f"  [+] driver record uid={user_id} → depot {depot_id}")
    return obj


def upsert_site(db, center_id, report_id, location_name, lat, lng,
                population, severity, needs, flags,
                status="unserved", hours_ago=0, confidence="single_unverified"):
    obj = db.query(Site).filter(
        Site.center_id == center_id,
        Site.location_name == location_name).first()
    if obj:
        print(f"  [skip] site '{location_name}'")
        return obj
    now = datetime.now(timezone.utc)
    last = now - timedelta(hours=hours_ago)
    score = priority_score({
        "estimated_population": population,
        "urgency_flags": flags,
        "severity": severity,
        "confidence": confidence,
        "last_report_time": last,
    }, now)
    obj = Site(center_id=center_id, report_id=report_id,
               location_name=location_name, lat=lat, lng=lng,
               estimated_population=population, severity=severity,
               needs=needs, urgency_flags=flags, confidence=confidence,
               priority_score=score, status=status, last_report_time=last)
    db.add(obj); db.flush()
    print(f"  [+] site '{location_name}' score={score:.0f} [{severity}]")
    return obj


def add_report(db, center_id, submitted_by, raw_text, status,
               structured=None, hours_ago=0):
    """Always inserts a fresh report row (reports have no unique constraint)."""
    # avoid duplicating on re-run by matching raw_text + center
    if raw_text:
        existing = db.query(Report).filter(
            Report.center_id == center_id,
            Report.raw_text == raw_text).first()
        if existing:
            print(f"  [skip] report (raw text exists)")
            return existing
    r = Report(center_id=center_id, submitted_by=submitted_by,
               source="manual", raw_text=raw_text, status=status)
    db.add(r); db.flush()
    print(f"  [+] report #{r.id} status={status}")
    return r


def add_damage(db, center_id, reported_by, lat, lng, reason):
    existing = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == center_id,
        DamagedRoad.lat == lat, DamagedRoad.lng == lng).first()
    if existing:
        print(f"  [skip] damage ({lat},{lng})")
        return existing
    obj = DamagedRoad(center_id=center_id, reported_by=reported_by,
                      lat=lat, lng=lng, edge_u=0, edge_v=0,
                      reason=reason, active=True)
    db.add(obj); db.flush()
    print(f"  [+] damage ({lat},{lng})")
    return obj


# ══════════════════════════════════════════════════════════════════════════════
def main():
    db: Session = SessionLocal()

    # ── 1. Admin ──────────────────────────────────────────────────────────────
    print("\n━━━ ADMINISTRATOR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    admin = upsert_user(db, "admin", "Admin@1234",
                        role="administrator", center_id=None)

    # ── 2. Support Centers ────────────────────────────────────────────────────
    print("\n━━━ SUPPORT CENTERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    C = {}  # code → SupportCenter

    centers_data = [
        # Punjab
        ("SC-DGK",  "Dera Ghazi Khan Flood Response Center",   "Punjab",  30.0493, 70.6343),
        ("SC-MSN",  "Muzaffargarh Relief Operations Hub",      "Punjab",  30.0722, 71.1930),
        ("SC-RYK",  "Rahim Yar Khan Emergency Center",         "Punjab",  28.4200, 70.2957),
        ("SC-MUL",  "Multan Coordination and Dispatch Center", "Punjab",  30.1978, 71.4711),
        # Sindh
        ("SC-SKR",  "Sukkur Emergency Relief Center",          "Sindh",   27.7052, 68.8574),
        ("SC-LKN",  "Larkana District Operations Center",      "Sindh",   27.5570, 68.2145),
        ("SC-HYD",  "Hyderabad South Sindh Relief Hub",        "Sindh",   25.3960, 68.3578),
        ("SC-JAC",  "Jacobabad Critical Response Unit",        "Sindh",   28.2820, 68.4510),
        # KPK
        ("SC-DER",  "Dera Ismail Khan Relief Center",          "KPK",     31.8314, 70.9017),
        ("SC-NOW",  "Nowshera Flood Emergency Base",            "KPK",     34.0153, 71.9747),
    ]
    for code, name, region, lat, lng in centers_data:
        C[code] = upsert_center(db, code=code, name=name, region=region,
                                lat=lat, lng=lng)

    # ── 3. Depots & Inventory ─────────────────────────────────────────────────
    print("\n━━━ DEPOTS & INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    D = {}  # key → Depot

    depots_data = [
        # (key, center_code, name, lat, lng)
        # DGK
        ("DGK-1", "SC-DGK", "DGK Main Warehouse",         30.0601, 70.6441),
        ("DGK-2", "SC-DGK", "Jampur Forward Base",         29.6415, 70.5953),
        ("DGK-3", "SC-DGK", "Taunsa Relief Point",         30.7020, 70.6500),
        # MSN
        ("MSN-1", "SC-MSN", "Muzaffargarh Central Depot",  30.0800, 71.2100),
        ("MSN-2", "SC-MSN", "Ali Pur Sub-Depot",           29.3869, 70.9114),
        # RYK
        ("RYK-1", "SC-RYK", "RYK Main Store",              28.4300, 70.3050),
        ("RYK-2", "SC-RYK", "Liaquatpur Forward Base",     28.9200, 70.9400),
        # MUL
        ("MUL-1", "SC-MUL", "Multan City Depot",           30.2000, 71.4800),
        ("MUL-2", "SC-MUL", "Shujabad Outpost",            29.8800, 71.3500),
        # SKR
        ("SKR-1", "SC-SKR", "Sukkur Central Depot",        27.7150, 68.8660),
        ("SKR-2", "SC-SKR", "Rohri Satellite Store",        27.6924, 68.8961),
        # LKN
        ("LKN-1", "SC-LKN", "Larkana Main Warehouse",      27.5600, 68.2200),
        ("LKN-2", "SC-LKN", "Kambar Forward Point",        27.5890, 68.0100),
        # HYD
        ("HYD-1", "SC-HYD", "Hyderabad Central Store",     25.4000, 68.3600),
        ("HYD-2", "SC-HYD", "Kotri Riverside Depot",       25.3670, 68.3090),
        # JAC
        ("JAC-1", "SC-JAC", "Jacobabad Main Depot",        28.2900, 68.4600),
        ("JAC-2", "SC-JAC", "Thul Sub-Depot",              28.2400, 68.7700),
        # DER
        ("DER-1", "SC-DER", "DIKhan Central Warehouse",    31.8400, 70.9100),
        ("DER-2", "SC-DER", "Kulachi Forward Base",        31.9270, 70.4570),
        # NOW
        ("NOW-1", "SC-NOW", "Nowshera Main Depot",          34.0200, 71.9800),
        ("NOW-2", "SC-NOW", "Pabbi Sub-Depot",              33.9900, 72.1300),
    ]
    for key, cc, name, lat, lng in depots_data:
        D[key] = upsert_depot(db, C[cc].id, name, lat, lng, admin.id)

    # Stock all depots with varied quantities
    inventory_template = {
        "food":                [1800, 900, 650, 1200, 500, 750, 400, 1100, 480,
                                1000, 600, 850, 320, 700, 290, 550, 210, 800, 370, 950, 430],
        "water":               [4500, 2200, 1600, 3000, 1100, 1800, 900, 2700, 1200,
                                2400, 1300, 2100, 780, 1700, 650, 1400, 500, 2000, 890, 2300, 1050],
        "medicine":            [620,  310,  210,  480,  190,  280,  120,  420,  175,
                                380,  220,  310,  95,   260,  80,   200,  70,   300,  130,  350,  160],
        "shelter":             [280,  140,  95,   220,  88,   130,  55,   190,  80,
                                170,  100,  145,  40,   115,  35,   90,   28,   135,  60,   160,  72],
        "medical_evacuation":  [60,   30,   20,   45,   18,   28,   10,   40,   15,
                                35,   20,   30,   8,    22,   6,    18,   5,    25,   11,   30,   14],
        "general_evacuation":  [110,  55,   38,   85,   34,   52,   20,   75,   30,
                                65,   38,   55,   15,   42,   12,   34,   9,    48,   21,   56,   26],
    }
    depot_keys = list(D.keys())
    for res, quantities in inventory_template.items():
        for i, key in enumerate(depot_keys):
            qty = quantities[i] if i < len(quantities) else quantities[0]
            stock(db, D[key].id, res, qty)

    # ── 4. Coordinators ───────────────────────────────────────────────────────
    print("\n━━━ COORDINATORS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    coordinators = {}  # username → User

    coord_data = [
        # (username, center_code)
        ("coord.dgk1",  "SC-DGK"), ("coord.dgk2",  "SC-DGK"), ("coord.dgk3",  "SC-DGK"),
        ("coord.msn1",  "SC-MSN"), ("coord.msn2",  "SC-MSN"),
        ("coord.ryk1",  "SC-RYK"), ("coord.ryk2",  "SC-RYK"),
        ("coord.mul1",  "SC-MUL"), ("coord.mul2",  "SC-MUL"), ("coord.mul3",  "SC-MUL"),
        ("coord.skr1",  "SC-SKR"), ("coord.skr2",  "SC-SKR"), ("coord.skr3",  "SC-SKR"),
        ("coord.lkn1",  "SC-LKN"), ("coord.lkn2",  "SC-LKN"),
        ("coord.hyd1",  "SC-HYD"), ("coord.hyd2",  "SC-HYD"),
        ("coord.jac1",  "SC-JAC"), ("coord.jac2",  "SC-JAC"),
        ("coord.der1",  "SC-DER"), ("coord.der2",  "SC-DER"),
        ("coord.now1",  "SC-NOW"), ("coord.now2",  "SC-NOW"),
    ]
    for uname, cc in coord_data:
        u = upsert_user(db, uname, "Coord@1234",
                        role="coordinator", center_id=C[cc].id,
                        created_by=admin.id)
        coordinators[uname] = u

    # ── 5. Drivers ────────────────────────────────────────────────────────────
    print("\n━━━ DRIVERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    driver_data = [
        # (username, center_code, depot_key, status)
        ("driver.dgk1", "SC-DGK", "DGK-1", "available"),
        ("driver.dgk2", "SC-DGK", "DGK-1", "available"),
        ("driver.dgk3", "SC-DGK", "DGK-2", "available"),
        ("driver.dgk4", "SC-DGK", "DGK-2", "on_route"),
        ("driver.dgk5", "SC-DGK", "DGK-3", "available"),
        ("driver.msn1", "SC-MSN", "MSN-1", "available"),
        ("driver.msn2", "SC-MSN", "MSN-1", "available"),
        ("driver.msn3", "SC-MSN", "MSN-2", "available"),
        ("driver.ryk1", "SC-RYK", "RYK-1", "available"),
        ("driver.ryk2", "SC-RYK", "RYK-1", "on_route"),
        ("driver.ryk3", "SC-RYK", "RYK-2", "available"),
        ("driver.mul1", "SC-MUL", "MUL-1", "available"),
        ("driver.mul2", "SC-MUL", "MUL-1", "available"),
        ("driver.mul3", "SC-MUL", "MUL-2", "available"),
        ("driver.mul4", "SC-MUL", "MUL-2", "on_route"),
        ("driver.skr1", "SC-SKR", "SKR-1", "available"),
        ("driver.skr2", "SC-SKR", "SKR-1", "available"),
        ("driver.skr3", "SC-SKR", "SKR-1", "on_route"),
        ("driver.skr4", "SC-SKR", "SKR-2", "available"),
        ("driver.skr5", "SC-SKR", "SKR-2", "available"),
        ("driver.lkn1", "SC-LKN", "LKN-1", "available"),
        ("driver.lkn2", "SC-LKN", "LKN-1", "available"),
        ("driver.lkn3", "SC-LKN", "LKN-2", "available"),
        ("driver.hyd1", "SC-HYD", "HYD-1", "available"),
        ("driver.hyd2", "SC-HYD", "HYD-1", "on_route"),
        ("driver.hyd3", "SC-HYD", "HYD-2", "available"),
        ("driver.jac1", "SC-JAC", "JAC-1", "available"),
        ("driver.jac2", "SC-JAC", "JAC-1", "available"),
        ("driver.jac3", "SC-JAC", "JAC-2", "available"),
        ("driver.der1", "SC-DER", "DER-1", "available"),
        ("driver.der2", "SC-DER", "DER-1", "available"),
        ("driver.der3", "SC-DER", "DER-2", "available"),
        ("driver.now1", "SC-NOW", "NOW-1", "available"),
        ("driver.now2", "SC-NOW", "NOW-1", "on_route"),
        ("driver.now3", "SC-NOW", "NOW-2", "available"),
    ]
    for uname, cc, dk, dstatus in driver_data:
        u = upsert_user(db, uname, "Driver@1234",
                        role="driver", center_id=C[cc].id,
                        created_by=admin.id)
        upsert_driver(db, u.id, D[dk].id, status=dstatus)

    # ── 6. Field Reports & Sites ──────────────────────────────────────────────
    print("\n━━━ REPORTS & SITES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    # helper: look up coordinator by username
    def co(name): return coordinators[name].id

    # Each tuple:
    # (center_code, coord_username, raw_text_or_None, report_status,
    #  site_location, lat, lng, pop, severity, needs, flags, site_status, hours_ago)
    reports_data = [

        # ── DGK ──────────────────────────────────────────────────────────────
        ("SC-DGK", "coord.dgk1", None, "confirmed",
         "Jampur Bypass Flood Zone",       29.6380, 70.5910, 850, "critical",
         ["food","water","medical_evacuation"],
         ["children_present","water_rising","stranded_no_exit"], "unserved", 3),

        ("SC-DGK", "coord.dgk1", None, "confirmed",
         "Taunsa Barrage Village Cluster",  30.5424, 70.8401, 420, "high",
         ["food","shelter","medicine"],
         ["elderly_present","children_present"], "unserved", 8),

        ("SC-DGK", "coord.dgk1", None, "confirmed",
         "Rojhan Town Low-Lying Sector",   29.6961, 70.2283, 310, "medium",
         ["water","shelter"],
         ["elderly_present"], "unserved", 12),

        ("SC-DGK", "coord.dgk2", None, "confirmed",
         "Fort Munro Hill Village",         29.9300, 70.1900, 180, "medium",
         ["food","medicine"],
         ["elderly_present","pregnancy"], "unserved", 18),

        ("SC-DGK", "coord.dgk2", None, "confirmed",
         "Choti Zareen Riverbank",          29.8800, 70.4400, 560, "high",
         ["food","water","shelter"],
         ["water_rising","children_present","injury_reported"], "dispatched", 5),

        ("SC-DGK", "coord.dgk3",
         "250 people cut off near Kot Adu bridge. Road submerged. Elderly and children present, "
         "desperately need food and medicine.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        ("SC-DGK", "coord.dgk3",
         "Village of Shah Jamal isolated since yesterday. Water level at doorsteps. "
         "Families with infants requesting immediate food parcels and clean water.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── MSN ──────────────────────────────────────────────────────────────
        ("SC-MSN", "coord.msn1", None, "confirmed",
         "Muzaffargarh Bypass Camp",        30.0550, 71.2200, 730, "critical",
         ["food","water","medical_evacuation","shelter"],
         ["water_rising","stranded_no_exit","injury_reported"], "unserved", 2),

        ("SC-MSN", "coord.msn1", None, "confirmed",
         "Ali Pur Lowland Settlement",      29.3700, 70.9000, 490, "high",
         ["food","water","shelter"],
         ["children_present","pregnancy"], "unserved", 6),

        ("SC-MSN", "coord.msn2", None, "confirmed",
         "Kotla Jam Village",               30.1500, 71.0700, 220, "medium",
         ["food","medicine"],
         ["elderly_present"], "unserved", 20),

        ("SC-MSN", "coord.msn2",
         "About 400 residents near the canal breach point outside Ali Pur city. "
         "Canal wall collapsed 6 hours ago. Urgent food and evacuation needed.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── RYK ──────────────────────────────────────────────────────────────
        ("SC-RYK", "coord.ryk1", None, "confirmed",
         "Rahim Yar Khan Flood Plains",     28.4050, 70.2800, 1100, "critical",
         ["food","water","medical_evacuation","shelter"],
         ["water_rising","stranded_no_exit","children_present","injury_reported"],
         "unserved", 1),

        ("SC-RYK", "coord.ryk1", None, "confirmed",
         "Liaquatpur West Bank",            28.9000, 70.9200, 385, "high",
         ["food","water","shelter"],
         ["elderly_present","pregnancy"], "unserved", 7),

        ("SC-RYK", "coord.ryk2", None, "confirmed",
         "Sadiqabad Drainage Colony",       28.3100, 70.1300, 260, "medium",
         ["water","medicine"],
         ["elderly_present"], "unserved", 14),

        ("SC-RYK", "coord.ryk2",
         "Around 300 families in Khanpur tehsil completely cut off. "
         "Rising waters from Sutlej overflow. Children sick, need medicine and food urgently.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── MUL ──────────────────────────────────────────────────────────────
        ("SC-MUL", "coord.mul1", None, "confirmed",
         "Shujabad Riverside Cluster",      29.8650, 71.3300, 640, "high",
         ["food","water","shelter","medicine"],
         ["children_present","water_rising"], "unserved", 4),

        ("SC-MUL", "coord.mul1", None, "confirmed",
         "Multan Cantonment Overflow Zone", 30.2200, 71.5100, 290, "medium",
         ["food","shelter"],
         ["elderly_present"], "unserved", 10),

        ("SC-MUL", "coord.mul2", None, "confirmed",
         "Jalalpur Pirwala Flood Camp",     29.5100, 71.2200, 510, "high",
         ["food","water","medical_evacuation"],
         ["pregnancy","injury_reported","children_present"], "unserved", 6),

        ("SC-MUL", "coord.mul3", None, "confirmed",
         "Lodhran Nullah Breach Site",      29.5390, 71.6320, 175, "medium",
         ["water","medicine"],
         ["elderly_present","pregnancy"], "unserved", 22),

        ("SC-MUL", "coord.mul3",
         "Severe flooding near Mailsi bridge on Sutlej. Approximately 500 families stranded "
         "on elevated ground. No food or water for 30 hours. Many elderly and pregnant women.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── SKR ──────────────────────────────────────────────────────────────
        ("SC-SKR", "coord.skr1", None, "confirmed",
         "Sukkur Indus Flood Plains",       27.6780, 68.8110, 1200, "critical",
         ["food","water","shelter","medical_evacuation"],
         ["water_rising","stranded_no_exit","children_present","injury_reported"],
         "unserved", 2),

        ("SC-SKR", "coord.skr1", None, "confirmed",
         "Pano Aqil Resettlement Camp",     27.8629, 69.1141, 670, "high",
         ["food","medicine","shelter"],
         ["pregnancy","elderly_present"], "unserved", 5),

        ("SC-SKR", "coord.skr2", None, "confirmed",
         "Kashmore Riverbank Settlement",   28.4415, 69.5769, 290, "medium",
         ["water","food"],
         ["children_present"], "unserved", 9),

        ("SC-SKR", "coord.skr2", None, "confirmed",
         "Ghotki Ferry Crossing Village",   28.0050, 69.3150, 460, "high",
         ["food","water","medicine"],
         ["water_rising","injury_reported"], "dispatched", 4),

        ("SC-SKR", "coord.skr3", None, "confirmed",
         "Ubauro Irrigation Colony",        28.1700, 69.7300, 380, "high",
         ["food","shelter","medicine"],
         ["children_present","elderly_present"], "unserved", 11),

        ("SC-SKR", "coord.skr3",
         "About 150 people trapped near Ghotki ferry crossing. No food or clean water for 2 days. "
         "Children showing signs of dehydration and fever.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        ("SC-SKR", "coord.skr3",
         "Saleh Pat area fully submerged. 600 residents on rooftops. "
         "Water still rising. Need boats and emergency food supplies immediately.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── LKN ──────────────────────────────────────────────────────────────
        ("SC-LKN", "coord.lkn1", None, "confirmed",
         "Larkana City South Ward",         27.5500, 68.2050, 780, "critical",
         ["food","water","medical_evacuation"],
         ["water_rising","stranded_no_exit","children_present"], "unserved", 3),

        ("SC-LKN", "coord.lkn1", None, "confirmed",
         "Kambar Ali Khan Flood Zone",      27.5890, 68.0100, 450, "high",
         ["food","shelter","medicine"],
         ["elderly_present","injury_reported"], "unserved", 7),

        ("SC-LKN", "coord.lkn2", None, "confirmed",
         "Warah Agricultural Colony",       26.9000, 67.8000, 210, "medium",
         ["food","water"],
         ["children_present"], "unserved", 15),

        ("SC-LKN", "coord.lkn2",
         "Flash flood in Shahdadkot village cluster. Approximately 350 people need "
         "immediate evacuation. Road to town blocked.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── HYD ──────────────────────────────────────────────────────────────
        ("SC-HYD", "coord.hyd1", None, "confirmed",
         "Hyderabad Kotri Industrial Belt",  25.3650, 68.3100, 920, "critical",
         ["food","water","medical_evacuation","shelter"],
         ["water_rising","injury_reported","children_present"], "unserved", 2),

        ("SC-HYD", "coord.hyd1", None, "confirmed",
         "Latifabad Unit-9 Flood Sector",   25.4200, 68.3800, 540, "high",
         ["food","water","medicine"],
         ["elderly_present","children_present"], "unserved", 5),

        ("SC-HYD", "coord.hyd2", None, "confirmed",
         "Badin North Agricultural Zone",   24.6600, 68.8400, 330, "medium",
         ["water","food","shelter"],
         ["pregnancy","children_present"], "unserved", 13),

        ("SC-HYD", "coord.hyd2",
         "Tando Allahyar area partially flooded. Around 800 families displaced. "
         "Elderly patients without medicine, children without food.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── JAC ──────────────────────────────────────────────────────────────
        ("SC-JAC", "coord.jac1", None, "confirmed",
         "Jacobabad Sindh Canal Overflow",  28.2700, 68.4400, 960, "critical",
         ["food","water","shelter","medical_evacuation"],
         ["water_rising","stranded_no_exit","injury_reported","children_present"],
         "unserved", 1),

        ("SC-JAC", "coord.jac1", None, "confirmed",
         "Thul Town Submergence Zone",      28.2400, 68.7700, 510, "high",
         ["food","water","medicine"],
         ["elderly_present","pregnancy"], "unserved", 6),

        ("SC-JAC", "coord.jac2", None, "confirmed",
         "Garhi Khairo Flood Camp",         28.3900, 69.5600, 270, "medium",
         ["food","shelter"],
         ["children_present"], "unserved", 11),

        ("SC-JAC", "coord.jac2",
         "Massive inundation near Pat Feeder Canal breach. Over 1000 families homeless. "
         "Urgent evacuation and food supply required. Several injuries reported.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── DER ──────────────────────────────────────────────────────────────
        ("SC-DER", "coord.der1", None, "confirmed",
         "Dera Ismail Khan River Camp",     31.8200, 70.8900, 720, "critical",
         ["food","water","medical_evacuation","shelter"],
         ["water_rising","stranded_no_exit","children_present"], "unserved", 2),

        ("SC-DER", "coord.der1", None, "confirmed",
         "Kulachi Flood Shelter Zone",      31.9200, 70.4500, 380, "high",
         ["food","medicine","shelter"],
         ["elderly_present","injury_reported"], "unserved", 8),

        ("SC-DER", "coord.der2", None, "confirmed",
         "Paharpur Village Flood Area",     32.0900, 70.8000, 240, "medium",
         ["food","water"],
         ["children_present","elderly_present"], "unserved", 16),

        ("SC-DER", "coord.der2",
         "Approx 500 villagers near Gomal River breach isolated for 36 hours. "
         "No food, water dangerously contaminated. Young children severely affected.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        # ── NOW ──────────────────────────────────────────────────────────────
        ("SC-NOW", "coord.now1", None, "confirmed",
         "Nowshera Kabul River Breach",     34.0100, 71.9600, 1050, "critical",
         ["food","water","medical_evacuation","shelter"],
         ["water_rising","stranded_no_exit","injury_reported","children_present"],
         "unserved", 1),

        ("SC-NOW", "coord.now1", None, "confirmed",
         "Pabbi Town Flood Displacement",   33.9800, 72.1200, 620, "high",
         ["food","water","shelter","medicine"],
         ["children_present","pregnancy","elderly_present"], "unserved", 4),

        ("SC-NOW", "coord.now2", None, "confirmed",
         "Jehangira Bridge Camp",           34.0500, 71.9100, 340, "high",
         ["food","medicine"],
         ["injury_reported","elderly_present"], "unserved", 9),

        ("SC-NOW", "coord.now2",
         "Swabi district village cluster submerged. At least 700 people on rooftops. "
         "Swift current makes boat rescue dangerous. Food and medicine critically needed.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),

        ("SC-NOW", "coord.now2",
         "Charsadda flash flood warning active. Two mohallas near ring road already under water. "
         "Elderly residents unable to evacuate without assistance.",
         "pending_extraction",
         None, None, None, None, None, None, None, None, None),
    ]

    for row in reports_data:
        (cc, cname, raw, rstatus,
         sloc, slat, slng, spop, ssev, sneeds, sflags, sstatus, shago) = row

        r = add_report(db, C[cc].id, co(cname), raw, rstatus)

        if sloc is not None:
            upsert_site(db, C[cc].id, r.id, sloc, slat, slng,
                        spop, ssev, sneeds, sflags, sstatus, shago)

    # ── 7. Road Damage ────────────────────────────────────────────────────────
    print("\n━━━ ROAD DAMAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    damages = [
        # (center_code, coord_username, lat, lng, reason)
        ("SC-DGK", "coord.dgk1", 29.6510, 70.5880, "Bridge approach washed out near Jampur bypass"),
        ("SC-DGK", "coord.dgk2", 30.5100, 70.8200, "Road submerged 1.2m deep - impassable"),
        ("SC-DGK", "coord.dgk3", 29.9100, 70.1700, "Culvert collapsed near Fort Munro approach"),
        ("SC-MSN", "coord.msn1", 30.0600, 71.2050, "Embankment breach blocks main supply road"),
        ("SC-MSN", "coord.msn2", 29.3500, 70.8900, "Canal overflow submerged Ali Pur highway"),
        ("SC-RYK", "coord.ryk1", 28.3900, 70.2600, "Sutlej overflow washed out RYK bypass"),
        ("SC-RYK", "coord.ryk2", 28.2900, 70.1100, "Sadiqabad bridge partially collapsed"),
        ("SC-MUL", "coord.mul1", 29.8500, 71.3100, "Shujabad road flooded chest-deep"),
        ("SC-MUL", "coord.mul2", 29.5000, 71.2000, "Jalalpur Pirwala approach road broken"),
        ("SC-SKR", "coord.skr1", 27.6900, 68.8250, "Indus embankment breach blocks supply route"),
        ("SC-SKR", "coord.skr2", 27.8500, 69.1000, "Pano Aqil approach road collapsed"),
        ("SC-SKR", "coord.skr3", 28.0000, 69.3000, "Ghotki ferry road completely inundated"),
        ("SC-LKN", "coord.lkn1", 27.5400, 68.1900, "Larkana south road under 1.5m water"),
        ("SC-LKN", "coord.lkn2", 27.5700, 67.9900, "Kambar approach bridge damaged"),
        ("SC-HYD", "coord.hyd1", 25.3600, 68.3000, "Kotri road flooded from canal overflow"),
        ("SC-HYD", "coord.hyd2", 24.6500, 68.8300, "Badin highway breach impassable"),
        ("SC-JAC", "coord.jac1", 28.2600, 68.4300, "Jacobabad canal road underwater"),
        ("SC-JAC", "coord.jac2", 28.2300, 68.7600, "Thul town road blocked by debris"),
        ("SC-DER", "coord.der1", 31.8100, 70.8800, "Gomal riverbank road eroded"),
        ("SC-DER", "coord.der2", 31.9100, 70.4400, "Kulachi supply road damaged by flash flood"),
        ("SC-NOW", "coord.now1", 34.0000, 71.9500, "Kabul river breach - main road cut off"),
        ("SC-NOW", "coord.now2", 33.9700, 72.1100, "Pabbi road flooded from Kabul overflow"),
        ("SC-NOW", "coord.now1", 34.0400, 71.9000, "Nowshera ring road underwater near bridge"),
    ]
    for cc, cname, lat, lng, reason in damages:
        add_damage(db, C[cc].id, co(cname), lat, lng, reason)

    db.commit()
    db.close()

    print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEMO CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ADMINISTRATOR
    admin / Admin@1234         (full access, all 10 centers)

  COORDINATORS  (all passwords: Coord@1234)
    DGK  (Dera Ghazi Khan)  :  coord.dgk1  coord.dgk2  coord.dgk3
    MSN  (Muzaffargarh)     :  coord.msn1  coord.msn2
    RYK  (Rahim Yar Khan)   :  coord.ryk1  coord.ryk2
    MUL  (Multan)           :  coord.mul1  coord.mul2  coord.mul3
    SKR  (Sukkur)           :  coord.skr1  coord.skr2  coord.skr3
    LKN  (Larkana)          :  coord.lkn1  coord.lkn2
    HYD  (Hyderabad)        :  coord.hyd1  coord.hyd2
    JAC  (Jacobabad)        :  coord.jac1  coord.jac2
    DER  (DI Khan)          :  coord.der1  coord.der2
    NOW  (Nowshera)         :  coord.now1  coord.now2

  DRIVERS  (all passwords: Driver@1234)
    DGK  :  driver.dgk1  driver.dgk2  driver.dgk3  driver.dgk4  driver.dgk5
    MSN  :  driver.msn1  driver.msn2  driver.msn3
    RYK  :  driver.ryk1  driver.ryk2  driver.ryk3
    MUL  :  driver.mul1  driver.mul2  driver.mul3  driver.mul4
    SKR  :  driver.skr1  driver.skr2  driver.skr3  driver.skr4  driver.skr5
    LKN  :  driver.lkn1  driver.lkn2  driver.lkn3
    HYD  :  driver.hyd1  driver.hyd2  driver.hyd3
    JAC  :  driver.jac1  driver.jac2  driver.jac3
    DER  :  driver.der1  driver.der2  driver.der3
    NOW  :  driver.now1  driver.now2  driver.now3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEEDED TOTALS
  Support centers   : 10  (4 Punjab, 4 Sindh, 2 KPK)
  Depots            : 21  (2-3 per center, all stocked)
  Coordinators      : 23
  Drivers           : 35  (some on_route, rest available)
  Confirmed sites   : 36  (across all centers, priority-scored)
  Pending reports   : 15  (raw text ready for AI extraction)
  Road damage flags : 23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")


if __name__ == "__main__":
    main()
