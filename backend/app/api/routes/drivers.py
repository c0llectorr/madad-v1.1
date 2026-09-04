"""Driver endpoints — driver-role screens and coordinator driver lists."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Depot, Dispatch, Driver, PlanItem, Site, User

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.get("")
def list_drivers(center_id: int | None = None, depot_id: int | None = None,
                 search: str | None = None, db: Session = Depends(get_db),
                 user: dict = Depends(require_role("coordinator", "administrator"))):
    """All drivers with their depot — powers the Assign Driver screen."""
    q = db.query(Driver, User, Depot).join(User, Driver.user_id == User.id) \
          .join(Depot, Driver.depot_id == Depot.id).filter(User.is_active == True)  # noqa: E712
    if center_id:
        q = q.filter(Depot.center_id == center_id)
    if depot_id:
        q = q.filter(Driver.depot_id == depot_id)
    if search:
        q = q.filter(User.username.ilike(f"%{search}%"))
    return [{"driver_id": d.id, "user_id": u.id, "username": u.username,
             "depot_id": d.depot_id, "depot_name": dp.name,
             "center_id": dp.center_id, "status": d.status}
            for d, u, dp in q.all()]


@router.get("/my/dispatches")
def my_dispatches(db: Session = Depends(get_db),
                  user: dict = Depends(require_role("driver"))):
    driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
    if not driver:
        return []
    rows = db.query(Dispatch).filter(Dispatch.driver_id == driver.id) \
             .order_by(Dispatch.created_at.desc()).all()
    out = []
    for d in rows:
        site = db.query(Site).get(d.site_id)
        depot = db.query(Depot).get(d.depot_id)
        items = []
        if d.plan_id:
            items = [{"resource_type": i.resource_type, "quantity": i.quantity}
                     for i in db.query(PlanItem).filter(PlanItem.plan_id == d.plan_id).all()]
        out.append({"dispatch_id": d.id, "status": d.status,
                    "site_name": site.location_name if site else None,
                    "site_lat": site.lat if site else None, "site_lng": site.lng if site else None,
                    "depot_name": depot.name if depot else None,
                    "distance_km": d.distance_km, "eta_minutes": d.eta_minutes,
                    "route_geojson": d.route_geojson, "plan_items": items,
                    "resources_loaded": d.resources_loaded})
    return out


@router.post("/my/dispatches/{dispatch_id}/start")
def start_journey(dispatch_id: int, db: Session = Depends(get_db),
                  user: dict = Depends(require_role("driver"))):
    """Driver loaded the truck — flips planned → en_route. Own dispatches only."""
    driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch or not driver or dispatch.driver_id != driver.id:
        raise HTTPException(status_code=404, detail="Dispatch not found for this driver")
    if dispatch.status != "planned":
        raise HTTPException(status_code=409, detail="Dispatch already started")
    dispatch.status = "en_route"
    db.commit()
    return {"dispatch_id": dispatch.id, "status": "en_route"}


@router.post("/my/dispatches/{dispatch_id}/complete")
def complete_journey(dispatch_id: int, db: Session = Depends(get_db),
                     user: dict = Depends(require_role("driver"))):
    driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
    dispatch = db.query(Dispatch).get(dispatch_id)
    if not dispatch or not driver or dispatch.driver_id != driver.id:
        raise HTTPException(status_code=404, detail="Dispatch not found for this driver")
    if dispatch.status != "en_route":
        raise HTTPException(status_code=409, detail="Journey not started yet")
    dispatch.status = "delivered"
    from app.models import Site
    db.query(Site).filter(Site.id == dispatch.site_id).update({"status": "delivered"})
    driver.status = "available"
    db.commit()
    return {"dispatch_id": dispatch.id, "status": "delivered"}
