from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models import Report, Site, SupportCenter
from app.schemas import ReportCreate, ReportUpdate
from app.services.geocoding import geocode_location_name
from app.services.extraction import get_extraction_provider
from app.services.prioritization import priority_score

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", status_code=201)
async def submit_report(payload: ReportCreate, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator"))):
    if not payload.raw_text and not payload.structured_fields:
        raise HTTPException(status_code=422, detail="Provide either raw_text or structured_fields")

    report = Report(center_id=payload.center_id, submitted_by=user["user_id"],
                    source=payload.source, raw_text=payload.raw_text)
    db.add(report)
    db.flush()

    if payload.structured_fields:
        sf = payload.structured_fields
        report.status = "confirmed"
        if sf.lat is not None and sf.lng is not None:
            # manual/picked coordinates win over geocoding
            site_lat, site_lng = sf.lat, sf.lng
        else:
            geocode_result = await geocode_location_name(sf.location_name, settings.GOOGLE_MAPS_API_KEY)
            if geocode_result:
                site_lat, site_lng = geocode_result["lat"], geocode_result["lng"]
            else:
                # Geocoding failed/unmatched - place the site at its center's
                # coordinates (right province, editable later) instead of (0,0).
                center_row = db.query(SupportCenter).get(payload.center_id)
                site_lat, site_lng = center_row.lat, center_row.lng
        site = Site(center_id=payload.center_id, report_id=report.id,
                    location_name=sf.location_name,
                    lat=site_lat,
                    lng=site_lng,
                    estimated_population=sf.headcount,
                    severity=sf.severity,
                    needs=sf.needs,
                    urgency_flags=sf.urgency_flags)
        site.last_report_time = datetime.utcnow()
        site.priority_score = priority_score(
            {"estimated_population": site.estimated_population,
             "urgency_flags": site.urgency_flags or [],
             "severity": site.severity,
             "confidence": site.confidence,
             "last_report_time": site.last_report_time},
            datetime.utcnow())
        db.add(site)
    db.commit()
    return {"report_id": report.id, "status": report.status}


@router.post("/{report_id}/extract")
async def extract_report(report_id: int, db: Session = Depends(get_db),
                         user: dict = Depends(require_role("coordinator"))):
    report = db.query(Report).get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != "pending_extraction":
        raise HTTPException(status_code=409, detail="Report already extracted")

    try:
        provider = get_extraction_provider()
        extracted = await provider.extract(report.raw_text)
    except Exception as e:
        # Keep the contract's 503, but say WHY — quota, key, or provider down.
        from app.services.extraction.groq_provider import ExtractionProviderError
        if isinstance(e, ExtractionProviderError):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=503, detail="Extraction provider unavailable")

    geocode_result = await geocode_location_name(extracted.get("location_name", ""),
                                                 settings.GOOGLE_MAPS_API_KEY)
    report.extracted_json = {**extracted,
                             "lat": geocode_result["lat"] if geocode_result else None,
                             "lng": geocode_result["lng"] if geocode_result else None,
                             "confidence": "single_unverified"}
    report.status = "extracted"
    db.commit()
    return {"report_id": report.id, "extracted": {
                "location_name": extracted.get("location_name"),
                "estimated_population": extracted.get("estimated_population", 0),
                "needs": extracted.get("needs", []),
                "urgency_flags": extracted.get("urgency_flags", []),
                "lat": report.extracted_json["lat"],
                "lng": report.extracted_json["lng"],
                "confidence": "single_unverified"},
            "geocode_status": "matched" if geocode_result else "unmatched"}


@router.patch("/{report_id}")
def review_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db),
                  user: dict = Depends(require_role("coordinator"))):
    """Review/edit a report. Confirming creates (or updates in place) the Site
    and computes its deterministic priority score immediately, so the site is
    rankable the moment it appears on the map."""
    report = db.query(Report).get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    editing_confirmed = report.status == "confirmed"
    if report.status not in ("extracted", "pending_extraction", "confirmed"):
        raise HTTPException(status_code=409, detail="Report already reviewed")

    extracted = report.extracted_json or {}
    location_name = payload.location_name or extracted.get("location_name", "Unnamed location")
    lat = payload.lat if payload.lat is not None else extracted.get("lat")
    lng = payload.lng if payload.lng is not None else extracted.get("lng")
    population = (payload.estimated_population if payload.estimated_population is not None
                  else extracted.get("estimated_population", 0))
    needs = payload.needs if payload.needs is not None else extracted.get("needs", [])
    urgency_flags = payload.urgency_flags if payload.urgency_flags is not None else extracted.get("urgency_flags", [])

    if payload.status == "confirmed" and (lat is None or lng is None):
        raise HTTPException(status_code=422,
                            detail="lat and lng are required to confirm a report — set them explicitly")

    report.status = payload.status or "confirmed"

    site = db.query(Site).filter(Site.report_id == report.id).first()
    site_id = None

    if report.status == "confirmed":
        if site:
            # update in place — editing a confirmed report never duplicates sites
            site.location_name = location_name
            site.lat = lat
            site.lng = lng
            site.estimated_population = population or 0
            site.needs = needs
            site.urgency_flags = urgency_flags
            if payload.severity:
                site.severity = payload.severity
        else:
            # corroboration: a second confirmed report for the same named location
            dup = db.query(Site).filter(Site.center_id == report.center_id,
                                        Site.location_name == location_name).first()
            confidence = "corroborated" if dup is not None else                 extracted.get("confidence", "single_unverified")
            site = Site(center_id=report.center_id, report_id=report.id,
                        location_name=location_name, lat=lat, lng=lng,
                        estimated_population=population or 0,
                        needs=needs, urgency_flags=urgency_flags,
                        severity=payload.severity, confidence=confidence)
            db.add(site)

        if site.status != "delivered":
            # deterministic priority score computed at confirmation time
            from datetime import datetime as dt
            site.last_report_time = dt.utcnow()
            site.priority_score = priority_score(
                {"estimated_population": site.estimated_population,
                 "urgency_flags": site.urgency_flags or [],
                 "severity": site.severity,
                 "confidence": site.confidence,
                 "last_report_time": site.last_report_time},
                dt.utcnow())
        db.flush()
        site_id = site.id

    db.commit()
    return {"site_id": site_id, "status": report.status}


@router.get("")
def list_reports(center_id: int | None = None, status: str | None = None,
                 db: Session = Depends(get_db), user: dict = Depends(require_role("coordinator"))):
    q = db.query(Report)
    if center_id:
        q = q.filter(Report.center_id == center_id)
    if status:
        q = q.filter(Report.status == status)

    rows = []
    for r in q.order_by(Report.created_at.desc()).all():
        site = db.query(Site).filter(Site.report_id == r.id).first()
        rows.append({
            "report_id": r.id,
            "raw_text": r.raw_text,
            "status": r.status,
            "created_at": r.created_at,
            "structured_fields": {
                "location_name": site.location_name,
                "headcount": site.estimated_population,
                "severity": site.severity,
                "needs": site.needs or [],
            } if site else None,
        })
    return rows
