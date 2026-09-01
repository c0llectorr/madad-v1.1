"""Fetch the demo corridor road graph once, ahead of time.

Covers the Dera Ghazi Khan -> Rajanpur corridor (MADAD_DATABASE.md Section 4).
Requires internet + osmnx. Run from backend/:
    python scripts/fetch_graph.py
"""
from pathlib import Path

import networkx as nx
import osmnx as ox

OUT = Path(__file__).resolve().parent.parent / "database" / "geodata" / "demo_corridor.graphml"

# (north, south, east, west) — osmnx 1.9.x argument order.
# DG Khan in the north (~30.05), Rajanpur in the south (~29.10).
# Smaller overlapping segments compose into the full corridor — big single
# queries are what Overpass instances choke on.
SEGMENTS = [
    (30.25, 29.85, 70.85, 70.05),   # DG Khan
    (29.95, 29.65, 70.70, 70.05),   # mid corridor
    (29.75, 29.45, 70.60, 70.05),   # lower corridor
    (29.55, 28.95, 70.55, 70.00),   # Rajanpur
]

ENDPOINTS = [
    "https://overpass-api.de/api",
    "https://overpass.kumi.systems/api",
    "https://maps.mail.ru/osm/tools/overpass/api",
    "https://overpass.private.coffee/api",
    "https://overpass.osm.jp/api",
]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    G_total = None
    for seg in SEGMENTS:
        G_seg = None
        last_err: Exception | None = None
        for attempt in range(4):
            for endpoint in ENDPOINTS:
                ox.settings.overpass_endpoint = endpoint
                try:
                    print(f"Segment {seg} via {endpoint} (attempt {attempt + 1}) …", flush=True)
                    G = ox.graph_from_bbox(*seg, network_type="drive")
                    if G_seg is None:
                        G_seg = G
                    else:
                        G_seg = nx.compose(G_seg, G)
                    break
                except Exception as e:  # noqa: BLE001 — try the next mirror
                    print(f"  failed: {e}", flush=True)
                    last_err = e
                    import time
                    time.sleep(20)
            if G_seg is not None:
                break
        if G_seg is None:
            raise SystemExit(f"All Overpass endpoints failed for segment {seg}: {last_err}")
        G_total = G_seg if G_total is None else nx.compose(G_total, G_seg)

    G_total = ox.add_edge_speeds(G_total)
    G_total = ox.add_edge_travel_times(G_total)
    ox.save_graphml(G_total, OUT)
    print(f"Saved graph ({len(G_total.nodes)} nodes, {len(G_total.edges)} edges) to {OUT}")


if __name__ == "__main__":
    main()
