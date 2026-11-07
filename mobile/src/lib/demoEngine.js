// On-phone demo twin. Used only when the user switches demo mode on, and always labelled.
//
// It returns the same shapes as the FastAPI data server, and ports its scoring exactly:
// surrogate risk, WQHI and the re-arm interlock (backend/edge.py). Events are a simplified
// script of the river rather than the real 1-D transport model, so its numbers are
// illustrative only. Evaluation figures come from the data server, never from here.
import { CHANNEL, PIPES, REACHES, STATIC, STATIONS } from './demoData';

const RISK_SUSPECT = 0.45;
const RISK_TRIP = 0.60;
const PERSISTENCE_S = 120;
const PREEMPT_S = 1800;       // close up to 30 min before forecast arrival
const HORIZON_S = 14400;
const SAMPLE_S = 300;         // history resolution
const DAY_MS = 86_400_000;
const WELL_LAG_S = 5400;      // bank filtration delays the plume at the shallow well

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const noise = (a) => (Math.random() - 0.5) * a;
const round = (v, d) => Number(v.toFixed(d));

function riskParts(r, b, rain, useTurbidity) {
  return {
    turbidity: useTurbidity ? clamp((r.turbidity - b.turbidity) / 20) : 0,
    orp: clamp((b.orp - r.orp) / 200),
    ph: clamp((Math.abs(r.ph - b.ph) - 0.2) / 0.8),
    tds: clamp((r.tds - b.tds) / 200),
    rain: clamp(rain / 40),
    bio: r.bio == null || b.bio == null ? 0 : clamp((r.bio - b.bio) / 15),
  };
}

const WEIGHTS = { turbidity: 0.55, orp: 0.60, ph: 0.25, tds: 0.30, rain: 0.20, bio: 0.70 };

function surrogateRisk(parts) {
  let clean = 1;
  for (const [k, x] of Object.entries(parts)) clean *= 1 - WEIGHTS[k] * x;
  const faecal = Math.max(Math.min(parts.turbidity, parts.orp), Math.min(parts.bio, Math.max(parts.turbidity, parts.orp)));
  return round(clamp(1 - clean + 0.30 * faecal), 3);
}

const riskBand = (risk) => (risk >= RISK_TRIP ? 'SEVERE' : risk >= RISK_SUSPECT ? 'HIGH' : risk >= 0.25 ? 'MODERATE' : 'LOW');

function wqhi(r) {
  const t = r.turbidity;
  const parts = {
    turbidity: t <= 1 ? 100 : Math.max(0, 100 - 58.9 * Math.log10(t)),
    orp: 100 * clamp((r.orp - 100) / 300),
    ph: 100 * clamp(1 - Math.max(0, Math.abs(r.ph - 7.5) - 0.5) / 1.5),
    tds: 100 * clamp(1 - Math.max(0, r.tds - 300) / 700),
  };
  let w = { turbidity: 0.35, orp: 0.30, ph: 0.15, tds: 0.20 };
  if (r.bio != null) {
    parts.bio = 100 * clamp(1 - Math.max(0, r.bio - 2) / 30);
    w = { turbidity: 0.28, orp: 0.22, ph: 0.12, tds: 0.13, bio: 0.25 };
  }
  const score = Math.round(Math.exp(Object.entries(parts).reduce((a, [k, v]) => a + w[k] * Math.log(Math.max(v, 1)), 0)));
  const rounded = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)]));
  return { score, category: score >= 80 ? 'GOOD' : score >= 60 ? 'FAIR' : score >= 40 ? 'POOR' : 'UNSAFE', parts: rounded };
}

// River travel time from the farm tributary, which joins just above AG-02
const reachS = (from) => REACHES.find((r) => r.reach.startsWith(from)).travel_time_s;
const SPILL_LAG = {
  'AG-02': 1200,
  'KS-03': 1200 + reachS('AG-02'),
  'MB-04': 1200 + reachS('AG-02') + reachS('KS-03') + WELL_LAG_S,
  'RH-05': 1200 + reachS('AG-02') + reachS('KS-03') + reachS('MB-04'),
};
const SPILL_SIZE = { 'AG-02': 1, 'KS-03': 0.8, 'MB-04': 0.3, 'RH-05': 0.45 };

