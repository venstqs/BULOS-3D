"""
Virtual field: the stand-in for real sensors while no hardware is deployed.

It owns the *true* physics (with a channel roughness the twin does not know),
rainfall, pollution sources, imperfect sensors (lag, noise, biofouling), the
edge nodes running the firmware logic, and the storage tanks. Its only output
is what a real deployment would produce: LoRaWAN uplinks and rain-gauge
readings, pushed through the same ingest path as live data. The twin never
reads this module's state directly.
"""
from __future__ import annotations

import random

import numpy as np

from . import config as C
from .edge import CMD, EdgeNode, encode_uplink
from .hydraulics import Channel, Transport

TRUE_MANNING_N = 0.058          # the real creek is rougher than the twin's textbook 0.040
RUNOFF_LAG_S = 25 * 60          # linear-reservoir catchment response
TSS, SEWAGE = 0, 1              # tracers: suspended sediment (mg/L), raw sewage fraction (%)
AQUIFER_LAG_S = 40 * 60         # creek -> riverbank well response time
AQUIFER_PASS = np.array([0.10, 0.55])   # fraction of sediment / sewage that reaches the well

SCENARIOS = {
    "MONSOON": "Monsoon cloudburst: 45 mm/hr for 1 h over the catchment (runoff + farm first-flush)",
    "SEPTIC": "Septic tank / piggery lagoon failure on the farm tributary (dry weather, 30 min release)",
    "BIOFOULING": "Biofilm growing on the KS-03 turbidity optics (sensor fault, water is clean)",
    "RESET": "Clear all events (dry season baseline)",
}


