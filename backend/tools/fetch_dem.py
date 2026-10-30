"""
Download a Digital Elevation Model grid for a study site and cache it.

Source: Copernicus GLO-90 DEM (ESA / Airbus, 3 arc-second, ~90 m), public
1x1 degree tiles on AWS Open Data: s3://copernicus-dem-90m (no account needed).

    python -m backend.tools.fetch_dem naga        # writes backend/data/dem_naga.json

Bounding boxes live in backend/config.py (SITES). The cached file is committed
so the platform runs offline. Needs Pillow + numpy (dev-time only).
"""
from __future__ import annotations

import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

from backend.config import SITES

RES = 1.0 / 1200                                     # 3 arc-seconds
DATA = Path(__file__).resolve().parents[1] / "data"


def tile_name(lat0, lon0):
    return f"Copernicus_DSM_COG_30_N{lat0:02d}_00_E{lon0:03d}_00_DEM"


def main(site):
    north, south, west, east = SITES[site]["bbox"]
    lat0, lon0 = math.floor(south), math.floor(west)
    if math.floor(north - 1e-9) != lat0 or math.floor(east - 1e-9) != lon0:
        raise SystemExit("bbox must fit inside one 1x1 degree tile")
    name = tile_name(lat0, lon0)
    url = f"https://copernicus-dem-90m.s3.amazonaws.com/{name}/{name}.tif"
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=180) as r:
        tile = np.array(Image.open(io.BytesIO(r.read())), dtype=np.float32)

    tile_n, tile_w = lat0 + 1.0, float(lon0)
    r0, r1 = round((tile_n - north) / RES), round((tile_n - south) / RES)
    c0, c1 = round((west - tile_w) / RES), round((east - tile_w) / RES)
    grid = tile[r0:r1 + 1, c0:c1 + 1]
    nrows, ncols = grid.shape
    out = DATA / f"dem_{site}.json"
    out.write_text(json.dumps(dict(
        source="Copernicus GLO-90 DEM (ESA/Airbus), AWS Open Data tile " + name,
        north=tile_n - r0 * RES, west=tile_w + c0 * RES, step=RES, nrows=nrows, ncols=ncols,
        elev=[round(float(v), 1) for v in grid.ravel()],
    )))
    print(f"wrote {out} ({nrows}x{ncols}, {grid.min():.0f}-{grid.max():.0f} m)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "naga")
