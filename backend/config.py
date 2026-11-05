"""
Site configuration.

Station positions are given as an index along the DEM-derived main stem (see
hydrology.py), so elevation, slope, chainage and contributing area are always
read from the terrain, never typed in. The drainage is real DEM output; the
assets placed on it (kiosk, well, RHU intake) are an illustrative pilot layout.

Select a site with BULOS_SITE=naga (default) or BULOS_SITE=makiling.
To add a site: put its bbox here, run `python -m backend.tools.fetch_dem <site>`,
then choose a main-stem head and station indices along the traced channel.
"""
import os
from pathlib import Path

SIM_SPEED = float(os.getenv("BULOS_SIM_SPEED", "60"))   # simulated s per real s
TICK_REAL_S = 1.0
TICK_SIM_S = SIM_SPEED * TICK_REAL_S
HISTORY_HOURS = 12

DATA_SOURCE = os.getenv("BULOS_DATA_SOURCE", "sim")      # sim | live
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/data/bulos.db")

# Philippine National Standards for Drinking Water (PNSDW 2017, DOH AO 2017-0010)
PNSDW = dict(turbidity_ntu=5.0, ph_min=6.5, ph_max=8.5, tds_mgL=600.0)

# Biological indicator: tryptophan-like fluorescence (TLF, ppb), a real-time proxy for faecal
# (E. coli / thermotolerant coliform) contamination. No PNSDW limit exists; 10 ppb is used as
# the alert reference for raw surface water.
BIO_ALERT_PPB = 10.0

# Edge trip logic (mirrored in firmware/bulos_edge_node/bulos_edge_node.ino)
RISK_SUSPECT = 0.45
RISK_TRIP = 0.60
PERSISTENCE_S = 120.0

NC_SOLENOID = dict(model='12 V DC normally-closed solenoid, 1"', relay="GPIO 26")


def _stations(idx, names, owners, gateways, notes, mid):
    """Five-node template shared by the sites: spring, sentinel, kiosk, mid-network asset, RHU."""
    base = [
        dict(turbidity=0.8, orp=430.0, ph=7.45, tds=120.0, temp=21.0, bio=0.6),
        dict(turbidity=2.2, orp=400.0, ph=7.30, tds=165.0, temp=24.0, bio=3.5),
        dict(turbidity=2.0, orp=410.0, ph=7.30, tds=170.0, temp=25.0, bio=3.0),
        dict(turbidity=2.4, orp=405.0, ph=7.35, tds=180.0, temp=25.5, bio=3.2),
        dict(turbidity=2.8, orp=395.0, ph=7.35, tds=190.0, temp=26.0, bio=4.0),
    ]
    ids = ["IN-01", "AG-02", "KS-03", "MB-04", "RH-05"]
    kinds = ["SPRING_INTAKE", "EXISTING_GOV_SENSOR", "COMMUNAL_KIOSK", mid["kind"], "CRITICAL_ENDPOINT"]
    valves = [None, None, NC_SOLENOID, mid["valve"], NC_SOLENOID]
    tanks = [None, None, dict(capacity_l=5000.0, demand_lps=0.30), mid["tank"],
             dict(capacity_l=3000.0, demand_lps=0.12)]
    pops = [0, 0, 2250, mid["population"], 650]
    sms = [None, "City ENRO duty officer", "Barangay Health Worker", mid["sms"], "City Health Officer"]
    networks = ["LGU-LoRaWAN", "DOST-LoRaWAN", "LGU-LoRaWAN", "LGU-LoRaWAN", "LGU-LoRaWAN"]
    if mid["kind"] == "SOLAR_PUMP_WELL":                     # riverbank-filtered groundwater
        base[3] = dict(turbidity=0.6, orp=380.0, ph=7.10, tds=240.0, temp=25.0, bio=1.2)
    return [dict(id=ids[k], name=names[k], kind=kinds[k], stem_index=idx[k], owner=owners[k],
                 network=networks[k], gateway=gateways[k], base=base[k], valve=valves[k],
                 tank=tanks[k], population=pops[k], sms=sms[k], note=notes[k]) for k in range(5)]