/** A 30 min rise, then a slow tail. x = seconds since the front arrived. */
const pulse = (x) => (x <= 0 ? 0 : x < 1800 ? x / 1800 : Math.exp(-(x - 1800) / 2700));

const NONE = { turbidity: 0, orp: 0, ph: 0, tds: 0, bio: 0 };

class DemoDigitalTwin {
  constructor() {
    this.epoch0 = Date.now();
    this.t = 0;
    this.speed = 60;
    this.autoPreempt = true;
    this.scenario = null;      // { name, t0 }
    this.fouling = 0;          // NTU of false turbidity on the KS-03 lens
    this.foulingRate = 0;      // NTU per minute
    this.detected = false;     // forecasts start once AG-02 has actually seen the plume
    this.events = [];
    this.sms = [];
    this.taskSeq = 0;
    this.tasks = [];
    this.forecast = {};

    this.stations = {};
    for (const d of STATIONS) {
      this.stations[d.id] = {
        ...d,
        reading: { ...d.base },
        open: Boolean(d.valve),
        tankPct: d.tank ? 95 : null,
        edgeState: 'NORMAL',
        suspectS: 0,
        classification: 'NORMAL',
        flags: {},
        fCnt: 1200,
        rssi: -82 - Math.round(Math.random() * 14),
        snr: round(2 + Math.random() * 6, 1),
        battery: 3.9 + Math.random() * 0.2,
        hist: [],
      };
      this._score(this.stations[d.id]);
    }

    this._seedHistory();
    this._seedTasks();
    this._forecast();
  }

  now() { return this.epoch0 + this.t * 1000; }

  _rain(t) {
    const s = this.scenario;
    return s?.name === 'MONSOON' && t >= s.t0 && t < s.t0 + 3600 ? 45 : 0;
  }

  /** How far from baseline each water point is at sim time t: the script of the event. */
  _excess(id, t) {
    const s = this.scenario;
    if (!s) return NONE;
    if (s.name === 'SEPTIC' && SPILL_LAG[id] != null) {
      const k = SPILL_SIZE[id] * pulse(t - s.t0 - SPILL_LAG[id]);
      return { turbidity: 30 * k, orp: 190 * k, ph: 0.35 * k, tds: 70 * k, bio: 22 * k };
    }
    if (s.name === 'MONSOON') {
      const lag = (this.stations[id].chainage_m / 24792) * 5400 + (this.stations[id].aquifer ? WELL_LAG_S : 0);
      const k = (id === 'IN-01' ? 0.2 : this.stations[id].aquifer ? 0.35 : 1) * pulse(t - s.t0 - lag);
      return { turbidity: 32 * k, orp: 115 * k, ph: 0.2 * k, tds: 25 * k, bio: (id === 'IN-01' ? 0 : 9) * k };
    }
    return NONE;
  }

  _readingAt(st, t, jitter = true) {
    const b = st.base;
    const e = this._excess(st.id, t);
    const j = (a) => (jitter ? noise(a) : 0);
    return {
      turbidity: round(Math.max(0.1, b.turbidity + e.turbidity + j(0.08) + (st.id === 'KS-03' ? this.fouling : 0)), 2),
      orp: round(b.orp - e.orp + j(1.5), 1),
      ph: round(b.ph - e.ph + j(0.02), 2),
      tds: round(b.tds + e.tds + j(0.8), 1),
      temp: round(b.temp + j(0.05), 2),
      bio: b.bio == null ? null : round(Math.max(0.1, b.bio + e.bio + j(0.1)), 2),
    };
  }

  _isFouled(st) { return st.id === 'KS-03' && this.fouling >= 3; }

  _score(st) {
    const rain = this._rain(this.t);
    st.riskParts = riskParts(st.reading, st.base, rain, !this._isFouled(st));
    st.risk = surrogateRisk(st.riskParts);
    st.riskBand = riskBand(st.risk);
    st.wqhi = wqhi(st.reading);
  }

  _sample(st, t, t_ms, r, risk, score, rain = 0) {
    st.hist.push({ t, t_ms, ...r, risk, wqhi: score, rain, edge_state: st.edgeState, valve_open: st.valve ? st.open : true });
    if (st.hist.length > 300) st.hist.shift();
  }

