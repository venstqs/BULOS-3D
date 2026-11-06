"""
Download real roads and mapped water facilities for the pilot site from OpenStreetMap.

    python -m backend.tools.fetch_network

Water mains are normally laid along roads, so the pipelines follow this road network, and the
crew truck drives on it. Data (c) OpenStreetMap contributors, ODbL.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from backend import config as C
from backend.hydrology import Terrain

DATA = Path(__file__).resolve().parents[1] / "data"
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track"


def overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    for url in SERVERS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "Bulos3D-student-project"})
            with urllib.request.urlopen(req, timeout=170) as r:
                return json.load(r)
        except Exception as e:                       # try the next public server
            print(f"{url}: {e}")
            time.sleep(2)
    raise SystemExit("No Overpass server answered. Try again later.")


def main():
    t = Terrain()
    b = f"{t.south:.4f},{t.west:.4f},{t.north:.4f},{t.east:.4f}"
    roads = overpass(f'[out:json][timeout:160];way["highway"~"^({ROADS})$"]({b});out geom tags;')
    ways = [dict(kind=w["tags"]["highway"], name=w["tags"].get("name"), bridge="bridge" in w["tags"],
                 coords=[[round(p["lon"], 5), round(p["lat"], 5)] for p in w["geometry"]])
            for w in roads["elements"] if w.get("geometry")]
    (DATA / f"roads_{C.SITE_ID}.json").write_text(json.dumps(dict(source="OpenStreetMap contributors (ODbL)", ways=ways)), encoding="utf-8")

    q = f"""[out:json][timeout:90];
(nwr["man_made"~"^(water_tower|water_works|storage_tank|reservoir_covered|pumping_station|water_well|wastewater_plant|pipeline)$"]({b});
 nwr["natural"="spring"]({b});
 nwr["amenity"~"^(drinking_water|water_point)$"]({b});
 nwr["office"="water_utility"]({b});
 nwr["waterway"~"^(dam|weir|sluice_gate|waterfall)$"]({b}););
out center tags;"""
    found = []
    for e in overpass(q)["elements"]:
        tags = e.get("tags", {})
        c = e.get("center", e)
        if "lat" not in c:
            continue
        kind = tags.get("man_made") or tags.get("natural") or tags.get("amenity") or tags.get("office") or tags.get("waterway")
        found.append(dict(kind=kind, name=tags.get("name"), operator=tags.get("operator"), lat=round(c["lat"], 6), lon=round(c["lon"], 6)))
    (DATA / f"water_assets_{C.SITE_ID}.json").write_text(json.dumps(dict(source="OpenStreetMap contributors (ODbL)", assets=found)), encoding="utf-8")
    places = []
    for e in overpass(f'[out:json][timeout:60];node["place"~"^(city|town|village|suburb|hamlet|quarter|neighbourhood)$"]["name"]({b});out body;')["elements"]:
        tags = e["tags"]
        pop = tags.get("population", "")
        places.append(dict(name=tags["name"], kind=tags["place"], lat=round(e["lat"], 6), lon=round(e["lon"], 6),
                           population=int(pop) if pop.isdigit() else None))
    (DATA / f"places_{C.SITE_ID}.json").write_text(json.dumps(dict(source="OpenStreetMap contributors (ODbL)", places=places)), encoding="utf-8")
    print(f"{len(ways)} roads, {len(found)} water facilities, {len(places)} places")


if __name__ == "__main__":
    main()
