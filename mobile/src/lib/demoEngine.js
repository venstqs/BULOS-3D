// Pure React Native in-app Digital Twin simulation engine for Bulos 3D.
// Allows complete standalone testing inside Expo Go with full fidelity
// when offline or disconnected from the PC LAN data server.

const PNSDW = { turbidity_ntu: 5.0, ph_min: 6.5, ph_max: 8.5, tds_mgL: 600.0 };

const STATIONS_DEF = [
  {
    id: 'IN-01', name: 'San Isidro Spring', kind: 'SPRING_INTAKE', owner: 'San Isidro Rural Waterworks',
    gateway: 'Barangay Hall LoRaWAN', network: 'Level II gravity system', elevation_m: 420, chainage_m: 1200,
    catchment_km2: 2.4, population: 850, note: 'Protected upland spring box. Supplies the San Isidro distribution tank via gravity line GL-1.',
    valve: { model: '12V DC Solenoid', relay: 'GPIO 26' },
    tank: { capacity_l: 45000, demand_lps: 2.1 },
    base: { turbidity: 0.8, orp: 430.0, ph: 7.45, tds: 120.0, temp: 21.0, bio: 0.6 },
    sms: 'Barangay Water Board', aquifer: false,
  },
  {
    id: 'AG-02', name: 'Upper Naga River Sentinel', kind: 'EXISTING_GOV_SENSOR', owner: 'DOST Region V / LGU Naga',
    gateway: 'Penafrancia Gateway', network: 'River basin monitoring network', elevation_m: 185, chainage_m: 8400,
    catchment_km2: 18.2, population: null, note: 'Main-stem sentinel station below agricultural tributaries. Early warning node for downstream intakes.',
    valve: null, tank: null,
    base: { turbidity: 2.2, orp: 400.0, ph: 7.30, tds: 165.0, temp: 24.0, bio: 3.5 },
    sms: 'LGU Environment Office', aquifer: false,
  },
  {
    id: 'KS-03', name: 'Pacol Communal Kiosk', kind: 'COMMUNAL_KIOSK', owner: 'Pacol Water Association',
    gateway: 'Pacol Elementary Gateway', network: 'Community tapstand & filtration', elevation_m: 92, chainage_m: 14600,
    catchment_km2: 34.1, population: 2400, note: 'Community drinking water kiosk with activated carbon & UF. Auto-shutoff solenoid protects filtration membranes.',
    valve: { model: '12V DC Solenoid', relay: 'GPIO 26' },
    tank: { capacity_l: 30000, demand_lps: 3.2 },
    base: { turbidity: 2.0, orp: 410.0, ph: 7.30, tds: 170.0, temp: 25.0, bio: 3.0 },
    sms: 'Kiosk Caretaker', aquifer: false,
  },
  {
    id: 'MB-04', name: 'Carolina Solar Well', kind: 'SOLAR_PUMP_WELL', owner: 'Carolina Farmers Cooperative',
    gateway: 'Brgy Carolina Agritech Hub', network: 'Solar-pumped riverbank well', elevation_m: 54, chainage_m: 21000,
    catchment_km2: 46.8, population: 1200, note: 'Shallow alluvium well with DC solar pump. Alluvial sand attenuates and delays creek plumes by 3–4 hours.',
    valve: { model: 'Solar pump DC contactor', relay: 'GPIO 25' },
    tank: { capacity_l: 20000, demand_lps: 1.8 },
    base: { turbidity: 2.4, orp: 405.0, ph: 7.35, tds: 180.0, temp: 25.5, bio: 3.2 },
    sms: 'Coop Water Committee', aquifer: true,
  },
  {
    id: 'RH-05', name: 'Naga City RHU Intake', kind: 'CRITICAL_ENDPOINT', owner: 'City Health Office (CHO)',
    gateway: 'City Hall LoRaWAN Base', network: 'Rural Health Unit clinical supply', elevation_m: 18, chainage_m: 27800,
    catchment_km2: 58.0, population: 6800, note: 'Clinical grade supply intake for the rural health center, birthing clinic and emergency hydration point.',
    valve: { model: 'Fail-safe solenoid', relay: 'GPIO 26' },
    tank: { capacity_l: 60000, demand_lps: 4.5 },
    base: { turbidity: 2.8, orp: 395.0, ph: 7.35, tds: 190.0, temp: 26.0, bio: 4.0 },
    sms: 'RHU Duty Officer', aquifer: false,
  },
];

