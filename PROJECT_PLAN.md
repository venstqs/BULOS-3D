# Bulos 3D: pilot plan and roadmap

## Phase 0: platform (done, this repository)
- DEM-derived watershed, channel model, forecasting and calibration (`backend/`)
- Operator console with CesiumJS terrain, risk heatmap and Three.js asset inspector (`src/`)
- Edge firmware and LoRaWAN codec (`firmware/`)
- Virtual field for demonstrations and regression tests (`backend/world.py`, `tests/`)

## Phase 1: bench and integration (≈ 6 weeks)
1. Bench-flash `bulos_edge_node` on ESP32 + RAK3172 + SIM800L. Verify the downlink format and the relay fail-safe.
2. Calibrate probes: pH 4/7 buffers, ORP standard, formazin turbidity standards. Store in NVS.
3. Register the nodes on the LGU ChirpStack (or TTN) and point the HTTP integration at `/api/ingest/chirpstack`.
4. Agree a data-sharing arrangement with DOST Region IV-A and DOST-ASTI for rain-gauge and sonde feeds.

## Phase 2: field pilot (≈ 3 months)
1. Deploy nodes at 2–3 water points that have no monitoring, alongside existing government sensors.
2. Commission a baseline per node (`BASELINE` command after one week of known-clean water).
3. Collect weekly grab samples for *E. coli* and total coliform at a DOH-accredited lab. Fit the surrogate-risk
   weights in `backend/edge.py` against the lab results (logistic regression), then report sensitivity and specificity.
4. Inject a conservative tracer (salt / conductivity pulse) to validate the transit-time calibration on each reach.

## Phase 3: handover
- TimescaleDB deployment at the LGU, SMS gateway contract, operator training for the Barangay Health Workers and the MENRO.
- Replicate to a second barangay by changing the DEM bounding box and station indices only.

## Key performance indicators
| KPI | Target |
|---|---|
| Advisory lead time before plume arrival at an intake | ≥ 20 min |
| False shut-offs caused by sensor fouling | 0 |
| Surrogate-risk detection of lab-confirmed *E. coli* > 0 CFU/100 mL | sensitivity ≥ 0.8 |
| Telemetry availability | ≥ 95 % |
