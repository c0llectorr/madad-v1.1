import networkx as nx
from fastapi import APIRouter, Depends, HTTPException
from shapely.geometry import mapping
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import DamagedRoad, Depot, Site
from app.schemas import DamageReport
from app.services.routing import (get_graph, get_damaged_edge_pairs, compute_route,
                                  path_to_geojson, direct_fallback)

router = APIRouter(prefix="/api", tags=["roads"])


@router.post("/roads/damage", status_code=201)
async def report_damage(payload: DamageReport, db: Session = Depends(get_db),
                        user: dict = Depends(require_role("coordinator", "driver"))):
    """Flag a road segment as damaged. Accepts two points (start + end of the
    damaged section). The backend snaps both to the road graph, finds the
    shortest path between them, and marks every edge on that path as damaged.
    Each edge gets its own DamagedRoad row so the routing exclusion works
    automatically."""
    from app.models import Driver

    # Drivers have no center of their own — derive it from their depot
    if user["role"] == "driver":
        driver = db.query(Driver).filter(Driver.user_id == user["user_id"]).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver profile not found")
        depot = db.query(Depot).get(driver.depot_id)
        payload.center_id = depot.center_id

    G = get_graph()

    # Resolve center for the damage records
    center_id = payload.center_id

    # Determine the damaged edges
    if payload.end_lat is not None and payload.end_lng is not None:
        # Two-point damage: snap both, find path between them, mark all edges
        import osmnx as ox
        start_node = ox.nearest_nodes(G, payload.start_lng, payload.start_lat)
        end_node = ox.nearest_nodes(G, payload.end_lng, payload.end_lat)
        try:
            path = nx.shortest_path(G, start_node, end_node, weight="travel_time")
        except nx.NetworkXNoPath:
            # Same node or disconnected — just mark the start edge
            path = [start_node]

        damaged_rows = []
        all_coords = []

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_data = G.get_edge_data(u, v)
            if not edge_data:
                continue
            edge_key = list(edge_data.keys())[0]
            ed = edge_data[edge_key]
            geom = ed.get("geometry")

            if geom is not None:
                from shapely.geometry import mapping
                seg_geojson = mapping(geom)
                coords = [[x, y] for x, y in geom.coords]
            else:
                seg_geojson = {"type": "LineString",
                               "coordinates": [[G.nodes[u]["x"], G.nodes[u]["y"]],
                                               [G.nodes[v]["x"], G.nodes[v]["y"]]]}
                coords = seg_geojson["coordinates"]

            if i == 0:
                all_coords.extend(coords)
            else:
                all_coords.extend(coords[1:])  # skip duplicate junction point

            damage = DamagedRoad(center_id=center_id, reported_by=user["user_id"],
                                 lat=payload.start_lat, lng=payload.start_lng,
                                 edge_u=u, edge_v=v,
                                 edge_geometry=seg_geojson,
                                 reason=payload.reason, active=True)
            db.add(damage)
            damaged_rows.append(damage)

        if not damaged_rows:
            # Degenerate: both points on the same edge
            edge_u, edge_v, _ = _nearest_edges(G, payload.start_lng, payload.start_lat)
            edge_data = G.get_edge_data(edge_u, edge_v, 0) or {}
            geom = edge_data.get("geometry")
            if geom is not None:
                edge_geojson = mapping(geom)
            else:
                edge_geojson = {"type": "LineString",
                                "coordinates": [[G.nodes[edge_u]["x"], G.nodes[edge_u]["y"]],
                                                [G.nodes[edge_v]["x"], G.nodes[edge_v]["y"]]]}
            all_coords = edge_geojson["coordinates"]
            damage = DamagedRoad(center_id=center_id, reported_by=user["user_id"],
                                 lat=payload.start_lat, lng=payload.start_lng,
                                 edge_u=edge_u, edge_v=edge_v,
                                 edge_geometry=edge_geojson,
                                 reason=payload.reason, active=True)
            db.add(damage)
            damaged_rows.append(damage)

        db.commit()
        combined = {"type": "LineString", "coordinates": all_coords}
        return {"id": damaged_rows[0].id, "active": True, "edge_geometry": combined,
                "edges_damaged": len(damaged_rows)}

    else:
        # Legacy single-point damage (backward compatibility)
        edge_u, edge_v, edge_key = _nearest_edges(G, payload.lng, payload.lat)
        edge_data = G.get_edge_data(edge_u, edge_v, edge_key)
        edge_geometry = edge_data.get("geometry")
        if edge_geometry is not None:
            edge_geojson = mapping(edge_geometry)
        else:
            edge_geojson = {"type": "LineString",
                            "coordinates": [[G.nodes[edge_u]["x"], G.nodes[edge_u]["y"]],
                                            [G.nodes[edge_v]["x"], G.nodes[edge_v]["y"]]]}

        damage = DamagedRoad(center_id=center_id, reported_by=user["user_id"],
                             lat=payload.lat, lng=payload.lng, edge_u=edge_u, edge_v=edge_v,
                             edge_geometry=edge_geojson, reason=payload.reason, active=True)
        db.add(damage)
        db.commit()
        return {"id": damage.id, "active": True, "edge_geometry": edge_geojson}


