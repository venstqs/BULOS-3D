"""
Build the whole-region terrain grid for Bicol, for the Bicol runoff risk layer.

    python -m backend.tools.fetch_bicol       # writes backend/data/bicol.npz and bicol.json

Sources, all open:
  Region V boundary: geoBoundaries gbOpen PHL ADM1 (NAMRIA, PSA, OCHA), CC BY 3.0 IGO
  Elevation:         Copernicus GLO-90 DEM (ESA / Airbus), public tiles on AWS Open Data

It works out the Topographic Wetness Index, ln(a / tan b): how much land drains through each
cell, against how steep the cell is. High values are the places where water collects.
Dev-time only: needs Pillow, shapely, rasterio and numpy. The output is committed.
"""
from __future__ import annotations

import heapq
import io
import json
import math
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.transform import from_origin
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

DATA = Path(__file__).resolve().parents[1] / "data"
CACHE = Path(tempfile.gettempdir()) / "bulos_dem_tiles"
BOUNDS_API = "https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM1/"
AGENT = {"User-Agent": "Bulos3D-student-project"}
DEM = 1.0 / 1200          # 3 arc-seconds
WORK = 3                  # model the water at 3 DEM cells (about 280 m)
OUT = 2                   # publish at 2 model cells (about 550 m)


def fetch(url, timeout=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=timeout) as r:
        return r.read()


def region_shape():
    meta = json.loads(fetch(BOUNDS_API, 40))
    data = json.loads(fetch(meta["simplifiedGeometryGeoJSON"]))
    names = [f["properties"].get("shapeName", "") for f in data["features"]]
    hit = [f for f in data["features"] if re.search(r"bicol|region v\b", f["properties"].get("shapeName", ""), re.I)]
    if len(hit) != 1:
        raise SystemExit(f"Could not pick Region V from: {names}")
    print("boundary:", hit[0]["properties"]["shapeName"], "from", meta["boundarySource"], "licence", meta["boundaryLicense"])
    return shape(hit[0]["geometry"]).buffer(0), meta


def tile(lat0, lon0):
    name = f"Copernicus_DSM_COG_30_N{lat0:02d}_00_E{lon0:03d}_00_DEM"
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{name}.tif"
    if not path.exists():
        try:
            path.write_bytes(fetch(f"https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif", 180))
            print("downloaded", name)
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                print("no tile (open sea)", name)
                return None
            raise
    return np.array(Image.open(io.BytesIO(path.read_bytes())), dtype=np.float32)


def mosaic(north, south, west, east):
    rows, cols = round((north - south) / DEM), round((east - west) / DEM)
    z = np.zeros((rows, cols), np.float32)
    for lat0 in range(math.floor(south), math.ceil(north)):
        for lon0 in range(math.floor(west), math.ceil(east)):
            t = tile(lat0, lon0)
            if t is None:
                continue
            if t.shape != (1200, 1200):
                t = np.array(Image.fromarray(t).resize((1200, 1200), Image.BILINEAR))
            r0, c0 = round((north - (lat0 + 1)) / DEM), round((lon0 - west) / DEM)
            a0, b0 = max(0, -r0), max(0, -c0)
            a1, b1 = min(1200, rows - r0), min(1200, cols - c0)
            if a1 > a0 and b1 > b0:
                z[r0 + a0:r0 + a1, c0 + b0:c0 + b1] = t[a0:a1, b0:b1]
    return z