const PIPES_DEF = [
  { id: 'GL-1', name: 'San Isidro Spring to Kiosk', src: 'IN-01', dst: 'KS-03', length_m: 3200, diameter_m: 0.075, material: 'HDPE PN16', static_head_m: 318, note: 'Primary gravity transmission pipeline.' },
  { id: 'DM-2', name: 'Carolina Well to RHU', src: 'MB-04', dst: 'RH-05', length_m: 2100, diameter_m: 0.050, material: 'PVC Class 100', static_head_m: 26, note: 'Gravity intertie for emergency clinic backup.' },
];

function calcWqhi(r) {
  let sub = 100;
  if (r.turbidity > 5) sub -= Math.min(35, (r.turbidity - 5) * 3);
  if (r.ph < 6.5) sub -= Math.min(25, (6.5 - r.ph) * 30);
  if (r.ph > 8.5) sub -= Math.min(25, (r.ph - 8.5) * 30);
  if (r.tds > 600) sub -= Math.min(20, (r.tds - 600) * 0.1);
  if (r.orp < 300) sub -= Math.min(25, (300 - r.orp) * 0.2);
  if (r.bio != null && r.bio > 10) sub -= Math.min(40, (r.bio - 10) * 3);
  const score = Math.max(0, Math.min(100, Math.round(sub)));
  return { score, status: score >= 85 ? 'Excellent' : score >= 70 ? 'Fair' : 'Poor' };
}

function calcRisk(r, base, rain = 0) {
  const turbRisk = Math.max(0, Math.min(1, (r.turbidity - base.turbidity) / 15));
  const orpRisk = Math.max(0, Math.min(1, (base.orp - r.orp) / 180));
  const bioRisk = r.bio != null ? Math.max(0, Math.min(1, (r.bio - base.bio) / 12)) : 0;
  const rainRisk = Math.min(0.2, rain / 200);
  const total = 1 - (1 - turbRisk * 0.7) * (1 - orpRisk * 0.75) * (1 - bioRisk * 0.8) * (1 - rainRisk);
  const risk = Math.max(0, Math.min(1, Math.round(total * 100) / 100));
  const band = risk < 0.25 ? 'Low' : risk < 0.45 ? 'Watch' : risk < 0.60 ? 'Suspect' : 'Severe';
  return { risk, band, parts: { turbidity: turbRisk, orp: orpRisk, bio: bioRisk } };
}

class DemoDigitalTwin {
  constructor() {
    this.epoch0 = Date.now() - 3600 * 4 * 1000;
    this.simSpeed = 60;
    this.autoPreempt = true;
    this.rain = 0;
    this.runoffRain = 0;
    this.scenarioName = 'NORMAL';
    this.scenarioElapsed = 0;

    this.stations = {};
    for (const d of STATIONS_DEF) {
      this.stations[d.id] = {
        ...d,
        reading: { ...d.base },
        baseline: { ...d.base },
        valveOpen: Boolean(d.valve),
        tankPct: d.tank ? 75 : null,
        edgeState: 'NORMAL',
        classification: 'NORMAL',
        drift: null,
        lastSeenT: Date.now(),
        batteryV: 3.98 + (Math.random() * 0.2),
        rssi: -85 - Math.round(Math.random() * 15),
        snr: 6.5 + Math.round(Math.random() * 4),
        hist: [],
      };
    }

    this.events = [
      { t_ms: Date.now() - 1800000, station: 'KS-03', type: 'SYSTEM', severity: 'info', message: 'Edge node KS-03 online via LoRaWAN (RSSI -91 dBm).' },
      { t_ms: Date.now() - 900000, station: 'IN-01', type: 'TASK_DONE', severity: 'info', message: 'Intake strainer inspected by operator. Flow clear.' },
    ];

    this.smsOutbox = [];

    this.tasks = [
      { id: 'T-101', station: 'KS-03', title: 'Clean optical turbidity lens', kind: 'LENS_CLEAN', due_ms: Date.now() + 3600000, urgent: false, status: 'PENDING' },
      { id: 'T-102', station: 'IN-01', title: 'Monthly spring box catchment patrol', kind: 'PATROL', due_ms: Date.now() + 86400000, urgent: false, status: 'PENDING' },
      { id: 'T-103', station: 'MB-04', title: 'Solar pump inverter check', kind: 'PUMP', due_ms: Date.now() - 7200000, urgent: true, status: 'PENDING' },
      { id: 'T-104', station: 'RH-05', title: 'Replace pre-filter sediment cartridge', kind: 'FILTER', due_ms: Date.now() - 18000000, urgent: false, status: 'COMPLETED', done_ms: Date.now() - 14000000, done_by: 'Staff nurse' },
    ];

    this._seedHistory();
  }

