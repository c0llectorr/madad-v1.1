"""Smoke tests for the prioritization + replanning logic (no DB or graph needed)."""
from datetime import datetime, timedelta

from app.services.prioritization import priority_score, format_reasoning


def test_priority_score_weights():
    now = datetime(2026, 1, 1, 12, 0, 0)
    site = {
        "estimated_population": 100,
        "urgency_flags": ["injury_reported"],
        "severity": "high",
        "confidence": "corroborated",
        "last_report_time": now,
    }
    # 100 population + 50 injury + 30 high severity + 10 corroborated = 190
    assert priority_score(site, now) == 190.0


def test_priority_score_age_bump():
    now = datetime(2026, 1, 1, 12, 0, 0)
    site = {"estimated_population": 0, "urgency_flags": [], "severity": None,
            "confidence": "single_unverified", "last_report_time": now - timedelta(hours=2)}
    assert priority_score(site, now) == 10.0  # 2 hours * 5


def test_format_reasoning():
    site = {"estimated_population": 250, "urgency_flags": ["water_rising"],
            "severity": "critical", "priority_score": 330.0}
    text = format_reasoning(site)
    assert "250" in text and "water_rising" in text and "critical" in text
