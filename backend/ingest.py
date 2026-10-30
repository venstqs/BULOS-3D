"""
Adapters from field networks to the twin's common reading format.

  ChirpStack v4  HTTP integration "up" event        POST /api/ingest/chirpstack
  TTN / TTS v3   webhook uplink_message              POST /api/ingest/ttn
  Generic JSON   any LGU / DOST API or script        POST /api/ingest/reading
  Rain gauge     DOST-ASTI ARG or LGU gauge          POST /api/ingest/rainfall
  MQTT           ChirpStack MQTT integration          backend/mqtt_bridge.py

Existing government sensors that do not run Bulos firmware send only the
water-quality fields; edge_state / valve fields are then simply absent.
"""
from __future__ import annotations

import base64

from .edge import decode_uplink

# DevEUI registry (LoRaWAN device -> station). Extend when commissioning nodes.
DEVICES = {
    "70B3D57ED0050001": "IN-01",
    "70B3D57ED0050002": "AG-02",
    "70B3D57ED0050003": "KS-03",
    "70B3D57ED0050004": "MB-04",
    "70B3D57ED0050005": "RH-05",
}
DEV_EUI = {v: k for k, v in DEVICES.items()}

FIELD_ALIASES = {
    "turbidity": ("turbidity", "turbidity_ntu", "turb", "turb_ntu"),
    "orp": ("orp", "orp_mv", "redox"),
    "ph": ("ph", "pH"),
    "tds": ("tds", "tds_ppm", "tds_mgl"),
    "temp": ("temp", "temp_c", "water_temp", "temperature"),
    "bio": ("bio", "tlf", "tlf_ppb", "bio_ppb"),       # optional biological indicator
}


def normalise(d):
    """Pick known fields from any JSON shape. Missing optional fields are tolerated."""
    out = {}
    for key, names in FIELD_ALIASES.items():
        for n in names:
            if n in d and d[n] is not None:
                out[key] = float(d[n])
                break
    missing = {"turbidity", "orp", "ph", "tds"} - out.keys()
    if missing:
        raise ValueError(f"missing fields: {sorted(missing)}")
    out.setdefault("temp", 25.0)
    out.setdefault("bio", None)
    return out


def _meta_from_decoded(dec):
    return {k: dec[k] for k in ("edge_state", "valve_open", "alarm", "battery_v", "edge_risk", "tank_pct")
            if k in dec}


def from_chirpstack(body):
    dev = body["deviceInfo"]["devEui"].upper()
    sid = DEVICES.get(dev)
    if not sid:
        raise KeyError(f"unregistered devEui {dev}")
    dec = decode_uplink(base64.b64decode(body["data"]))
    rx = (body.get("rxInfo") or [{}])[0]
    meta = dict(_meta_from_decoded(dec), rssi=rx.get("rssi"), snr=rx.get("snr"),
                f_cnt=body.get("fCnt"), source="chirpstack")
    return sid, normalise(dec), meta


def from_ttn(body):
    dev = body["end_device_ids"]["dev_eui"].upper()
    sid = DEVICES.get(dev)
    if not sid:
        raise KeyError(f"unregistered dev_eui {dev}")
    up = body["uplink_message"]
    dec = up.get("decoded_payload") or decode_uplink(base64.b64decode(up["frm_payload"]))
    rx = (up.get("rx_metadata") or [{}])[0]
    meta = dict(_meta_from_decoded(dec), rssi=rx.get("rssi"), snr=rx.get("snr"),
                f_cnt=up.get("f_cnt"), source="ttn")
    return sid, normalise(dec), meta


def from_generic(body):
    sid = body["station_id"]
    meta = {k: body[k] for k in ("edge_state", "valve_open", "tank_pct", "battery_v") if k in body}
    meta["source"] = body.get("source", "api")
    return sid, normalise(body), meta


def rain_from_body(body):
    """Accepts mm/hr directly, or a DOST-ASTI-style 15-minute accumulation."""
    if "rain_mm_hr" in body:
        return float(body["rain_mm_hr"])
    if "rain_mm_15min" in body:
        return float(body["rain_mm_15min"]) * 4
    raise ValueError("rain_mm_hr or rain_mm_15min required")