  _seedHistory() {
    const now = Date.now();
    for (const st of Object.values(this.stations)) {
      st.hist = [];
      for (let m = 360; m >= 0; m -= 5) {
        const t_ms = now - m * 60 * 1000;
        const jTurb = (Math.random() - 0.5) * 0.2;
        const jOrp = (Math.random() - 0.5) * 4;
        const r = {
          turbidity: Math.max(0.1, st.base.turbidity + jTurb),
          orp: st.base.orp + jOrp,
          ph: st.base.ph + (Math.random() - 0.5) * 0.04,
          tds: st.base.tds + (Math.random() - 0.5) * 2,
          temp: st.base.temp + (Math.random() - 0.5) * 0.3,
          bio: st.base.bio ? Math.max(0.1, st.base.bio + (Math.random() - 0.5) * 0.2) : null,
        };
        const w = calcWqhi(r);
        const rsk = calcRisk(r, st.base);
        st.hist.push({ t_ms, ...r, wqhi: w.score, risk: rsk.risk, valve_open: st.valveOpen });
      }
    }
  }

  tick() {
    this.scenarioElapsed += 1;
    const now = Date.now();

    for (const st of Object.values(this.stations)) {
      // Natural micro-jitter
      let dTurb = (Math.random() - 0.5) * 0.08;
      let dOrp = (Math.random() - 0.5) * 1.5;
      let dPh = (Math.random() - 0.5) * 0.02;
      let dTds = (Math.random() - 0.5) * 0.8;
      let dBio = st.reading.bio != null ? (Math.random() - 0.5) * 0.1 : null;

      if (this.scenarioName === 'SEPTIC') {
        if (st.id === 'AG-02') {
          st.reading.turbidity = Math.min(38, st.reading.turbidity + 0.6);
          st.reading.orp = Math.max(160, st.reading.orp - 4.5);
          if (st.reading.bio != null) st.reading.bio = Math.min(26, st.reading.bio + 0.4);
          st.classification = 'ACUTE_EVENT';
          st.edgeState = 'TRIPPED';
        } else if (st.id === 'KS-03' && this.scenarioElapsed > 20) {
          // Plume reaches Pacol kiosk after ~20s
          st.reading.turbidity = Math.min(24, st.reading.turbidity + 0.4);
          st.reading.orp = Math.max(220, st.reading.orp - 3.2);
          if (st.reading.bio != null) st.reading.bio = Math.min(18, st.reading.bio + 0.3);
          if (this.autoPreempt && st.valveOpen) {
            st.valveOpen = false;
            st.edgeState = 'TRIPPED';
            this.events.unshift({
              t_ms: now, station: 'KS-03', type: 'CMD_PREEMPT_SHUT', severity: 'warning',
              message: 'Twin pre-emptive shut-off: plume arrival window in 12 min. Intake solenoid closed automatically.',
            });
          }
        }
      } else if (this.scenarioName === 'MONSOON') {
        this.rain = Math.min(48, this.rain + 0.8);
        dTurb += 0.15;
        dTds += 0.5;
      } else if (this.scenarioName === 'BIOFOULING') {
        if (st.id === 'KS-03') {
          // Slow linear turbidity creep while ORP and TDS remain completely flat
          st.reading.turbidity = Math.min(22.5, st.reading.turbidity + 0.12);
          st.classification = 'SENSOR_BIOFOULING';
          st.drift = { slope_ntu_per_min: 0.28, r2: 0.98, orp_dev: 4 };
        }
      } else if (this.scenarioName === 'RESET') {
        // Smooth recovery to base
        st.reading.turbidity += (st.base.turbidity - st.reading.turbidity) * 0.15;
        st.reading.orp += (st.base.orp - st.reading.orp) * 0.15;
        st.reading.ph += (st.base.ph - st.reading.ph) * 0.15;
        st.reading.tds += (st.base.tds - st.reading.tds) * 0.15;
        if (st.reading.bio != null) st.reading.bio += (st.base.bio - st.reading.bio) * 0.15;
        if (Math.abs(st.reading.turbidity - st.base.turbidity) < 0.2) {
          st.classification = 'NORMAL';
          st.edgeState = 'NORMAL';
          st.drift = null;
          this.scenarioName = 'NORMAL';
        }
      }

      st.reading.turbidity = Math.max(0.1, Number((st.reading.turbidity + dTurb).toFixed(2)));
      st.reading.orp = Number((st.reading.orp + dOrp).toFixed(1));
      st.reading.ph = Number(Math.max(4, Math.min(10, st.reading.ph + dPh)).toFixed(2));
      st.reading.tds = Number((st.reading.tds + dTds).toFixed(1));
      if (st.reading.bio != null) st.reading.bio = Math.max(0.1, Number((st.reading.bio + dBio).toFixed(2)));

      if (st.tankPct != null) {
        if (st.valveOpen) st.tankPct = Math.min(98, st.tankPct + 0.05);
        else st.tankPct = Math.max(8, st.tankPct - 0.15);
      }

      const w = calcWqhi(st.reading);
      const rsk = calcRisk(st.reading, st.baseline, this.rain);
      st.wqhi = w;
      st.risk = rsk.risk;
      st.riskBand = rsk.band;
      st.riskParts = rsk.parts;
    }
  }

