import re
from pydantic import BaseModel, Field, field_validator
from typing import Literal

# ─── shared char-set rules (mirror of mobile/src/utils/sanitize.ts) ────────
#
# SAFE_NAME:     letters, digits, spaces, round brackets, dot, hyphen
# SAFE_RESOURCE: same + underscore + forward-slash (for "medical/food" etc.)
# SAFE_USERNAME: letters, digits, underscore, dot, hyphen  (no spaces)
# SAFE_CODE:     letters, digits, hyphen  (short identifiers like "C-104")
# SAFE_REASON:   same as SAFE_NAME but also allows commas (natural sentence)
#
# These are the authoritative server-side checks. The frontend sanitizers are
# a convenience layer; these validators are what actually enforces the rule.

_SAFE_NAME_RE     = re.compile(r'^[a-zA-Z0-9()\s.\-]+$')
_SAFE_RESOURCE_RE = re.compile(r'^[a-zA-Z0-9()\s._\-/]+$')
_SAFE_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_.\-]+$')
_SAFE_CODE_RE     = re.compile(r'^[a-zA-Z0-9\-]+$')
_SAFE_REASON_RE   = re.compile(r'^[a-zA-Z0-9()\s.,\-]+$')


def _check_name(v: str, field: str = "Value") -> str:
    t = v.strip()
    if not _SAFE_NAME_RE.match(t):
        raise ValueError(
            f"{field} contains disallowed characters — "
            "only letters, digits, spaces, ( ) . and - are allowed"
        )
    return t


def _check_resource(v: str, field: str = "Resource type") -> str:
    t = v.strip().lower()
    if not _SAFE_RESOURCE_RE.match(t):
        raise ValueError(
            f"{field} contains disallowed characters — "
            "only letters, digits, spaces, ( ) . _ - and / are allowed"
        )
    return t


def _check_username(v: str) -> str:
    t = v.strip()
    if not _SAFE_USERNAME_RE.match(t):
        raise ValueError(
            "Username contains disallowed characters — "
            "only letters, digits, _ . and - are allowed"
        )
    return t


def _check_code(v: str) -> str:
    t = v.strip().upper()
    if not _SAFE_CODE_RE.match(t):
        raise ValueError(
            "Code contains disallowed characters — "
            "only letters, digits and - are allowed"
        )
    return t


def _check_reason(v: str) -> str:
    t = v.strip()
    if not _SAFE_REASON_RE.match(t):
        raise ValueError(
            "Reason contains disallowed characters — "
            "only letters, digits, spaces, ( ) . , and - are allowed"
        )
    return t


# ─── AUTH ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("Username is required")
        if len(t) < 3 or len(t) > 60:
            raise ValueError("Username must be 3–60 characters")
        return _check_username(t)


# ─── ACCOUNTS ───────────────────────────────────────────────────────────────

class CreateCoordinatorRequest(BaseModel):
    center_id: int
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("Username is required")
        if len(t) < 3 or len(t) > 60:
            raise ValueError("Username must be 3–60 characters")
        return _check_username(t)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ─── CENTERS & DEPOTS ───────────────────────────────────────────────────────

class CenterCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        return _check_code(v)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _check_name(v, "Center name")

    @field_validator("region")
    @classmethod
    def validate_region(cls, v: str | None) -> str | None:
        if v is None:
            return v
        t = v.strip()
        if not t:
            return None
        return _check_name(t, "Region")


class DepotCreate(BaseModel):
    center_id: int
    name: str = Field(min_length=2, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _check_name(v, "Depot name")


class InventoryUpdate(BaseModel):
    resource_type: str = Field(min_length=1, max_length=40)
    quantity_delta: int

    @field_validator("resource_type")
    @classmethod
    def validate_resource_type(cls, v: str) -> str:
        return _check_resource(v)


# ─── REPORTS ────────────────────────────────────────────────────────────────

NEED_ENUM     = Literal["food", "water", "medical_evacuation", "shelter",
                         "medicine", "general_evacuation"]
SEVERITY_ENUM = Literal["low", "medium", "high", "critical"]
URGENCY_ENUM  = Literal["elderly_present", "children_present", "pregnancy",
                         "injury_reported", "water_rising", "stranded_no_exit"]


class StructuredFields(BaseModel):
    location_name: str = Field(min_length=2, max_length=150)
    headcount: int = Field(ge=0, le=10_000_000)
    severity: SEVERITY_ENUM | None = None
    needs: list[NEED_ENUM] = []
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    urgency_flags: list[URGENCY_ENUM] = []

    @field_validator("location_name")
    @classmethod
    def validate_location_name(cls, v: str) -> str:
        return _check_name(v, "Location name")


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

    @field_validator("location_name")
    @classmethod
    def validate_location_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _check_name(v, "Location name")


# ─── PLANNING ───────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    center_id: int


class ReplanRequest(BaseModel):
    center_id: int
    trigger: Literal["new_report", "road_damage", "dispatch_complete"]


# ─── ROADS & ROUTING ────────────────────────────────────────────────────────

class DamageReport(BaseModel):
    center_id: int
    lat: float
    lng: float
    end_lat: float | None = None
    end_lng: float | None = None
    reason: str | None = Field(default=None, max_length=200)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str | None) -> str | None:
        if v is None:
            return v
        t = v.strip()
        if not t:
            return None
        return _check_reason(t)


class RerouteRequest(BaseModel):
    current_lat: float
    current_lng: float
    reason: str | None = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str | None) -> str | None:
        if v is None:
            return v
        t = v.strip()
        if not t:
            return None
        return _check_reason(t)


# ─── DISPATCH ───────────────────────────────────────────────────────────────

class DispatchResource(BaseModel):
    resource_type: str = Field(min_length=1, max_length=40)
    quantity: int = Field(gt=0)

    @field_validator("resource_type")
    @classmethod
    def validate_resource_type(cls, v: str) -> str:
        return _check_resource(v)


class DispatchCreate(BaseModel):
    site_id: int
    depot_id: int
    resources: list[DispatchResource]


class DispatchStatusUpdate(BaseModel):
    status: Literal["en_route", "delivered"]


# ─── ASSIGNMENT ─────────────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    coordinator_id: int


class PlanItemIn(BaseModel):
    resource_type: str = Field(min_length=1, max_length=40)
    quantity: int = Field(gt=0)

    @field_validator("resource_type")
    @classmethod
    def validate_resource_type(cls, v: str) -> str:
        return _check_resource(v)


class PlanItemsUpdate(BaseModel):
    items: list[PlanItemIn]
