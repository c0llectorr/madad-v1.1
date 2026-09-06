from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from fastapi import HTTPException

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Site, Depot

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("")
def list_sites(center_id: int | None = None, status: str | None = None,
               db: Session = Depends(get_db), user: dict = Depends(require_role("coordinator", "administrator"))):
    q = db.query(Site)
    if center_id:
        q = q.filter(Site.center_id == center_id)
    if status:
        q = q.filter(Site.status == status)
    return [{"id": s.id, "center_id": s.center_id, "report_id": s.report_id, "location_name": s.location_name, "lat": s.lat, "lng": s.lng,
             "estimated_population": s.estimated_population,
             "needs": s.needs, "urgency_flags": s.urgency_flags,
             "severity": s.severity, "confidence": s.confidence,
             "priority_score": s.priority_score, "status": s.status}
            for s in q.order_by(Site.priority_score.desc().nullslast()).all()]


@router.post("/{site_id}/assign")
async def assign_coordinator_to_site(site_id: int, payload: dict,
                                     db: Session = Depends(get_db),
                                     user: dict = Depends(require_role("coordinator"))):
    """Manually assign an available coordinator to a flood-affected region.

    Creates a dispatch for the site (from the nearest depot, resources to be
    loaded separately via the plan/dispatch flow) and assigns the coordinator
    in the same transaction. One coordinator per region; a coordinator may
    hold only one active assignment."""
    from app.models import DamagedRoad
    from app.services.routing import (compute_route, get_damaged_edge_pairs,
                                      path_to_geojson, direct_fallback)
    from fastapi.concurrency import run_in_threadpool

    site = db.query(Site).get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if site.status in ("dispatched", "delivered"):
        raise HTTPException(status_code=409, detail="Site already has an active dispatch")

    coordinator = db.query(User).get(payload.get("coordinator_id"))
    if not coordinator or coordinator.role != "coordinator" or not coordinator.is_active:
        raise HTTPException(status_code=404, detail="Coordinator not found")
    depots = db.query(Depot).filter(Depot.center_id == site.center_id).all()
    if not depots:
        raise HTTPException(status_code=404, detail="No depot exists for this center — create one first")
    import math
    def hav(d):
        R = 6371.0
        p1, p2 = math.radians(site.lat), math.radians(d.lat)
        dp = p2 - p1
        dl = math.radians(d.lng - site.lng)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * R * math.asin(math.sqrt(a))
    depot = min(depots, key=hav)

    damage_rows = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == user["center_id"], DamagedRoad.active == True).all()
    damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)
    result = await run_in_threadpool(
        compute_route, (depot.lat, depot.lng), (site.lat, site.lng), damaged_edge_pairs)
    if result is None:
        # Destination unreachable in the road graph (e.g. outside the loaded
        # corridor) - straight-line fallback keeps assignment working.
        result = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

    new_dispatch = Dispatch(
        center_id=user["center_id"], site_id=site.id, depot_id=depot.id,
        dispatched_by=user["user_id"], assigned_to=coordinator.id,
        resources_loaded=[], route_geojson=path_to_geojson(result["path_nodes"]),
        distance_km=result["distance_km"], eta_minutes=round(result["travel_time_sec"] / 60))
    db.add(new_dispatch)
    db.flush()
    db.query(Site).filter(Site.id == site.id).update({"status": "dispatched"})
    db.commit()
    return {"dispatch_id": new_dispatch.id, "assigned_to": coordinator.id,
            "site_id": site.id,
            "eta_minutes": new_dispatch.eta_minutes, "distance_km": new_dispatch.distance_km}
