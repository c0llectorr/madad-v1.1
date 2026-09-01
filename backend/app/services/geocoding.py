import httpx
from urllib.parse import quote

# Geocoding API v4 — the only geocode service usable with a no-billing demo key.
GEOCODE_V4_URL = "https://geocode.googleapis.com/v4/geocode/address/"


async def geocode_location_name(location_name: str, api_key: str) -> dict | None:
    if not api_key:
        return None
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            GEOCODE_V4_URL + quote(location_name),
            headers={"X-Goog-Api-Key": api_key},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
    candidates = data.get("results") or []
    if not candidates:
        return None
    top = candidates[0]
    loc = top.get("location") or {}
    if "latitude" not in loc or "longitude" not in loc:
        return None
    return {"lat": loc["latitude"],
            "lng": loc["longitude"],
            "display_name": top.get("formattedAddress")}
