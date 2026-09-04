from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class SupportCenter(Base):
    __tablename__ = "support_centers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    region: Mapped[str | None] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="center")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('administrator', 'coordinator', 'driver')"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int | None] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"))
    username: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    center: Mapped[SupportCenter | None] = relationship(back_populates="users", foreign_keys=[center_id])


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("source IN ('manual', 'sms_stub')"),
        CheckConstraint("status IN ('pending_extraction', 'extracted', 'confirmed', 'rejected')"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    submitted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    raw_text: Mapped[str | None] = mapped_column(Text)
    extracted_json: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_extraction")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical') OR severity IS NULL"),
        CheckConstraint("confidence IN ('single_unverified', 'corroborated')"),
        CheckConstraint("status IN ('unserved', 'planned', 'dispatched', 'delivered')"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"))
    location_name: Mapped[str] = mapped_column(String(150), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_population: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    needs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    urgency_flags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    severity: Mapped[str | None] = mapped_column(String(20))
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="single_unverified")
    priority_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unserved")
    last_report_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Depot(Base):
    __tablename__ = "depots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    inventory: Mapped[list["Inventory"]] = relationship(back_populates="depot")


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("depot_id", "resource_type"),
        CheckConstraint("quantity >= 0"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depots.id", ondelete="CASCADE"), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    depot: Mapped[Depot] = relationship(back_populates="inventory")


class Dispatch(Base):
    __tablename__ = "dispatches"
    __table_args__ = (CheckConstraint("status IN ('planned', 'en_route', 'delivered')"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depots.id", ondelete="CASCADE"), nullable=False)
    dispatched_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resources_loaded: Mapped[list] = mapped_column(JSONB, nullable=False)
    route_geojson: Mapped[dict | None] = mapped_column(JSONB)
    distance_km: Mapped[float | None] = mapped_column(Float)
    eta_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DamagedRoad(Base):
    __tablename__ = "damaged_roads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    reported_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    edge_u: Mapped[int] = mapped_column(BigInteger, nullable=False)
    edge_v: Mapped[int] = mapped_column(BigInteger, nullable=False)
    edge_geometry: Mapped[dict | None] = mapped_column(JSONB)
    reason: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DispatchReroute(Base):
    __tablename__ = "dispatch_reroutes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id", ondelete="CASCADE"), nullable=False)
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    current_lat: Mapped[float] = mapped_column(Float, nullable=False)
    current_lng: Mapped[float] = mapped_column(Float, nullable=False)
    old_eta_minutes: Mapped[int | None] = mapped_column(Integer)
    new_eta_minutes: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depots.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    center_id: Mapped[int] = mapped_column(ForeignKey("support_centers.id", ondelete="CASCADE"), nullable=False)
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="ai")
    reasoning: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlanItem(Base):
    __tablename__ = "plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
