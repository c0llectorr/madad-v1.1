from pydantic import BaseModel, Field
from typing import Literal


# --- AUTH ---
class LoginRequest(BaseModel):
    username: str
    password: str


# --- ACCOUNTS ---
class CreateCoordinatorRequest(BaseModel):
    center_id: int
    username: str
    password: str


# --- CENTERS & DEPOTS ---
class CenterCreate(BaseModel):
    code: str
    name: str
    region: str | None = None
    lat: float
    lng: float


class DepotCreate(BaseModel):
    center_id: int
    name: str
    lat: float
    lng: float


class InventoryUpdate(BaseModel):
    resource_type: str
    quantity_delta: int


# --- REPORTS ---
NEED_ENUM = Literal["food", "water", "medical_evacuation", "shelter", "medicine", "general_evacuation"]
SEVERITY_ENUM = Literal["low", "medium", "high", "critical"]


class StructuredFields(BaseModel):
    location_name: str
    headcount: int = 0
    severity: SEVERITY_ENUM | None = None
    needs: list[NEED_ENUM] = []


class ReportCreate(BaseModel):
    center_id: int
    source: Literal["manual", "sms_stub"] = "manual"
    raw_text: str | None = None
    structured_fields: StructuredFields | None = None


class ReportUpdate(BaseModel):
    location_name: str | None = None
    lat: float | None = None
    lng: float | None = None
    estimated_population: int | None = None
    needs: list[str] | None = None
    urgency_flags: list[str] | None = None
    severity: SEVERITY_ENUM | None = None
    status: Literal["confirmed", "rejected"] | None = None


# --- PLANNING ---
class PlanRequest(BaseModel):
    center_id: int


class ReplanRequest(BaseModel):
    center_id: int
    trigger: Literal["new_report", "road_damage", "dispatch_complete"]


# --- ROADS & ROUTING ---
class DamageReport(BaseModel):
    center_id: int
    lat: float
    lng: float
    reason: str | None = None


class RerouteRequest(BaseModel):
    current_lat: float
    current_lng: float
    reason: str | None = None


# --- DISPATCH ---
class DispatchResource(BaseModel):
    resource_type: str
    quantity: int = Field(gt=0)


class DispatchCreate(BaseModel):
    site_id: int
    depot_id: int
    resources: list[DispatchResource]


class DispatchStatusUpdate(BaseModel):
    status: Literal["en_route", "delivered"]

# --- ASSIGNMENT ---
class AssignRequest(BaseModel):
    coordinator_id: int

class PlanItemIn(BaseModel):
    resource_type: str
    quantity: int = Field(gt=0)

class PlanItemsUpdate(BaseModel):
    items: list[PlanItemIn]