def block(a, k, how=np.mean):
    h, w = a.shape[0] // k * k, a.shape[1] // k * k
    return how(a[:h, :w].reshape(h // k, k, w // k, k), axis=(1, 3))


def priority_flood(z, sea):
    """Fills pits so every land cell drains to the sea."""
    rows, cols = z.shape
    filled = z.astype(np.float64).copy()
    done = sea.copy()
    done[0, :] = done[-1, :] = True
    done[:, 0] = done[:, -1] = True
    edge = done & ~np.pad(np.ones((rows - 2, cols - 2), bool), 1) | sea
    near = edge.copy()
    near[1:, :] |= edge[:-1, :]
    near[:-1, :] |= edge[1:, :]
    near[:, 1:] |= edge[:, :-1]
    near[:, :-1] |= edge[:, 1:]
    heap = [(float(filled[r, c]), int(r), int(c)) for r, c in zip(*np.nonzero(done & near))]
    heapq.heapify(heap)
    while heap:
        h, r, c = heapq.heappop(heap)
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                y, x = r + dr, c + dc
                if 0 <= y < rows and 0 <= x < cols and not done[y, x]:
                    done[y, x] = True
                    filled[y, x] = max(filled[y, x], h + 1e-3)
                    heapq.heappush(heap, (filled[y, x], y, x))
    return filled


def accumulate(filled, sea, dx, dy):
    """Steepest-descent flow, then how many cells drain through each cell."""
    rows, cols = filled.shape
    best = np.zeros((rows, cols))
    target = np.arange(rows * cols).reshape(rows, cols)
    ids = target.copy()
    diag = math.hypot(dx, dy)
    for dr, dc, dist in ((-1, 0, dy), (1, 0, dy), (0, -1, dx), (0, 1, dx), (-1, -1, diag), (-1, 1, diag), (1, -1, diag), (1, 1, diag)):
        ys = slice(max(0, -dr), rows - max(0, dr))
        xs = slice(max(0, -dc), cols - max(0, dc))
        yn = slice(max(0, dr), rows - max(0, -dr))
        xn = slice(max(0, dc), cols - max(0, -dc))
        drop = (filled[ys, xs] - filled[yn, xn]) / dist
        win = drop > best[ys, xs]
        best[ys, xs][win] = drop[win]
        target[ys, xs][win] = ids[yn, xn][win]
    flat = target.ravel().tolist()
    acc = np.ones(rows * cols, np.float64)
    acc[sea.ravel()] = 0
    a = acc.tolist()
    for i in np.argsort(-filled.ravel(), kind="stable").tolist():
        j = flat[i]
        if j != i:
            a[j] += a[i]
    return np.array(a).reshape(rows, cols)


def main():
    region, meta = region_shape()
    west, south, east, north = region.bounds
    west, south = math.floor(west * 20) / 20 - 0.05, math.floor(south * 20) / 20 - 0.05
    east, north = math.ceil(east * 20) / 20 + 0.05, math.ceil(north * 20) / 20 + 0.05
    print(f"area N{north} S{south} W{west} E{east}")

    z = mosaic(north, south, west, east)
    work = block(z, WORK)
    sea = work <= 0.5
    step = DEM * WORK
    mid = math.radians((north + south) / 2)
    dy, dx = step * 111_320, step * 111_320 * math.cos(mid)
    print("cells", work.shape, "land share", round(float((~sea).mean()), 3))

    filled = priority_flood(work, sea)
    print("pits filled")
    acc = accumulate(filled, sea, dx, dy)
    print("flow accumulated, largest catchment km2", round(float(acc.max() * dx * dy / 1e6)))

    gy, gx = np.gradient(work, dy, dx)
    tan_b = np.maximum(np.hypot(gx, gy), 0.002)
    twi = np.log(np.maximum(acc, 1) * math.sqrt(dx * dy) / tan_b)

    # Rivers are thin, so a cell keeps some of its wettest part as well as the average
    wet = 0.6 * block(twi, OUT) + 0.4 * block(twi, OUT, np.max)
    elev = block(work, OUT)
    rows, cols = wet.shape
    out_step = step * OUT
    transform = from_origin(west, north, out_step, out_step)
    inside = ~geometry_mask([mapping(region.buffer(0.012))], out_shape=(rows, cols), transform=transform)
    inside &= elev > 0.5

    lo, hi = np.percentile(wet[inside], [3, 99.5])
    norm = np.clip((wet - lo) / (hi - lo), 0, 1)
    grid = np.where(inside, np.clip(norm * 254 + 1, 1, 255), 0).astype(np.uint8)

    parts = [p for p in (region.geoms if region.geom_type == "MultiPolygon" else [region]) if p.area > 0.0006]
    outline = unary_union(parts).simplify(0.004)
    geo = mapping(outline)

    def rounded(o):
        return [rounded(v) for v in o] if isinstance(o, (list, tuple)) and not isinstance(o[0], (int, float)) else [round(o[0], 4), round(o[1], 4)]

    np.savez_compressed(DATA / "bicol.npz", wet=grid, elev=np.clip(elev, -100, 3000).astype(np.int16))
    (DATA / "bicol.json").write_text(json.dumps(dict(
        name="Bicol Region (Region V)", north=north, west=west, step=out_step, nrows=rows, ncols=cols,
        south=north - rows * out_step, east=west + cols * out_step,
        boundary_source=f"geoBoundaries gbOpen PHL ADM1 ({meta['boundarySource']}), {meta['boundaryLicense']}",
        dem_source="Copernicus GLO-90 DEM (ESA/Airbus), AWS Open Data",
        outline=dict(type=geo["type"], coordinates=rounded(geo["coordinates"])),
    )))
    print(f"wrote bicol.npz and bicol.json: {rows}x{cols}, {int(inside.sum())} land cells, wet p50 {np.median(norm[inside]):.2f}")


if __name__ == "__main__":
    main()
