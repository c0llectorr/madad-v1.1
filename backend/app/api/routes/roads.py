from fastapi import APIRouter, Depends, HTTPException
from shapely.geometry import mapping
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import DamagedRoad, Depot, Site
from app.schemas import DamageReport
from app.services.routing import (get_graph, get_damaged_edge_pairs, compute_route, path_to_geojson, direct_fallback)

router = APIRouter(prefix="/api", tags=["roads"])


@router.post("/roads/damage", status_code=201)
async def report_damage(payload: DamageReport, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator", "driver"))):
    # Drivers have no center of their own — derive it from their depot so the
    # flag lands in the right center regardless of what the client sent.
    if user["role"] == "driver":
        from app.models import Driver
        driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver profile not found")
        depot = db.query(Depot).get(driver.depot_id)
        payload.center_id = depot.center_id

    G = get_graph()
    edge_u, edge_v, edge_key = _nearest_edges(G, payload.lng, payload.lat)
    edge_data = G.get_edge_data(edge_u, edge_v, edge_key)
    edge_geometry = edge_data.get("geometry")
    if edge_geometry is not None:
        edge_geojson = mapping(edge_geometry)
    else:
        # OSMnx stores `geometry` only for curved segments; straight edges have
        # none. Fall back to the chord between the edge's two nodes so the map
        # always has something to draw.
        edge_geojson = {
            "type": "LineString",
            "coordinates": [[G.nodes[edge_u]["x"], G.nodes[edge_u]["y"]],
                            [G.nodes[edge_v]["x"], G.nodes[edge_v]["y"]]],
        }

    damage = DamagedRoad(center_id=payload.center_id, reported_by=user["user_id"],
                         lat=payload.lat, lng=payload.lng, edge_u=edge_u, edge_v=edge_v,
                         edge_geometry=edge_geojson, reason=payload.reason, active=True)
    db.add(damage)
    db.commit()
    return {"id": damage.id, "active": True, "edge_geometry": edge_geojson}


def _nearest_edges(G, x, y):
    import osmnx as ox
    return ox.nearest_edges(G, x, y)


@router.get("/roads/damaged")
def list_damaged(center_id: int | None = None, db: Session = Depends(get_db),
                 user: dict = Depends(require_role("coordinator", "administrator", "driver"))):
    q = db.query(DamagedRoad).filter(DamagedRoad.active == True)
    if center_id:
        q = q.filter(DamagedRoad.center_id == center_id)
    rows = q.all()
    return [{"id": r.id, "center_id": r.center_id, "lat": r.lat, "lng": r.lng, "reason": r.reason,
             "edge_geometry": r.edge_geometry, "reported_at": r.reported_at} for r in rows]


@router.get("/routes")
async def get_route(from_depot_id: int, to_site_id: int, db: Session = Depends(get_db),
                    user: dict = Depends(require_role("coordinator", "driver"))):
    depot = db.query(Depot).get(from_depot_id)
    site = db.query(Site).get(to_site_id)
    if not depot or not site:
        raise HTTPException(status_code=404, detail="Depot or site not found")
    if site.lat == 0.0 and site.lng == 0.0:
        raise HTTPException(status_code=422, detail="Site has no coordinates yet — confirm its report first")

    damage_rows = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == user["center_id"], DamagedRoad.active == True).all()
    damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)

    result_with_damage = compute_route((depot.lat, depot.lng), (site.lat, site.lng), damaged_edge_pairs)
    if result_with_damage is None:
        result_with_damage = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

    result_direct = compute_route((depot.lat, depot.lng), (site.lat, site.lng), set())
    if result_direct is None:
        result_direct = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

    return {
        "distance_km": result_with_damage["distance_km"],
        "eta_minutes": round(result_with_damage["travel_time_sec"] / 60),
        "geojson": result_with_damage.get("geojson") or path_to_geojson(result_with_damage["path_nodes"]),
        "avoided_damage": len(damaged_edge_pairs) > 0,
        "delta_minutes_vs_direct": round((result_with_damage["travel_time_sec"]
                                          - result_direct["travel_time_sec"]) / 60),
    }


@router.post("/roads/damage/{damage_id}/reopen")
def reopen_road(damage_id: int, db: Session = Depends(get_db),
                user: dict = Depends(require_role("coordinator", "administrator"))):
    """Reopen a previously flagged road (closures are no longer permanent)."""
    from app.models import DamagedRoad as DR
    row = db.query(DR).get(damage_id)
    if not row:
        raise HTTPException(status_code=404, detail="Damage report not found")
    if not row.active:
        raise HTTPException(status_code=409, detail="Road already reopened")
    row.active = False
    db.commit()
    return {"id": row.id, "active": False}


@router.post("/damage/{damage_id}/reopen")
def reopen_road(damage_id: int, db: Session = Depends(get_db),
                user: dict = Depends(require_role("coordinator"))):
    """Reopen a previously flagged road — the edge re-enters the routing graph."""
    from app.models import DamagedRoad
    damage = db.query(DamagedRoad).get(damage_id)
    if not damage:
        raise HTTPException(status_code=404, detail="Damage report not found")
    if not damage.active:
        raise HTTPException(status_code=409, detail="Road already reopened")
    damage.active = False
    db.commit()
    return {"id": damage.id, "active": False}
