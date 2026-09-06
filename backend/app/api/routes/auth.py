from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import verify_password, create_access_token
from app.db.session import get_db
from app.models import User
from app.schemas import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    token = create_access_token(user.id, user.role, user.center_id)
    return {"access_token": token, "role": user.role, "user_id": user.id,
            "username": user.username,
            "center_id": user.center_id,
            "center_name": user.center.name if user.center else None}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