SITES = {
    # Mt. Isarog west slope -> Naga River system -> Naga City, Camarines Sur
    "naga": dict(
        bbox=(13.720, 13.560, 123.160, 123.400),
        title="Naga City, Camarines Sur",
        subtitle="Mt. Isarog west slope → Naga City",
        main_stem_head=(13.6575, 123.3700),
        # Real river (OpenStreetMap): Isarog slope to the Naga-Bicol confluence, as (lon, lat)
        river=dict(head=(123.3228, 13.6578), outlet=(123.1803, 13.6164), max_area_km2=120.0),
        pipes=[
            dict(id="GL-1", name="Spring gravity line", src="IN-01", dst="KS-03", diameter_m=0.10,
                 material="HDPE", hw_c=140, source_yield_lps=6.0, control=None,
                 note="Isarog spring box to the barangay kiosk tank. Break-pressure tanks along the line."),
            dict(id="DM-2", name="Well distribution main", src="MB-04", dst="RH-05", diameter_m=0.075,
                 material="HDPE", hw_c=140, source_yield_lps=None, control="MB-04", tank_head_m=10.0,
                 note="Elevated tank at the solar well feeds the clinic and school by gravity."),
        ],
        farm_confluence_index=113,
        rain_gauge=dict(id="ARG-NAGA", name="DOST-ASTI automated rain gauge (Naga City)",
                        lat=13.6260, lon=123.2600),
        stations=_stations(
            idx=[40, 120, 150, 185, 225],
            names=["Mt. Isarog Communal Spring Intake", "Agricultural Runoff Sentinel",
                   "Barangay Communal Water Kiosk", "Solar-Pumped Shallow Well",
                   "Rural Health Unit & School Intake"],
            owners=["City Water Office", "DOST Region V (Bicol)", "Barangay Council",
                    "Barangay Water Association", "City Health Office"],
            gateways=["LGU-GW-Isarog", "DOST-GW-Bicol", "LGU-GW-Isarog", "LGU-GW-Naga", "LGU-GW-Naga"],
            notes=[
                "Spring box on the forested Isarog slope feeding the upland gravity line. "
                "Supplemental Bulos edge node.",
                "Existing government water-quality sonde below the farm tributary. Ingested, not owned.",
                "Creek intake -> cartridge filter -> 5,000 L tank -> 4 taps. 450 households.",
                "Riverbank shallow well; solar pump lifts to a 10,000 L elevated tank. "
                "Draws induced river infiltration, so it sees creek contamination.",
                "Clinic + elementary school on the city edge. Highest vulnerability (infants, patients, pupils).",
            ],
            mid=dict(kind="SOLAR_PUMP_WELL",
                     valve=dict(model='Solar pump controller enable + 2" NC solenoid', relay="GPIO 26 / GPIO 25"),
                     tank=dict(capacity_l=10000.0, demand_lps=0.60), population=1200,
                     sms="Barangay water association"),
        ),
    ),
    # Mt. Makiling north slope -> Laguna de Bay, Los Baños, Laguna (alternate demo site)
    "makiling": dict(
        bbox=(14.200, 14.100, 121.170, 121.280),
        title="Los Baños, Laguna",
        subtitle="Mt. Makiling north slope → Laguna de Bay",
        main_stem_head=(14.1317, 121.2083),
        pipes=[
            dict(id="GL-1", name="Spring gravity line", src="IN-01", dst="KS-03", diameter_m=0.075,
                 material="HDPE", hw_c=140, source_yield_lps=4.0, control=None,
                 note="Spring box to the barangay kiosk tank."),
            dict(id="DM-2", name="Reservoir distribution main", src="MB-04", dst="RH-05", diameter_m=0.10,
                 material="PVC", hw_c=150, source_yield_lps=None, control="MB-04", tank_head_m=6.0,
                 note="Municipal reservoir feeds the clinic and school by gravity."),
        ],
        farm_confluence_index=22,
        rain_gauge=dict(id="ARG-LB", name="DOST-ASTI automated rain gauge (Los Baños)",
                        lat=14.1650, lon=121.2420),
        stations=_stations(
            idx=[6, 30, 44, 62, 80],
            names=["Upland Spring Intake", "Agricultural Runoff Sentinel", "Barangay Communal Water Kiosk",
                   "Municipal Reservoir & Slow-Sand Filter", "Rural Health Unit & School Intake"],
            owners=["LGU Water Office", "DOST Region IV-A", "Barangay Council", "Municipal Water Utility",
                    "Municipal Health Office"],
            gateways=["LGU-GW-Makiling-1", "DOST-ARG-GW-LB", "LGU-GW-Poblacion", "LGU-GW-Poblacion",
                      "LGU-GW-Lakeshore"],
            notes=[
                "Spring box feeding the upper gravity line. Supplemental Bulos edge node.",
                "Existing government water-quality sonde below the farm tributary. Ingested, not owned.",
                "Creek intake -> cartridge filter -> 5,000 L tank -> 4 taps. 450 households.",
                "Intake to 50 m3 reservoir with slow-sand filter and chlorination.",
                "Clinic + elementary school. Highest vulnerability (infants, patients, pupils).",
            ],
            mid=dict(kind="MUNICIPAL_RESERVOIR",
                     valve=dict(model='Motorised butterfly valve, 4" (Modbus RTU)', relay="RS-485 ID 4"),
                     tank=dict(capacity_l=50000.0, demand_lps=2.5), population=1800,
                     sms="Municipal water engineer"),
        ),
    ),
}

SITE_ID = os.getenv("BULOS_SITE", "naga")
SITE = SITES[SITE_ID]
DEM_PATH = Path(__file__).resolve().parent / "data" / f"dem_{SITE_ID}.json"
MAIN_STEM_HEAD = SITE["main_stem_head"]
STATIONS = SITE["stations"]
RAIN_GAUGE = SITE["rain_gauge"]
FARM_CONFLUENCE_INDEX = SITE["farm_confluence_index"]   # septic / manure source joins here
PIPES = SITE["pipes"]