  _seedHistory() {
    for (const st of Object.values(this.stations)) {
      for (let m = 1440; m > 0; m -= SAMPLE_S / 60) {
        const r = this._readingAt(st, 0);
        this._sample(st, -m * 60, this.epoch0 - m * 60_000, r, surrogateRisk(riskParts(r, st.base, 0, true)), wqhi(r).score);
      }
    }
  }

  _addTask(station, kind, due_ms, { title, recurring = null, by = 'schedule', urgent = false } = {}) {
    const task = {
      id: ++this.taskSeq, station, kind, title: title || STATIC.task_kinds[kind], due_ms, recurring_days: recurring,
      created_by: by, urgent, done_ms: null, done_by: null,
    };
    this.tasks.push(task);
    return task;
  }

  _seedTasks() {
    const n = this.epoch0;
    this._addTask('KS-03', 'LENS_CLEAN', n + 3 * 3_600_000, { recurring: 14 });
    this._addTask('IN-01', 'LENS_CLEAN', n + 2 * DAY_MS, { recurring: 14 });
    this._addTask('MB-04', 'SOLAR', n - 2 * 3_600_000, { recurring: 30 });
    this._addTask('KS-03', 'FILTER', n + 6 * DAY_MS, { recurring: 30 });
    this._addTask('RH-05', 'TANK', n + 10 * DAY_MS, { recurring: 90 });
    this._addTask('RH-05', 'PH_CAL', n + 12 * DAY_MS, { recurring: 30 });
  }

  _event(station, type, severity, message, sms_to = null) {
    this.events.unshift({ t: this.t, t_ms: this.now(), station, type, severity, message, sms_to });
    if (this.events.length > 120) this.events.pop();
    if (sms_to) this._sms(sms_to, message);
  }

  _sms(role, message) {
    this.sms.unshift({ t: this.now() / 1000, role, numbers: 0, message: `[Bulos 3D] ${message}`, provider: 'demo', status: 'simulated, not sent' });
    if (this.sms.length > 40) this.sms.pop();
  }

  _once(st, flag, fn) {
    if (st.flags[flag]) return;
    st.flags[flag] = true;
    fn();
  }

  _forecast() {
    const out = {};
    for (const st of Object.values(this.stations)) {
      const series = [];
      const nowRisk = st.risk;
      let arrival = null;
      let peak = nowRisk;
      let peakS = null;
      let clear = null;
      for (let tau = SAMPLE_S; tau <= HORIZON_S; tau += SAMPLE_S) {
        const known = this.detected || this.scenario?.name === 'MONSOON';
        const r = known ? this._readingAt(st, this.t + tau, false) : st.reading;
        const e = known ? this._excess(st.id, this.t + tau) : NONE;
        const risk = known ? surrogateRisk(riskParts(r, st.base, this._rain(this.t + tau), !this._isFouled(st))) : nowRisk;
        series.push({ tau, risk: round(risk, 3), turb_excess: round(e.turbidity, 2), orp_deficit: round(e.orp, 1), bio_excess: round(e.bio, 2) });
        if (risk > peak) { peak = risk; peakS = tau; }
        if (arrival == null && nowRisk < RISK_SUSPECT && risk >= RISK_SUSPECT) arrival = tau;
        if (arrival != null && clear == null && risk < RISK_SUSPECT) clear = tau;
      }
      out[st.id] = { arrival_s: arrival, peak_s: peakS, clear_s: clear, peak_risk: round(peak, 3), peak_band: riskBand(peak), series };
    }
    this.forecast = out;
  }

  _edge(st, dt) {
    const closed = ['TRIPPED', 'REMOTE_SHUT', 'PREEMPTIVE_SHUT'].includes(st.edgeState);
    if (closed) return;
    if (this._isFouled(st)) { st.edgeState = 'MAINTENANCE'; return; }
    if (st.edgeState === 'MAINTENANCE') st.edgeState = 'NORMAL';
    if (st.risk < RISK_SUSPECT) { st.edgeState = 'NORMAL'; st.suspectS = 0; return; }
    if (st.edgeState !== 'SUSPECT') {
      st.edgeState = 'SUSPECT';
      st.suspectS = 0;
      this._event(st.id, 'EDGE_SUSPECT', 'warning', `Surrogate risk ${st.risk.toFixed(2)}. Verifying persistence for 2 min.`);
    }
    st.suspectS += dt;
    if (st.valve && st.risk >= RISK_TRIP && st.suspectS >= PERSISTENCE_S) {
      st.edgeState = 'TRIPPED';
      st.open = false;
      this._event(st.id, 'EDGE_AUTO_TRIP', 'danger', `Risk ${st.risk.toFixed(2)} held for 2 min. Intake closed by the sensor node.`, st.sms);
    }
  }

