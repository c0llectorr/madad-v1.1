from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Site
from app.services.prioritization import priority_score, format_reasoning


def site_to_dict(s: Site) -> dict:
    return {"id": s.id, "estimated_population": s.estimated_population,
            "urgency_flags": s.urgency_flags or [], "severity": s.severity,
            "confidence": s.confidence, "priority_score": s.priority_score or 0.0,
            "last_report_time": s.last_report_time}


def replan_center(center_id: int, db: Session) -> dict:
    active_sites = db.query(Site).filter(
        Site.center_id == center_id,
        Site.status.notin_(["dispatched", "delivered"]),
    ).all()

    old_ranks = {}
    for s in sorted(active_sites, key=lambda x: x.priority_score or 0, reverse=True):
        old_ranks[s.id] = len(old_ranks) + 1

    for s in active_sites:
        d = site_to_dict(s)
        s.priority_score = priority_score(d, datetime.now(timezone.utc))
    active_sites.sort(key=lambda s: s.priority_score, reverse=True)

    changed, unchanged = [], []
    for rank, s in enumerate(active_sites, start=1):
        if old_ranks.get(s.id) != rank:
            changed.append({"site_id": s.id, "old_rank": old_ranks.get(s.id), "new_rank": rank,
                            "reason": format_reasoning({**site_to_dict(s), "priority_score": s.priority_score})})
        else:
            unchanged.append(s.id)
    db.commit()
    return {"changed": changed, "unchanged": unchanged}
