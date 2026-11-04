"""
The digital twin. It sees only what a real control room would see:
sensor packets (any source) and rainfall. From those it

  1. learns each station's clean baseline (robust median of quiet periods)
  2. scores surrogate biological-contamination risk + WQHI per station
  3. separates sensor biofouling from real events using cross-node evidence
  4. runs its own DEM channel model, assimilating observations at stations
  5. forecasts arrival windows at every downstream intake (4 h horizon)
  6. measures node-to-node pulse transit times and recalibrates velocities
  7. paints a spatial risk field over the catchment for the 3D heatmap
  8. raises advisories / pre-emptive shut-offs before the plume arrives
"""
from __future__ import annotations

import base64
import math
from collections import deque
from statistics import median

import numpy as np

from . import config as C
from .edge import CLOSED_STATES, drift_check, linfit, risk_band, surrogate_risk, wqhi
from .hydraulics import Channel, Transport

TEXTBOOK_MANNING_N = 0.040
RUNOFF_LAG_S = 25 * 60
FORECAST_EVERY_S = 300
FORECAST_HORIZON_S = 4 * 3600
FORECAST_DT = 60
LEAD_ADVISORY_S = 75 * 60        # warn communities up to 75 min ahead
LEAD_PREEMPT_S = 30 * 60         # close intakes up to 30 min ahead
TURB, ORP, BIO = 0, 1, 2         # twin tracers: turbidity excess (NTU), ORP deficit (mV), TLF excess (ppb)
N_TRACERS = 3
DECAY = [4e-5, 2e-5, 2e-5]
AQUIFER_LAG_S = 40 * 60          # twin's assumption for riverbank wells
AQUIFER_PASS = np.array([0.15, 0.5, 0.5])

_channel_cache = {}


def _forecast_channel(profile_key, profile):
    """One reusable forecast channel per process (also used by Celery workers)."""
    if profile_key not in _channel_cache:
        _channel_cache[profile_key] = Channel(profile, manning_n=TEXTBOOK_MANNING_N)
    return _channel_cache[profile_key]


def compute_forecast(inp, profile=None):
    """
    Pure 4-hour forecast from a JSON-serialisable snapshot of the twin, so it can run
    in-process or on a Celery worker (backend/tasks.py). Returns per-station series
    of (tau_s, turb_excess, orp_deficit, bio_excess, risk).
    """
    if profile is None:                                   # worker side: rebuild from the DEM
        from .hydrology import Terrain
        T = Terrain()
        profile = T.path_profile(T.trace(*T.rc(*C.MAIN_STEM_HEAD)))
    fch = _forecast_channel(C.SITE_ID, profile)
    fch.n_mult = np.array(inp["n_mult"])
    fch.update(inp["runoff"])
    tr = Transport(fch, N_TRACERS, DECAY)
    tr.c = np.array(inp["c"], dtype=float)
    slope_factor = np.clip((fch.slope / 0.05) ** 0.5, 0.5, 2.0)
    stations = inp["stations"]
    cells = {s["id"]: s["cell"] for s in stations}
    well = {s["id"]: np.array(s["obs"], dtype=float) for s in stations if s["aquifer"]}
    runoff, rain0 = inp["runoff"], inp["rain"]
    series = {s["id"]: [] for s in stations}
    tau = 0.0
    while tau < inp["horizon_s"]:
        tau += FORECAST_DT
        rain = rain0 if tau < 1200 else rain0 * math.exp(-(tau - 1200) / 2400)
        runoff += (rain - runoff) * min(1.0, FORECAST_DT / RUNOFF_LAG_S)
        if abs(runoff - fch.rain) > 0.02 * max(1.0, runoff):      # hydraulics only change with runoff
            fch.update(runoff)
        lateral = np.zeros_like(tr.c)
        lateral[TURB] = inp["erosion_k"] * runoff * slope_factor
        tr.step(FORECAST_DT, lateral_conc=lateral)
        decay = math.exp(-tau / 1800)
        for s in stations:                                   # observed values persist, fading
            if not s["aquifer"]:
                tr.c[:, s["cell"]] = np.maximum(tr.c[:, s["cell"]], np.array(s["obs"]) * decay)
        for sid, w in well.items():                          # riverbank aquifer response
            w += (tr.c[:, cells[sid]] * AQUIFER_PASS - w) * min(1.0, FORECAST_DT / AQUIFER_LAG_S)
        if tau % 300 == 0:
            for s in stations:
                b = s["base"]
                ex = well[s["id"]] if s["aquifer"] else tr.c[:, s["cell"]]
                # sites with no biological sensor still get the sentinel's forecast biological signal
                b0 = b.get("bio") or 0.0
                r = dict(turbidity=b["turbidity"] + ex[TURB], orp=b["orp"] - ex[ORP], ph=b["ph"], tds=b["tds"],
                         bio=b0 + ex[BIO])
                risk, _ = surrogate_risk(r, {**b, "bio": b0}, rain)
                series[s["id"]].append((int(tau), round(float(ex[TURB]), 2), round(float(ex[ORP]), 1),
                                        round(float(ex[BIO]), 2), risk))
    return series