  getStatic() {
    return {
      site: { id: 'naga', title: 'Mt. Isarog → Naga River Catchment', subtitle: 'Naga City, Camarines Sur' },
      pnsdw: PNSDW,
      thresholds: { suspect: 0.45, trip: 0.60, persistence_s: 120 },
      task_kinds: [
        { kind: 'LENS_CLEAN', label: 'Optical lens cleaning', interval_days: 14 },
        { kind: 'PATROL', label: 'Catchment patrol', interval_days: 30 },
        { kind: 'PUMP', label: 'Pump & electrical check', interval_days: 45 },
        { kind: 'FILTER', label: 'Pre-filter cartridge change', interval_days: 60 },
      ],
      heat_indices: ['risk', 'turbidity', 'ph', 'tds', 'bio'],
      pipes: PIPES_DEF,
    };
  }

  getState() {
    const now = Date.now();
    const stations = Object.values(this.stations).map((st) => ({
      id: st.id, name: st.name, kind: st.kind, owner: st.owner, network: st.network, gateway: st.gateway, note: st.note,
      lat: 13.62 + (st.chainage_m / 28000) * 0.08, lon: 123.25 - (st.chainage_m / 28000) * 0.12,
      elevation_m: st.elevation_m, chainage_m: st.chainage_m, catchment_km2: st.catchment_km2, population: st.population,
      reading: { ...st.reading }, baseline: { ...st.baseline }, aquifer: st.aquifer,
      risk: st.risk, risk_band: st.riskBand, risk_parts: st.riskParts,
      wqhi: st.wqhi, classification: st.classification, drift: st.drift, edge_state: st.edgeState,
      valve: st.valve ? { ...st.valve, open: st.valveOpen } : null,
      tank: st.tank ? { capacity_l: st.tank.capacity_l, pct: Math.round(st.tankPct), reserve_h: Number(((st.tank.capacity_l * st.tankPct / 100) / (st.tank.demand_lps * 3600)).toFixed(1)) } : null,
      link: { last_seen_t: st.lastSeenT, rssi: st.rssi, snr: st.snr, battery_v: Number(st.batteryV.toFixed(2)), f_cnt: 142, source: `LoRaWAN ${st.id}` },
      sms: st.sms,
    }));

    const fcStations = {};
    for (const st of Object.values(this.stations)) {
      const isSeptic = this.scenarioName === 'SEPTIC';
      const arr = st.id === 'AG-02' ? (isSeptic ? 0 : null) : st.id === 'KS-03' ? (isSeptic ? Math.max(60, 720 - this.scenarioElapsed * 20) : null) : null;
      fcStations[st.id] = {
        arrival_s: arr,
        peak_risk: isSeptic && (st.id === 'AG-02' || st.id === 'KS-03') ? 0.78 : st.risk,
        peak_band: isSeptic && (st.id === 'AG-02' || st.id === 'KS-03') ? 'Severe' : st.riskBand,
        clear_s: arr ? arr + 3600 : null,
      };
    }

    const reaches = [
      { reach: 'IN-01→AG-02', length_km: 7.2, slope_m_per_m: 0.032, velocity_mps: 1.15, travel_time_min: 104, velocity_factor: 0.94 },
      { reach: 'AG-02→KS-03', length_km: 6.2, slope_m_per_m: 0.015, velocity_mps: 0.92, travel_time_min: 112, velocity_factor: 0.88 },
      { reach: 'KS-03→MB-04', length_km: 6.4, slope_m_per_m: 0.006, velocity_mps: 0.74, travel_time_min: 144, velocity_factor: 0.91 },
      { reach: 'MB-04→RH-05', length_km: 6.8, slope_m_per_m: 0.005, velocity_mps: 0.68, travel_time_min: 166, velocity_factor: 0.89 },
    ];

    const pipes = PIPES_DEF.map((p) => {
      const src = this.stations[p.src];
      const flowing = src.valveOpen && (src.tankPct == null || src.tankPct > 5);
      return {
        id: p.id, flow_lps: flowing ? (p.id === 'GL-1' ? 4.8 : 2.4) : 0,
        velocity_mps: flowing ? (p.id === 'GL-1' ? 1.08 : 0.82) : 0,
        flowing, status: flowing ? 'Flowing by gravity' : 'Stopped: valve closed',
        source_risk: src.risk, source_band: src.riskBand,
      };
    });

    return {
      clock: { t: this.scenarioElapsed * 60, epoch_ms: now, speed: this.simSpeed, mode: 'sim' },
      rain_mm_hr: Number(this.rain.toFixed(1)), runoff_mm_hr: Number((this.rain * 0.7).toFixed(1)),
      stations,
      forecast: { t: now, stations: fcStations },
      reaches, pipes, calibration: [], events: this.events.slice(0, 50),
      sms: this.smsOutbox.slice(0, 20), sms_provider: 'Local SMS Bridge (Simulated)',
      auto_preempt: this.autoPreempt, forecast_engine: 'React Native in-app twin',
      storage: 'React Native Local Storage',
    };
  }

