"""
Live weather for the pilot site from Open-Meteo (free, no key). This is real data, shown beside
the simulated field so nobody confuses the two. Results are cached so the service is not hammered.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

CACHE_S = 900
_cache = dict(t=0.0, value=None)
CONDITION = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle",
             53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 80: "Showers",
             81: "Showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"}


def _get(url, params):
    req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}", headers={"User-Agent": "Bulos3D-student-project"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def live_weather(lat, lon):
    now = time.time()
    if _cache["value"] and now - _cache["t"] < CACHE_S:
        return _cache["value"]
    try:
        d = _get("https://api.open-meteo.com/v1/forecast", dict(
            latitude=lat, longitude=lon, current="temperature_2m,precipitation,wind_speed_10m,weather_code",
            hourly="precipitation", forecast_days=2, timezone="Asia/Manila"))
        cur = d["current"]
        hours = d["hourly"]["time"]
        start = next((i for i, h in enumerate(hours) if h >= cur["time"][:13]), 0)
        value = dict(available=True, source="Open-Meteo", time=cur["time"], temp_c=cur["temperature_2m"], rain_mm=cur["precipitation"],
                     wind_kmh=cur["wind_speed_10m"], condition=CONDITION.get(cur["weather_code"], "Unsettled"),
                     next24_mm=round(sum(v or 0 for v in d["hourly"]["precipitation"][start:start + 24]), 1), discharge_m3s=None)
    except Exception as e:                           # the twin must keep working without this feed
        return _cache["value"] or dict(available=False, source="Open-Meteo", error=str(e)[:120])
    try:
        f = _get("https://flood-api.open-meteo.com/v1/flood", dict(latitude=lat, longitude=lon, daily="river_discharge", forecast_days=3))
        value["discharge_m3s"] = f["daily"]["river_discharge"][0]
    except Exception:
        pass                                         # river flow is a bonus; weather alone is fine
    _cache.update(t=now, value=value)
    return value
