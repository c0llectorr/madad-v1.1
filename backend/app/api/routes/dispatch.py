from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import require_role, get_current_user
from app.db.session import get_db
from app.models import Dispatch, DispatchReroute, DamagedRoad, Depot, Site, User, Driver
from app.schemas import DispatchCreate, DispatchStatusUpdate, RerouteRequest
from app.services.routing import (compute_route, get_damaged_edge_pairs, path_to_geojson, direct_fallback)

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])

STATUS_ORDER = {"planned": 0, "en_route": 1, "delivered": 2, "cancelled": 3}


@router.post("", status_code=201)
async def create_dispatch(payload: DispatchCreate, db: Session = Depends(get_db),
                          user: dict = Depends(require_role("coordinator"))):
    depot = db.query(Depot).get(payload.depot_id)
    site = db.query(Site).get(payload.site_id)
    if not depot or not site:
        raise HTTPException(status_code=404, detail="Depot or site not found")

    try:
        for resource in sorted(payload.resources, key=lambda r: r.resource_type):
            from app.models import Inventory
            inventory_row = db.query(Inventory).filter(
                Inventory.depot_id == payload.depot_id,
                Inventory.resource_type == resource.resource_type,
            ).with_for_update().first()
            if not inventory_row or inventory_row.quantity < resource.quantity:
                raise HTTPException(status_code=409,
                                    detail="Insufficient inventory for one or more resources")
            inventory_row.quantity -= resource.quantity

        damage_rows = db.query(DamagedRoad).filter(
            DamagedRoad.center_id == user["center_id"], DamagedRoad.active == True).all()
        damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)

        result = await run_in_threadpool(
            compute_route, (depot.lat, depot.lng), (site.lat, site.lng), damaged_edge_pairs)
        if result is None:
            # Outside the loaded corridor - straight-line fallback keeps
            # dispatch working nationwide (real routing resumes inside it).
            result = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

        route_geojson = result.get("geojson") or path_to_geojson(result["path_nodes"])
        new_dispatch = Dispatch(center_id=user["center_id"], site_id=payload.site_id,
                                depot_id=payload.depot_id, dispatched_by=user["user_id"],
                                resources_loaded=[r.model_dump() for r in payload.resources],
                                route_geojson=route_geojson,
                                distance_km=result["distance_km"],
                                eta_minutes=round(result["travel_time_sec"] / 60))
        db.add(new_dispatch)
        db.flush()
        db.query(Site).filter(Site.id == payload.site_id).update({"status": "dispatched"})
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return {"dispatch_id": new_dispatch.id, "status": "planned",
            "route": {"geojson": route_geojson, "distance_km": result["distance_km"]},
            "eta_minutes": new_dispatch.eta_minutes}


@router.patch("/{dispatch_id}/status")
def update_status(dispatch_id: int, payload: DispatchStatusUpdate, db: Session = Depends(get_db),
                  user: dict = Depends(require_role("coordinator", "driver"))):
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if user["role"] == "driver":
        driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
        if not driver or dispatch.driver_id != driver.id:
            raise HTTPException(status_code=403, detail="Not your dispatch")
    if STATUS_ORDER[payload.status] <= STATUS_ORDER[dispatch.status]:
        raise HTTPException(status_code=422, detail="Dispatch status cannot move backward")

    dispatch.status = payload.status
    if payload.status == "delivered":
        db.query(Site).filter(Site.id == dispatch.site_id).update({"status": "delivered"})
        if dispatch.driver_id:
            db.query(Driver).filter(Driver.id == dispatch.driver_id).update({"status": "available"})
        # free the driver on EVERY delivery path (coordinator or driver),
        # not only the driver-completed one — fixes the stranded on_route bug
        if dispatch.driver_id:
            db.query(Driver).filter(Driver.id == dispatch.driver_id).update({"status": "available"})
    db.commit()
    return {"dispatch_id": dispatch.id, "status": dispatch.status}


@router.post("/{dispatch_id}/reroute")
async def reroute_dispatch(dispatch_id: int, payload: RerouteRequest, db: Session = Depends(get_db),
                           user: dict = Depends(require_role("coordinator", "driver"))):
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if dispatch.status == "delivered":
        raise HTTPException(status_code=409, detail="Cannot reroute a delivered dispatch")

    site = db.query(Site).get(dispatch.site_id)
    damage_rows = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == user["center_id"], DamagedRoad.active == True).all()
    damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)

    result = await run_in_threadpool(
        compute_route, (payload.current_lat, payload.current_lng), (site.lat, site.lng), damaged_edge_pairs)
    if result is None:
        result = direct_fallback((payload.current_lat, payload.current_lng), (site.lat, site.lng))

    result_direct = await run_in_threadpool(
        compute_route, (payload.current_lat, payload.current_lng), (site.lat, site.lng), set())
    if result_direct is None:
        result_direct = direct_fallback((payload.current_lat, payload.current_lng), (site.lat, site.lng))

    old_eta = dispatch.eta_minutes
    new_eta = round(result["travel_time_sec"] / 60)

    dispatch.route_geojson = result.get("geojson") or path_to_geojson(result["path_nodes"])
    dispatch.distance_km = result["distance_km"]
    dispatch.eta_minutes = new_eta

    reroute_log = DispatchReroute(dispatch_id=dispatch_id, triggered_by=user["user_id"],
                                  current_lat=payload.current_lat, current_lng=payload.current_lng,
                                  old_eta_minutes=old_eta, new_eta_minutes=new_eta,
                                  reason=payload.reason)
    db.add(reroute_log)
    db.commit()

    return {"dispatch_id": dispatch_id, "distance_km": result["distance_km"], "eta_minutes": new_eta,
            "geojson": dispatch.route_geojson,
            "delta_minutes_vs_direct": round((result["travel_time_sec"]
                                              - result_direct["travel_time_sec"]) / 60)}