def _nearest_edges(G, x, y):
    import osmnx as ox
    return ox.nearest_edges(G, x, y)


@router.get("/roads/damaged")
def list_damaged(center_id: int | None = None, db: Session = Depends(get_db),
                 user: dict = Depends(require_role("coordinator", "driver", "administrator"))):
    q = db.query(DamagedRoad).filter(DamagedRoad.active == True)  # noqa: E712
    if center_id:
        q = q.filter(DamagedRoad.center_id == center_id)
    rows = q.all()
    # Deduplicate by edge pair — multiple rows per edge from multi-edge damage
    seen = set()
    out = []
    for r in rows:
        key = (r.edge_u, r.edge_v)
        if key in seen:
            continue
        seen.add(key)
        out.append({"id": r.id, "center_id": r.center_id, "lat": r.lat, "lng": r.lng,
                    "reason": r.reason, "edge_geometry": r.edge_geometry,
                    "reported_at": r.reported_at})
    return out


@router.post("/roads/damage/{damage_id}/reopen")
def reopen_road(damage_id: int, db: Session = Depends(get_db),
                user: dict = Depends(require_role("coordinator"))):
    """Reopen a previously flagged road — the edge re-enters the routing graph.
    Reopens ALL damage rows that share the same edge pair."""
    from app.models import DamagedRoad
    damage = db.query(DamagedRoad).get(damage_id)
    if not damage:
        raise HTTPException(status_code=404, detail="Damage report not found")
    if not damage.active:
        raise HTTPException(status_code=409, detail="Road already reopened")
    # Reopen all rows sharing the same edge pair
    db.query(DamagedRoad).filter(
        DamagedRoad.edge_u == damage.edge_u,
        DamagedRoad.edge_v == damage.edge_v).update({"active": False}, synchronize_session=False)
    db.commit()
    return {"id": damage.id, "active": False}


@router.get("/routes")
async def get_route(from_depot_id: int, to_site_id: int, db: Session = Depends(get_db),
                    user: dict = Depends(require_role("coordinator", "driver"))):
    depot = db.query(Depot).get(from_depot_id)
    site = db.query(Site).get(to_site_id)
    if not depot or not site:
        raise HTTPException(status_code=404, detail="Depot or site not found")
    if site.lat == 0.0 and site.lng == 0.0:
        raise HTTPException(status_code=422, detail="Site has no coordinates yet — confirm its report first")

    damage_rows = db.query(DamagedRoad).filter(
        DamagedRoad.center_id == user["center_id"], DamagedRoad.active == True).all()
    damaged_edge_pairs = get_damaged_edge_pairs(damage_rows)

    result_with_damage = compute_route((depot.lat, depot.lng), (site.lat, site.lng), damaged_edge_pairs)
    if result_with_damage is None:
        result_with_damage = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

    result_direct = compute_route((depot.lat, depot.lng), (site.lat, site.lng), set())
    if result_direct is None:
        result_direct = direct_fallback((depot.lat, depot.lng), (site.lat, site.lng))

    return {
        "distance_km": result_with_damage["distance_km"],
        "eta_minutes": round(result_with_damage["travel_time_sec"] / 60),
        "geojson": result_with_damage.get("geojson") or path_to_geojson(result_with_damage["path_nodes"]),
        "avoided_damage": len(damaged_edge_pairs) > 0,
        "delta_minutes_vs_direct": round((result_with_damage["travel_time_sec"]
                                          - result_direct["travel_time_sec"]) / 60),
    }