class World:
    def __init__(self, profile, stations=C.STATIONS):
        self.t = 0.0
        self.ch = Channel(profile, manning_n=TRUE_MANNING_N)
        self.tr = Transport(self.ch, 2, decay_per_s=[4e-5, 1e-5])
        self.rain = 0.0
        self.runoff_rain = 0.0
        self.hyetograph = []                     # (t_start, t_end, peak) events
        self.spills = []                         # (t_start, t_end, cell, rate)
        self.slope_factor = np.clip((self.ch.slope / 0.05) ** 0.5, 0.5, 2.0)
        farm = np.zeros(self.ch.n_cells)
        farm[max(0, C.FARM_CONFLUENCE_INDEX - 8):C.FARM_CONFLUENCE_INDEX + 9] = 1.0
        self.farm_cells = farm
        self.nodes = {}
        for st in stations:
            self.nodes[st["id"]] = dict(
                st=st, cell=st["stem_index"],
                sensor=dict(st["base"]), drift=0.0, drift_rate=0.0,
                edge=EdgeNode(st, st["base"]),
                tank_l=st["tank"]["capacity_l"] * 0.9 if st["tank"] else None,
                battery_mv=random.randint(3950, 4150), seq=0,
                aquifer=st["kind"] == "SOLAR_PUMP_WELL", aq=np.zeros(2),
            )

    # ---------------------------------------------------------- scenarios
    def trigger(self, name):
        if name == "MONSOON":
            self.hyetograph.append((self.t, self.t + 3600, 45.0))
        elif name == "SEPTIC":
            # Lagoon breach releasing raw effluent at ~12 % of the receiving stream's dry flow
            # (5 L/s on the small Makiling creek, ~30 L/s on the Naga River system).
            # Units: m3/s of effluent x 100 % strength -> (%·m3/s)
            cell = C.FARM_CONFLUENCE_INDEX
            self.spills.append((self.t, self.t + 1800, cell, 0.12 * float(self.ch.Q[cell]) * 100))
        elif name == "BIOFOULING":
            self.nodes["KS-03"]["drift_rate"] = 6.0 / 3600          # +6 NTU per hour
        elif name == "RESET":
            self.hyetograph.clear()
            self.spills.clear()
            for n in self.nodes.values():
                n["drift_rate"] = 0.0
                n["drift"] = 0.0
        else:
            raise ValueError(f"unknown scenario {name}")

    def _rain_now(self):
        r = 0.0
        for t0, t1, peak in self.hyetograph:
            if t0 <= self.t <= t1 + 1800:
                ramp = min(1.0, (self.t - t0) / 900)                  # 15 min build-up
                tail = 1.0 if self.t <= t1 else max(0.0, 1 - (self.t - t1) / 1800)
                r = max(r, peak * ramp * tail * (0.85 + 0.3 * random.random()))
        return r

    # --------------------------------------------------------------- tick
    def step(self, dt):
        self.t += dt
        self.rain = self._rain_now()
        self.runoff_rain += (self.rain - self.runoff_rain) * min(1.0, dt / RUNOFF_LAG_S)
        self.ch.update(self.runoff_rain)

        lateral = np.zeros_like(self.tr.c)
        lateral[TSS] = 14.0 * self.runoff_rain * self.slope_factor           # hillslope erosion
        lateral[SEWAGE] = 0.12 * self.runoff_rain * self.farm_cells           # manure first-flush
        point = np.zeros_like(self.tr.c)
        for t0, t1, cell, rate in self.spills:
            if t0 <= self.t <= t1:
                point[SEWAGE, cell] += rate
        self.tr.step(dt, lateral_conc=lateral, point_mass=point)

        for n in self.nodes.values():
            if n["aquifer"]:
                # riverbank filtration: well water follows the creek with a lag, sand filters most sediment
                creek = self.tr.c[:, n["cell"]] * AQUIFER_PASS
                n["aq"] += (creek - n["aq"]) * min(1.0, dt / AQUIFER_LAG_S)
            self._sense(n, dt)
            self._tank(n, dt)

    def _truth(self, n):
        b = n["st"]["base"]
        tss, sew = n["aq"] if n["aquifer"] else (self.tr.c[TSS, n["cell"]], self.tr.c[SEWAGE, n["cell"]])
        return dict(
            turbidity=b["turbidity"] + 0.55 * tss + 1.6 * sew,
            orp=b["orp"] - min(80.0, 0.12 * tss) - 380.0 * sew / (sew + 2.5),
            ph=b["ph"] - 0.0004 * tss - min(0.6, 0.06 * sew),
            tds=b["tds"] + 0.04 * tss + 6.5 * sew,
            temp=b["temp"] - 0.03 * self.runoff_rain + 0.02 * sew,
            bio=b["bio"] + 9.0 * sew + 0.015 * tss,          # tryptophan-like fluorescence, ppb
        )

    def _sense(self, n, dt):
        truth, s = self._truth(n), n["sensor"]
        a = min(1.0, dt / 90.0)                                   # probe response time ~90 s
        noise = dict(turbidity=0.03, orp=2.5, ph=0.012, tds=1.2, temp=0.03, bio=0.15)
        for k in s:
            s[k] += a * (truth[k] - s[k])
        n["drift"] = min(40.0, n["drift"] + n["drift_rate"] * dt)
        n["reading"] = dict(
            turbidity=max(0.05, s["turbidity"] * (1 + random.gauss(0, noise["turbidity"])) + n["drift"]),
            orp=s["orp"] + random.gauss(0, noise["orp"]),
            ph=s["ph"] + random.gauss(0, noise["ph"]),
            bio=max(0.0, s["bio"] + random.gauss(0, noise["bio"])),
            tds=max(0.0, s["tds"] + random.gauss(0, noise["tds"])),
            temp=s["temp"] + random.gauss(0, noise["temp"]),
        )
        e = n["edge"]
        e.step(self.t, n["reading"], dt)

    def _tank(self, n, dt):
        tank = n["st"]["tank"]
        if not tank:
            return
        demand = tank["demand_lps"] * dt
        refill = tank["demand_lps"] * 3.0 * dt if n["edge"].valve_open else 0.0
        n["tank_l"] = min(tank["capacity_l"] * 0.95, max(0.0, n["tank_l"] - demand + refill))

    # ---------------------------------------------------- field interfaces
    def uplinks(self, loss=0.02):
        """LoRaWAN uplinks for this tick (some get lost, as in the real world)."""
        out = []
        for sid, n in self.nodes.items():
            if random.random() < loss:
                continue
            e = n["edge"]
            tank = n["st"]["tank"]
            pct = None if not tank else 100.0 * n["tank_l"] / tank["capacity_l"]
            n["seq"] += 1
            out.append(dict(
                station_id=sid, f_cnt=n["seq"], rssi=random.randint(-112, -85) + (8 if sid == "MB-04" else 0),
                snr=round(random.uniform(-4, 9), 1),
                payload=encode_uplink(n["reading"], e.state, e.valve_open, e.state == "TRIPPED",
                                      n["battery_mv"], e.risk, pct),
                edge_log=self._drain(e),
            ))
        return out

    @staticmethod
    def _drain(e):
        log, e.log = e.log, []
        return log

    def rain_gauge(self):
        return dict(gauge_id=C.RAIN_GAUGE["id"], rain_mm_hr=round(self.rain, 1))

    def downlink(self, station_id, cmd, arg=0):
        """Network-server -> node. Returns (ok, message) as the node would ACK."""
        n = self.nodes[station_id]
        if cmd == CMD["CLEANED"]:
            n["drift"] = 0.0
            n["drift_rate"] = 0.0
        return n["edge"].command(cmd, arg, n["reading"] if "reading" in n else None)
