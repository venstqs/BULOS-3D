"""
The real river. The twin's channel follows surveyed OpenStreetMap waterways rather than a line
traced from the 90 m elevation model, which can stray kilometres from the true river on flat
ground. Elevation and contributing area are still read from the DEM along that line.
Sites with no waterway file fall back to the DEM trace.
"""
from __future__ import annotations

import heapq
import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import config as C

DATA = Path(__file__).resolve().parent / "data"
CHANNEL_POINTS = 256
PIPE_OFFSET_M = 40.0                     # pipelines run along the bank, clear of the water


def _key(p):
    return round(p[0], 5), round(p[1], 5)


def _metres(a, b):
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((b[0] - a[0]) * 111_320 * k, (b[1] - a[1]) * 111_320)


@lru_cache(maxsize=1)
def waterways():
    path = DATA / f"rivers_{C.SITE_ID}.json"
    return json.loads(path.read_text(encoding="utf-8"))["ways"] if path.exists() else []


@lru_cache(maxsize=1)
def main_line():
    """Head-to-outlet polyline of (lon, lat) through the waterway network, or None."""
    ends = C.SITE.get("river")
    ways = waterways()
    if not ends or not ways:
        return None
    graph = {}
    for w in ways:
        for a, b in zip(w["coords"], w["coords"][1:]):
            ka, kb = _key(a), _key(b)
            d = _metres(a, b)
            graph.setdefault(ka, {})[kb] = d
            graph.setdefault(kb, {})[ka] = d
    nearest = lambda p: min(graph, key=lambda k: (k[0] - p[0]) ** 2 + (k[1] - p[1]) ** 2)
    head, outlet = nearest(ends["head"]), nearest(ends["outlet"])
    dist, prev, queue = {outlet: 0.0}, {}, [(0.0, outlet)]
    while queue:
        d, u = heapq.heappop(queue)
        if u == head:
            break
        if d > dist[u]:
            continue
        for v, length in graph[u].items():
            if d + length < dist.get(v, math.inf):
                dist[v], prev[v] = d + length, u
                heapq.heappush(queue, (d + length, v))
    if head not in dist:
        return None
    line = [head]
    while line[-1] != outlet:
        line.append(prev[line[-1]])
    return line


def _cell(T, lat, lon):
    r, c = T.rc(lat, lon)
    return min(max(r, 0), T.nrows - 1), min(max(c, 0), T.ncols - 1)


def main_profile(T):
    """Channel profile for the twin: chainage, elevation and contributing area along the river."""
    line = main_line()
    if line is None:
        return T.path_profile(T.trace(*T.rc(*C.MAIN_STEM_HEAD)))
    along = np.concatenate([[0.0], np.cumsum([_metres(a, b) for a, b in zip(line, line[1:])])])
    s = np.linspace(0.0, along[-1], CHANNEL_POINTS)
    lon = np.interp(s, along, [p[0] for p in line])
    lat = np.interp(s, along, [p[1] for p in line])
    z = np.empty(CHANNEL_POINTS)
    area = np.empty(CHANNEL_POINTS)
    for i in range(CHANNEL_POINTS):
        r, c = _cell(T, lat[i], lon[i])
        z[i] = T.filled[r, c]
        window = [(a, b) for a in range(r - 2, r + 3) for b in range(c - 2, c + 3) if T.inside(a, b)]
        area[i] = min(max(T.area_km2(a, b) for a, b in window), C.SITE["river"]["max_area_km2"])
    # Water runs downhill: remove DEM bumps from banks and buildings, then ease the steps
    z = np.minimum.accumulate(z)
    z = np.convolve(np.pad(z, 4, mode="edge"), np.ones(9) / 9, mode="valid")
    area = np.maximum.accumulate(area)
    return [dict(lat=round(float(lat[i]), 6), lon=round(float(lon[i]), 6), s=round(float(s[i]), 1),
                 z=round(float(z[i]), 1), area_km2=round(float(area[i]), 3)) for i in range(CHANNEL_POINTS)]


def catchment(T, ch):
    """Every cell that drains to the river: its watershed."""
    if main_line() is None:
        return T.catchment_mask(T.rc(float(ch.lat[-1]), float(ch.lon[-1])))
    mask = np.zeros(T.elev.shape, bool)
    for la, lo in zip(ch.lat, ch.lon):
        r, c = _cell(T, float(la), float(lo))
        mask[max(0, r - 1):r + 2, max(0, c - 1):c + 2] = True
    for idx in np.argsort(T.filled, axis=None):          # lowest first: parents resolve before children
        r, c = divmod(int(idx), T.ncols)
        nxt = T.downstream(r, c)
        if nxt and mask[nxt]:
            mask[r, c] = True
    return mask


def streams(T, mask, profile):
    """Tributaries as mapped, for drawing. Lines that are part of the main river are left out."""
    line = main_line()
    if line is None:
        return T.stream_network(mask=mask)
    on_main = set(line)
    out = []
    for w in waterways():
        pts = w["coords"]
        cells = [_cell(T, p[1], p[0]) for p in pts]
        if sum(mask[c] for c in cells) < 0.5 * len(cells) or sum(_key(p) in on_main for p in pts) > 0.6 * len(pts):
            continue
        area = max(T.area_km2(*c) for c in cells)
        out.append(dict(area_km2=round(min(max(area, 0.4), 30.0), 2), name=w.get("name"),
                        coords=[[p[0], p[1], round(float(T.elev[c]), 1)] for p, c in zip(pts, cells)]))
    return out


def pipe_along_river(T, profile, a, b, n=40):
    """A pipeline that follows the river corridor between two channel points, set back on the bank."""
    lo, hi = sorted((a, b))
    idx = np.linspace(lo, hi, n + 1).round().astype(int)
    pts = []
    for i in idx:
        p, q = profile[max(0, i - 3)], profile[min(len(profile) - 1, i + 3)]
        k = math.cos(math.radians(p["lat"]))
        ex, ny = (q["lon"] - p["lon"]) * 111_320 * k, (q["lat"] - p["lat"]) * 111_320
        length = math.hypot(ex, ny) or 1.0
        lon = profile[i]["lon"] + (-ny / length) * PIPE_OFFSET_M / (111_320 * k)
        lat = profile[i]["lat"] + (ex / length) * PIPE_OFFSET_M / 111_320
        r, c = _cell(T, lat, lon)
        pts.append((round(lon, 6), round(lat, 6), round(float(T.elev[r, c]), 1)))
    total = sum(_metres(p, q) for p, q in zip(pts, pts[1:])) * 1.10      # bends and fittings
    return pts, total
