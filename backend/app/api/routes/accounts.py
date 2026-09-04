from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, SupportCenter
from app.schemas import CreateCoordinatorRequest

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.post("/coordinators", status_code=201)
def create_coordinator(payload: CreateCoordinatorRequest, db: Session = Depends(get_db),
                       admin: dict = Depends(require_role("administrator"))):
    if not db.query(SupportCenter).get(payload.center_id):
        raise HTTPException(status_code=404, detail="Center not found")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    new_user = User(center_id=payload.center_id, username=payload.username,
                    password_hash=hash_password(payload.password), role="coordinator",
                    is_active=True, created_by=admin["user_id"])
    db.add(new_user)
    db.commit()
    return {"user_id": new_user.id, "username": new_user.username,
            "role": "coordinator", "center_id": new_user.center_id}


@router.get("/coordinators")
def list_coordinators(center_id: int | None = None, db: Session = Depends(get_db),
                      admin: dict = Depends(require_role("administrator"))):
    q = db.query(User).filter(User.role == "coordinator")
    if center_id:
        q = q.filter(User.center_id == center_id)
    return [{"user_id": u.id, "username": u.username, "center_id": u.center_id,
             "is_active": u.is_active,
             "created_at": u.created_at} for u in q.all()]


@router.patch("/coordinators/{user_id}/deactivate")
def deactivate_coordinator(user_id: int, db: Session = Depends(get_db),
                           admin: dict = Depends(require_role("administrator"))):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"user_id": user.id, "is_active": False}