  _classify(st) {
    const prev = st.classification;
    st.classification = this._isFouled(st) ? 'SENSOR_BIOFOULING' : st.risk >= RISK_SUSPECT ? 'ACUTE_EVENT' : st.risk >= 0.25 ? 'WATCH' : 'NORMAL';
    if (st.classification === 'SENSOR_BIOFOULING' && prev !== 'SENSOR_BIOFOULING') {
      this._event(st.id, 'BIOFOULING', 'warning', 'Turbidity is drifting in a straight line while ORP and TDS stay flat. Sensor fault, not contamination.');
      const open = this.tasks.find((x) => x.station === st.id && x.kind === 'LENS_CLEAN' && !x.done_ms);
      if (open) { open.due_ms = this.now(); open.urgent = true; } else this._addTask(st.id, 'LENS_CLEAN', this.now(), { by: 'twin', urgent: true });
    } else if (st.classification === 'ACUTE_EVENT' && prev !== 'ACUTE_EVENT') {
      this._event(st.id, 'ANOMALY', 'danger', `Contamination signature at ${st.name}. Risk ${st.risk.toFixed(2)}.`);
    } else if (prev === 'ACUTE_EVENT' && st.classification === 'NORMAL') {
      this._event(st.id, 'RECOVERED', 'info', 'Surrogates back at baseline.');
      if (st.valve && !st.open) this._event(st.id, 'REARM_RECOMMENDED', 'info', 'Operator may re-arm the intake (interlock will verify on-site).');
      st.flags = {};
    }
  }

  _protect(st) {
    const f = this.forecast[st.id];
    if (!f?.arrival_s || f.peak_risk < RISK_SUSPECT) return;
    this._once(st, 'advised', () => this._event(st.id, 'FORECAST_ADVISORY', 'danger',
      `Plume forecast at ${st.name} in about ${Math.round(f.arrival_s / 60)} min, peak risk ${f.peak_risk.toFixed(2)}.`, st.sms));
    if (this.autoPreempt && st.valve && st.open && f.arrival_s <= PREEMPT_S && f.peak_risk >= RISK_TRIP) {
      st.open = false;
      st.edgeState = 'PREEMPTIVE_SHUT';
      this._event(st.id, 'CMD_PREEMPT_SHUT', 'warning', `Twin pre-emptive shut-off: plume ETA ${Math.round(f.arrival_s / 60)} min, peak risk ${f.peak_risk.toFixed(2)}. Valve closed.`, st.sms);
    }
  }

  _tank(st, dt) {
    if (st.tankPct == null) return;
    const flow = (st.tank.demand_lps * dt * 100) / st.tank.capacity_l;
    st.tankPct = st.open ? Math.min(95, st.tankPct + flow * 2) : Math.max(0, st.tankPct - flow);
    if (!st.open && this._reserveH(st) < 1) {
      this._once(st, 'reserve', () => this._event(st.id, 'RESERVE_LOW', 'danger', `Tank reserve at ${st.name} is under 1 hour.`, st.sms));
    }
  }

  _reserveH(st) { return (st.tank.capacity_l * st.tankPct) / 100 / (st.tank.demand_lps * 3600); }

  tick() {
    const dt = this.speed;
    const before = Math.floor(this.t / SAMPLE_S);
    this.t += dt;
    this.fouling += (this.foulingRate * dt) / 60;
    const s = this.scenario;
    if (s && this.t > s.t0 + 8 * 3600) this.scenario = null;

    const list = Object.values(this.stations);
    for (const st of list) {
      st.reading = this._readingAt(st, this.t);
      this._score(st);
      st.fCnt += 1;
      st.lastSeen = this.t;
    }
    if (this.stations['AG-02'].risk >= RISK_SUSPECT) this.detected = true;
    this._forecast();
    for (const st of list) {
      this._edge(st, dt);
      this._classify(st);
      this._protect(st);
      this._tank(st, dt);
    }
    if (Math.floor(this.t / SAMPLE_S) > before) {
      const rain = this._rain(this.t);
      for (const st of list) this._sample(st, this.t, this.now(), st.reading, st.risk, st.wqhi.score, rain);
    }
  }

