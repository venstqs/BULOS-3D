"""
The whole Bicol Region at a glance: where rain runoff is likely to collect.

Unlike the river twin this is not simulated, and it is not a measurement of water quality. It joins
real terrain (the Topographic Wetness Index from Copernicus GLO-90, see tools/fetch_bicol.py)
with live rainfall from Open-Meteo. It is a screening estimate of where water gathers and can
carry dirt into streams and wells, and it has not been calibrated against field data.
"""
from __future__ import annotations

import base64
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .weather import _get

DATA = Path(__file__).resolve().parent / "data"
RAIN_CACHE_S = 1800
RAIN_FULL_MM = 80        # 24 h rain that counts as a very wet day for this estimate
DRY_SHARE = 0.45         # how much of the terrain signal shows on a dry day
ROWS, COLS = 8, 7        # live rain sample points across the region
MANILA = timezone(timedelta(hours=8))

_meta = None
_wet = None
_elev = None
_cache = dict(t=0.0, rain=None, payload=None, time=None)


def _load():
    global _meta, _wet, _elev
    if _meta is None:
        _meta = json.loads((DATA / "bicol.json").read_text())
        with np.load(DATA / "bicol.npz") as d:
            _wet, _elev = d["wet"], d["elev"]
    return _meta


def _sample_points():
    m = _meta
    return np.linspace(m["north"], m["south"], ROWS), np.linspace(m["west"], m["east"], COLS)


def _fetch_rain():
    """24 hour rain forecast at each sample point, in mm, as a ROWS x COLS array."""
    lats, lons = _sample_points()
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    d = _get("https://api.open-meteo.com/v1/forecast", dict(
        latitude=",".join(f"{v:.3f}" for v in la.ravel()), longitude=",".join(f"{v:.3f}" for v in lo.ravel()),
        hourly="precipitation", forecast_days=2, timezone="Asia/Manila"), timeout=12)
    now = datetime.now(MANILA).strftime("%Y-%m-%dT%H")
    totals = []
    for point in d:
        hours = point["hourly"]["time"]
        start = next((i for i, h in enumerate(hours) if h >= now), 0)
        totals.append(sum(v or 0 for v in point["hourly"]["precipitation"][start:start + 24]))
    return np.array(totals, float).reshape(ROWS, COLS)


def _rain():
    now = time.time()
    if _cache["rain"] is not None and now - _cache["t"] < RAIN_CACHE_S:
        return _cache["rain"], True
    try:
        _cache.update(rain=_fetch_rain(), t=now, payload=None, time=datetime.now(MANILA).strftime("%H:%M"))
        return _cache["rain"], True
    except Exception:                                # terrain still works without the rain feed
        return _cache["rain"], _cache["rain"] is not None


def _rain_field(points):
    """Smooth the sample points onto the full grid, one direction at a time."""
    lats, lons = _sample_points()
    m = _meta
    rows = m["north"] - (np.arange(m["nrows"]) + 0.5) * m["step"]
    cols = m["west"] + (np.arange(m["ncols"]) + 0.5) * m["step"]
    across = np.array([np.interp(cols, lons, r) for r in points])
    return np.array([np.interp(rows, lats[::-1], across[::-1, c]) for c in range(m["ncols"])]).T


def _level(wet01, rain_mm):
    return wet01 * (DRY_SHARE + (1 - DRY_SHARE) * np.clip(rain_mm / RAIN_FULL_MM, 0, 1) ** 0.7)


def grid():
    """The Bicol runoff risk raster, in the same form as the river heatmaps."""
    m = _load()
    points, live = _rain()
    if _cache["payload"] is not None and live:
        return _cache["payload"]
    rain = _rain_field(points) if live else np.zeros(_wet.shape)
    val = _level((_wet.astype(float) - 1) / 254, rain)
    out = np.where(_wet > 0, np.clip(val * 254 + 1, 1, 255), 0).astype(np.uint8)
    inside = _wet > 0
    payload = dict(
        index="bicol", north=m["north"], south=m["south"], west=m["west"], east=m["east"], nrows=m["nrows"], ncols=m["ncols"],
        data=base64.b64encode(out.tobytes()).decode(), outline=m["outline"],
        rain=dict(live=bool(live), source="Open-Meteo", checked=_cache["time"],
                  mean_mm=round(float(rain[inside].mean()), 1), max_mm=round(float(rain[inside].max()), 1)),
        sources=[m["dem_source"], m["boundary_source"], "Open-Meteo live rain"],
    )
    if live:
        _cache["payload"] = payload
    return payload


def at(lat, lon):
    """What the regional layer says about one spot. Raises ValueError outside Bicol."""
    m = _load()
    r, c = int((m["north"] - lat) / m["step"]), int((lon - m["west"]) / m["step"])
    if not (0 <= r < m["nrows"] and 0 <= c < m["ncols"]) or _wet[r, c] == 0:
        raise ValueError("That spot is outside Bicol.")
    points, live = _rain()
    rain = float(_rain_field(points)[r, c]) if live else None
    value = float(_level((float(_wet[r, c]) - 1) / 254, rain or 0))
    return dict(lat=lat, lon=lon, region=True, elevation_m=int(_elev[r, c]), rain_next24_mm=None if rain is None else round(rain, 1),
                runoff=round(value, 2), level="Higher" if value >= 0.55 else "Medium" if value >= 0.3 else "Lower")