@router.post("/{dispatch_id}/cancel")
def cancel_dispatch(dispatch_id: int, db: Session = Depends(get_db),
                    user: dict = Depends(require_role("coordinator"))):
    """Cancel a dispatch: restocks the deducted inventory, frees the driver,
    returns the site to unserved, and marks the dispatch cancelled."""
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if dispatch.status in ("delivered", "cancelled"):
        raise HTTPException(status_code=409, detail="Dispatch already completed")

    from app.models import Inventory
    try:
        for resource in (dispatch.resources_loaded or []):
            row = db.query(Inventory).filter(
                Inventory.depot_id == dispatch.depot_id,
                Inventory.resource_type == resource["resource_type"]).with_for_update().first()
            if row:
                row.quantity += resource.get("quantity", 0)
        if dispatch.driver_id:
            db.query(Driver).filter(Driver.id == dispatch.driver_id).update({"status": "available"})
        if dispatch.plan_id:
            from app.models import Plan
            db.query(Plan).filter(Plan.id == dispatch.plan_id).update({"status": "finalized"})
        db.query(Site).filter(Site.id == dispatch.site_id).update({"status": "unserved"})
        dispatch.status = "cancelled"
        db.commit()
    except HTTPException:
        db.rollback(); raise
    return {"dispatch_id": dispatch.id, "status": "cancelled"}


@router.get("")
def list_dispatches(center_id: int | None = None, db: Session = Depends(get_db),
                    user: dict = Depends(require_role("coordinator", "administrator"))):
    q = db.query(Dispatch)
    if center_id:
        q = q.filter(Dispatch.center_id == center_id)
    return [{"dispatch_id": d.id, "site_id": d.site_id, "depot_id": d.depot_id,
             "status": d.status, "distance_km": d.distance_km, "eta_minutes": d.eta_minutes,
             "route_geojson": d.route_geojson,
             "resources_loaded": d.resources_loaded, "created_at": d.created_at,
             "assigned_to": d.assigned_to, "driver_id": d.driver_id, "plan_id": d.plan_id,
             "dispatched_by": d.dispatched_by}
            for d in q.order_by(Dispatch.created_at.desc()).all()]


@router.post("/{dispatch_id}/assign")
def assign_coordinator(dispatch_id: int, payload: dict, db: Session = Depends(get_db),
                       user: dict = Depends(require_role("coordinator"))):
    """Assign one available coordinator to a planned/en_route dispatch.
    Rules: only one assignment per dispatch; a coordinator can hold only one
    active assignment."""
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if dispatch.status == "delivered":
        raise HTTPException(status_code=409, detail="Cannot assign a delivered dispatch")
    if dispatch.assigned_to:
        raise HTTPException(status_code=409, detail="Dispatch already has an assigned coordinator")

    coordinator = db.query(User).get(payload.get("coordinator_id"))
    if not coordinator or coordinator.role != "coordinator" or not coordinator.is_active:
        raise HTTPException(status_code=404, detail="Coordinator not found")
    dispatch.assigned_to = coordinator.id
    db.commit()
    return {"dispatch_id": dispatch.id, "assigned_to": coordinator.id}


@router.post("/{dispatch_id}/unassign")
def unassign_coordinator(dispatch_id: int, db: Session = Depends(get_db),
                         user: dict = Depends(require_role("coordinator"))):
    """Release the assigned coordinator (assignment cancelled pre-departure)."""
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if not dispatch.assigned_to:
        raise HTTPException(status_code=409, detail="Dispatch has no assigned coordinator")
    dispatch.assigned_to = None
    db.commit()
    return {"dispatch_id": dispatch.id, "assigned_to": None}


@router.get("/available-coordinators")
def available_coordinators(center_id: int, db: Session = Depends(get_db),
                           user: dict = Depends(require_role("coordinator", "administrator"))):
    """All active coordinators of a center — anyone can be assigned."""
    rows = db.query(User).filter(User.center_id == center_id, User.role == "coordinator",
                                 User.is_active == True).all()  # noqa: E712
    return [{"user_id": u.id, "username": u.username, "center_id": u.center_id} for u in rows]


@router.post("/{dispatch_id}/cancel")
def cancel_dispatch(dispatch_id: int, db: Session = Depends(get_db),
                    user: dict = Depends(require_role("coordinator", "administrator"))):
    """Cancel a not-yet-delivered dispatch: restores plan to draft, site to
    unserved, returns the deducted stock to the depot, frees the driver."""
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if dispatch.status == "delivered":
        raise HTTPException(status_code=409, detail="Cannot cancel a delivered dispatch")

    from app.models import Plan, PlanItem, Inventory
    for r in dispatch.resources_loaded or []:
        row = db.query(Inventory).filter(
            Inventory.depot_id == dispatch.depot_id,
            Inventory.resource_type == r.get("resource_type")).first()
        if row:
            row.quantity += int(r.get("quantity", 0))
        else:
            db.add(Inventory(depot_id=dispatch.depot_id,
                             resource_type=r.get("resource_type"),
                             quantity=int(r.get("quantity", 0))))

    db.query(Site).filter(Site.id == dispatch.site_id).update({"status": "unserved"})
    if dispatch.plan_id:
        db.query(Plan).filter(Plan.id == dispatch.plan_id).update({"status": "draft"})
    if dispatch.driver_id:
        db.query(Driver).filter(Driver.id == dispatch.driver_id).update({"status": "available"})
    dispatch.status = "cancelled"
    db.commit()
    return {"dispatch_id": dispatch.id, "status": "cancelled"}