  _drift(st) {
    const fouled = this._isFouled(st);
    return {
      slope_ntu_per_min: fouled ? this.foulingRate : 0, r2: fouled ? 0.98 : 0,
      orp_dev: round(Math.abs(st.reading.orp - st.base.orp), 1), tds_dev: round(Math.abs(st.reading.tds - st.base.tds), 1),
    };
  }

  _channel() {
    const list = Object.values(this.stations).sort((a, b) => a.chainage_m - b.chainage_m);
    const at = (x, key) => {
      const hi = list.findIndex((s) => s.chainage_m >= x);
      if (hi <= 0) return hi === 0 ? this._excess(list[0].id, this.t)[key] : this._excess(list.at(-1).id, this.t)[key];
      const [a, b] = [list[hi - 1], list[hi]];
      const f = (x - a.chainage_m) / (b.chainage_m - a.chainage_m);
      return this._excess(a.id, this.t)[key] * (1 - f) + this._excess(b.id, this.t)[key] * f;
    };
    const profile = (key) => CHANNEL.chainage_m.map((x) => round(at(x, key), 2));
    return {
      ...CHANNEL, turb_excess: profile('turbidity'), orp_deficit: profile('orp'), bio_excess: profile('bio'),
      velocity_factor: CHANNEL.chainage_m.map(() => 1),
    };
  }

  getStatic() {
    return { ...STATIC, pipes: PIPES };
  }

  getState() {
    const stations = Object.values(this.stations).map((st) => ({
      id: st.id, name: st.name, kind: st.kind, owner: st.owner, network: st.network, gateway: st.gateway, note: st.note,
      lat: st.lat, lon: st.lon, elevation_m: st.elevation_m, chainage_m: st.chainage_m, catchment_km2: st.catchment_km2, population: st.population,
      reading: { ...st.reading }, baseline: { ...st.base }, aquifer: st.aquifer, estimated: [],
      risk: st.risk, risk_band: st.riskBand, risk_parts: st.riskParts, wqhi: st.wqhi,
      classification: st.classification, drift: this._drift(st), edge_state: st.edgeState,
      valve: st.valve ? { ...st.valve, open: st.open } : null,
      tank: st.tank ? { capacity_l: st.tank.capacity_l, pct: Math.round(st.tankPct), reserve_h: round(this._reserveH(st), 1) } : null,
      link: { last_seen_t: this.t, rssi: st.rssi, snr: st.snr, battery_v: round(st.battery, 3), f_cnt: st.fCnt, source: `Simulated on phone (${st.id})` },
      sms: st.sms,
    }));

    const fc = {};
    for (const [id, { series, ...rest }] of Object.entries(this.forecast)) fc[id] = rest;

    const pipes = PIPES.map((p) => {
      const src = this.stations[p.src];
      const flowing = !src.valve || src.open;
      const full = p.id === PIPES[0].id ? 6 : 2.4;
      return {
        id: p.id, flow_lps: flowing ? full : 0, velocity_mps: flowing ? round(full / 1000 / (Math.PI * (p.diameter_m / 2) ** 2), 2) : 0,
        flowing, status: flowing ? 'Flowing by gravity' : 'Stopped: valve closed', source_risk: src.risk, source_band: src.riskBand,
      };
    });

    const rain = this._rain(this.t);
    return {
      clock: { t: this.t, epoch_ms: this.now(), speed: this.speed, mode: 'sim' },
      rain_mm_hr: rain, runoff_mm_hr: round(rain * 0.6, 1),
      stations, forecast: { t: this.t, stations: fc }, reaches: REACHES, pipes, calibration: [], channel: this._channel(),
      events: this.events.slice(0, 50), sms: this.sms.slice(0, 20), sms_provider: 'on-phone demo (nothing is really sent)',
      auto_preempt: this.autoPreempt, forecast_engine: 'on-phone demo', live_nodes: [], storage: 'on-phone demo',
    };
  }

  getForecast() {
    return { t: this.t, horizon_s: HORIZON_S, stations: this.forecast };
  }

