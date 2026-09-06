from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, SupportCenter, Driver, Depot
from app.schemas import CreateCoordinatorRequest

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.post("/coordinators", status_code=201)
def create_user(payload: dict, db: Session = Depends(get_db),
                admin: dict = Depends(require_role("administrator"))):
    """Create a coordinator OR a driver (role in body; drivers require depot_id)."""
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not username or not (3 <= len(username) <= 60):
        raise HTTPException(status_code=422, detail="username must be 3-60 characters")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="password must be at least 8 characters")
    role = payload.get("role", "coordinator")
    if role not in ("coordinator", "driver"):
        raise HTTPException(status_code=422, detail="role must be coordinator or driver")
    if not db.query(SupportCenter).get(payload.get("center_id")):
        raise HTTPException(status_code=404, detail="Center not found")
    if db.query(User).filter(User.username == payload.get("username")).first():
        raise HTTPException(status_code=409, detail="Username already exists")

    depot_id = payload.get("depot_id")
    if role == "driver":
        depot = db.query(Depot).get(depot_id) if depot_id else None
        if not depot or depot.center_id != payload.get("center_id"):
            raise HTTPException(status_code=404, detail="Depot not found in this center")

    new_user = User(center_id=payload.get("center_id"), username=payload.get("username"),
                    password_hash=hash_password(payload.get("password")), role=role,
                    is_active=True, created_by=admin["user_id"])
    db.add(new_user)
    db.flush()
    if role == "driver":
        db.add(Driver(user_id=new_user.id, depot_id=depot_id))
    db.commit()
    return {"user_id": new_user.id, "username": new_user.username,
            "role": role, "center_id": new_user.center_id,
            "depot_id": depot_id if role == "driver" else None}


@router.get("/coordinators")
def list_coordinators(center_id: int | None = None, db: Session = Depends(get_db),
                      admin: dict = Depends(require_role("administrator"))):
    q = db.query(User).filter(User.role.in_(("coordinator", "driver")))
    if center_id:
        q = q.filter(User.center_id == center_id)
    # single joined query — was 2 queries per user (N+1)
    rows = (db.query(User, Driver, Depot)
            .outerjoin(Driver, Driver.user_id == User.id)
            .outerjoin(Depot, Depot.id == Driver.depot_id)
            .filter(User.id.in_([u.id for u in q.all()])).all())
    by_id = {u.id: (u, d, dp) for u, d, dp in rows}
    out = []
    for u in q.all():
        d, dp = (by_id.get(u.id, (None, None))[1], by_id.get(u.id, (None, None))[2])
        out.append({"user_id": u.id, "username": u.username, "center_id": u.center_id,
                    "is_active": u.is_active, "role": u.role,
                    "depot_id": d.depot_id if d else None,
                    "depot_name": dp.name if dp else None,
                    "created_at": u.created_at})
    return out


@router.patch("/coordinators/{user_id}/deactivate")
def deactivate_coordinator(user_id: int, db: Session = Depends(get_db),
                           admin: dict = Depends(require_role("administrator"))):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"user_id": user.id, "is_active": False}


@router.patch("/coordinators/{user_id}/reactivate")
def reactivate_user(user_id: int, db: Session = Depends(get_db),
                    admin: dict = Depends(require_role("administrator"))):
    """Re-enable a deactivated account (deactivation is no longer irreversible)."""
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    return {"user_id": user.id, "is_active": True}
