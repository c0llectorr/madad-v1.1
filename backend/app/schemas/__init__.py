from pydantic import BaseModel, Field, field_validator
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

    @field_validator("resource_type")
    @classmethod
    def normalise_resource_type(cls, v: str) -> str:
        return v.strip().lower()


# --- REPORTS ---
NEED_ENUM = Literal["food", "water", "medical_evacuation", "shelter", "medicine", "general_evacuation"]
SEVERITY_ENUM = Literal["low", "medium", "high", "critical"]
URGENCY_ENUM = Literal["elderly_present", "children_present", "pregnancy", "injury_reported", "water_rising", "stranded_no_exit"]


class StructuredFields(BaseModel):
    location_name: str = Field(max_length=150)
    headcount: int = Field(ge=0, le=10_000_000)
    severity: SEVERITY_ENUM | None = None
    needs: list[NEED_ENUM] = []
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    urgency_flags: list[URGENCY_ENUM] = []


class ReportCreate(BaseModel):
    center_id: int
    source: Literal["manual", "sms_stub"] = "manual"
    raw_text: str | None = Field(default=None, max_length=4000)
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
    end_lat: float | None = None
    end_lng: float | None = None
    reason: str | None = Field(default=None, max_length=200)


class RerouteRequest(BaseModel):
    current_lat: float
    current_lng: float
    reason: str | None = None


# --- DISPATCH ---
class DispatchResource(BaseModel):
    resource_type: str
    quantity: int = Field(gt=0)

    @field_validator("resource_type")
    @classmethod
    def normalise_resource_type(cls, v: str) -> str:
        return v.strip().lower()


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

    @field_validator("resource_type")
    @classmethod
    def normalise_resource_type(cls, v: str) -> str:
        return v.strip().lower()

class PlanItemsUpdate(BaseModel):
    items: list[PlanItemIn]
