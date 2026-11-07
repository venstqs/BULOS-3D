<p align="center"><img src="public/favicon.svg" width="128" alt="Bulos 3D logo"></p>

# Bulos 3D: Water Quality Digital Twin

**Spatial telemetry, physicochemical surrogate analytics and hydrodynamic simulation for rural, decentralized water networks.**
Xylem Global Student Innovation Challenge · Camarines Sur National High School.
Pilot catchment: **Mt. Isarog west slope → Naga River system → Naga City, Camarines Sur** (57 km², 29.7 km mapped river, 336 m → 3 m).
An alternate site (Mt. Makiling, Los Baños) is kept for comparison: `BULOS_SITE=makiling`.

Bulos 3D takes the IoT and LoRaWAN telemetry that DOST and LGUs already collect, adds low-cost edge nodes where none
exist, and turns it into a 3D decision-support system. The system detects contamination from cheap surrogate
sensors, tells sensor faults apart from real events, forecasts when a plume will reach each downstream water point,
and closes intakes and texts residents before contaminated water is dispensed.

---

## The five core features and how they work

| # | Feature (concept paper) | Implementation |
|---|---|---|
| 1 | **3D watershed & DEM catchment mapping** | MapLibre GL 3D map on open terrain tiles with Esri satellite imagery, OpenStreetMap roads and buildings, and Three.js facility models drawn inside the map. The mobile app embed still uses CesiumJS. The **catchment boundary, stream network and main-stem long profile are computed by the backend from the Copernicus GLO-90 DEM**: priority-flood depression filling → D8 flow direction → flow accumulation → channel initiation at 0.35 km² (`backend/hydrology.py`). No pipe CAD drawings are needed. |
| 2 | **Spatiotemporal contaminant heatmaps (multi-parameter)** | Each node gets a surrogate biological-contamination risk from turbidity rise, ORP drop, pH shift, TDS jump and DOST rainfall (noisy-OR, plus a faecal-signature term when turbidity rises *and* ORP falls). The risk is spread along the channel by the transport model and over hillslopes by rainfall × runoff potential (slope + wetness), then **draped as a heatmap on the 3D terrain**. |
| 3 | **Terrain-driven flow & time-of-flight** | Discharge from the rational method on DEM contributing area. Channel width from downstream hydraulic geometry. **Manning velocity from DEM slope.** Animated particles move along every channel at the simulated velocity. **Node-to-node pulse transit times are measured by cross-correlation** and used to recalibrate each reach's velocity (dry-weather point-source pulses only, because rain loads every reach at once). |
| 4 | **Contaminant dispersion & arrival forecasting** | 1-D advection–dispersion (finite volume, Fischer dispersion coefficient, lateral inflow dilution, decay). Observations are assimilated at every node, then the model is run 4 h ahead with DOST rain persistence. Output: **arrival, peak and clear times at each intake** → SMS advisory up to 75 min ahead → optional **pre-emptive valve closure** up to 30 min ahead. |
| 5 | **Asset diagnostics, drift detection & shut-off** | Full-screen Three.js **3D site view** per water point, with photo materials and real shadows, and close-ups of the sensors, valve and storage. **WQHI 0–100** referenced to PNSDW 2017. A **biofouling classifier** looks for a slow, linear turbidity rise with flat ORP/TDS, no rain and a quiet upstream node (cross-node evidence); the water keeps flowing and a technician is dispatched. Autonomous edge trip with 120 s persistence, remote close, and **interlocked re-arm**. |

Also included:
- PNSDW compliance audit (SQLite or **TimescaleDB** hypertables).
- SMS outbox (Semaphore PH gateway when configured).
- Low-reserve escalation when an intake stays closed.
- ChirpStack / TTN / MQTT / generic ingest.


### Alignment with the concept paper (CSNHS, "Rural and Isolated Water Networks")

| Paper | Where it lives |
|---|---|
| Sensors for pH, turbidity, TDS **and biological indicators** | Tryptophan-like fluorescence (TLF, ppb) channel: real-time faecal proxy, in risk, WQHI, forecast, heatmap, 20-byte LoRaWAN v2 payload, firmware (`CAL TLF0`) and gauges |
| Heatmaps of multi-parameter safety indexes | Watershed page selector: overall risk · turbidity · pH · TDS · biological (`GET /api/heatmap?index=`) |
| Particle flow in **gravity-fed pipes** and spring channels, driven by telemetry | River (Manning, calibrated by measured pulse transit) + pipelines GL-1 spring→kiosk and DM-2 well tank→RHU (Hazen–Williams on DEM head; stops when telemetry reports an empty tank) |
| Dispersion through networks **and aquifers**, arrival times hours ahead | River advection–dispersion + riverbank-aquifer response for the solar-pumped shallow well (delayed, filtered), 4 h forecast |
| Click a solar pump / tank / spring → isometric Three.js view with WQHI + gauges | Single click on the 3D map opens the site view (double-click: details page) |
| FastAPI / **Celery** | Forecast is a pure function (`twin.compute_forecast`); runs in-process, or on a Celery worker with `BULOS_CELERY=1` (`backend/tasks.py`, needs Redis) |
| PostgreSQL + TimescaleDB | `DATABASE_URL=postgresql+psycopg://…` creates hypertables; SQLite for laptop demos |
| Beneficiaries & SDGs | About page in the app |

