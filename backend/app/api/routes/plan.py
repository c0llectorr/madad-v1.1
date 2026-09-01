from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Site, Depot
from app.schemas import PlanRequest, ReplanRequest
from app.services.prioritization import priority_score, format_reasoning
from app.services.replanning import replan_center, site_to_dict

router = APIRouter(prefix="/api/plan", tags=["planning"])


@router.post("/generate")
def generate_plan(payload: PlanRequest, db: Session = Depends(get_db),
                  user: dict = Depends(require_role("coordinator"))):
    sites = db.query(Site).filter(
        Site.center_id == payload.center_id,
        Site.status.notin_(["dispatched", "delivered"]),
    ).all()

    now = datetime.now(timezone.utc)
    for s in sites:
        d = site_to_dict(s)
        s.priority_score = priority_score(d, now)
    sites.sort(key=lambda s: s.priority_score or 0, reverse=True)
    db.commit()

    # Aggregate stock across the center's depots and allocate greedily by priority.
    depots = db.query(Depot).filter(Depot.center_id == payload.center_id).all()
    stock: dict[str, int] = {}
    for d in depots:
        for item in d.inventory:
            stock[item.resource_type] = stock.get(item.resource_type, 0) + item.quantity

    # Simple nearest-depot choice per site for resources the center actually holds.
    allocations = []
    for rank, s in enumerate(sites, start=1):
        needed = s.needs or []
        resources = []
        for resource_type in needed:
            available = stock.get(resource_type, 0)
            if available <= 0:
                continue
            quantity = min(available, max(1, s.estimated_population // 4 or 1))
            stock[resource_type] = available - quantity
            resources.append({"resource_type": resource_type, "quantity": quantity})

        depot = min(depots, key=lambda d: (d.lat - s.lat) ** 2 + (d.lng - s.lng) ** 2) if depots else None
        allocations.append({"site_id": s.id, "depot_id": depot.id if depot else None,
                            "rank": rank, "priority_score": s.priority_score,
                            "resources": resources,
                            "reasoning": format_reasoning(
                                {**site_to_dict(s), "priority_score": s.priority_score})})
    return {"allocations": allocations}


@router.post("/replan")
def replan(payload: ReplanRequest, db: Session = Depends(get_db),
           user: dict = Depends(require_role("coordinator"))):
    return replan_center(payload.center_id, db)
