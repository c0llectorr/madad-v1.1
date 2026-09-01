from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import SupportCenter
from app.schemas import CenterCreate

router = APIRouter(prefix="/api/centers", tags=["centers"])


@router.post("", status_code=201)
def create_center(payload: CenterCreate, db: Session = Depends(get_db),
                  admin: dict = Depends(require_role("administrator"))):
    if db.query(SupportCenter).filter(SupportCenter.code == payload.code).first():
        raise HTTPException(status_code=409, detail="Center code already exists")
    center = SupportCenter(code=payload.code, name=payload.name, region=payload.region,
                           lat=payload.lat, lng=payload.lng)
    db.add(center)
    db.commit()
    return {"id": center.id, "code": center.code}


@router.get("")
def list_centers(db: Session = Depends(get_db), user: dict = Depends(require_role("administrator", "coordinator"))):
    return [{"id": c.id, "code": c.code, "name": c.name, "region": c.region,
             "lat": c.lat, "lng": c.lng} for c in db.query(SupportCenter).all()]