---

## Architecture

```
 DOST / LGU LoRaWAN gateways ─┐                         ┌─► MapLibre 3D watershed, risk heatmap, flow animation
 Bulos ESP32 edge nodes ──────┼─► ingest (ChirpStack,   │   React + Tailwind operator console
 DOST-ASTI rain gauges ───────┘    TTN, MQTT, JSON)     ├─► Three.js 3D site view
                                        │               │
                                        ▼               │
                         ┌─────────── Twin (FastAPI) ───┤
                         │ baselines · risk · WQHI      │
                         │ drift classifier             │
                         │ DEM channel model + ADE      ├─► SMS (Semaphore) · downlinks (valve cmds)
                         │ assimilation · 4 h forecast  │
                         │ transit-time calibration     ├─► SQLite / PostgreSQL + TimescaleDB
                         └──────────────────────────────┘
```

**Demo mode is honest.** With no hardware attached, `backend/world.py` stands in for the field. It runs the *true*
physics, using a creek roughness the twin doesn't know, adds imperfect sensors (lag, noise, biofouling), runs the
firmware logic on virtual edge nodes, and emits **real 18-byte LoRaWAN payloads** through the same decoder and ingest
path as live data. The twin never reads the simulator's state; it has to detect, classify, forecast and calibrate
from packets, exactly as it would in the field.

---

## Run it

Prerequisites: Python 3.10+, Node 18+.

```powershell
pip install -r requirements.txt
npm install                     # also copies Cesium assets into public/cesium
npm start                       # starts the data server + website, then open http://localhost:5173
```

`npm start` builds the optimized site (about 90 KB to first paint; the 3D map loads in the background) and
runs the FastAPI data server on port 8000 (API docs at http://127.0.0.1:8000/docs). Press Ctrl+C to stop both.
For development with hot reload use `npm run backend` and `npm run dev` in two terminals. Dev mode serves the
3D libraries unbundled (around 50 MB), so the first load there is much slower.

**Competition materials:** [`docs/submission-pack.md`](docs/submission-pack.md) (concept changes, results, video script,
deployment, checklist), [`docs/bench-node.md`](docs/bench-node.md) (build the low-cost real prototype), and
[`docs/evaluation.md`](docs/evaluation.md) (simulated test results; regenerate with `python -m backend.tools.evaluate`).

**Real hardware:** a Wi-Fi bench node (`firmware/bulos_bench_node`) posts to `POST /api/node/reading` and takes over one
water point while the rest stay simulated. Rehearse without hardware using `python -m backend.tools.fake_node`.

**Mobile app (Expo Go):** see [`mobile/README.md`](mobile/README.md). In short, run `npm run start:lan` here,
then `npm start` in `mobile/`, and scan the QR code with Expo Go on the same Wi-Fi.

Run the tests with `python -m pytest tests -q`. They cover the DEM drainage, payload codec, risk, interlock, forecast
lead time, transit calibration, biofouling, monsoon behaviour, reserve escalation, and every ingest API.

### Demo script (about 4 minutes at 60× speed)

The console is organised around the proposal's five core features (left rail **01 Catchment · 02 Heatmaps ·
03 Flow · 04 Forecast · 05 Assets**, plus 06 Logs). The **river schematic** under the map shows the whole network
as a living long profile: water colour, closed intakes and forecast ETA chips at a glance.

1. **Piggery lagoon spill.** About 20 s in, AG-02 turns *Severe* and the heatmap glows on the terrain. Shortly after,
   the twin forecasts the plume at the KS-03 kiosk (an ETA chip appears on the river schematic), sends the SMS
   advisory and closes the intake before the plume arrives. Open **Transit calibration** to watch the
   twin learn that the real creek is slower than the textbook value.
2. **Probe biofouling (KS-03).** Turbidity creeps to 20+ NTU, but the twin and the edge node call it *sensor
   biofouling*. The valve stays open for 2,250 people and a technician is dispatched. Click **Inspect in 3D** to see
   the fouled probe, then **Log lens cleaned**.
3. **Monsoon cloudburst.** The whole catchment lights up and every intake is protected before the first-flush turbidity peak.
4. Try **Re-arm** while contamination is present: the on-site interlock refuses.

### Operator tools (all wired to the API)

| On screen | What it does | Endpoint |
|---|---|---|
| Water test | PNSDW pass/fail report for the latest reading at any water point (printable) | `GET /api/state` |
| Add reminder | Schedules a maintenance task (probe cleaning, pH calibration, filter, solar, tank, custom) | `POST /api/maintenance` |
| Log maintenance / Mark done | Completes a task, reschedules recurring ones; a probe cleaning also resets the node's drift check | `POST /api/maintenance/{id}/done` |
| Send SMS advisory | Texts the contact of each affected (or chosen) water point | `POST /api/advisory` |
| Close intake / Re-arm / Force re-arm | Valve downlinks with the on-site safety interlock | `POST /api/valve` |
| Water quality trend | Network-average WQHI over the last 12 h | `GET /api/trend` |

