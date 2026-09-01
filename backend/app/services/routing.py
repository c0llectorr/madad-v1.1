"""Damage-aware routing over a single, module-level OSMnx graph.

The graph loads exactly once at process startup and is never copied or
re-fetched. Damaged edges are excluded structurally (weight function returns
None), so a damaged-only path raises NetworkXNoPath instead of silently
routing through it.
"""
import networkx as nx
import osmnx as ox

from app.core.config import settings

_graph: nx.MultiDiGraph | None = None


def load_graph_on_startup() -> None:
    global _graph
    try:
        G = ox.load_graphml(settings.GRAPH_PATH)
    except FileNotFoundError:
        raise RuntimeError(
            f"FATAL: {settings.GRAPH_PATH} not found. This must be pre-fetched and committed to the "
            f"repo before startup — see MADAD_DATABASE.md Section 4 (scripts/fetch_graph.py). "
            f"Refusing to start."
        )
    G = ox.add_edge_speeds(G, fallback=40)  # real OSM data has edges without maxspeed
    G = ox.add_edge_travel_times(G)
    _graph = G


def get_graph() -> nx.MultiDiGraph:
    if _graph is None:
        raise RuntimeError("Graph not loaded — load_graph_on_startup() must run before any request is served.")
    return _graph


def get_damaged_edge_pairs(damage_rows) -> set[tuple[int, int]]:
    """Build the exclusion set from cached edge_u/edge_v columns — no re-snapping."""
    pairs: set[tuple[int, int]] = set()
    for row in damage_rows:
        if not row.active:
            continue
        pairs.add((row.edge_u, row.edge_v))
        pairs.add((row.edge_v, row.edge_u))  # bidirectional — a damaged bridge blocks both directions
    return pairs


def compute_route(origin: tuple[float, float], dest: tuple[float, float],
                  damaged_edge_pairs: set[tuple[int, int]]) -> dict | None:
    G = get_graph()
    orig_node = ox.nearest_nodes(G, origin[1], origin[0])
    dest_node = ox.nearest_nodes(G, dest[1], dest[0])

    def weight_func(u, v, edge_data):
        if (u, v) in damaged_edge_pairs:
            return None  # structurally excluded, not just expensive
        return edge_data.get("travel_time", 1)

    try:
        path_nodes = nx.shortest_path(G, orig_node, dest_node, weight=weight_func)
    except nx.NetworkXNoPath:
        return None

    travel_time_sec = sum(G[u][v][0].get("travel_time", 1) for u, v in zip(path_nodes, path_nodes[1:]))
    distance_m = sum(G[u][v][0].get("length", 0) for u, v in zip(path_nodes, path_nodes[1:]))
    return {"path_nodes": path_nodes, "travel_time_sec": travel_time_sec, "distance_km": distance_m / 1000}


def path_to_geojson(path_nodes: list[int]) -> dict:
    G = get_graph()
    coords = [[G.nodes[n]["x"], G.nodes[n]["y"]] for n in path_nodes]
    return {"type": "LineString", "coordinates": coords}


def snap_to_edge(lat: float, lng: float) -> tuple[int, int, int]:
    """Snap a coordinate to the nearest graph edge — used once, at damage-report time."""
    G = get_graph()
    u, v, key = ox.nearest_edges(G, lng, lat)  # (x=lng, y=lat) order
    return u, v, key
