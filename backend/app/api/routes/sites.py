from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Site

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("")
def list_sites(center_id: int | None = None, status: str | None = None,
               db: Session = Depends(get_db), user: dict = Depends(require_role("coordinator"))):
    q = db.query(Site)
    if center_id:
        q = q.filter(Site.center_id == center_id)
    if status:
        q = q.filter(Site.status == status)
    return [{"id": s.id, "location_name": s.location_name, "lat": s.lat, "lng": s.lng,
             "estimated_population": s.estimated_population,
             "needs": s.needs, "urgency_flags": s.urgency_flags,
             "severity": s.severity, "confidence": s.confidence,
             "priority_score": s.priority_score, "status": s.status}
            for s in q.order_by(Site.priority_score.desc().nullslast()).all()]
