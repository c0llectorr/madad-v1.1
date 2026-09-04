import httpx
from urllib.parse import quote

# Geocoding API v4 — the only geocode service usable with a no-billing demo key.
GEOCODE_V4_URL = "https://geocode.googleapis.com/v4/geocode/address/"


async def geocode_location_name(location_name: str, api_key: str) -> dict | None:
    if not api_key:
        return None
    # Reports come from Pakistan - bias the query so ambiguous names
    # (e.g. "Shahdra") resolve inside Pakistan, not abroad.
    query = location_name.strip()
    if "pakistan" not in query.lower():
        query = query + ", Pakistan"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            GEOCODE_V4_URL + quote(query),
            headers={"X-Goog-Api-Key": api_key},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
    candidates = data.get("results") or []
    # Accept only results resolved inside Pakistan. Google may match a
    # same-named place abroad (Shahdara, Delhi) and may return the address in
    # Urdu script, so check coordinates against Pakistan's bounding box
    # (language-independent) in addition to the address text.
    def in_pakistan(c: dict) -> bool:
        loc = c.get("location") or {}
        la, ln = loc.get("latitude"), loc.get("longitude")
        if la is None or ln is None:
            return False
        if 23.5 <= la <= 37.5 and 60.0 <= ln <= 78.5:
            return True
        return "pakistan" in (c.get("formattedAddress") or "").lower() or "پاکستان" in (c.get("formattedAddress") or "")

    candidates = [c for c in candidates if in_pakistan(c)]
    if not candidates:
        return None
    top = candidates[0]
    loc = top.get("location") or {}
    if "latitude" not in loc or "longitude" not in loc:
        return None
    return {"lat": loc["latitude"],
            "lng": loc["longitude"],
            "display_name": top.get("formattedAddress")}
