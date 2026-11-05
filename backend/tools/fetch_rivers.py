"""
Download the real mapped waterways for the pilot site from OpenStreetMap.

    python -m backend.tools.fetch_rivers

The twin's hydraulics run on a channel traced from the 90 m elevation model. That line is
good for slope and travel time but is only an estimate of where the river lies on the ground,
so the maps draw these surveyed lines instead. Data (c) OpenStreetMap contributors, ODbL.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from backend import config as C
from backend.hydrology import Terrain

OUT = Path(__file__).resolve().parents[1] / "data" / f"rivers_{C.SITE_ID}.json"
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def query(bbox):
    s, w, n, e = bbox
    return f"""[out:json][timeout:90];
(way["waterway"~"^(river|stream|canal)$"]({s},{w},{n},{e}););
out geom tags;"""


def main():
    t = Terrain()
    bbox = (round(t.south, 4), round(t.west, 4), round(t.north, 4), round(t.east, 4))
    body = urllib.parse.urlencode({"data": query(bbox)}).encode()
    data = None
    for url in SERVERS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "Bulos3D-student-project"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.load(r)
            break
        except Exception as e:                       # try the next public server
            print(f"{url}: {e}")
            time.sleep(2)
    if data is None:
        raise SystemExit("No Overpass server answered. Try again later.")
    ways = [dict(id=w["id"], kind=w["tags"].get("waterway"), name=w["tags"].get("name"),
                 coords=[[round(p["lon"], 6), round(p["lat"], 6)] for p in w["geometry"]])
            for w in data["elements"] if w.get("geometry")]
    OUT.write_text(json.dumps(dict(source="OpenStreetMap contributors (ODbL)", bbox=bbox, ways=ways)), encoding="utf-8")
    print(f"{len(ways)} waterways -> {OUT.name}")


if __name__ == "__main__":
    main()
