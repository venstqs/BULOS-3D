import numpy as np
"""
    python -m pytest tests -q
"""
import base64

import pytest

from backend import config as C
from backend.edge import EdgeNode, decode_uplink, encode_uplink, surrogate_risk
from backend.hydrology import Terrain
from backend.platform_core import Platform


@pytest.fixture(scope="module")
def terrain():
    return Terrain()


def run(p, minutes, until=None):
    for m in range(minutes):
        p.tick(60)
        if until and until(p):
            return m + 1
    return None


def first_event(p, kind, station):
    for e in reversed(p.events):
        if e["type"] == kind and e["station"] == station:
            return e
    return None


# ---------------------------------------------------------------- terrain
def test_main_stem_runs_downhill_to_the_lake(terrain):
    path = terrain.trace(*terrain.rc(*C.MAIN_STEM_HEAD))
    prof = terrain.path_profile(path)
    assert prof[0]["z"] > 500 and prof[-1]["z"] < 6
    assert prof[-1]["area_km2"] > 15
    z_station = [prof[s["stem_index"]]["z"] for s in C.STATIONS]
    assert z_station == sorted(z_station, reverse=True)


def test_catchment_contains_main_stem(terrain):
    p = Platform(store=False)
    for cell in p.stem:
        assert p.twin.catchment[cell]
    assert len(p.static()["catchment"]["ring"]) > 20


# ------------------------------------------------------------------ edge
def test_codec_roundtrip():
    r = dict(turbidity=12.3, orp=-45.0, ph=6.81, tds=412.0, temp=24.37, bio=27.4)
    b = encode_uplink(r, "TRIPPED", False, True, 3987, 0.73, 41.5)
    assert len(b) == 20 and b[0] == 2
    d = decode_uplink(b)
    assert d["bio"] == 27.4
    v1 = bytes([1]) + b[1:18]                               # older nodes without a biological sensor
    assert decode_uplink(v1)["bio"] is None and decode_uplink(v1)["turbidity"] == 12.3
    assert d["turbidity"] == 12.3 and d["orp"] == -45 and d["ph"] == 6.81
    assert d["edge_state"] == "TRIPPED" and not d["valve_open"] and d["alarm"]
    assert abs(d["edge_risk"] - 0.73) < 0.01 and d["tank_pct"] == 41.5


def test_risk_is_low_at_baseline_and_high_for_sewage_signature():
    base = C.STATIONS[2]["base"]
    assert surrogate_risk(base, base)[0] < 0.05
    sewage = dict(base, turbidity=base["turbidity"] + 15, orp=base["orp"] - 220, tds=base["tds"] + 60)
    assert surrogate_risk(sewage, base)[0] >= C.RISK_TRIP


def test_rearm_interlock_refuses_while_contaminated():
    st = C.STATIONS[2]
    node = EdgeNode(st, st["base"])
    node.command(0x01)
    bad = dict(st["base"], turbidity=40, orp=150)
    ok, msg = node.command(0x03, r=bad)
    assert not ok and "Interlock" in msg
    ok, _ = node.command(0x04, r=bad)                       # FORCE_REARM bypasses
    assert ok and node.valve_open


# ---------------------------------------------------------------- twin
def test_septic_forecast_warns_kiosk_before_arrival():
    p = Platform(store=False)
    p.scenario("SEPTIC")
    run(p, 120)
    adv = first_event(p, "FORECAST_ADVISORY", "KS-03")
    hit = first_event(p, "ANOMALY", "KS-03")
    assert adv and hit, "expected an advisory and the observed anomaly at KS-03"
    assert hit["t"] - adv["t"] >= 10 * 60, "advisory should lead the plume by >= 10 min"
    assert not p.twin.stations["KS-03"].valve_open, "intake should have been closed pre-emptively"


def test_transit_calibration_learns_slower_creek():
    p = Platform(store=False)
    p.scenario("SEPTIC")
    run(p, 480)                                            # long enough to cross every reach
    assert len(p.twin.calibration) >= 2, p.twin.calibration   # creek pairs only; the well lags the creek
    factors = [r["velocity_factor"] for r in p.twin.reaches()[1:]]
    assert all(f < 1.0 for f in factors), factors        # true creek is rougher than textbook
    assert len({c["reach"] for c in p.twin.calibration}) == len(p.twin.calibration)   # one per pulse


