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
async def generate_plan(payload: dict, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator"))):
    """AI plan — persisted as an editable draft (delegates to plans router)."""
    from app.api.routes.plans import generate_plan as _persisted_generate
    return await _persisted_generate(payload, db, user)


@router.post("/replan")
def replan(payload: ReplanRequest, db: Session = Depends(get_db),
           user: dict = Depends(require_role("coordinator"))):
    return replan_center(payload.center_id, db)
