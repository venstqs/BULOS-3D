"""
Edge-node logic shared by the virtual field nodes and the twin.

This is a line-for-line port of firmware/bulos_edge_node/bulos_edge_node.ino:
  * surrogate_risk()       biological-contamination risk from physicochemical surrogates
  * wqhi()                 Water Quality Health Index 0-100 (PNSDW-referenced)
  * drift_check()          slow optical biofouling vs. real event (on-device, 60 min window)
  * EdgeNode               autonomous valve state machine with persistence + interlock
  * encode/decode_uplink   18-byte LoRaWAN payload, downlink command codes
"""
from __future__ import annotations

import math
import struct
from collections import deque

from .config import PERSISTENCE_S, RISK_SUSPECT, RISK_TRIP

STATES = ["NORMAL", "SUSPECT", "TRIPPED", "MAINTENANCE", "REMOTE_SHUT", "PREEMPTIVE_SHUT"]
CLOSED_STATES = {"TRIPPED", "REMOTE_SHUT", "PREEMPTIVE_SHUT"}

CMD = dict(SHUT=0x01, PREEMPT_SHUT=0x02, REARM=0x03, FORCE_REARM=0x04, CLEANED=0x05, RAIN=0x06)
CMD_NAME = {v: k for k, v in CMD.items()}


def _clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


# --------------------------------------------------------------------- risk
def risk_components(r, base, rain_mm_hr=0.0, use_turbidity=True):
    bio, bio0 = r.get("bio"), base.get("bio")
    return dict(
        turbidity=_clamp((r["turbidity"] - base["turbidity"]) / 20.0) if use_turbidity else 0.0,
        orp=_clamp((base["orp"] - r["orp"]) / 200.0),
        ph=_clamp((abs(r["ph"] - base["ph"]) - 0.2) / 0.8),
        tds=_clamp((r["tds"] - base["tds"]) / 200.0),
        rain=_clamp(rain_mm_hr / 40.0),
        bio=0.0 if bio is None or bio0 is None else _clamp((bio - bio0) / 15.0),
    )


# bio (tryptophan-like fluorescence) is the most direct faecal evidence, so it weighs most
WEIGHTS = dict(turbidity=0.55, orp=0.60, ph=0.25, tds=0.30, rain=0.20, bio=0.70)


def surrogate_risk(r, base, rain_mm_hr=0.0, use_turbidity=True):
    """
    Noisy-OR of weighted surrogate evidence, plus a faecal-signature bonus when
    particles AND reducing conditions appear together (turbidity up, ORP down).
    0 = no evidence, 1 = overwhelming evidence. Heuristic, not a calibrated probability.
    """
    k = {n: float(v) for n, v in risk_components(r, base, rain_mm_hr, use_turbidity).items()}
    p_clean = 1.0
    for name, x in k.items():
        p_clean *= 1.0 - WEIGHTS[name] * x
    faecal = max(min(k["turbidity"], k["orp"]), min(k["bio"], max(k["turbidity"], k["orp"])))
    return round(_clamp(1.0 - p_clean + 0.30 * faecal), 3), k


def risk_band(risk):
    if risk >= RISK_TRIP:
        return "SEVERE"
    if risk >= RISK_SUSPECT:
        return "HIGH"
    if risk >= 0.25:
        return "MODERATE"
    return "LOW"


# --------------------------------------------------------------------- WQHI
def wqhi(r):
    """Weighted geometric mean of parameter sub-scores (100 = excellent)."""
    t = r["turbidity"]
    s_turb = 100.0 if t <= 1 else max(0.0, 100.0 - 58.9 * math.log10(t))      # 5 NTU -> 59, 50 -> 0
    s_orp = 100.0 * _clamp((r["orp"] - 100.0) / 300.0)                         # 400 mV -> 100
    dev = abs(r["ph"] - 7.5)
    s_ph = 100.0 * _clamp(1.0 - max(0.0, dev - 0.5) / 1.5)                      # 6.5-8.5 -> >=67
    s_tds = 100.0 * _clamp(1.0 - max(0.0, r["tds"] - 300.0) / 700.0)           # 1000 mg/L -> 0
    parts = dict(turbidity=s_turb, orp=s_orp, ph=s_ph, tds=s_tds)
    w = dict(turbidity=0.35, orp=0.30, ph=0.15, tds=0.20)
    if r.get("bio") is not None:                                                # biological indicator
        parts["bio"] = 100.0 * _clamp(1.0 - max(0.0, r["bio"] - 2.0) / 30.0)       # 32 ppb TLF -> 0
        w = dict(turbidity=0.28, orp=0.22, ph=0.12, tds=0.13, bio=0.25)
    score = math.exp(sum(w[k] * math.log(max(v, 1.0)) for k, v in parts.items()))
    score = int(round(score))
    cat = "GOOD" if score >= 80 else "FAIR" if score >= 60 else "POOR" if score >= 40 else "UNSAFE"
    return dict(score=score, category=cat, parts={k: round(v) for k, v in parts.items()})