def test_biofouling_never_closes_the_kiosk():
    p = Platform(store=False)
    p.scenario("BIOFOULING")
    run(p, 200)
    ks = p.twin.stations["KS-03"]
    assert ks.classification == "SENSOR_BIOFOULING"
    assert ks.valve_open
    assert not first_event(p, "EDGE_AUTO_TRIP", "KS-03")
    p.send_command("KS-03", "CLEANED", actor="test")
    run(p, 30)
    assert p.twin.stations["KS-03"].reading["turbidity"] < 5


def test_closed_intake_escalates_before_tank_runs_dry():
    p = Platform(store=False)
    p.scenario("SEPTIC")
    run(p, 420)                                            # nobody re-arms KS-03
    ev = first_event(p, "RESERVE_LOW", "KS-03")
    assert ev and "re-arm" in ev["message"].lower()
    assert ev.get("sms")                                   # escalated by SMS


def test_monsoon_does_not_miscalibrate():
    p = Platform(store=False)
    p.scenario("MONSOON")
    run(p, 200)
    assert all(r["velocity_factor"] == 1.0 for r in p.twin.reaches())


# ---------------------------------------------------------------- api
def test_api_ingest_paths():
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.ingest import DEV_EUI
    c = TestClient(app)
    payload = encode_uplink(dict(turbidity=3.1, orp=402, ph=7.3, tds=171, temp=24.5), "NORMAL", True, False, 4010, 0.02, 88)
    r = c.post("/api/ingest/chirpstack", json=dict(
        deviceInfo=dict(devEui=DEV_EUI["KS-03"]), data=base64.b64encode(payload).decode(),
        rxInfo=[dict(rssi=-97, snr=5.5)], fCnt=12))
    assert r.status_code == 200, r.text
    r = c.post("/api/ingest/ttn", json=dict(end_device_ids=dict(dev_eui=DEV_EUI["MB-04"]),
                                            uplink_message=dict(frm_payload=base64.b64encode(payload).decode())))
    assert r.status_code == 200, r.text
    r = c.post("/api/ingest/reading", json=dict(station_id="AG-02", turbidity_ntu=2.5, orp_mv=399, ph=7.3, tds_ppm=166))
    assert r.status_code == 200, r.text
    assert c.post("/api/ingest/rainfall", json=dict(rain_mm_15min=2.5)).status_code == 200
    assert c.post("/api/ingest/reading", json=dict(station_id="AG-02", ph=7)).status_code == 400
    s = c.get("/api/state").json()
    assert len(s["stations"]) == 5
    assert c.get("/api/heatmap").status_code == 200
    assert c.get("/api/static").json()["catchment"]["area_km2"] > 15


# ------------------------------------------------------------ maintenance & advisory
def test_biofouling_creates_urgent_cleaning_task_and_completing_it_cleans_the_probe():
    p = Platform(store=False)
    p.scenario("BIOFOULING")
    run(p, 200)
    urgent = [t for t in p.schedule.view(p.epoch() * 1000)
              if t["station"] == "KS-03" and t["kind"] == "LENS_CLEAN" and t["urgent"] and t["status"] != "COMPLETED"]
    assert urgent, "twin should pull a lens cleaning forward"
    task, nxt = p.complete_task(urgent[0]["id"], by="test")
    assert task["done_ms"] and nxt and nxt["due_ms"] > task["done_ms"]
    run(p, 30)
    assert p.twin.stations["KS-03"].reading["turbidity"] < 5


def test_advisory_targets_affected_points_and_reports_none_when_quiet():
    p = Platform(store=False)
    with pytest.raises(ValueError):
        p.send_advisory()
    sent = p.send_advisory(["KS-03", "RH-05"])
    assert {s["station"] for s in sent} == {"KS-03", "RH-05"}
    assert len(p.notifier.outbox) == 2
    assert p.trend(6, 30)



# ------------------------------------------------------------ concept-paper features
def test_biological_indicator_drives_risk():
    base = C.STATIONS[2]["base"]
    sewage_bio_only = dict(base, bio=base["bio"] + 15)
    assert surrogate_risk(sewage_bio_only, base)[0] > 0.6
    assert surrogate_risk(dict(base, bio=None), base)[0] < 0.05          # node without the sensor