class Station:
    def __init__(self, cfg, channel):
        self.cfg = cfg
        self.id = cfg["id"]
        self.cell = cfg["stem_index"]
        self.lat, self.lon = float(channel.lat[self.cell]), float(channel.lon[self.cell])
        self.elev = float(channel.z[self.cell])
        self.chainage = float(channel.s[self.cell])
        self.area = float(channel.area[self.cell])
        self.hist = deque(maxlen=int(C.HISTORY_HOURS * 3600 / 60) + 5)
        self.baseline = None
        self.reading = None
        self.meta = {}
        self.risk = 0.0
        self.risk_parts = {}
        self.wqhi = None
        self.classification = "NORMAL"
        self.drift = None
        self.edge_state = "NORMAL"
        self.valve_open = True
        self.tank_pct = None
        self.last_t = None
        self.quiet_since = None
        self.flags = set()                       # dedupe keys for alerts
        self.aquifer = cfg["kind"] == "SOLAR_PUMP_WELL"      # draws riverbank-filtered groundwater


class Twin:
    def __init__(self, terrain, profile, emit, command):
        """
        emit(event_dict)                -> audit log / SMS fan-out
        command(station_id, name, why)  -> downlink to the edge node
        """
        self.terrain = terrain
        self.emit = emit
        self.command = command
        self.ch = Channel(profile, manning_n=TEXTBOOK_MANNING_N)
        self.fch = Channel(profile, manning_n=TEXTBOOK_MANNING_N)          # forecast copy
        self.profile = profile
        self.tr = Transport(self.ch, N_TRACERS, decay_per_s=DECAY)
        self.forecast_runner = None          # set to a callable (e.g. Celery) to run forecasts off-process
        self._pending_forecast = None
        self.slope_factor = np.clip((self.ch.slope / 0.05) ** 0.5, 0.5, 2.0)
        self.stations = {s["id"]: Station(s, self.ch) for s in C.STATIONS}
        self.order = [s["id"] for s in C.STATIONS]                         # upstream -> downstream
        self.t = 0.0
        self.rain = 0.0
        self.runoff_rain = 0.0
        self.rain_hist = deque(maxlen=12 * 60)
        self.erosion_k = 7.0                                               # NTU per mm/hr (prior)
        self.forecast = dict(t=None, stations={})
        self._last_forecast = -1e9
        self.calibration = []                                              # transit-time log
        self.auto_preempt = True
        self._prep_grid()

    # ================================================================ ingest
    def ingest_rain(self, t, mm_hr):
        self.rain = max(0.0, float(mm_hr))
        self.rain_hist.append((t, self.rain))

    def ingest_reading(self, sid, t, r, meta=None):
        st = self.stations[sid]
        meta = meta or {}
        prev_state = st.edge_state
        st.reading, st.last_t, st.meta = r, t, {**st.meta, **meta}
        st.edge_state = meta.get("edge_state", st.edge_state)
        st.valve_open = meta.get("valve_open", st.edge_state not in CLOSED_STATES)
        st.tank_pct = meta.get("tank_pct", st.tank_pct)
        if st.baseline is None:
            st.baseline = dict(r)

        window = [(h["t"], h["turbidity"], h["orp"], h["tds"]) for h in list(st.hist)[-90:]]
        window.append((t, r["turbidity"], r["orp"], r["tds"]))
        is_drift, info = drift_check(window, st.baseline, self.runoff_rain)
        upstream = self._upstream_of(sid)
        up_quiet = upstream is None or upstream.reading is None or \
            (upstream.reading["turbidity"] - upstream.baseline["turbidity"]) < 3.0
        st.drift = info
        drift_confirmed = is_drift and up_quiet

        st.risk, st.risk_parts = surrogate_risk(r, st.baseline, self.rain, use_turbidity=not drift_confirmed)
        st.wqhi = wqhi(r if not drift_confirmed else {**r, "turbidity": st.baseline["turbidity"]})
        prev_class = st.classification
        if drift_confirmed:
            st.classification = "SENSOR_BIOFOULING"
        elif st.risk >= C.RISK_SUSPECT:
            st.classification = "ACUTE_EVENT"
        elif st.risk >= 0.25:
            st.classification = "WATCH"
        else:
            st.classification = "NORMAL"

        st.hist.append(dict(t=t, **{k: r.get(k) for k in ("turbidity", "orp", "ph", "tds", "temp", "bio")},
                            risk=st.risk, wqhi=st.wqhi["score"], rain=self.rain,
                            edge_state=st.edge_state, valve_open=st.valve_open))
        self._update_baseline(st)
        self._class_events(st, prev_class, info)
        self._edge_events(st, prev_state, meta.get("edge_log", []))

    def _upstream_of(self, sid):
        i = self.order.index(sid)
        return self.stations[self.order[i - 1]] if i > 0 else None

    def _update_baseline(self, st):
        """Robust baseline from the quietest recent samples; frozen during events."""
        st.n_samples = getattr(st, "n_samples", 0) + 1
        if st.n_samples % 10 or st.classification != "NORMAL":
            return
        quiet = [h for h in list(st.hist)[-360:] if h["risk"] < 0.15]
        if len(quiet) < 30:
            return
        for k in ("turbidity", "orp", "ph", "tds", "temp", "bio"):
            vals = [h[k] for h in quiet if h.get(k) is not None]
            if vals:
                st.baseline[k] = median(vals)

    # ================================================================ events
    def _ev(self, st, kind, severity, msg, sms=None, **extra):
        self.emit(dict(t=self.t, station=st.id if st else None, type=kind,
                       severity=severity, message=msg, sms_to=sms, **extra))

    def _class_events(self, st, prev, info):
        if st.classification == prev:
            return
        if st.classification == "SENSOR_BIOFOULING":
            self._ev(st, "BIOFOULING", "warning",
                     f"Turbidity rising {info['slope_ntu_per_min'] * 60:.1f} NTU/h, linear (R² {info['r2']}), "
                     f"ORP/TDS steady, no rain, upstream node quiet: optical biofouling, not contamination. "
                     "Turbidity excluded from risk; maintenance work order raised.",
                     sms="LGU sensor technician")
        elif st.classification == "ACUTE_EVENT":
            parts = ", ".join(f"{k} {v:.2f}" for k, v in st.risk_parts.items() if v > 0.1)
            self._ev(st, "ANOMALY", "danger",
                     f"Surrogate risk {st.risk:.2f} ({risk_band(st.risk)}). Evidence: {parts}.")
        elif prev == "ACUTE_EVENT" and st.classification == "NORMAL":
            self._ev(st, "RECOVERED", "info", "Surrogates back at baseline.")

    def _edge_events(self, st, prev_state, edge_log):
        for kind, msg in edge_log:
            sev = "danger" if kind == "AUTO_TRIP" else "warning" if kind in ("SUSPECT", "MAINTENANCE") else "info"
            sms = st.cfg["sms"] if kind == "AUTO_TRIP" else None
            self._ev(st, f"EDGE_{kind}", sev, msg, sms=sms)

    # ============================================================= hydraulics
    def step(self, t, dt):
        self.t = t
        self.runoff_rain += (self.rain - self.runoff_rain) * min(1.0, dt / RUNOFF_LAG_S)
        self.ch.update(self.runoff_rain)
        lateral = np.zeros_like(self.tr.c)
        lateral[TURB] = self.erosion_k * self.runoff_rain * self.slope_factor
        self.tr.step(dt, lateral_conc=lateral)
        self._assimilate(self.tr)
        self._measure_transit()
        if t - self._last_forecast >= FORECAST_EVERY_S:
            self._last_forecast = t
            self._run_forecast()
        self._collect_forecast()

    def _excess(self, st):
        """Observed (turbidity, ORP, biological) excess over the station baseline."""
        if st.reading is None:
            return 0.0, 0.0, 0.0
        r, b = st.reading, st.baseline
        turb = 0.0 if st.classification == "SENSOR_BIOFOULING" else max(0.0, r["turbidity"] - b["turbidity"])
        bio = 0.0 if r.get("bio") is None or b.get("bio") is None else max(0.0, r["bio"] - b["bio"])
        return turb, max(0.0, b["orp"] - r["orp"]), bio

    def _assimilate(self, tr):
        """Direct insertion of observed excess at creek stations (wells sample groundwater, not the creek)."""
        for st in self.stations.values():
            if st.aquifer:
                continue
            te, oe, be = self._excess(st)
            tr.c[TURB, st.cell], tr.c[ORP, st.cell] = te, oe
            if st.reading is not None and st.reading.get("bio") is not None:
                tr.c[BIO, st.cell] = be

    # ============================================================== forecast
    def forecast_input(self):
        """JSON-serialisable snapshot for compute_forecast (in-process or Celery)."""
        return dict(
            n_mult=self.ch.n_mult.tolist(), runoff=self.runoff_rain, rain=self.rain, c=self.tr.c.tolist(),
            erosion_k=self.erosion_k, horizon_s=FORECAST_HORIZON_S,
            stations=[dict(id=sid, cell=st.cell, aquifer=st.aquifer, obs=list(self._excess(st)),
                           base=dict(st.baseline or st.cfg["base"])) for sid, st in self.stations.items()],
        )

    def _run_forecast(self):
        inp = self.forecast_input()
        if self.forecast_runner:                       # off-process (Celery): collect on a later tick
            if self._pending_forecast is None:
                self._pending_forecast = (self.t, self.forecast_runner(inp))
            return
        self._apply_forecast(self.t, compute_forecast(inp, self.profile))

    def _collect_forecast(self):
        if not self._pending_forecast:
            return
        t0, handle = self._pending_forecast
        if handle.ready():
            self._pending_forecast = None
            try:
                self._apply_forecast(t0, handle.get(timeout=1))
            except Exception as e:                    # worker failure: fall back to in-process
                print("forecast worker failed, running in-process:", e)
                self._apply_forecast(self.t, compute_forecast(self.forecast_input(), self.profile))

    def _apply_forecast(self, t0, series):
        self.forecast = dict(t=t0, horizon_s=FORECAST_HORIZON_S,
                             stations={sid: self._window(sid, s) for sid, s in series.items()})
        self._policy()
        self._rearm_advice()

    def _window(self, sid, series):
        st = self.stations[sid]
        start = peak = end = None
        peak_risk = 0.0
        if st.risk >= C.RISK_SUSPECT:
            start = 0
        for tau, te, oe, be, risk in series:
            tau = int(tau)
            if risk >= C.RISK_SUSPECT and start is None:
                start = tau
            if risk > peak_risk:
                peak_risk, peak = risk, tau
            if start is not None and tau > (peak or 0) and risk < C.RISK_SUSPECT and end is None and peak_risk >= C.RISK_SUSPECT:
                end = tau
        return dict(
            arrival_s=start, peak_s=peak if peak_risk >= C.RISK_SUSPECT else None, clear_s=end,
            peak_risk=round(peak_risk, 3), peak_band=risk_band(peak_risk),
            series=[dict(tau=s[0], turb_excess=s[1], orp_deficit=s[2], bio_excess=s[3], risk=s[4]) for s in series],
        )

    # ======================================================= transit timing
    def _measure_transit(self):
        """
        Cross-correlate turbidity-excess pulses between consecutive nodes. The lag
        of best match is the *measured* transit time; compare with the model and
        nudge reach velocities toward reality (bounded, smoothed).
        """
        if int(self.t) % 300:
            return
        dt_sample = 60.0
        grid = self.t - np.arange(360)[::-1] * dt_sample            # last 6 h, 1-min grid (long reaches)
        n = len(grid)
        creek = [sid for sid in self.order if not self.stations[sid].aquifer]   # wells lag the creek
        for a_id, b_id in zip(creek, creek[1:]):
            a, b = self.stations[a_id], self.stations[b_id]
            if len(a.hist) < 120 or len(b.hist) < 120:
                continue
            xa, xb = self._pulse_signal(a, grid), self._pulse_signal(b, grid)
            ia, ib = int(np.argmax(xa)), int(np.argmax(xb))
            if xa[ia] < 4 or xb[ib] < 2 or ib <= ia or ib >= n - 10 or ia < 5:
                continue                                   # need a complete pulse at both nodes
            last = getattr(a, "last_transit_peak", -1e18)
            if grid[ia] - last < 2 * 3600:                # one measurement per pulse
                continue
            best_lag, best_r = 0, -1.0
            for lag in range(1, n - ia):
                u, v = xa[:n - lag], xb[lag:]
                if u.std() == 0 or v.std() == 0:
                    continue
                r = float(np.corrcoef(u, v)[0, 1])
                if r > best_r:
                    best_r, best_lag = r, lag
            if best_r < 0.6:
                continue
            a.last_transit_peak = grid[ia]
            # Rain loads every reach at once, so lag != travel time. Calibrate only on
            # point-source pulses that arrive in (near) dry weather.
            rain_max = max([h["rain"] for h in a.hist if h["t"] >= grid[ia] - 4 * 3600] or [0.0])
            if rain_max > 2.0:
                continue
            measured = best_lag * dt_sample
            rain_mean = 0.0
            self.fch.n_mult = self.ch.n_mult.copy()
            self.fch.update(rain_mean)
            modelled = self.fch.travel_time(a.cell, b.cell)
            ratio = float(np.clip(modelled / measured, 0.3, 3.0))
            seg = slice(a.cell, b.cell)
            self.ch.n_mult[seg] = np.clip(self.ch.n_mult[seg] * ratio ** 0.7, 0.3, 2.5)
            rec = dict(t=self.t, reach=f"{a_id}→{b_id}", measured_s=round(measured),
                       modelled_s=round(modelled), correlation=round(best_r, 2),
                       velocity_factor=round(float(np.mean(self.ch.n_mult[seg])), 3))
            self.calibration.append(rec)
            self._ev(b, "TRANSIT_CALIBRATION", "info",
                     f"Pulse transit {a_id}→{b_id}: measured {measured / 60:.0f} min vs model "
                     f"{modelled / 60:.0f} min (r={best_r:.2f}). Reach velocity factor now "
                     f"{rec['velocity_factor']:.2f}.", calibration=rec)

    @staticmethod
    def _pulse_signal(st, grid):
        """Combined turbidity + ORP excess resampled onto a regular time grid (forward fill)."""
        b = st.baseline
        ts = np.array([h["t"] for h in st.hist])
        val = np.array([max(0.0, h["turbidity"] - b["turbidity"]) + max(0.0, b["orp"] - h["orp"]) / 20
                        + (0.0 if h.get("bio") is None or b.get("bio") is None else max(0.0, h["bio"] - b["bio"]) / 2)
                        for h in st.hist])
        idx = np.clip(np.searchsorted(ts, grid, side="right") - 1, 0, len(ts) - 1)
        return val[idx]

    # =============================================================== policy
    def _policy(self):
        for sid, fc in self.forecast["stations"].items():
            st = self.stations[sid]
            if fc["arrival_s"] is None and st.risk < 0.25:
                st.flags -= {"advisory", "preempt"}               # episode over, re-arm alerts
            if not st.cfg["valve"] or fc["arrival_s"] is None or fc["arrival_s"] == 0:
                continue
            if fc["peak_risk"] < C.RISK_TRIP:
                continue
            if fc["arrival_s"] <= LEAD_ADVISORY_S and "advisory" not in st.flags:
                st.flags.add("advisory")
                reserve = self._reserve_h(st)
                self._ev(st, "FORECAST_ADVISORY", "danger",
                         f"Contaminated water forecast at {st.cfg['name']} in ~{fc['arrival_s'] // 60} min "
                         f"(peak risk {fc['peak_risk']:.2f}, clears in ~{(fc['clear_s'] or FORECAST_HORIZON_S) // 60} min). "
                         f"Stored water covers ~{reserve:.1f} h. Do not drink untreated creek water.",
                         sms=st.cfg["sms"], arrival_s=fc["arrival_s"])
            if (self.auto_preempt and st.valve_open and fc["arrival_s"] <= LEAD_PREEMPT_S
                    and "preempt" not in st.flags):
                st.flags.add("preempt")
                self.command(sid, "PREEMPT_SHUT",
                             f"Twin pre-emptive shut-off: plume ETA {fc['arrival_s'] // 60} min, "
                             f"peak risk {fc['peak_risk']:.2f}.")

    def _rearm_advice(self):
        for st in self.stations.values():
            if not st.cfg["valve"] or st.valve_open:
                st.quiet_since = None
                st.flags.discard("reserve_low")
                continue
            reserve = self._reserve_h(st)
            if st.cfg["tank"] and reserve < 1.0 and "reserve_low" not in st.flags:
                st.flags.add("reserve_low")
                fc = self.forecast["stations"].get(st.id, {})
                still_bad = st.risk >= C.RISK_SUSPECT or fc.get("arrival_s") is not None
                self._ev(st, "RESERVE_LOW", "danger",
                         f"Intake closed and stored water down to ~{reserve * 60:.0f} min of supply for "
                         f"{st.cfg['population']:,} people. "
                         + ("Water source still contaminated: dispatch a water tanker / boil-water advisory."
                            if still_bad else "Source looks clean again: re-arm the intake to refill the tank."),
                         sms=st.cfg["sms"])
            fc = self.forecast["stations"].get(st.id, {})
            upcoming = fc.get("arrival_s") not in (None, 0)
            if st.risk < 0.25 and not upcoming:
                st.quiet_since = st.quiet_since or self.t
                if self.t - st.quiet_since >= 20 * 60 and ("rearm", st.quiet_since) not in st.flags:
                    st.flags.add(("rearm", st.quiet_since))
                    self._ev(st, "REARM_RECOMMENDED", "info",
                             "Surrogates at baseline for 20 min and no plume in the 4 h forecast. "
                             "Operator may re-arm the intake (interlock will verify on-site).")
            else:
                st.quiet_since = None

    def _reserve_h(self, st):
        tank = st.cfg["tank"]
        if not tank or st.tank_pct is None:
            return 0.0
        return tank["capacity_l"] * st.tank_pct / 100 / tank["demand_lps"] / 3600

    # =============================================================== heatmap
    def _prep_grid(self):
        T = self.terrain
        outlet = T.rc(float(self.ch.lat[-1]), float(self.ch.lon[-1]))
        self.catchment = T.catchment_mask(outlet)
        rr, cc = np.nonzero(self.catchment)
        lat = T.north - rr * T.step
        lon = T.west + cc * T.step
        dy = (lat[:, None] - self.ch.lat[None, :]) * 111_320
        dx = (lon[:, None] - self.ch.lon[None, :]) * 111_320 * math.cos(math.radians((T.north + T.south) / 2))
        d = np.hypot(dx, dy)
        self._grid_idx = (rr, cc)
        self._near_cell = np.argmin(d, axis=1)
        self._near_dist = d[np.arange(len(rr)), self._near_cell]
        wet = np.log1p(T.acc[rr, cc]) / np.log1p(T.acc.max())
        steep = np.clip(T.slope_deg[rr, cc] / 30, 0, 1)
        self._runoff_potential = np.clip(0.5 * wet + 0.5 * steep, 0, 1)
        # Height above the nearest river point: low ground beside the channel floods first.
        # A terrain screening estimate from the 90 m DEM, not an official hazard map.
        hand = np.clip(T.elev[rr, cc] - self.ch.z[self._near_cell], 0, None)
        self._flood_potential = np.clip(1 - hand / 8.0, 0, 1) * np.exp(-self._near_dist / 1500)

    HEAT_INDICES = ("risk", "turbidity", "ph", "tds", "bio")

    def _station_hazard(self, st, index):
        """0-1 hazard of one water point for the chosen heatmap index."""
        if st.reading is None:
            return 0.0
        r, p = st.reading, C.PNSDW
        if index == "turbidity":
            return float(np.clip(r["turbidity"] / (2 * p["turbidity_ntu"]), 0, 1))
        if index == "ph":
            return float(np.clip((abs(r["ph"] - 7.5) - 0.5) / 1.5, 0, 1))
        if index == "tds":
            return float(np.clip((r["tds"] - 300) / (p["tds_mgL"] - 300) * 0.8, 0, 1))
        if index == "bio":
            return 0.0 if r.get("bio") is None else float(np.clip((r["bio"] - 2) / (2 * C.BIO_ALERT_PPB), 0, 1))
        return st.risk

    def risk_grid(self, index="risk"):
        """uint8 hazard raster over the DEM grid (0 = none / outside catchment), base64."""
        if index not in (*self.HEAT_INDICES, "flood"):
            raise ValueError(f"index must be one of {self.HEAT_INDICES} or flood")
        T = self.terrain
        if index == "flood":                       # brightens as rain falls on the catchment
            return self._grid(index, self._flood_potential * (0.55 + 0.45 * np.clip(self.runoff_rain / 40, 0, 1)))
        creek = [st for st in self.stations.values() if not st.aquifer]
        if index == "risk":
            chan = 1 - (1 - np.clip(self.tr.c[TURB] / 40, 0, 1) * 0.7) * (1 - np.clip(self.tr.c[ORP] / 200, 0, 1) * 0.8) \
                * (1 - np.clip(self.tr.c[BIO] / 20, 0, 1) * 0.8)
            hill = np.clip(self.runoff_rain / 40, 0, 1) * self._runoff_potential * 0.55
        else:
            # interpolate the measured hazard along the river between creek stations (by chainage)
            chan = np.interp(self.ch.s, [st.chainage for st in creek], [self._station_hazard(st, index) for st in creek])
            hill = np.zeros_like(self._runoff_potential)
            if index == "turbidity":
                chan = np.maximum(chan, np.clip(self.tr.c[TURB] / 40, 0, 1))
                hill = np.clip(self.runoff_rain / 40, 0, 1) * self._runoff_potential * 0.55
        stream = np.clip(chan, 0, 1)[self._near_cell] * np.exp(-self._near_dist / 220)
        val = np.maximum(stream, hill)
        rr, cc = self._grid_idx
        lat = T.north - rr * T.step
        lon = T.west + cc * T.step
        for st in self.stations.values():
            if st.reading is None:
                continue
            d = np.hypot((lat - st.lat) * T.dy / T.step, (lon - st.lon) * T.dx / T.step)
            val = np.maximum(val, self._station_hazard(st, index) * np.exp(-(d / 250) ** 2))
        return self._grid(index, val)

    def _grid(self, index, val):
        T = self.terrain
        grid = np.zeros((T.nrows, T.ncols), np.uint8)
        grid[self._grid_idx] = np.clip(val * 254 + 1, 1, 255).astype(np.uint8)
        return dict(index=index, north=T.north, south=T.south, west=T.west, east=T.east,
                    nrows=T.nrows, ncols=T.ncols, data=base64.b64encode(grid.tobytes()).decode())

    # ============================================================== snapshot
    def channel_state(self):
        ch = self.ch
        return dict(
            chainage_m=ch.s.round(0).tolist(), elev_m=ch.z.round(1).tolist(),
            velocity_mps=ch.v.round(2).tolist(), discharge_m3s=ch.Q.round(3).tolist(),
            turb_excess=self.tr.c[TURB].round(2).tolist(), orp_deficit=self.tr.c[ORP].round(1).tolist(),
            bio_excess=self.tr.c[BIO].round(2).tolist(),
            velocity_factor=ch.n_mult.round(3).tolist(),
        )

    def reaches(self):
        out = []
        for a_id, b_id in zip(self.order, self.order[1:]):
            a, b = self.stations[a_id], self.stations[b_id]
            out.append(dict(reach=f"{a_id}→{b_id}", **self.ch.reach_summary(a.cell, b.cell),
                            velocity_factor=round(float(np.mean(self.ch.n_mult[a.cell:b.cell])), 3)))
        return out

    def station_view(self, st):
        r = st.reading or st.cfg["base"]
        tank = st.cfg["tank"]
        return dict(
            id=st.id, name=st.cfg["name"], kind=st.cfg["kind"], owner=st.cfg["owner"],
            network=st.cfg["network"], gateway=st.cfg["gateway"], note=st.cfg["note"],
            lat=st.lat, lon=st.lon, elevation_m=round(st.elev, 1), chainage_m=round(st.chainage),
            catchment_km2=round(st.area, 2), population=st.cfg["population"],
            reading={k: (None if v is None else round(v, 2)) for k, v in r.items()},
            baseline={k: (None if v is None else round(v, 2)) for k, v in (st.baseline or r).items()}, aquifer=st.aquifer,
            estimated=st.meta.get("estimated", []),
            risk=st.risk, risk_band=risk_band(st.risk),
            risk_parts={k: round(v, 3) for k, v in st.risk_parts.items()},
            wqhi=st.wqhi or wqhi(r), classification=st.classification, drift=st.drift,
            edge_state=st.edge_state, valve=None if not st.cfg["valve"] else dict(
                open=st.valve_open, **st.cfg["valve"]),
            tank=None if not tank else dict(capacity_l=tank["capacity_l"], pct=st.tank_pct,
                                            reserve_h=round(self._reserve_h(st), 2)),
            link=dict(last_seen_t=st.last_t, **{k: st.meta.get(k) for k in ("rssi", "snr", "battery_v", "f_cnt", "source")}),
            sms=st.cfg["sms"],
        )

    def history(self, sid, minutes=720, max_points=240):
        st = self.stations[sid]
        pts = [h for h in st.hist if h["t"] >= self.t - minutes * 60]
        step = max(1, len(pts) // max_points)
        return pts[::step]