# ------------------------------------------------------------- drift check
def linfit(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return 0.0, 0.0
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx
    r2 = 0.0 if syy == 0 else (sxy * sxy) / (sxx * syy)
    return slope, r2


def drift_check(window, base, rain_mm_hr):
    """
    window: list of (t_s, turbidity, orp, tds) over >= 45 minutes.
    Biofouling builds a film on the optical window: turbidity creeps up
    slowly and linearly while ORP and conductivity, which use different
    sensing principles, stay flat, and it is not raining.
    """
    if len(window) < 8 or window[-1][0] - window[0][0] < 45 * 60:
        return False, None
    xs = [(p[0] - window[0][0]) / 60.0 for p in window]
    turb = [p[1] for p in window]
    slope, r2 = linfit(xs, turb)
    excess = turb[-1] - base["turbidity"]
    orp_dev = max(abs(p[2] - base["orp"]) for p in window)
    tds_dev = max(abs(p[3] - base["tds"]) for p in window)
    is_drift = (excess > 3.0 and 0.005 < slope < 0.3 and r2 > 0.8
                and orp_dev < 40.0 and tds_dev < 25.0 and rain_mm_hr < 2.0)
    return is_drift, dict(slope_ntu_per_min=round(slope, 4), r2=round(r2, 3),
                          orp_dev=round(orp_dev, 1), tds_dev=round(tds_dev, 1))


# -------------------------------------------------------------- edge node
class EdgeNode:
    """Autonomous valve controller. Runs with no cloud connection."""

    def __init__(self, station, base):
        self.station = station
        self.base = dict(base)                 # learned at commissioning
        self.has_valve = bool(station.get("valve"))
        self.state = "NORMAL"
        self.timer = 0.0
        self.rain = 0.0                        # last DOST rainfall broadcast (downlink)
        self.window = deque(maxlen=60)         # 1 sample/min, 60 min
        self.risk = 0.0
        self.log = []                          # (kind, message) consumed by the caller

    @property
    def valve_open(self):
        return self.state not in CLOSED_STATES

    def _emit(self, kind, msg):
        self.log.append((kind, msg))

    def step(self, t, r, dt):
        self.window.append((t, r["turbidity"], r["orp"], r["tds"]))
        drift, _ = drift_check(list(self.window), self.base, self.rain)
        use_turb = self.state != "MAINTENANCE" and not drift
        self.risk, _ = surrogate_risk(r, self.base, self.rain, use_turbidity=use_turb)
        full_risk, _ = surrogate_risk(r, self.base, self.rain)
        if not self.has_valve or self.state in CLOSED_STATES:
            return

        if drift and full_risk >= RISK_SUSPECT * 0.5:
            if self.state != "MAINTENANCE":
                self.state, self.timer = "MAINTENANCE", 0.0
                self._emit("MAINTENANCE", "Optical drift signature (slow linear turbidity rise, ORP/TDS flat, "
                                          "no rain). Valve kept OPEN; lens cleaning requested.")
            if self.risk < RISK_SUSPECT:
                return

        if self.risk < RISK_SUSPECT:
            if self.state == "SUSPECT":
                self._emit("CLEARED", "Risk back below suspect level; persistence timer reset.")
            if self.state != "MAINTENANCE":
                self.state, self.timer = "NORMAL", 0.0
            return

        if self.state != "SUSPECT":
            self.state, self.timer = "SUSPECT", 0.0
            self._emit("SUSPECT", f"Surrogate risk {self.risk:.2f}. Verifying persistence "
                                  f"for {int(PERSISTENCE_S)} s before isolating intake.")
            return
        self.timer += dt
        if self.risk >= RISK_TRIP and self.timer >= PERSISTENCE_S:
            self.state = "TRIPPED"
            self._emit("AUTO_TRIP", f"Edge auto-trip: risk {self.risk:.2f} for {int(self.timer)} s "
                                    f"(turbidity {r['turbidity']:.1f} NTU, ORP {r['orp']:.0f} mV). "
                                    "Solenoid de-energised, beacon RED, SMS via GSM module.")

    def command(self, cmd, arg=0, r=None):
        """Downlink handler. Returns (ok, message)."""
        name = CMD_NAME.get(cmd, "?")
        if name == "RAIN":
            self.rain = float(arg)
            return True, ""
        if name == "CLEANED":
            self.window.clear()
            if self.state == "MAINTENANCE":
                self.state = "NORMAL"
            return True, "Lens cleaned; drift window reset."
        if not self.has_valve:
            return False, "Node has no actuator."
        if name in ("SHUT", "PREEMPT_SHUT"):
            self.state, self.timer = ("REMOTE_SHUT" if name == "SHUT" else "PREEMPTIVE_SHUT"), 0.0
            return True, "Valve closed."
        if name in ("REARM", "FORCE_REARM"):
            if name == "REARM" and r is not None:
                risk, _ = surrogate_risk(r, self.base, self.rain,
                                         use_turbidity=not drift_check(list(self.window), self.base, self.rain)[0])
                if risk >= RISK_SUSPECT:
                    return False, f"Interlock: on-site risk {risk:.2f} still >= {RISK_SUSPECT}. Re-arm refused."
            self.state, self.timer = "NORMAL", 0.0
            return True, "Valve re-armed (open)." + (" Interlock BYPASSED." if name == "FORCE_REARM" else "")
        return False, "Unknown command."


# ------------------------------------------------------------------- codec
UPLINK_FMT_V1 = ">BHhHHhBBHBH"         # 18 bytes, big-endian (no biological channel)
UPLINK_FMT = UPLINK_FMT_V1 + "H"        # v2: + uint16 TLF ppb x10 (0xFFFF = no sensor) -> 20 bytes
UPLINK_LEN_V1 = struct.calcsize(UPLINK_FMT_V1)
UPLINK_LEN = struct.calcsize(UPLINK_FMT)


def encode_uplink(r, state, valve_open, alarm, battery_mv, risk, tank_pct):
    bio = r.get("bio")
    return struct.pack(
        UPLINK_FMT, 2,
        int(_clamp(r["turbidity"], 0, 6553) * 10), int(round(r["orp"])),
        int(_clamp(r["ph"], 0, 14) * 100), int(_clamp(r["tds"], 0, 65535)),
        int(round(r["temp"] * 100)), STATES.index(state),
        (1 if valve_open else 0) | (2 if alarm else 0),
        int(battery_mv), int(_clamp(risk) * 200),
        0xFFFF if tank_pct is None else int(_clamp(tank_pct, 0, 100) * 100),
        0xFFFF if bio is None else int(_clamp(bio, 0, 6500) * 10),
    )


def decode_uplink(b: bytes):
    if len(b) == UPLINK_LEN and b[0] == 2:
        v, turb, orp, ph, tds, temp, st, flags, batt, risk, tank, bio = struct.unpack(UPLINK_FMT, b)
    elif len(b) == UPLINK_LEN_V1 and b[0] == 1:
        (v, turb, orp, ph, tds, temp, st, flags, batt, risk, tank), bio = struct.unpack(UPLINK_FMT_V1, b), 0xFFFF
    else:
        raise ValueError(f"payload must be v1 ({UPLINK_LEN_V1} bytes) or v2 ({UPLINK_LEN} bytes), got {len(b)} bytes")
    return dict(
        bio=None if bio == 0xFFFF else bio / 10,
        turbidity=turb / 10, orp=float(orp), ph=ph / 100, tds=float(tds), temp=temp / 100,
        edge_state=STATES[st] if st < len(STATES) else "NORMAL",
        valve_open=bool(flags & 1), alarm=bool(flags & 2), battery_v=batt / 1000,
        edge_risk=risk / 200, tank_pct=None if tank == 0xFFFF else tank / 100,
    )
