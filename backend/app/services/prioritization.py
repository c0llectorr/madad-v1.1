from datetime import datetime, timezone


def priority_score(site: dict, now: datetime) -> float:
    score = site["estimated_population"] * 1.0
    urgency_weights = {"injury_reported": 50, "pregnancy": 40, "water_rising": 30,
                       "stranded_no_exit": 30, "elderly_present": 15, "children_present": 15}
    score += sum(urgency_weights.get(f, 0) for f in site["urgency_flags"])
    severity_weights = {"critical": 50, "high": 30, "medium": 10, "low": 0}
    score += severity_weights.get(site.get("severity"), 0)
    score += 10 if site["confidence"] == "corroborated" else 0
    last = site["last_report_time"]
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    hours_since_report = (now - last).total_seconds() / 3600
    score += hours_since_report * 5
    return score


def format_reasoning(site: dict) -> str:
    parts = [f"population {site['estimated_population']}"]
    if site["urgency_flags"]:
        parts.append(f"flags: {', '.join(site['urgency_flags'])}")
    if site.get("severity"):
        parts.append(f"severity: {site['severity']}")
    return f"Priority score {site['priority_score']:.0f}: " + ", ".join(parts)
