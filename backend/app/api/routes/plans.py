"""Plan lifecycle: AI-persisted drafts, human edits, finalize, driver assignment."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import (DamagedRoad, Depot, Dispatch, Driver, Inventory, Plan,
                        PlanItem, Site, User)
from app.schemas import PlanItemsUpdate
from app.services.routing import (compute_route, direct_fallback,
                                  get_damaged_edge_pairs, path_to_geojson)

router = APIRouter(prefix="/api/plans", tags=["plans"])


def _plan_dict(db: Session, plan: Plan) -> dict:
    site = db.query(Site).get(plan.site_id)
    items = db.query(PlanItem).filter(PlanItem.plan_id == plan.id).all()
    return {"plan_id": plan.id, "site_id": plan.site_id, "center_id": plan.center_id,
            "status": plan.status, "source": plan.source, "reasoning": plan.reasoning,
            "site_name": site.location_name if site else None,
            "site_lat": site.lat if site else None, "site_lng": site.lng if site else None,
            "estimated_population": site.estimated_population if site else 0,
            "items": [{"resource_type": i.resource_type, "quantity": i.quantity} for i in items],
            "created_at": plan.created_at}


def _stock_for_site(db: Session, center_id: int, site) -> tuple[Depot, dict]:
    depots = db.query(Depot).filter(Depot.center_id == center_id).all()
    depot = min(depots, key=lambda d: (d.lat - site.lat) ** 2 + (d.lng - site.lng) ** 2)
    stock = {i.resource_type: i.quantity for i in db.query(Inventory)
             .filter(Inventory.depot_id == depot.id).all()}
    return depot, stock


@router.post("/generate")
async def generate_plan(payload: dict, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator"))):
    """AI-generated plan (same model family as extraction) persisted as a draft."""
    site_id = payload.get("site_id")
    site = db.query(Site).get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if site.status in ("dispatched", "delivered"):
        raise HTTPException(status_code=409, detail="Site already has an active dispatch")

    # one open draft per site — reopen instead of piling up drafts
    existing = db.query(Plan).filter(Plan.site_id == site.id, Plan.status == "draft").first()
    depot, stock = _stock_for_site(db, payload.get("center_id") or site.center_id, site)

    from app.services.planning_ai import ai_generate_plan, heuristic_plan
    site_dict = {"location_name": site.location_name, "estimated_population": site.estimated_population,
                 "severity": site.severity, "needs": site.needs or [], "urgency_flags": site.urgency_flags or []}
    ai = await ai_generate_plan(site_dict, stock)
    result = ai if ai else heuristic_plan(site_dict, stock)

    if existing:
        plan = existing
        plan.reasoning = result["reasoning"]
        plan.updated_at = datetime.utcnow()
        db.query(PlanItem).filter(PlanItem.plan_id == plan.id).delete()
    else:
        plan = Plan(site_id=site.id, center_id=site.center_id, generated_by=user["user_id"],
                    source="ai" if ai else "manual", reasoning=result["reasoning"])
        db.add(plan)
        db.flush()
    for item in result["items"]:
        qty = max(0, min(int(item.get("quantity", 0)), stock.get(item.get("resource_type"), 0)))
        if qty > 0:
            db.add(PlanItem(plan_id=plan.id, resource_type=item["resource_type"], quantity=qty))
    db.commit()
    return _plan_dict(db, plan)


@router.get("")
def list_plans(center_id: int, status: str | None = None, db: Session = Depends(get_db),
               user: dict = Depends(require_role("coordinator", "administrator"))):
    q = db.query(Plan).filter(Plan.center_id == center_id)
    if status:
        q = q.filter(Plan.status == status)
    return [_plan_dict(db, p) for p in q.order_by(Plan.updated_at.desc()).all()]


@router.get("/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db),
             user: dict = Depends(require_role("coordinator", "driver", "administrator"))):
    plan = db.query(Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _plan_dict(db, plan)


@router.patch("/{plan_id}/items")
def update_items(plan_id: int, payload: PlanItemsUpdate, db: Session = Depends(get_db),
                 user: dict = Depends(require_role("coordinator"))):
    """Edit quantities — only while the plan is a draft (R5 lock)."""
    plan = db.query(Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=409,
                            detail="Plan is locked — a driver has already been assigned")

    db.query(PlanItem).filter(PlanItem.plan_id == plan_id).delete()
    for item in payload.items:
        if item.quantity > 0:
            db.add(PlanItem(plan_id=plan_id, resource_type=item.resource_type,
                            quantity=item.quantity))
    db.commit()
    return _plan_dict(db, plan)


@router.post("/{plan_id}/finalize")
def finalize_plan(plan_id: int, db: Session = Depends(get_db),
                  user: dict = Depends(require_role("coordinator"))):
    plan = db.query(Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=409, detail="Plan already finalized")
    plan.status = "finalized"
    db.commit()
    return _plan_dict(db, plan)


@router.post("/{plan_id}/assign")
async def assign_driver(plan_id: int, payload: dict, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator"))):
    """Finalize-and-assign: creates the dispatch from the DRIVER'S depot with the
    plan's items, deducts inventory transactionally, locks the plan, and flips
    the driver to on_route."""
    plan = db.query(Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status == "assigned":
        raise HTTPException(status_code=409, detail="Plan already assigned to a driver")
    site = db.query(Site).get(plan.site_id)
    if site.status in ("dispatched", "delivered"):
        raise HTTPException(status_code=409, detail="Site already has an active dispatch")

    driver = db.query(Driver).get(payload.get("driver_id"))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver_user = db.query(User).get(driver.user_id)
    if not driver_user or not driver_user.is_active:
        raise HTTPException(status_code=404, detail="Driver account is inactive")

    items = db.query(PlanItem).filter(PlanItem.plan_id == plan_id).all()
    resources = [{"resource_type": i.resource_type, "quantity": i.quantity} for i in items]

    depot = db.query(Depot).get(driver.depot_id)
    damage_rows = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == plan.center_id, DamagedRoad.active == True).all()
    damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)

    try:
        result = await run_in_threadpool(
            compute_route, (depot.lat, depot.lng), (site.lat, site.lng), damaged_edge_pairs)
        if result is None:
            result = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

        for resource in resources:
            row = db.query(Inventory).filter(
                Inventory.depot_id == depot.id,
                Inventory.resource_type == resource["resource_type"]).with_for_update().first()
            if not row or row.quantity < resource["quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient {resource['resource_type']} at {depot.name}")
            row.quantity -= resource["quantity"]

        new_dispatch = Dispatch(
            center_id=plan.center_id, site_id=site.id, depot_id=depot.id,
            dispatched_by=user["user_id"], assigned_to=driver_user.id,
            driver_id=driver.id, plan_id=plan.id,
            resources_loaded=resources, route_geojson=result.get("geojson") or path_to_geojson(result["path_nodes"]),
            distance_km=result["distance_km"], eta_minutes=round(result["travel_time_sec"] / 60))
        db.add(new_dispatch)
        db.flush()
        db.query(Site).filter(Site.id == site.id).update({"status": "dispatched"})
        plan.status = "assigned"
        driver.status = "on_route"
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    return {"dispatch_id": new_dispatch.id, "driver": driver_user.username,
            "depot": depot.name, "eta_minutes": new_dispatch.eta_minutes,
            "distance_km": new_dispatch.distance_km}
