"""
Wires field -> ingest -> twin -> storage / SMS / downlinks.

sim  mode: the virtual field (world.py) produces LoRaWAN uplinks every tick and
           executes downlinks, so every byte goes through the real codec.
live mode: uplinks arrive through /api/ingest/* or MQTT; downlinks are queued
           for the network server (MQTT publish when the bridge is running).
"""
from __future__ import annotations

import base64
import os
import time
from collections import deque

from . import config as C
from .edge import CMD, decode_uplink
from .hydraulics import hazen_williams_q, pipe_route
from .hydrology import Terrain
from .ingest import DEV_EUI, normalise
from .notify import Notifier
from .maintenance import KINDS, Schedule
from .edge import risk_band
from .storage import Store
from .twin import Twin
from .world import SCENARIOS, World

WARMUP_H = 6


class Platform:
    def __init__(self, mode=C.DATA_SOURCE, store=True):
        self.mode = mode
        self.speed = C.SIM_SPEED
        self.terrain = Terrain()
        head = self.terrain.rc(*C.MAIN_STEM_HEAD)
        self.stem = self.terrain.trace(*head)
        self.profile = self.terrain.path_profile(self.stem)
        self.events = deque(maxlen=300)
        self.notifier = Notifier()
        self.store = Store() if store else None
        self.downlink_queue = deque(maxlen=100)
        self.mqtt = None                                 # set by mqtt_bridge when running
        self.twin = Twin(self.terrain, self.profile, self._emit, self._twin_command)
        self.forecast_engine = "in-process"
        if os.getenv("BULOS_CELERY") == "1":
            try:
                from .tasks import forecast_task
                self.twin.forecast_runner = lambda snap: forecast_task.delay(snap)
                self.forecast_engine = "Celery worker"
            except Exception as e:                    # celery/redis missing: keep running in-process
                print("Celery unavailable, forecasting in-process:", e)
        self.world = World(self.profile) if mode == "sim" else None
        self.t = 0.0
        self.epoch0 = time.time()
        self._static = None
        self.schedule = None
        self.node_seen = {}                              # real hardware: station id -> last check-in
        self.node_commands = {}                          # pending commands for real nodes
        if self.world:
            self._warmup()
        self.schedule = Schedule(C.STATIONS, self.epoch() * 1000)
        self.pipes = self._build_pipes()

    # ------------------------------------------------------------- clock
    def epoch(self, t=None):
        return self.epoch0 + (self.t if t is None else t)

    def _warmup(self):
        """Run the field for a few quiet hours so baselines and history exist at start-up."""
        store, self.store = self.store, None
        n = int(WARMUP_H * 3600 / 60)
        self.twin._last_forecast = 1e18                  # skip forecasts during warm-up
        for _ in range(n):
            self.tick(60.0)
        self.twin._last_forecast = -1e9
        self.store = store
        self.events.clear()
        self.epoch0 = time.time() - self.t
        self._emit(dict(t=self.t, station=None, type="SYSTEM", severity="info",
                        message=f"Bulos 3D twin online ({self.mode} mode). Main stem "
                                f"{self.profile[-1]['s'] / 1000:.1f} km, {len(self.twin.stations)} nodes, "
                                f"DEM: {self.terrain.source.split(',')[0]}."))

    def tick(self, dt=None):
        dt = dt or self.speed * C.TICK_REAL_S
        self.t += dt
        if self.world:
            self.world.step(dt)
            g = self.world.rain_gauge()
            self.ingest_rain(g["gauge_id"], g["rain_mm_hr"])
            for sid in self.world.nodes:                 # DOST rainfall broadcast to edge nodes
                self.world.downlink(sid, CMD["RAIN"], g["rain_mm_hr"])
            self._expire_nodes()
            for up in self.world.uplinks():
                if up["station_id"] in self.node_seen:   # a real node owns this water point
                    continue
                dec = decode_uplink(up["payload"])
                meta = dict(edge_state=dec["edge_state"], valve_open=dec["valve_open"], tank_pct=dec["tank_pct"],
                            battery_v=dec["battery_v"], rssi=up["rssi"], snr=up["snr"], f_cnt=up["f_cnt"],
                            edge_log=up["edge_log"], source=f"LoRaWAN {DEV_EUI[up['station_id']]}")
                self.ingest_reading(up["station_id"], normalise(dec), meta)
        self.twin.step(self.t, dt)
        if self.store:
            self.store.flush()

    # ------------------------------------------------------------ ingest
    def ingest_reading(self, sid, reading, meta):
        if sid not in self.twin.stations:
            raise KeyError(f"unknown station {sid}")
        self.twin.ingest_reading(sid, self.t, reading, meta)
        if self.store:
            self.store.add_reading(self.epoch(), sid, reading,
                                   self.twin.station_view(self.twin.stations[sid]), meta.get("source", "api"))

    # ----------------------------------------------------- real field nodes
    NODE_TIMEOUT_S = 45
    EDGE_KIND = {"TRIPPED": "AUTO_TRIP", "SUSPECT": "SUSPECT", "MAINTENANCE": "MAINTENANCE"}

    def _reset_station(self, st):
        """Forget learned history when a water point changes between simulated and real."""
        st.hist.clear()
        st.baseline, st.reading, st.classification = None, None, "NORMAL"
        st.flags.clear()

    def _expire_nodes(self):
        for sid, seen in list(self.node_seen.items()):
            if time.time() - seen > self.NODE_TIMEOUT_S:
                del self.node_seen[sid]
                self.node_commands.pop(sid, None)
                st = self.twin.stations[sid]
                self._reset_station(st)
                self._emit(dict(t=self.t, station=sid, type="NODE_OFFLINE", severity="warning",
                                message=f"Real sensor node {sid} stopped reporting; back to simulated data."))

    def ingest_node(self, body):
        """
        Check-in from a real Wi-Fi node (firmware/bulos_bench_node). It can take over one water
        point while the others stay simulated. Sensors it does not carry are filled with the
        station baseline and listed as `estimated`, so they add no evidence and the UI can say so.
        Returns pending valve commands plus the DOST rainfall value for the node's risk score.
        """
        sid = body["station_id"]
        if sid not in self.twin.stations:
            raise KeyError(f"unknown station {sid}")
        st = self.twin.stations[sid]
        if sid not in self.node_seen:
            self._reset_station(st)
            self._emit(dict(t=self.t, station=sid, type="NODE_ONLINE", severity="info",
                            message=f"Real sensor node connected at {sid}. Live readings replace the simulation here."))
        self.node_seen[sid] = time.time()
        base = st.baseline or st.cfg["base"]
        reading, estimated = {}, []
        for k in ("turbidity", "orp", "ph", "tds", "temp"):
            if body.get(k) is None:
                reading[k] = base[k]
                estimated.append(k)
            else:
                reading[k] = float(body[k])
        reading["bio"] = None if body.get("bio") is None else float(body["bio"])
        state = body.get("edge_state", st.edge_state)
        log = []
        if state != st.edge_state and state in self.EDGE_KIND:
            log.append((self.EDGE_KIND[state], f"Real node reported {state.replace('_', ' ').lower()} "
                                               f"(turbidity {reading['turbidity']:.1f} NTU)."))
        meta = dict(edge_state=state, valve_open=bool(body.get("valve_open", True)), estimated=estimated,
                    source="Wi-Fi bench node (real sensor)", edge_log=log,
                    rssi=body.get("rssi"), battery_v=body.get("battery_v"))
        if body.get("tank_pct") is not None:
            meta["tank_pct"] = float(body["tank_pct"])
        self.ingest_reading(sid, reading, meta)
        pending = list(self.node_commands.pop(sid, []))
        return dict(ok=True, commands=pending, rain_mm_hr=self.twin.rain)

    def ingest_rain(self, gauge, mm_hr):
        self.twin.ingest_rain(self.t, mm_hr)
        if self.store:
            self.store.add_rain(self.epoch(), gauge, mm_hr)

    # ------------------------------------------------------ events / SMS
    def _emit(self, ev, actor="twin"):
        ev = dict(ev, t_ms=int(self.epoch(ev["t"]) * 1000))
        if ev.get("sms_to"):
            ev["sms"] = self.notifier.send(ev["sms_to"], ev["message"])["status"]
        self.events.appendleft(ev)
        if ev["type"] == "BIOFOULING" and self.schedule:
            self.schedule.urgent_lens_clean(ev["station"], ev["t_ms"])
        if self.store:
            self.store.add_event(self.epoch(ev["t"]), ev, actor)
            if ev["type"] == "TRANSIT_CALIBRATION":
                self.store.add_calibration(self.epoch(ev["t"]), ev["station"], "TRANSIT", ev["message"])

    # ---------------------------------------------------------- commands
    def _twin_command(self, sid, name, why):
        self.send_command(sid, name, actor="Bulos twin (auto)", reason=why)

    def send_command(self, sid, name, actor="operator", reason="", arg=0):
        if sid not in self.twin.stations:
            raise KeyError(sid)
        if sid in self.node_seen:
            self.node_commands.setdefault(sid, []).append(dict(cmd=name, arg=arg))
            ok, msg = True, "Sent to the real node; it acts at its next check-in (a few seconds)."
        elif self.world:
            ok, msg = self.world.downlink(sid, CMD[name], arg)
        else:
            frame = dict(devEui=DEV_EUI[sid], fPort=10, confirmed=True,
                         data=base64.b64encode(bytes([CMD[name], int(arg) & 0xFF])).decode())
            self.downlink_queue.append(dict(t=self.t, station_id=sid, command=name, frame=frame))
            if self.mqtt:
                self.mqtt.publish_downlink(frame)
            ok, msg = True, "Downlink queued for the network server (node ACK pending)."
        sev = "warning" if name in ("SHUT", "PREEMPT_SHUT", "FORCE_REARM") else "info"
        self._emit(dict(t=self.t, station=sid, type=f"CMD_{name}" if ok else f"CMD_{name}_REFUSED",
                        severity=sev if ok else "danger",
                        message=f"{actor}: {name.replace('_', ' ').lower()}. {reason} {msg}".strip(),
                        sms_to=self.twin.stations[sid].cfg["sms"] if (ok and name == "PREEMPT_SHUT") else None),
                   actor=actor)
        if ok and name == "CLEANED" and self.store:
            self.store.add_calibration(self.epoch(), sid, "LENS_CLEAN", f"by {actor}")
        return ok, msg

    def scenario(self, name):
        if not self.world:
            raise ValueError("Scenarios are only available in sim mode.")
        self.world.trigger(name)
        if name == "RESET":
            self.twin.clear_model()
        self._emit(dict(t=self.t, station=None, type="SCENARIO", severity="info",
                        message=f"Field scenario injected: {SCENARIOS[name]}"), actor="demo")

    # -------------------------------------------------------- maintenance
    def add_task(self, sid, kind, due_ms, title=None, by="operator"):
        if sid not in self.twin.stations:
            raise KeyError(sid)
        t = self.schedule.add(sid, kind, due_ms, title, by=by)
        self._emit(dict(t=self.t, station=sid, type="TASK_ADDED", severity="info",
                        message=f"{by} scheduled: {t['title']}."), actor=by)
        return t

    def complete_task(self, task_id, by="field technician", note=""):
        task, nxt = self.schedule.complete(task_id, self.epoch() * 1000, by)
        msg = f"{by} completed: {task['title']}." + (f" {note}" if note else "")
        if task["kind"] == "LENS_CLEAN":
            self.send_command(task["station"], "CLEANED", actor=by, reason="Turbidity probe cleaned.")
        self._emit(dict(t=self.t, station=task["station"], type="TASK_DONE", severity="info", message=msg), actor=by)
        return task, nxt

    # ---------------------------------------------------------- advisory
    def send_advisory(self, station_ids=None, message=None, by="operator"):
        """SMS advisory to the contact role of each listed (or each affected) water point."""
        tw = self.twin
        fc = tw.forecast.get("stations", {})
        if not station_ids:
            station_ids = [sid for sid, st in tw.stations.items()
                           if st.risk >= C.RISK_SUSPECT or (fc.get(sid, {}).get("arrival_s") or 0) > 0]
        if not station_ids:
            raise ValueError("No water point is affected right now. Pick a water point to send an advisory anyway.")
        sent = []
        for sid in station_ids:
            st = tw.stations[sid]
            if not st.cfg["sms"]:
                continue
            arr = fc.get(sid, {}).get("arrival_s")
            text = message or (
                f"Water advisory for {st.cfg['name']}: "
                + (f"contaminated water expected in about {int(arr // 60)} min. " if arr else "contamination detected. ")
                + "Do not drink untreated water; boil water for at least 1 minute.")
            rec = self.notifier.send(st.cfg["sms"], text)
            sent.append(dict(station=sid, role=st.cfg["sms"], status=rec["status"]))
            self._emit(dict(t=self.t, station=sid, type="ADVISORY_SENT", severity="warning",
                            message=f"{by} sent an SMS advisory to {st.cfg['sms']}: {text}"), actor=by)
        if not sent:
            raise ValueError("None of the selected water points has an SMS contact.")
        return sent

    # ---------------------------------------------------------- pipelines
    RESIDUAL_HEAD_M = 10.0                       # pressure kept at the delivery tap / tank inlet

    def _build_pipes(self):
        out = []
        for p in C.PIPES:
            a, b = self.twin.stations[p["src"]], self.twin.stations[p["dst"]]
            coords, length = pipe_route(self.terrain, (a.lat, a.lon), (b.lat, b.lon))
            head = a.elev + p.get("tank_head_m", 0.0) - b.elev - self.RESIDUAL_HEAD_M
            out.append(dict(p, coords=coords, length_m=round(length), static_head_m=round(head, 1)))
        return out

    def pipe_state(self):
        """Flow in each gravity line from DEM head + Hazen-Williams, gated by telemetry."""
        out = []
        for p in self.pipes:
            src = self.twin.stations[p["src"]]
            q = hazen_williams_q(p["length_m"], p["static_head_m"], p["diameter_m"], p["hw_c"])
            if p.get("source_yield_lps"):
                q = min(q, p["source_yield_lps"] / 1000)
            reason = "Flowing by gravity"
            if p.get("control"):
                ctl = self.twin.stations[p["control"]]
                if ctl.tank_pct is not None and ctl.tank_pct < 5:
                    q, reason = 0.0, "Stopped: source tank empty"
                elif not ctl.valve_open:
                    reason = "Serving stored water (pump off)"
            if p["static_head_m"] <= 0:
                q, reason = 0.0, "No gravity head"
            area = 3.14159 * p["diameter_m"] ** 2 / 4
            out.append(dict(id=p["id"], flow_lps=round(q * 1000, 2), velocity_mps=round(q / area, 2),
                            flowing=q > 0, status=reason, source_risk=src.risk, source_band=risk_band(src.risk)))
        return out

    def trend(self, hours=12, bucket_min=30):
        """Network-average and worst WQHI per time bucket."""
        t1 = self.t
        t0 = t1 - hours * 3600
        n = int(hours * 60 / bucket_min)
        sums = [[] for _ in range(n)]
        for st in self.twin.stations.values():
            for h in st.hist:
                if h["t"] >= t0:
                    k = min(n - 1, int((h["t"] - t0) / (bucket_min * 60)))
                    sums[k].append(h["wqhi"])
        out = []
        for k, vals in enumerate(sums):
            if vals:
                out.append(dict(t_ms=int(self.epoch(t0 + (k + 0.5) * bucket_min * 60) * 1000),
                                avg=round(sum(vals) / len(vals), 1), min=min(vals)))
        return out

    # ------------------------------------------------------------- views
    def static(self):
        """Terrain products, computed once."""
        if self._static is None:
            T = self.terrain
            ring = T.boundary_ring(self.twin.catchment)
            self._static = dict(
                site=dict(id=C.SITE_ID, title=C.SITE["title"], subtitle=C.SITE["subtitle"]),
                dem=dict(source=T.source, north=T.north, south=T.south, west=T.west, east=T.east,
                         nrows=T.nrows, ncols=T.ncols, cell_m=[round(T.dx, 1), round(T.dy, 1)],
                         min_m=float(T.elev.min()), max_m=float(T.elev.max())),
                catchment=dict(ring=ring, area_km2=round(float(self.twin.catchment.sum()) * T.cell_area / 1e6, 2)),
                streams=T.stream_network(mask=self.twin.catchment),
                main_stem=[[p["lon"], p["lat"], p["z"], p["s"]] for p in self.profile],
                rain_gauge=C.RAIN_GAUGE,
                pnsdw=C.PNSDW,
                thresholds=dict(suspect=C.RISK_SUSPECT, trip=C.RISK_TRIP, persistence_s=C.PERSISTENCE_S),
                scenarios=SCENARIOS if self.world else {},
                task_kinds=KINDS,
                pipes=[{k: p[k] for k in ("id", "name", "src", "dst", "coords", "length_m", "diameter_m", "material",
                                         "static_head_m", "note")} for p in self.pipes],
                heat_indices=list(self.twin.HEAT_INDICES),
                bio_alert_ppb=C.BIO_ALERT_PPB,
            )
        return self._static

    def state(self):
        tw = self.twin
        fc = tw.forecast
        return dict(
            clock=dict(t=self.t, epoch_ms=int(self.epoch() * 1000), speed=self.speed, mode=self.mode),
            rain_mm_hr=round(tw.rain, 1), runoff_mm_hr=round(tw.runoff_rain, 1),
            stations=[tw.station_view(s) for s in tw.stations.values()],
            forecast=dict(t=fc["t"], stations={k: {kk: vv for kk, vv in v.items() if kk != "series"}
                                               for k, v in fc["stations"].items()}),
            reaches=tw.reaches(),
            pipes=self.pipe_state(),
            calibration=tw.calibration[-20:],
            channel=tw.channel_state(),
            events=list(self.events)[:60],
            sms=list(self.notifier.outbox)[:20],
            sms_provider=self.notifier.provider,
            auto_preempt=tw.auto_preempt,
            forecast_engine=self.forecast_engine,
            live_nodes=sorted(self.node_seen),
            storage=None if not self.store else ("TimescaleDB" if self.store.timescale else self.store.dialect),
        )