  getHistory(id, minutes = 360) {
    const st = this.stations[id];
    if (!st) throw new Error('unknown station');
    return { station_id: id, series: st.hist.filter((h) => h.t >= this.t - minutes * 60) };
  }

  getMaintenance() {
    const now = this.now();
    const status = (t) => (t.done_ms ? 'COMPLETED' : t.due_ms < now - DAY_MS / 24 ? 'OVERDUE' : t.due_ms < now + DAY_MS ? 'DUE_TODAY' : 'UPCOMING');
    const tasks = this.tasks.map((t) => ({ ...t, status: status(t) })).sort((a, b) => a.due_ms - b.due_ms);
    return { now_ms: now, tasks };
  }

  getCompliance(hours = 24) {
    const from = this.t - hours * 3600;
    const p = STATIC.pnsdw;
    const stations = Object.values(this.stations).map((st) => {
      const rows = st.hist.filter((h) => h.t >= from);
      const pct = (ok) => round((100 * rows.filter(ok).length) / Math.max(1, rows.length), 1);
      return {
        station_id: st.id, samples: rows.length,
        turbidity_pct: pct((h) => h.turbidity <= p.turbidity_ntu), ph_pct: pct((h) => h.ph >= p.ph_min && h.ph <= p.ph_max), tds_pct: pct((h) => h.tds <= p.tds_mgL),
        wqhi_avg: round(rows.reduce((a, h) => a + h.wqhi, 0) / Math.max(1, rows.length), 1),
        risk_max: Math.max(0, ...rows.map((h) => h.risk)), intake_closed_pct: pct((h) => !h.valve_open),
      };
    });
    return { standard: 'PNSDW 2017 (DOH AO 2017-0010)', limits: p, stations, backend: 'on-phone demo' };
  }

  getTrend(hours = 12, bucketMin = 30) {
    const now = this.now();
    const rows = Object.values(this.stations).flatMap((s) => s.hist);
    const series = [];
    for (let i = (hours * 60) / bucketMin; i > 0; i -= 1) {
      const to = now - (i - 1) * bucketMin * 60_000;
      const vals = rows.filter((h) => h.t_ms > to - bucketMin * 60_000 && h.t_ms <= to).map((h) => h.wqhi);
      if (vals.length) series.push({ t_ms: to, avg: round(vals.reduce((a, b) => a + b, 0) / vals.length, 1), min: Math.min(...vals) });
    }
    return { series };
  }

  _command(st, name, actor) {
    if (name === 'CLEANED') {
      if (st.id === 'KS-03') { this.fouling = 0; this.foulingRate = 0; }
      if (st.edgeState === 'MAINTENANCE') st.edgeState = 'NORMAL';
      st.reading = this._readingAt(st, this.t);
      this._score(st);
      this._classify(st);
      this._event(st.id, 'CMD_CLEANED', 'info', `${actor}: cleaned. Lens cleaned; drift window reset.`);
      return 'Lens cleaned; drift window reset.';
    }
    if (!st.valve) throw new Error('Node has no actuator.');
    if (name === 'SHUT') {
      st.open = false;
      st.edgeState = 'REMOTE_SHUT';
      this._event(st.id, 'CMD_SHUT', 'warning', `${actor}: shut. Valve closed.`);
      return 'Valve closed.';
    }
    if (name === 'REARM' && st.risk >= RISK_SUSPECT) {
      const msg = `Interlock: on-site risk ${st.risk.toFixed(2)} still >= ${RISK_SUSPECT}. Re-arm refused.`;
      this._event(st.id, 'CMD_REARM_REFUSED', 'danger', `${actor}: rearm. ${msg}`);
      throw new Error(msg);
    }
    st.open = true;
    st.edgeState = 'NORMAL';
    st.suspectS = 0;
    const msg = `Valve re-armed (open).${name === 'FORCE_REARM' ? ' Interlock BYPASSED.' : ''}`;
    this._event(st.id, `CMD_${name}`, name === 'FORCE_REARM' ? 'warning' : 'info', `${actor}: ${name.replace('_', ' ').toLowerCase()}. ${msg}`);
    return msg;
  }

  _reset() {
    this.scenario = null;
    this.detected = false;
    this.fouling = 0;
    this.foulingRate = 0;
    for (const st of Object.values(this.stations)) {
      st.open = Boolean(st.valve);
      st.edgeState = 'NORMAL';
      st.suspectS = 0;
      st.flags = {};
      st.classification = 'NORMAL';
    }
  }