  getForecast() {
    const stations = {};
    for (const [id, st] of Object.entries(this.stations)) {
      const arr = this.scenarioName === 'SEPTIC' && id === 'KS-03' ? Math.max(60, 720 - this.scenarioElapsed * 20) : null;
      const series = [];
      for (let tau = 300; tau <= 14400; tau += 300) {
        let r = st.risk;
        if (this.scenarioName === 'SEPTIC' && (id === 'KS-03' || id === 'AG-02')) {
          const dt = (tau - (arr || 0)) / 1800;
          r = Math.max(st.risk, 0.75 * Math.exp(-dt * dt));
        }
        series.push({ tau, risk: Number(Math.min(1, r).toFixed(2)) });
      }
      stations[id] = {
        arrival_s: arr,
        peak_risk: this.scenarioName === 'SEPTIC' ? 0.78 : st.risk,
        peak_band: this.scenarioName === 'SEPTIC' ? 'Severe' : st.riskBand,
        clear_s: arr ? arr + 3600 : null,
        series,
      };
    }
    return { t: Date.now(), stations };
  }

  getHistory(stationId, minutes = 360) {
    const st = this.stations[stationId] || this.stations['KS-03'];
    return { station_id: st.id, series: st.hist };
  }

  getMaintenance() {
    return { tasks: this.tasks };
  }

