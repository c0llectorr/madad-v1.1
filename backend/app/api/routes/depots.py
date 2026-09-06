from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Depot, Inventory, SupportCenter
from app.schemas import DepotCreate, InventoryUpdate

router = APIRouter(prefix="/api/depots", tags=["depots"])


@router.post("", status_code=201)
def create_depot(payload: DepotCreate, db: Session = Depends(get_db),
                 admin: dict = Depends(require_role("administrator"))):
    if not db.query(SupportCenter).get(payload.center_id):
        raise HTTPException(status_code=404, detail="Center not found")
    depot = Depot(center_id=payload.center_id, name=payload.name, lat=payload.lat,
                  lng=payload.lng, created_by=admin["user_id"])
    db.add(depot)
    db.commit()
    return {"id": depot.id}


@router.get("")
def list_depots(center_id: int, db: Session = Depends(get_db),
                user: dict = Depends(require_role("administrator", "coordinator"))):
    depots = db.query(Depot).filter(Depot.center_id == center_id).all()
    return [{"id": d.id, "name": d.name, "lat": d.lat, "lng": d.lng,
             "inventory": [{"resource_type": i.resource_type, "quantity": i.quantity}
                           for i in d.inventory]} for d in depots]


@router.patch("/{depot_id}/inventory")
def update_inventory(depot_id: int, payload: InventoryUpdate, db: Session = Depends(get_db),
                     admin: dict = Depends(require_role("administrator"))):
    row = (db.query(Inventory)
           .filter(Inventory.depot_id == depot_id, Inventory.resource_type == payload.resource_type)
           .with_for_update().first())
    if row:
        new_quantity = row.quantity + payload.quantity_delta
        if new_quantity < 0:
            raise HTTPException(status_code=409, detail="Insufficient inventory, cannot go below zero")
        row.quantity = new_quantity
    else:
        if payload.quantity_delta < 0:
            raise HTTPException(status_code=409, detail="Insufficient inventory, cannot go below zero")
        row = Inventory(depot_id=depot_id, resource_type=payload.resource_type,
                        quantity=payload.quantity_delta)
        db.add(row)
    db.commit()
    return {"resource_type": payload.resource_type, "quantity": row.quantity}