  _advisory(ids, message, by) {
    const fc = this.forecast;
    const targets = ids?.length ? ids
      : Object.values(this.stations).filter((s) => s.risk >= RISK_SUSPECT || fc[s.id]?.arrival_s > 0).map((s) => s.id);
    if (!targets.length) throw new Error('No water point is affected right now. Pick a water point to send an advisory anyway.');
    const sent = [];
    for (const id of targets) {
      const st = this.stations[id];
      if (!st?.sms) continue;
      const arr = fc[id]?.arrival_s;
      const text = message || `Water advisory for ${st.name}: ${arr ? `contaminated water expected in about ${Math.floor(arr / 60)} min. ` : 'contamination detected. '}Do not drink untreated water; boil water for at least 1 minute.`;
      this._sms(st.sms, text);
      sent.push({ station: id, role: st.sms, status: 'simulated, not sent' });
      this._event(id, 'ADVISORY_SENT', 'warning', `${by} logged an advisory for ${st.sms}: ${text}`);
    }
    if (!sent.length) throw new Error('None of the selected water points has an SMS contact.');
    return sent;
  }

  act(path, body) {
    if (path === '/api/valve') {
      const st = this.stations[body.station_id];
      if (!st) throw new Error('unknown station');
      return { ok: true, message: this._command(st, body.action, body.operator ?? 'Mobile operator') };
    }
    if (path === '/api/maintenance/clean') {
      const st = this.stations[body.station_id];
      if (!st) throw new Error('unknown station');
      return { ok: true, message: this._command(st, 'CLEANED', body.technician ?? 'Mobile technician') };
    }
    if (path === '/api/maintenance') {
      const task = this._addTask(body.station_id, body.kind, body.due_ms ?? this.now(), { title: body.title, by: body.created_by ?? 'Mobile operator' });
      this._event(task.station, 'TASK_ADDED', 'info', `${task.created_by} scheduled: ${task.title}.`);
      return { ok: true, task, message: `Reminder added: ${task.title}.` };
    }
    const done = path.match(/^\/api\/maintenance\/(\d+)\/done$/);
    if (done) {
      const task = this.tasks.find((t) => t.id === Number(done[1]));
      if (!task) throw new Error('unknown task');
      if (task.done_ms) throw new Error('Task is already completed.');
      const by = body.done_by ?? 'Field technician';
      task.done_ms = this.now();
      task.done_by = by;
      const next = task.recurring_days
        ? this._addTask(task.station, task.kind, this.now() + task.recurring_days * DAY_MS, { title: task.title, recurring: task.recurring_days })
        : null;
      if (task.kind === 'LENS_CLEAN') this._command(this.stations[task.station], 'CLEANED', by);
      this._event(task.station, 'TASK_DONE', 'info', `${by} completed: ${task.title}.${body.note ? ` ${body.note}` : ''}`);
      return { ok: true, task, next, message: `Marked done: ${task.title}.${next ? ' Next one scheduled.' : ''}` };
    }
    if (path === '/api/advisory') {
      const sent = this._advisory(body.station_ids, body.message, body.sent_by ?? 'Mobile operator');
      return { ok: true, sent, message: `SMS advisory simulated for ${[...new Set(sent.map((s) => s.role))].sort().join(', ')}.` };
    }
    if (path === '/api/scenario') {
      if (!STATIC.scenarios[body.name]) throw new Error('unknown scenario');
      this._reset();
      if (body.name === 'BIOFOULING') this.foulingRate = 0.06;
      else if (body.name !== 'RESET') this.scenario = { name: body.name, t0: this.t };
      this._event(null, 'SCENARIO', 'info', `Field scenario injected: ${STATIC.scenarios[body.name]}`);
      return { ok: true, message: body.name };
    }
    if (path === '/api/policy') {
      this.autoPreempt = Boolean(body.auto_preempt);
      return { ok: true, auto_preempt: this.autoPreempt };
    }
    if (path === '/api/speed') {
      this.speed = Number(body.speed) || 60;
      return { ok: true, speed: this.speed };
    }
    throw new Error(`Demo mode does not support ${path}.`);
  }
}

export const demoTwin = new DemoDigitalTwin();