When the twin detects sensor biofouling it pulls that node's probe cleaning forward and marks it urgent.

---

## Connecting real data

Set `BULOS_DATA_SOURCE=live` to disable the virtual field. Then:

| Source | How |
|---|---|
| ChirpStack v4 | HTTP integration → `POST /api/ingest/chirpstack`, or the MQTT bridge: `pip install paho-mqtt`, `MQTT_HOST=… CHIRPSTACK_APP_ID=…` |
| TTN / The Things Stack | Webhook → `POST /api/ingest/ttn`. Payload formatter: `firmware/codec/bulos_codec.js` |
| Existing LGU / DOST sondes | `POST /api/ingest/reading` with `{station_id, turbidity_ntu, orp_mv, ph, tds_ppm, temp_c}` |
| DOST-ASTI rain gauge | `POST /api/ingest/rainfall` with `{rain_mm_hr}` or `{rain_mm_15min}` |
| Valve commands | Published as ChirpStack downlinks (MQTT), or listed at `GET /api/downlinks` |

Device EUIs are registered in `backend/ingest.py`, and stations in `backend/config.py`. Station positions are given
as an index along the DEM main stem, so elevation, slope and catchment area always come from the terrain.

Environment variables:

| Variable | Purpose |
|---|---|
| `VITE_CESIUM_ION_TOKEN` | Optional. Use Cesium World Terrain instead of ArcGIS elevation. |
| `DATABASE_URL` | Optional. e.g. `postgresql+psycopg://user:pw@host/bulos`. TimescaleDB hypertables are created automatically. |
| `SEMAPHORE_API_KEY` | Real SMS via Semaphore. |
| `BULOS_SMS_RECIPIENTS` | JSON map of role → phone numbers. |
| `BULOS_SIM_SPEED` | Demo speed (default 60×). |
| `BULOS_SITE` | `naga` (default) or `makiling`. |
| `BULOS_NODE_KEY` | Secret that real nodes must send. Set this on any public deployment. |

To add a study area, add it to `SITES` in `backend/config.py` (bounding box, main-stem head, station indices),
run `python -m backend.tools.fetch_dem <site>`, and start with `BULOS_SITE=<site>`.

---

## Edge node hardware (per water point, indicative)

| Part | Role |
|---|---|
| ESP32 DevKit v1 | Runs `firmware/bulos_edge_node`: same risk / drift / trip logic as `backend/edge.py` |
| RAK3172 (AS923-3) | LoRaWAN to the LGU/DOST gateway, AT commands |
| SIM800L | SMS straight from the site when LoRaWAN is down |
| Turbidity, ORP, pH, TDS probes + DS18B20 | Surrogate sensing. For a production version, swap in a YSI EXO sonde (SDI-12/Modbus) |
| 12 V DC **normally-closed** solenoid + opto relay | Fail-safe: power or MCU failure closes the intake |
| JSN-SR04T | Tank level → reserve hours |
| 20 W solar panel, 12 V LiFePO₄, RGB beacon, buzzer | Off-grid power and local warning for residents without phones |

The firmware is written against these parts but **has not yet been bench-flashed**. In particular, check the RAK3172
downlink event format against your RUI3 version.

---

## Honest limitations

- The **risk weights are expert heuristics, not a calibrated probability.** The next step is fitting them against
  DOH-accredited lab *E. coli* results from the pilot sites.
- The hydraulic model is 1-D on the main stem with a 90 m DEM. Tributary routing beyond the main stem is visual only.
- Kiosk, solar-pumped well and RHU assets are an **illustrative pilot layout**. The drainage network and elevations are
  real DEM output; the main channel follows the Naga River system as resolved by a 90 m DEM.
- Raw-water compliance figures describe *source* exposure, not treated tap water.

## Project layout

```
backend/   config.py (sites: naga, makiling) · hydrology.py (DEM analysis) · hydraulics.py (Manning + ADE) · twin.py (analytics, forecast, calibration)
           edge.py (risk, WQHI, drift, edge FSM, LoRaWAN codec) · world.py (virtual field) · platform_core.py
           ingest.py · storage.py · notify.py · mqtt_bridge.py · main.py (API) · data/dem_<site>.json · tools/fetch_dem.py
src/       App.jsx · components/CesiumScene.jsx · RiverSchematic.jsx · Modules.jsx · AssetInspector.jsx · StationPanel.jsx · charts/
firmware/  bulos_edge_node/bulos_edge_node.ino · codec/bulos_codec.js
tests/     test_backend.py
_archive/  previous (pre-rewrite) version, zipped
```

**SDG alignment:** 3 (waterborne disease prevention), 6 (safe decentralized water), 9 (upgrades existing public IoT),
11 & 13 (typhoon and monsoon resilience).

## Credits

Building, ground and sky textures in `public/textures/` are CC0 from [Poly Haven](https://polyhaven.com).
