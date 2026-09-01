"""Routing tests over a tiny synthetic graph — no OSM download needed."""
import os
import networkx as nx
import pytest

import app.services.routing as routing


@pytest.fixture
def line_graph(monkeypatch):
    """A—B—C line plus a parallel A→C shortcut through D. Damaging B—C forces the detour."""
    G = nx.MultiDiGraph()
    for node, (x, y) in {"A": (0, 0), "B": (1, 0), "C": (2, 0), "D": (1.5, 1)}.items():
        G.add_node(node, x=x, y=y)
    edges = [
        ("A", "B", 100, 60),   # (u, v, length_m, travel_time_s)
        ("B", "C", 100, 60),
        ("A", "D", 300, 180),
        ("D", "C", 300, 180),
    ]
    for u, v, length, tt in edges:
        G.add_edge(u, v, length=length, travel_time=tt)
        G.add_edge(v, u, length=length, travel_time=tt)  # bidirectional
    monkeypatch.setattr(routing, "_graph", G)
    return G


def _patch_nearest(monkeypatch, mapping):
    import osmnx as ox
    monkeypatch.setattr(ox, "nearest_nodes", lambda G, x, y: mapping[(x, y)])
    monkeypatch.setattr(ox, "nearest_edges", lambda G, x, y: mapping["_edge"])


def test_route_normal_path(line_graph, monkeypatch):
    _patch_nearest(monkeypatch, {(0, 0): "A", (0, 2): "C", "_edge": ("A", "B", 0)})
    result = routing.compute_route((0, 0), (2, 0), set())
    assert result is not None
    assert result["travel_time_sec"] == 120  # direct via B
    assert result["distance_km"] == 0.2


def test_damaged_edge_forces_detour(line_graph, monkeypatch):
    _patch_nearest(monkeypatch, {(0, 0): "A", (0, 2): "C", "_edge": ("B", "C", 0)})
    damaged = {("B", "C"), ("C", "B")}
    result = routing.compute_route((0, 0), (2, 0), damaged)
    assert result is not None
    assert result["travel_time_sec"] == 360  # forced through D
    assert result["distance_km"] == 0.6


def test_damaged_only_path_raises_no_path(line_graph, monkeypatch):
    """Cut both paths → no route, rather than an expensive-but-usable path."""
    _patch_nearest(monkeypatch, {(0, 0): "A", (0, 2): "C", "_edge": ("A", "B", 0)})
    damaged = {("B", "C"), ("C", "B"), ("A", "D"), ("D", "A")}
    assert routing.compute_route((0, 0), (2, 0), damaged) is None


def test_geojson_shape(line_graph):
    coords = [[0.0, 0.0], [1.0, 0.0]]
    line_graph.nodes["A"]["x"], line_graph.nodes["A"]["y"] = 0.0, 0.0
    line_graph.nodes["B"]["x"], line_graph.nodes["B"]["y"] = 0.0, 1.0
    gj = routing.path_to_geojson(["A", "B"])
    assert gj["type"] == "LineString"
    assert gj["coordinates"] == [[0.0, 0.0], [0.0, 1.0]]  # [lng, lat] order