  getCompliance(hours = 24) {
    return {
      backend: 'React Native local audit archive',
      stations: Object.values(this.stations).map((s) => ({
        station_id: s.id, samples: 288, wqhi_avg: s.wqhi.score,
        turbidity_pct: s.classification === 'ACUTE_EVENT' ? 76.4 : 98.6,
        ph_pct: 100.0, tds_pct: 100.0,
        intake_closed_pct: s.valveOpen ? 0.0 : 100.0,
      })),
    };
  }

  getTrend(hours = 12, bucketMin = 30) {
    const now = Date.now();
    const count = Math.round((hours * 60) / bucketMin);
    const series = [];
    for (let i = 0; i < count; i++) {
      series.push({
        t_ms: now - (count - i) * bucketMin * 60 * 1000,
        avg: Math.min(100, Math.max(65, 88 + Math.round((Math.random() - 0.5) * 8))),
        min: 72,
      });
    }
    return { series };
  }

  act(path, body) {
    const now = Date.now();
    if (path === '/api/valve') {
      const { station_id, action } = body;
      const st = this.stations[station_id];
      if (st) {
        if (action === 'SHUT') {
          st.valveOpen = false;
          st.edgeState = 'TRIPPED';
          this.events.unshift({ t_ms: now, station: station_id, type: 'CMD_SHUT', severity: 'warning', message: `Operator closed intake valve at ${st.name}.` });
          return { ok: true, message: `Intake at ${st.name} closed.` };
        }
        if (action === 'REARM' || action === 'FORCE_REARM') {
          st.valveOpen = true;
          st.edgeState = 'NORMAL';
          this.events.unshift({ t_ms: now, station: station_id, type: 'CMD_REARM', severity: 'info', message: `Operator re-opened intake valve at ${st.name}.` });
          return { ok: true, message: `Intake at ${st.name} re-opened.` };
        }
      }
    }
    if (path === '/api/scenario') {
      const { name } = body;
      this.scenarioName = name;
      this.scenarioElapsed = 0;
      this.events.unshift({ t_ms: now, station: null, type: 'SCENARIO', severity: 'info', message: `Scenario triggered: ${name}.` });
      return { ok: true, message: `Injected scenario ${name}.` };
    }
    if (path === '/api/policy') {
      this.autoPreempt = Boolean(body.auto_preempt);
      return { ok: true, message: `Auto-preempt ${this.autoPreempt ? 'enabled' : 'disabled'}.` };
    }
    if (path === '/api/speed') {
      this.simSpeed = Number(body.speed) || 60;
      return { ok: true, message: `Speed set to ${this.simSpeed}×.` };
    }
    if (path === '/api/maintenance/clean') {
      const { station_id } = body;
      const st = this.stations[station_id];
      if (st) {
        st.reading.turbidity = st.base.turbidity;
        st.classification = 'NORMAL';
        st.drift = null;
        this.events.unshift({ t_ms: now, station: station_id, type: 'CMD_CLEANED', severity: 'info', message: `Probe cleaned at ${st.name}. Drift reset.` });
      }
      return { ok: true, message: 'Probe cleaned.' };
    }
    if (path === '/api/maintenance/task') {
      const { id, done } = body;
      const task = this.tasks.find((t) => t.id === id);
      if (task && done) {
        task.status = 'COMPLETED';
        task.done_ms = now;
        this.events.unshift({ t_ms: now, station: task.station, type: 'TASK_DONE', severity: 'info', message: `Task "${task.title}" completed.` });
      }
      return { ok: true, message: 'Task updated.' };
    }
    if (path === '/api/advisory') {
      const { station_ids, message } = body;
      const target = (station_ids && station_ids.length ? station_ids : ['KS-03', 'RH-05']);
      for (const sid of target) {
        const st = this.stations[sid];
        if (st) {
          const text = message || `Water Advisory: Potential contamination detected upstream of ${st.name}. Boil water advisory in effect.`;
          this.smsOutbox.unshift({ t: now, role: st.sms, status: 'Simulated SMS Sent', message: text });
          this.events.unshift({ t_ms: now, station: sid, type: 'ADVISORY_SENT', severity: 'warning', message: `Advisory sent to ${st.sms}: ${text}` });
        }
      }
      return { ok: true, message: 'SMS advisories dispatched.' };
    }
    return { ok: true };
  }
}

export const demoTwin = new DemoDigitalTwin();
