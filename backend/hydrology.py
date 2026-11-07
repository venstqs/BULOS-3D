"""
DEM terrain analysis: everything the twin knows about the watershed comes
from the Copernicus DEM, not from hand-typed numbers.

  priority-flood depression filling   (Barnes, Lehman & Mulla 2014)
  D8 flow direction                    (O'Callaghan & Mark 1984)
  flow accumulation -> contributing area per cell
  stream network     = cells draining more than STREAM_AREA_KM2
  catchment          = every cell draining through a given outlet
  flow path          = D8 trace from any point down to the lake
"""
from __future__ import annotations

import heapq
import json
import math
from functools import cached_property
from pathlib import Path

import numpy as np

from .config import DEM_PATH

LAKE_ELEV_M = 2.5            # open water / low floodplain outlet (lake shore, Bicol River plain)
STREAM_AREA_KM2 = 0.35       # channel initiation threshold

# D8 neighbour offsets (dr, dc), index = direction code
D8 = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


class Terrain:
    def __init__(self, path: Path = DEM_PATH):
        d = json.loads(path.read_text())
        self.source = d["source"]
        self.north, self.west, self.step = d["north"], d["west"], d["step"]
        self.nrows, self.ncols = d["nrows"], d["ncols"]
        self.south = self.north - (self.nrows - 1) * self.step
        self.east = self.west + (self.ncols - 1) * self.step
        self.elev = np.array(d["elev"], dtype=np.float64).reshape(self.nrows, self.ncols)
        lat0 = math.radians((self.north + self.south) / 2)
        self.dy = self.step * 111_320.0
        self.dx = self.step * 111_320.0 * math.cos(lat0)
        self.cell_area = self.dx * self.dy
        self.lake = self._lake_mask()
        self.filled = self._fill()
        self.fdir = self._flow_direction()
        self.acc = self._accumulate()             # cells draining through each cell (incl. itself)

    # ------------------------------------------------------------ geometry
    def rc(self, lat, lon):
        return (int(round((self.north - lat) / self.step)),
                int(round((lon - self.west) / self.step)))

    def latlon(self, r, c):
        return self.north - r * self.step, self.west + c * self.step

    def inside(self, r, c):
        return 0 <= r < self.nrows and 0 <= c < self.ncols

    def step_len(self, d):
        dr, dc = D8[d]
        return math.hypot(dr * self.dy, dc * self.dx)

    def area_km2(self, r, c):
        return self.acc[r, c] * self.cell_area / 1e6

    # ---------------------------------------------------------- algorithms
    def _lake_mask(self):
        """Low, flat cells connected to the map edge = lake / floodplain outlet."""
        low = self.elev <= LAKE_ELEV_M
        mask = np.zeros_like(low)
        stack = [(r, c) for r in range(self.nrows) for c in (0, self.ncols - 1) if low[r, c]]
        stack += [(r, c) for c in range(self.ncols) for r in (0, self.nrows - 1) if low[r, c]]
        while stack:
            r, c = stack.pop()
            if mask[r, c]:
                continue
            mask[r, c] = True
            for dr, dc in D8[::2]:
                rr, cc = r + dr, c + dc
                if self.inside(rr, cc) and low[rr, cc] and not mask[rr, cc]:
                    stack.append((rr, cc))
        return mask

    def _fill(self):
        """Priority-flood: raise pits so every cell drains to the edge or the lake."""
        z = self.elev.copy()
        done = np.zeros(z.shape, bool)
        pq = []
        for r in range(self.nrows):
            for c in range(self.ncols):
                if self.lake[r, c] or r in (0, self.nrows - 1) or c in (0, self.ncols - 1):
                    heapq.heappush(pq, (z[r, c], r, c))
                    done[r, c] = True
        eps = 1e-3
        while pq:
            h, r, c = heapq.heappop(pq)
            for dr, dc in D8:
                rr, cc = r + dr, c + dc
                if self.inside(rr, cc) and not done[rr, cc]:
                    done[rr, cc] = True
                    z[rr, cc] = max(z[rr, cc], h + eps)
                    heapq.heappush(pq, (z[rr, cc], rr, cc))
        return z

    def _flow_direction(self):
        fdir = np.full(self.elev.shape, -1, dtype=np.int8)
        for r in range(self.nrows):
            for c in range(self.ncols):
                if self.lake[r, c]:
                    continue
                best, bd = 0.0, -1
                for d, (dr, dc) in enumerate(D8):
                    rr, cc = r + dr, c + dc
                    if not self.inside(rr, cc):
                        continue
                    drop = (self.filled[r, c] - self.filled[rr, cc]) / self.step_len(d)
                    if drop > best:
                        best, bd = drop, d
                fdir[r, c] = bd
        return fdir

    def downstream(self, r, c):
        d = self.fdir[r, c]
        if d < 0:
            return None
        rr, cc = r + D8[d][0], c + D8[d][1]
        return (rr, cc) if self.inside(rr, cc) else None

    def _accumulate(self):
        acc = np.ones(self.elev.shape, dtype=np.int64)
        order = np.argsort(-self.filled, axis=None)     # highest first
        for idx in order:
            r, c = divmod(int(idx), self.ncols)
            nxt = self.downstream(r, c)
            if nxt:
                acc[nxt] += acc[r, c]
        return acc

    # ------------------------------------------------------------ products
    def trace(self, r, c, stop_at=None):
        """D8 flow path from (r, c) to the lake / map edge (or to stop_at)."""
        path = [(r, c)]
        while True:
            if stop_at and (r, c) == stop_at:
                break
            nxt = self.downstream(r, c)
            if nxt is None or self.lake[nxt]:
                break
            r, c = nxt
            path.append(nxt)
        return path

    def path_profile(self, path):
        """Chainage (m), DEM elevation and contributing area along a path."""
        out, dist = [], 0.0
        for k, (r, c) in enumerate(path):
            if k:
                pr, pc = path[k - 1]
                dist += math.hypot((r - pr) * self.dy, (c - pc) * self.dx)
            lat, lon = self.latlon(r, c)
            out.append(dict(lat=round(lat, 6), lon=round(lon, 6), s=round(dist, 1),
                            z=round(float(self.elev[r, c]), 1),
                            area_km2=round(self.area_km2(r, c), 3)))
        return out

    def snap_to_stream(self, lat, lon, radius=3):
        """Move a point onto the highest-accumulation cell nearby."""
        r0, c0 = self.rc(lat, lon)
        best = (r0, c0)
        for r in range(r0 - radius, r0 + radius + 1):
            for c in range(c0 - radius, c0 + radius + 1):
                if self.inside(r, c) and not self.lake[r, c] and self.acc[r, c] > self.acc[best]:
                    best = (r, c)
        return best

    def catchment_mask(self, outlet):
        """All cells whose D8 path passes through the outlet."""
        mask = np.zeros(self.elev.shape, bool)
        mask[outlet] = True
        order = np.argsort(self.filled, axis=None)       # lowest first: parents resolved before children
        for idx in order:
            r, c = divmod(int(idx), self.ncols)
            nxt = self.downstream(r, c)
            if nxt and mask[nxt]:
                mask[r, c] = True
        return mask

    def boundary_ring(self, mask):
        """Outline of a raster mask as a closed lon/lat ring (marching squares on cell corners)."""
        edges = {}
        h = self.step / 2
        for r in range(self.nrows):
            for c in range(self.ncols):
                if not mask[r, c]:
                    continue
                lat, lon = self.latlon(r, c)
                corners = [(lon - h, lat + h), (lon + h, lat + h), (lon + h, lat - h), (lon - h, lat - h)]
                for k, (dr, dc) in enumerate([(-1, 0), (0, 1), (1, 0), (0, -1)]):
                    rr, cc = r + dr, c + dc
                    if not (self.inside(rr, cc) and mask[rr, cc]):
                        a, b = corners[k], corners[(k + 1) % 4]
                        edges[_key(a)] = b
        if not edges:
            return []
        start = next(iter(edges))
        ring, cur = [start], edges[start]
        total = len(edges)                               # fixed here: edges shrinks as the walk uses them
        while _key(cur) != start and len(ring) <= total:
            ring.append(_key(cur))
            cur = edges.pop(_key(cur), None)
            if cur is None:
                break
        ring.append(start)
        return [list(p) for p in _simplify_collinear(ring)]

    def stream_network(self, min_area_km2=STREAM_AREA_KM2, mask=None):
        """Stream reaches as polylines, split at confluences, with Strahler-like order."""
        thr = min_area_km2 * 1e6 / self.cell_area
        is_stream = (self.acc >= thr) & ~self.lake
        if mask is not None:
            is_stream &= mask
        inflow = np.zeros(self.elev.shape, dtype=np.int16)
        for r, c in zip(*np.nonzero(is_stream)):
            nxt = self.downstream(r, c)
            if nxt and is_stream[nxt]:
                inflow[nxt] += 1
        heads = [(r, c) for r, c in zip(*np.nonzero(is_stream)) if inflow[r, c] != 1]
        reaches = []
        for r, c in heads:
            line = [(r, c)]
            while True:
                nxt = self.downstream(*line[-1])
                if nxt is None:
                    break
                line.append(nxt)
                if self.lake[nxt] or not is_stream[nxt] or inflow[nxt] != 1:
                    break
            if len(line) < 2:
                continue
            area = self.area_km2(*line[-2])
            reaches.append(dict(
                area_km2=round(area, 2),
                coords=[[round(self.latlon(*p)[1], 6), round(self.latlon(*p)[0], 6),
                         round(float(self.elev[p]), 1)] for p in line],
            ))
        return reaches

    @cached_property
    def slope_deg(self):
        gy, gx = np.gradient(self.elev, self.dy, self.dx)
        return np.degrees(np.arctan(np.hypot(gx, gy)))


def _key(p):
    return (round(p[0], 7), round(p[1], 7))


def _simplify_collinear(ring):
    out = [ring[0]]
    for i in range(1, len(ring) - 1):
        a, b, c = out[-1], ring[i], ring[i + 1]
        if (b[0] - a[0]) * (c[1] - a[1]) != (b[1] - a[1]) * (c[0] - a[0]):
            out.append(b)
    out.append(ring[-1])
    return out
