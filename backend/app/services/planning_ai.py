"""AI-assisted resource planning — same provider family as report extraction.

The model proposes quantities for each needed resource based on the site's
population, severity, urgency flags, and the depot's available stock. Output
is a strict JSON tool-call; anything it cannot provide falls back to the
deterministic heuristic so planning never blocks a dispatch.
"""
import json

import httpx

from app.core.config import settings

PLAN_TOOL = {
    "type": "function",
    "function": {
        "name": "generate_relief_plan",
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "resource_type": {"type": "string"},
                            "quantity": {"type": "integer"},
                        },
                        "required": ["resource_type", "quantity"],
                    },
                },
                "reasoning": {"type": "string"},
            },
            "required": ["items", "reasoning"],
        },
    },
}

PLAN_PROMPT = (
    "You are a flood-relief logistics planner. Given an affected site and the "
    "stock table of the nearest depot, propose resource quantities. Rules: "
    "quantity must not exceed stock; scale with population and severity "
    "(critical/high => more); food and water in kg/liters roughly equal to "
    "population for 3 days unless stock limits it; include other resources only "
    "if the site needs them or flags justify it (e.g. boats when stranded)."
)


async def ai_generate_plan(site: dict, stock: dict) -> dict | None:
    """Returns {items: [{resource_type, quantity}], reasoning} or None on failure."""
    key = settings.GROQ_API_KEY
    if not key:
        return None
    stock_text = "\n".join(f"- {k}: {v}" for k, v in stock.items()) or "- (depot empty)"
    content = (
        f"{PLAN_PROMPT}\n\nAFFECTED SITE\n- location: {site['location_name']}\n"
        f"- population: {site['estimated_population']}\n- severity: {site.get('severity') or 'unknown'}\n"
        f"- needs: {', '.join(site.get('needs') or []) or 'unspecified'}\n"
        f"- urgency flags: {', '.join(site.get('urgency_flags') or []) or 'none'}\n\n"
        f"DEPOT STOCK\n{stock_text}"
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": [{"role": "user", "content": content}],
                    "tools": [PLAN_TOOL],
                    "tool_choice": {"type": "function",
                                    "function": {"name": "generate_relief_plan"}},
                },
            )
            resp.raise_for_status()
            tool_call = resp.json()["choices"][0]["message"]["tool_calls"][0]
            out = json.loads(tool_call["function"]["arguments"])
            return {"items": out.get("items", []), "reasoning": out.get("reasoning", "")}
    except Exception:
        return None


def heuristic_plan(site: dict, stock: dict) -> dict:
    """Deterministic fallback: scale core resources to population, cap at stock."""
    pop = site.get("estimated_population") or 0
    severity = (site.get("severity") or "medium").lower()
    mult = {"critical": 1.5, "high": 1.2, "medium": 1.0, "low": 0.7}.get(severity, 1.0)
    needs = set(site.get("needs") or [])
    flags = set(site.get("urgency_flags") or [])

    def qty(rtype: str, base: int) -> int:
        want = int(base * mult)
        return max(0, min(want, stock.get(rtype, 0)))

    items = []
    if "food" in needs or "food" in stock:
        items.append({"resource_type": "food", "quantity": qty("food", pop * 3)})
    if "water" in needs or "water" in stock:
        items.append({"resource_type": "water", "quantity": qty("water", pop * 3)})
    if "medicine" in needs or "medicine" in stock:
        items.append({"resource_type": "medicine", "quantity": qty("medicine", pop // 2)})
    if "shelter" in needs:
        items.append({"resource_type": "clothes", "quantity": qty("clothes", pop)})
    if "stranded_no_exit" in flags or "general_evacuation" in needs:
        items.append({"resource_type": "boats", "quantity": qty("boats", max(1, pop // 50))})
    items = [i for i in items if i["quantity"] > 0]
    reasoning = (f"Heuristic: population {pop}, severity {severity}; quantities "
                 f"capped by depot stock.")
    return {"items": items, "reasoning": reasoning}