def test_shallow_well_sees_a_delayed_filtered_plume():
    p = Platform(store=False)
    p.scenario("SEPTIC")
    peak = {}
    for m in range(360):
        p.tick(60)
        for sid in ("KS-03", "MB-04"):
            b = p.twin.stations[sid].reading["bio"] - p.twin.stations[sid].baseline["bio"]
            if b > peak.get(sid, (0, 0))[0]:
                peak[sid] = (b, m)
    assert peak["MB-04"][0] < peak["KS-03"][0]                          # attenuated by the aquifer
    assert peak["MB-04"][1] > peak["KS-03"][1]                          # and later


def test_heatmap_indices_and_pipelines():
    p = Platform(store=False)
    for idx in ("risk", "turbidity", "ph", "tds", "bio"):
        g = p.twin.risk_grid(idx)
        assert g["index"] == idx and g["data"]
    with pytest.raises(ValueError):
        p.twin.risk_grid("nope")
    pipes = p.pipe_state()
    assert {x["id"] for x in pipes} == {"GL-1", "DM-2"}
    assert all(x["flowing"] and 0 < x["velocity_mps"] < 5 for x in pipes)
    gl = next(x for x in pipes if x["id"] == "GL-1")
    assert gl["flow_lps"] <= 6.0                                        # limited by the spring yield


def test_forecast_is_a_pure_json_function():
    import json
    from backend.twin import compute_forecast
    p = Platform(store=False)
    snap = json.loads(json.dumps(p.twin.forecast_input()))              # what a Celery worker receives
    series = compute_forecast(snap)
    assert set(series) == set(p.twin.stations)
    assert len(series["RH-05"]) == 48 and len(series["RH-05"][0]) == 5


# ------------------------------------------------------------ real node + sensor plans
def test_real_node_takes_over_and_receives_commands():
    p = Platform(store=False)
    for _ in range(3):
        p.ingest_node(dict(station_id="KS-03", turbidity=4.0, tds=170, temp=25, edge_state="NORMAL", valve_open=True))
        p.tick(60)
    st = p.twin.stations["KS-03"]
    assert st.reading["turbidity"] == 4.0                                # simulator no longer overwrites it
    assert set(st.meta["estimated"]) == {"orp", "ph"}                    # honest about missing probes
    assert "KS-03" in p.state()["live_nodes"]
    ok, msg = p.send_command("KS-03", "SHUT", actor="test")
    assert ok and "real node" in msg
    assert p.ingest_node(dict(station_id="KS-03", turbidity=4.0))["commands"] == [dict(cmd="SHUT", arg=0)]
    assert p.ingest_node(dict(station_id="KS-03", turbidity=4.0))["commands"] == []
    p.ingest_node(dict(station_id="KS-03", turbidity=60.0, edge_state="TRIPPED", valve_open=False))
    assert first_event(p, "EDGE_AUTO_TRIP", "KS-03")
    p.node_seen["KS-03"] = 0                                             # node goes quiet
    p.tick(60)
    assert "KS-03" not in p.node_seen and first_event(p, "NODE_OFFLINE", "KS-03")


def test_sentinel_bio_signal_reaches_low_cost_sites_in_the_forecast():
    p = Platform(store=False)
    p.world.bio_stations = {"AG-02"}
    run(p, 20)
    p.scenario("SEPTIC")
    run(p, 45)
    assert p.twin.stations["KS-03"].reading["bio"] is None               # no sensor at the kiosk
    fc = p.twin.forecast["stations"]["KS-03"]
    assert max(x["bio_excess"] for x in fc["series"]) > 1                # but the forecast still sees it coming


def test_reset_restores_the_demo():
    p = Platform(store=False)
    p.scenario("SEPTIC")
    run(p, 120)
    p.scenario("RESET")
    run(p, 10)
    assert all(n["edge"].valve_open for n in p.world.nodes.values())
    assert p.world.nodes["KS-03"]["tank_l"] > 0.8 * C.STATIONS[2]["tank"]["capacity_l"]


def test_flood_layer_is_low_ground_beside_the_river():
    p = Platform(store=False)
    g = np.frombuffer(base64.b64decode(p.twin.risk_grid("flood")["data"]), np.uint8)
    inside = g[g > 0]
    assert inside.size and inside.max() > 100          # some ground is flagged
    assert np.mean(inside > 100) < 0.5                 # but not the whole catchment
    with pytest.raises(ValueError):
        p.twin.risk_grid("nonsense")
