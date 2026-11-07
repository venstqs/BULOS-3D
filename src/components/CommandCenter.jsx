import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Box, Check, LayoutPanelLeft, ChevronUp, Clock, Crosshair, Cpu, Droplets, FlaskConical, Lock, LockOpen, Menu, Minus, Navigation, Pause, Plane, Play, Plus, RotateCcw, Search, Send, Tag, TriangleAlert, Users, X,
} from 'lucide-react';
import { get, post, usePoll } from '../api';
import { EDGE_LABEL, fmt, fmtClock, fmtMin, stationStatus } from '../lib/format';
import { AHEAD_S, PAST_S, exposure, fmtOffset } from '../lib/twinField';
import { useTwinTime } from '../lib/useTwinTime';
import { Floating, resetPanels, usePanelsMoved } from '../lib/floating';

const TwinMapScene = lazy(() => import('./TwinMapScene'));
// One surface for everything that hangs over the map: plain white, so the map keeps the colour
const card = 'rounded-xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2),0_4px_14px_rgba(16,24,40,0.14)]';

function Figure({ value, label, alert = false }) {
  return (
    <div>
      <dd className={`m-0 font-display text-[19px] font-semibold leading-tight tabular-nums ${alert ? 'text-[#a32626]' : 'text-ink'}`}>{value}</dd>
      <dt className="text-[11.5px] text-muted">{label}</dt>
    </div>
  );
}

/** Recorded history, now, and the forecast on one line, with alerts marked where they happened. */
function Timeline({ live, time }) {
  const at = (s) => `${((s + PAST_S) / (PAST_S + AHEAD_S)) * 100}%`;
  const marks = live.events.filter((e) => (e.severity === 'danger' || e.severity === 'warning') && e.t_ms > live.clock.epoch_ms - PAST_S * 1000).slice(0, 40);
  return (
    <div className={`${card} flex min-w-[260px] flex-1 items-center gap-2.5 px-2.5 py-1.5`}>
      <button onClick={time.togglePlay} aria-label={time.playing ? 'Pause' : 'Play the last 6 hours and next 4 hours'} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-civic text-white">
        {time.playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <span className="shrink-0 text-[11px] text-muted">−6 h</span>
      <div className="relative min-w-0 flex-1">
        <input type="range" min={-PAST_S} max={AHEAD_S} step={time.step} value={time.tauStep} aria-label="Time" onChange={(e) => time.scrub(Number(e.target.value))} className="block w-full accent-[#2f5be7]" />
        <i className="pointer-events-none absolute -bottom-0.5 -top-0.5 w-px bg-ink-2" style={{ left: at(0) }} />
        {marks.map((e, i) => <i key={`${e.t_ms}-${i}`} className="pointer-events-none absolute top-1/2 h-2 w-[3px] -translate-x-1/2 -translate-y-1/2" style={{ left: at((e.t_ms - live.clock.epoch_ms) / 1000), background: e.severity === 'danger' ? '#d03b3b' : '#e0a800' }} />)}
      </div>
      <span className="shrink-0 text-[11px] text-muted">+4 h</span>
      <button onClick={time.toNow} disabled={time.tauStep === 0} className="w-[64px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-civic disabled:text-muted">{time.tauStep === 0 ? 'Now' : fmtOffset(time.tauStep)}</button>
    </div>
  );
}

function Row({ label, children }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-xs last:border-0"><span className="text-muted">{label}</span><span className="text-right font-medium">{children}</span></div>;
}

function Inspector({ st, fc, act, quick, onInspect, onDetails, onClose, onStreet, onSensors }) {
  const status = stationStatus(st);
  const r = st.reading ?? {};
  const closed = st.valve && !st.valve.open;
  const eta = fc?.arrival_s > 0 ? fc.arrival_s : null;
  return (
    <div className="p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: status.color }}><Droplets size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold text-muted">{st.id}</div>
          <div className="font-display text-sm font-semibold leading-tight">{st.name}</div>
        </div>
        <button onClick={onClose} aria-label="Close inspector" className="rounded-lg p-1 text-muted hover:bg-panel-2"><X size={15} /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="pill" style={{ background: `${status.color}22`, color: status.ink }}>{status.label}</span>
        {st.valve && <span className={`pill ${closed ? 'pill-red' : 'pill-good'}`}>{closed ? 'Intake closed' : 'Intake open'}</span>}
        {eta && <span className="pill pill-amber">ETA {fmtMin(eta)}</span>}
      </div>
      <div className="mt-2">
        <Row label="Health index">{st.wqhi.score} / 100</Row>
        <Row label="Contamination risk">{fmt(st.risk, 2)}</Row>
        {st.tank && <Row label="Stored water">{st.tank.pct}% · {fmt(st.tank.reserve_h, 1)} h</Row>}
        <Row label="People served">{(st.population ?? 0).toLocaleString()}</Row>
      </div>
      <div className="mt-2 rounded-xl bg-panel-2 px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold"><span>Sensor bank</span><span className="pill pill-grey !text-[10px]">Simulated</span></div>
        <Row label="Turbidity">{fmt(r.turbidity, 1)} NTU</Row>
        <Row label="pH">{fmt(r.ph, 2)}</Row>
        <Row label="ORP">{fmt(r.orp, 0)} mV</Row>
        <Row label="TDS">{fmt(r.tds, 0)} mg/L</Row>
        <Row label="Temperature">{fmt(r.temp, 1)} °C</Row>
        {r.bio != null && <Row label="Biological (TLF)">{fmt(r.bio, 1)} ppb</Row>}
      </div>
      <div className="mt-1">
        <Row label="Node state">{EDGE_LABEL[st.edge_state] ?? st.edge_state}</Row>
      </div>
      {st.valve && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button disabled={closed} onClick={() => act('/api/valve', { station_id: st.id, action: 'SHUT' }, `Intake at ${st.id} closed.`)}
                  className="flex items-center justify-center gap-1 rounded-xl bg-[#d03b3b] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><Lock size={13} />Close intake</button>
          <button disabled={!closed} onClick={() => act('/api/valve', { station_id: st.id, action: 'REARM' }, `Intake at ${st.id} re-opened.`)}
                  className="flex items-center justify-center gap-1 rounded-xl border border-line bg-white px-2 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40"><LockOpen size={13} />Reopen</button>
        </div>
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button onClick={() => onSensors(st.id)} className="flex items-center justify-center gap-1 rounded-xl bg-[#e9efff] px-2 py-1.5 text-xs font-semibold text-civic"><Cpu size={13} />See sensors</button>
        <button onClick={() => onStreet(st.id)} className="flex items-center justify-center gap-1 rounded-xl bg-[#e9efff] px-2 py-1.5 text-xs font-semibold text-civic"><Users size={13} />Street view</button>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <button onClick={() => onInspect(st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><Box size={12} />3D site</button>
        <button onClick={() => quick('test', st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><FlaskConical size={12} />Test</button>
        <button onClick={() => onDetails(st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><Activity size={12} />Details</button>
      </div>
    </div>
  );
}

/** Where the plume is along the river, as a route of water points. */
function Tracker({ live, danger, onPick }) {
  const fc = live.forecast.stations ?? {};
  const steps = live.stations.map((s) => {
    const arrival = fc[s.id]?.arrival_s > 0 ? fc[s.id].arrival_s : null;
    const hit = s.risk >= 0.45;
    const closed = s.valve && !s.valve.open;
    const label = hit ? 'Contaminated' : arrival ? `in ${arrival >= 3600 ? `${Math.floor(arrival / 3600)} h ${Math.round((arrival % 3600) / 60)} m` : `${Math.round(arrival / 60)} min`}` : s.classification === 'SENSOR_BIOFOULING' ? 'Dirty sensor' : 'Clear';
    return { s, hit, arrival, closed, label };
  });
  const active = danger.points > 0;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-display text-sm font-semibold">Along the river</div>
        <span className={`pill ${active ? 'pill-red' : 'pill-good'}`}>{active ? `${danger.points} water point${danger.points > 1 ? 's' : ''} affected` : 'River clear'}</span>
      </div>
      <ol className="flex items-start">
        {steps.map(({ s, hit, arrival, closed, label }, i) => (
          <li key={s.id} className="relative min-w-0 flex-1 text-center">
            {i > 0 && <span className={`absolute right-1/2 top-[11px] h-[3px] w-full ${hit || arrival ? 'bg-[#ec835a]' : 'bg-[#cfe0ff]'}`} />}
            <button onClick={() => onPick(s.id)} className="relative z-[1] mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white"
                    style={{ background: hit ? '#d03b3b' : arrival ? '#ec835a' : '#2f5be7' }} aria-label={`Select ${s.id}`}>
              {hit ? <X size={13} /> : arrival ? <Clock size={13} /> : <Check size={13} />}
            </button>
            <div className="mt-1 text-[11px] font-semibold">{s.id}</div>
            <div className="truncate px-0.5 text-[10px] text-ink-2">{label}</div>
            <div className="h-[15px] text-[10px] font-semibold text-[#a32626]">{closed ? 'Closed' : ''}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tables({ live, tasks, quick, onPick, weather, access }) {
  const [tab, setTab] = useState('intakes');
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const feed = live.events.filter((e) => e.type !== 'TRANSIT_CALIBRATION').slice(0, 12);
  const tabs = [['intakes', 'Intakes', live.stations.filter((s) => s.valve).length], ['sensors', 'Sensors', live.stations.length], ['crews', 'Tasks', open.length], ['events', 'Events', feed.length], ['river', 'River', live.reaches.length], ['weather', 'Weather', ''], ['access', 'Access', access?.length ?? 0]];
  const line = 'flex w-full items-center gap-2 border-b border-line py-1.5 text-left text-xs last:border-0 hover:bg-panel-2';
  return (
    <div className="p-3">
      <div className="mb-1 flex gap-2 overflow-x-auto whitespace-nowrap border-b border-line text-[11px] font-semibold" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-0.5 pb-1.5 ${tab === k ? 'border-civic text-civic' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      <div>
        {tab === 'intakes' && live.stations.filter((s) => s.valve).map((s) => (
          <button key={s.id} onClick={() => onPick(s.id)} className={line}>
            <span className="w-12 font-semibold">{s.id}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
            <span className="text-muted">{fmt(s.tank?.reserve_h, 1)} h</span>
            <span className={`pill ${s.valve.open ? 'pill-good' : 'pill-red'}`}>{s.valve.open ? 'Open' : 'Closed'}</span>
          </button>
        ))}
        {tab === 'sensors' && live.stations.map((s) => (
          <button key={s.id} onClick={() => onPick(s.id)} className={line}>
            <span className="w-12 font-semibold">{s.id}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.owner}</span>
            <span className="text-muted">{fmt(s.link?.battery_v, 2)} V</span>
            <span className="text-muted">{s.link?.rssi} dBm</span>
          </button>
        ))}
        {tab === 'access' && (
          <>
            <p className="pb-1 text-[10px] text-muted">Barangays furthest from a water source by road, using the proposed network.</p>
            {(access ?? []).slice(0, 40).map((a) => (
              <div key={a.name} className="flex items-center gap-2 border-b border-line py-1 text-xs last:border-0">
                <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
                <span className={`pill !text-[10px] ${a.road_km == null ? 'pill-red' : a.road_km > 3 ? 'pill-amber' : 'pill-good'}`}>{a.road_km == null ? 'Over 6 km' : `${fmt(a.road_km, 1)} km`}</span>
              </div>
            ))}
          </>
        )}
        {tab === 'weather' && (weather?.available ? (
          <>
            <div className="flex items-center justify-between py-1 text-xs"><b>{weather.condition}, {fmt(weather.temp_c, 0)}°C</b><span className="pill pill-good !text-[10px]">Real · live</span></div>
            <Row label="Rain right now">{fmt(weather.rain_mm, 1)} mm</Row>
            <Row label="Rain forecast, next 24 h">{fmt(weather.next24_mm, 1)} mm</Row>
            <Row label="Wind">{fmt(weather.wind_kmh, 0)} km/h</Row>
            {weather.discharge_m3s != null && <Row label="River flow estimate">{fmt(weather.discharge_m3s, 1)} m³/s</Row>}
            <p className="pt-1 text-[10px] text-muted">Open-Meteo, updated every 15 minutes. Not used by the simulated field.</p>
          </>
        ) : <p className="py-3 text-center text-xs text-muted">{weather ? 'Live weather is not reachable right now.' : 'Loading live weather…'}</p>)}
        {tab === 'river' && (
          <>
            <div className="flex items-center justify-between border-b border-line py-1.5 text-xs"><span className="text-muted">Rain now</span><b>{fmt(live.rain_mm_hr, 1)} mm/h</b></div>
            {live.reaches.map((r) => (
              <div key={r.reach} className="flex items-center gap-2 border-b border-line py-1.5 text-xs last:border-0">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.reach}</span>
                <span className="text-muted">{fmt(r.mean_velocity_mps, 2)} m/s</span>
                <span className="text-muted">{fmt(r.depth_m, 2)} m deep</span>
                <span className="text-muted">{fmtMin(r.travel_time_s)}</span>
              </div>
            ))}
          </>
        )}
        {tab === 'events' && (feed.length ? feed.map((e, i) => (
          <div key={`${e.t_ms}-${i}`} className="flex items-start gap-2 border-b border-line py-1.5 text-[11.5px] last:border-0">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${e.severity === 'danger' ? 'bg-critical' : e.severity === 'warning' ? 'bg-warning' : 'bg-civic'}`} />
            <span className="w-14 shrink-0 text-muted">{fmtClock(e.t_ms)}</span>
            <span className="min-w-0 flex-1 text-ink-2">{e.station ? `${e.station}: ` : ''}{e.message}</span>
          </div>
        )) : <p className="py-3 text-center text-xs text-muted">No events yet.</p>)}
        {tab === 'crews' && (open.length ? open.slice(0, 8).map((t) => (
          <button key={t.id} onClick={() => quick('log', t.id)} className={line}>
            <span className="w-12 font-semibold">{t.station}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{t.title}</span>
            <span className={`pill ${t.status === 'OVERDUE' || t.urgent ? 'pill-red' : t.status === 'DUE_TODAY' ? 'pill-amber' : 'pill-grey'}`}>
              {t.status === 'OVERDUE' ? 'Overdue' : t.status === 'DUE_TODAY' ? 'Today' : 'Later'}
            </span>
          </button>
        )) : <p className="py-3 text-center text-xs text-muted">No open tasks.</p>)}
      </div>
    </div>
  );
}

const HAZARDS = {
  none: { label: 'None', group: 'Water quality' },
  risk: { label: 'Overall contamination risk', group: 'Water quality', low: 'Low', high: 'Severe' },
  turbidity: { label: 'Turbidity', group: 'Water quality', low: 'Clear', high: 'Cloudy' },
  ph: { label: 'pH', group: 'Water quality', low: 'Normal', high: 'Off range' },
  tds: { label: 'Total dissolved solids', group: 'Water quality', low: 'Low', high: 'High' },
  bio: { label: 'Biological indicator', group: 'Water quality', low: 'Low', high: 'High' },
  wells: { label: 'Shallow well exposure', group: 'Water access', low: 'Lower', high: 'Higher', note: 'Low ground near the river, where wells draw in river water. Our estimate.' },
  runoff: { label: 'Runoff sources', group: 'Water access', low: 'Low', high: 'High', note: 'Wet, steep ground that sends rain and pollution into the river. Our estimate.' },
  access: { label: 'Distance to water', group: 'Water access', low: 'Near', high: '5 km+', note: 'Straight-line distance to the nearest water point or district facility.' },
};
const HEAT = ['risk', 'turbidity', 'ph', 'tds', 'bio'];
const PALETTE_CSS = { hazard: ['#ffe05a', '#fa9628', '#e0342c'], ocean: ['#bae6fd', '#3896f0', '#1432a0'], clear: ['#fde725', '#21918c', '#440154'] };
const VIEW_KEY = 'bulos-view';
const DEFAULT_VIEW = { mapLabels: true, hazard: 'risk', opacity: 0.7, palette: 'hazard', base: 'satellite', relief: 1.5 };
const OFF_BY_DEFAULT = ['network', 'barangays'];
const TOGGLES = [['buildings', 'Real 3D buildings'], ['labels', 'Roads and place names'], ['streams', 'Streams'], ['pipes', 'Main pipelines'], ['network', 'Proposed barangay network'], ['barangays', 'Barangay access dots'], ['assets', 'Water district facilities'], ['particles', 'Water flow'], ['catchment', 'Watershed']];

function CustomisePanel({ view, setView, layers, setLayers }) {
  const set = (patch) => setView((v) => ({ ...v, ...patch }));
  const pick = (k, options) => (
    <div className="flex rounded-xl bg-panel-2 p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => set({ [k]: v })} aria-pressed={view[k] === v} className={`flex-1 rounded-[10px] px-1.5 py-1 text-[11px] font-semibold ${view[k] === v ? 'bg-civic text-white' : 'text-ink-2'}`}>{label}</button>
      ))}
    </div>
  );
  return (
    <div className="p-3 text-xs text-ink-2">
      {['Water quality', 'Water access'].map((group) => (
        <div key={group}>
          <div className="mt-2 text-[12px] font-semibold text-ink">{group}</div>
          {Object.entries(HAZARDS).filter(([, h]) => h.group === group).map(([k, h]) => (
            <label key={k} className="flex items-center gap-2 py-0.5">
              <input type="radio" name="hazard" checked={view.hazard === k} onChange={() => set({ hazard: k })} className="h-3.5 w-3.5 accent-[#2f5be7]" />{h.label}
            </label>
          ))}
        </div>
      ))}
      <label className="mt-1 block">Layer opacity <b>{Math.round(view.opacity * 100)}%</b>
        <input type="range" min={0.2} max={1} step={0.05} value={view.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="w-full accent-[#2f5be7]" />
      </label>
      <div className="mb-1 mt-2 text-[12px] font-semibold text-ink">Colours</div>
      {pick('palette', [['hazard', 'Hazard'], ['ocean', 'Water'], ['clear', 'Colour-safe']])}
      <div className="mb-1 mt-2 text-[12px] font-semibold text-ink">Base map</div>
      {pick('base', [['satellite', 'Satellite'], ['light', 'Light'], ['dark', 'Dark']])}
      <label className="mt-2 block">Terrain height <b>×{view.relief}</b>
        <input type="range" min={1} max={3} step={0.25} value={view.relief} onChange={(e) => set({ relief: Number(e.target.value) })} className="w-full accent-[#2f5be7]" />
      </label>
      <div className="mb-1 mt-2 text-[12px] font-semibold text-ink">Show on the map</div>
      {TOGGLES.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 py-0.5">
          <input type="checkbox" checked={OFF_BY_DEFAULT.includes(k) ? layers[k] === true : layers[k] !== false} onChange={() => setLayers((l) => ({ ...l, [k]: OFF_BY_DEFAULT.includes(k) ? l[k] !== true : l[k] === false }))} className="h-3.5 w-3.5 accent-[#2f5be7]" />{label}
        </label>
      ))}
      <button onClick={() => setView(DEFAULT_VIEW)} className="mt-2 w-full rounded-xl border border-line py-1 text-[11px] font-semibold text-ink-2">Reset to default</button>
    </div>
  );
}

const SOURCES = [
  ['Real', 'pill-good', ['Terrain: Copernicus GLO-90 elevation', 'Satellite imagery: Esri', 'River, streams, roads, buildings: OpenStreetMap', 'Water district facilities and barangay names: OpenStreetMap', 'Weather right now: Open-Meteo, live']],
  ['Computed', 'pill-blue', ['River speed and travel time, from real slope', 'Well exposure and runoff layers, from the 90 m elevation model', 'Forecasts and risk scores, from the twin']],
  ['Simulated', 'pill-amber', ['All sensor readings at the five water points', 'Spills, storms in Simulate, valves, tanks and SMS']],
  ['Illustrative', 'pill-grey', ['The five water points are a proposed layout, not existing sites', 'Pipelines and the barangay network follow real roads, but they are proposed routes', 'Building and people models, and the rain gauge position']],
];

function DataPanel() {
  return (
    <div className="border-t border-line p-3 text-xs text-ink-2">
      <div className="mb-1 font-display text-sm font-semibold text-ink">What is real here</div>
      {SOURCES.map(([label, pill, items]) => (
        <div key={label} className="mt-2">
          <span className={`pill ${pill}`}>{label}</span>
          <ul className="mt-1 grid list-disc gap-0.5 pl-4">{items.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      ))}
      <p className="mt-2 border-t border-line pt-2 text-[11px]">Real sensors can replace the simulated ones without changing the twin: they send readings to the same data server.</p>
    </div>
  );
}

function SearchBox({ live, tasks, onPick, go }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const text = q.trim().toLowerCase();
  const points = live?.stations.filter((s) => `${s.id} ${s.name} ${s.owner}`.toLowerCase().includes(text)).slice(0, 5) ?? [];
  const jobs = text ? (tasks ?? []).filter((t) => t.status !== 'COMPLETED' && t.title.toLowerCase().includes(text)).slice(0, 3) : [];
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-[11px] text-muted" />
      <input
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Search water points, tasks…" aria-label="Search" className="h-9 w-full rounded-lg bg-panel-2 pl-8 pr-2 text-[13px]"
      />
      {open && (points.length > 0 || jobs.length > 0) && (
        <div className={`${card} absolute left-0 top-10 z-30 w-[280px] p-1.5 text-xs`}>
          {points.map((s) => <button key={s.id} onMouseDown={() => { onPick(s.id); setQ(''); }} className="block w-full truncate rounded-lg px-2 py-1.5 text-left hover:bg-panel-2"><b>{s.id}</b> {s.name}</button>)}
          {jobs.map((t) => <button key={t.id} onMouseDown={() => go('maintenance')} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-ink-2 hover:bg-panel-2">{t.station}: {t.title}</button>)}
        </div>
      )}
    </div>
  );
}

/** Tap anywhere on the map: what the twin says about the water nearest that spot. */
function HazardCard({ spot, live, onClose, onSpill }) {
  const st = live.stations.find((x) => x.id === spot?.nearest_id);
  const eta = st ? live.forecast.stations?.[st.id]?.arrival_s : null;
  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-semibold">Check this location</div>
        <button onClick={onClose} aria-label="Close location check" className="rounded p-0.5 text-muted hover:bg-panel-2"><X size={14} /></button>
      </div>
      {!spot && <p className="mt-1 text-xs text-muted">Checking…</p>}
      {spot?.error && <p className="mt-1 text-xs text-ink-2">{spot.error}</p>}
      {spot && !spot.error && (
        <>
          <div className="mt-1">
            <Row label="Nearest water point">{spot.nearest_id} · {fmt(spot.nearest_km, 1)} km</Row>
            {st && <Row label="Its water quality">{st.wqhi.score} / 100</Row>}
            {st && <Row label="Contamination risk">{fmt(st.risk, 2)}</Row>}
            {eta > 0 && <Row label="Plume arrives there in">{fmtMin(eta)}</Row>}
            {spot.river_distance_m != null && <Row label="Distance to river">{spot.river_distance_m.toLocaleString()} m</Row>}
            <Row label="In the watershed">{spot.in_catchment ? 'Yes' : 'No'}</Row>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">Water readings are simulated.</p>
          {spot.in_catchment && onSpill && <button onClick={() => onSpill(spot)} className="mt-2 w-full rounded-xl bg-[#c9551f] px-2 py-1.5 text-xs font-semibold text-white">Simulate a spill near here</button>}
        </>
      )}
    </div>
  );
}

function Legend({ view }) {
  const h = HAZARDS[view.hazard];
  if (!h?.low) return null;
  const [a, b, c] = PALETTE_CSS[view.palette];
  return (
    <div className={`${card} flex max-w-[460px] items-center gap-2 px-3 py-1.5 text-[11px] text-ink-2`} title={h.note}>
      <span className="whitespace-nowrap font-semibold text-ink">{h.label}</span>
      <span>{h.low}</span>
      <i className="h-2.5 w-20 rounded-sm" style={{ background: `linear-gradient(90deg, ${a}, ${b}, ${c})` }} />
      <span>{h.high}</span>
    </div>
  );
}

/** What the operator should do next, worked out from the twin's state. */
function nextAction(live) {
  const fc = live.forecast.stations ?? {};
  const open = live.stations.filter((s) => s.valve?.open && fc[s.id]?.arrival_s > 0).sort((a, b) => fc[a.id].arrival_s - fc[b.id].arrival_s)[0];
  if (open) return { kind: 'close', st: open, title: `Plume reaches ${open.id} in ${fmtMin(fc[open.id].arrival_s)}`, text: `${(open.population ?? 0).toLocaleString()} people use ${open.name}.` };
  const dirty = live.stations.find((s) => s.valve?.open && s.risk >= 0.45);
  if (dirty) return { kind: 'close', st: dirty, title: `${dirty.id} is contaminated`, text: 'The intake is still open.' };
  const fouled = live.stations.find((s) => s.classification === 'SENSOR_BIOFOULING');
  if (fouled) return { kind: 'clean', st: fouled, title: `Dirty sensor at ${fouled.id}`, text: 'This is a sensor fault, not contamination. Clean the probe.' };
  const low = live.stations.find((s) => s.valve && !s.valve.open && s.tank?.reserve_h < 1.5);
  if (low) return { kind: 'view', st: low, title: `${low.id} is running low`, text: `Stored water lasts about ${fmt(low.tank.reserve_h, 1)} h.` };
  return null;
}

function ActionCard({ live, act, quick, onPick }) {
  const a = nextAction(live);
  if (!a) return null;
  return (
    <div className="rounded-lg border border-[#f3c4b4] bg-[#fff6f2] p-2.5">
      <div className="flex items-start gap-2">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-[#c9551f]" />
        <div className="min-w-0">
                    <div className="font-display text-sm font-semibold leading-tight">{a.title}</div>
          <div className="mt-0.5 text-xs text-ink-2">{a.text}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {a.kind === 'close' && <button onClick={() => act('/api/valve', { station_id: a.st.id, action: 'SHUT' }, `Intake at ${a.st.id} closed.`)} className="rounded-xl bg-[#d03b3b] px-2.5 py-1 text-xs font-semibold text-white">Close intake</button>}
        {a.kind === 'clean' && <button onClick={() => act('/api/maintenance/clean', { station_id: a.st.id }, 'Probe cleaning logged.')} className="rounded-xl bg-civic px-2.5 py-1 text-xs font-semibold text-white">Log cleaning</button>}
        <button onClick={() => onPick(a.st.id)} className="rounded-xl border border-line px-2.5 py-1 text-xs font-semibold text-ink-2">Go there</button>
        {a.kind === 'close' && <button onClick={() => quick('advisory')} className="rounded-xl border border-line px-2.5 py-1 text-xs font-semibold text-ink-2">Warn people</button>}
      </div>
    </div>
  );
}

export default function CommandCenter({ live, forecast, tasks, staticData, layers, setLayers, status, selectedId, onSelect, onInspect, onDetails, act, quick, notify, pages, page, go, actions }) {
  const time = useTwinTime(live, forecast);
  const controls = useRef({});
  const [probe, setProbe] = useState(null);
  const [spot, setSpot] = useState(null);
  const [detail, setDetail] = useState(false);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState('river');
  const [menu, setMenu] = useState(false);
  const [flat, setFlat] = useState(false);
  const readout = useRef(null);
  const needle = useRef(null);
  const panelsMoved = usePanelsMoved();
  const { data: weather } = usePoll('/api/weather', 600000);
  const [touring, setTouring] = useState(false);
  const [following, setFollowing] = useState(false);
  const [caption, setCaption] = useState(null);
  const [view, setView] = useState(() => {
    try {
      const saved = { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY)) };
      return HAZARDS[saved.hazard] ? saved : { ...saved, hazard: DEFAULT_VIEW.hazard };   // an older save may name a removed layer
    } catch { return DEFAULT_VIEW; }
  });
  useEffect(() => { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); }, [view]);
  const isHeat = HEAT.includes(view.hazard);
  const hazardPath = view.hazard === 'none' ? null : isHeat ? `/api/heatmap?index=${view.hazard}` : `/api/layer/${view.hazard}`;
  const { data: hazardGrid } = usePoll(hazardPath, isHeat ? 8000 : 0);
  const checkSpot = useMemo(() => (at) => {
    setProbe(at);
    setSpot(null);
    get(`/api/hazard?lat=${at.lat}&lon=${at.lon}`).then(setSpot).catch(() => setSpot({ error: 'That spot is outside the modelled area.' }));
  }, []);
  const selected = live?.stations.find((s) => s.id === selectedId);
  const danger = live ? exposure(live) : null;

  const pick = useMemo(() => (id) => { onSelect(id); setDetail(true); setProbe(null); }, [onSelect]);
  const focus = (id) => { pick(id); controls.current.focus?.(id); };
  const total = live?.stations.reduce((a, s) => a + (s.population ?? 0), 0) ?? 0;
  const avg = live ? Math.round(live.stations.reduce((a, s) => a + s.wqhi.score, 0) / live.stations.length) : 0;
  const valves = live?.stations.filter((s) => s.valve) ?? [];
  const closed = valves.filter((s) => !s.valve.open).length;
  const tool = 'flex h-[34px] w-[38px] items-center justify-center text-ink-2 hover:bg-panel-2 hover:text-civic';
  const rightOpen = Boolean(probe) || (detail && Boolean(selected));
  const isLive = time.tauStep === 0;

  return (
    <div className="relative min-h-full overflow-x-hidden bg-[#eef2f6] lg:fixed lg:inset-0 lg:overflow-hidden">
      <div className="relative h-[60vh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Loading the map…</div>}>
          <TwinMapScene
            staticData={staticData} live={live} hazard={hazardPath ? hazardGrid : null} view={view} atTime={time.atTime} tauStep={time.tauStep} selectedId={selectedId}
            onPick={pick} onInspect={onInspect} layers={layers} controls={controls} onTour={setTouring} onCaption={setCaption} onProbe={checkSpot} probe={probe}
            insets={{ left: panel ? 364 : 20, right: rightOpen ? 372 : 64, top: 16, bottom: 72 }} readout={readout} needle={needle}
          />
        </Suspense>
      </div>

      {/* Left: everything about the river, one panel */}
      <Floating id="map-main" label="Move this panel" role="region" aria-label="Bulos 3D" className={`${card} relative z-20 m-2 flex flex-col lg:absolute lg:left-3 lg:top-3 lg:m-0 lg:max-h-[calc(100vh-24px)] lg:w-[340px]`}>
        <div className="flex items-center gap-2 p-2">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-panel-2"><Menu size={18} /></button>
          <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1"><SearchBox live={live} tasks={tasks} onPick={focus} go={go} /></div>
          <button onClick={() => setPanel((v) => !v)} aria-expanded={panel} aria-label={panel ? 'Collapse panel' : 'Expand panel'} className="hidden h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-2 lg:flex"><ChevronUp size={16} className={panel ? '' : 'rotate-180'} /></button>
        </div>
        {menu && (
          <nav className="grid grid-cols-2 gap-0.5 border-t border-line p-1.5">
            {pages.map(([id, label]) => (
              <button key={id} onClick={() => { setMenu(false); go(id); }} aria-current={page === id ? 'page' : undefined} className={`rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium ${page === id ? 'bg-[#e9efff] text-civic' : 'text-ink-2 hover:bg-panel-2'}`}>{label}</button>
            ))}
          </nav>
        )}
        {live && <div className="px-2 pb-2 empty:hidden"><ActionCard live={live} act={act} quick={quick} onPick={focus} /></div>}
        {panel && live && (
          <>
            <div className="flex gap-4 border-b border-t border-line px-3" role="tablist">
              {[['river', 'River'], ['layers', 'Layers'], ['data', 'Data']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 py-2 text-[13px] font-semibold ${tab === k ? 'border-civic text-civic' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'river' && (
                <div className="p-3">
                  <p className="font-display text-[17px] font-semibold leading-snug">{danger.points ? `${danger.points} water point${danger.points > 1 ? 's' : ''} affected` : 'The river is clear'}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{status !== 'online' ? 'The data server is offline.' : `${isLive ? 'Updated' : time.tauStep > 0 ? 'Forecast for' : 'Replay of'} ${isLive ? fmtClock(live.clock.epoch_ms) : fmtOffset(time.tauStep)}. Readings are ${live.clock.mode === 'sim' ? 'simulated' : 'from the field'}.`}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <Figure value={`${avg}%`} label="Water quality" />
                    <Figure value={(total - danger.people).toLocaleString()} label="People not affected" alert={danger.people > 0} />
                    <Figure value={`${valves.length - closed} of ${valves.length}`} label="Intakes open" alert={closed > 0} />
                    <Figure value={danger.next ? fmtMin(danger.next.s) : 'None'} label={danger.next ? `Next plume, ${danger.next.id}` : 'Next plume'} alert={Boolean(danger.next)} />
                  </dl>
                  <Tracker live={live} danger={danger} onPick={focus} />
                  <button onClick={() => quick('advisory')} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-civic py-2 text-[13px] font-semibold text-white"><Send size={13} />Send advisory</button>
                </div>
              )}
              {tab === 'layers' && (
                <>
                  <CustomisePanel view={view} setView={setView} layers={layers} setLayers={setLayers} />
                  <DataPanel />
                </>
              )}
              {tab === 'data' && <Tables live={live} tasks={tasks} quick={quick} onPick={focus} weather={weather} access={staticData?.access} />}
            </div>
          </>
        )}
        {!live && <p className="p-3 text-sm text-muted">{status === 'offline' ? 'The data server is not running. Run npm start in the project folder.' : 'Connecting to the twin…'}</p>}
      </Floating>

      {live && (
        <>
          {/* Top right: account-level actions, then map controls */}
          <div className="map-actions absolute right-3 top-3 z-20 hidden items-center gap-2 lg:flex">{actions}</div>
          <Floating id="map-tools" label="Move the map tools" className={`${card} absolute right-3 top-[64px] z-10 hidden flex-col overflow-hidden lg:flex`}>
            <button onClick={() => controls.current.zoom?.(0.8)} aria-label="Zoom in" title="Zoom in" className={tool}><Plus size={17} /></button>
            <button onClick={() => controls.current.zoom?.(-0.8)} aria-label="Zoom out" title="Zoom out" className={tool}><Minus size={17} /></button>
            <hr className="border-line" />
            <button onClick={() => controls.current.north?.()} aria-label="Point north" title="Point north" className={tool}><span ref={needle} className="block"><Navigation size={15} className="fill-[#d03b3b] text-[#d03b3b]" /></span></button>
            <button onClick={() => { const on = !flat; setFlat(on); controls.current.tilt3d?.(on); }} aria-pressed={flat} aria-label={flat ? 'Switch to 3D' : 'Switch to 2D'} title={flat ? 'Switch to 3D' : 'Switch to 2D'} className={`${tool} text-[12px] font-bold`}>{flat ? '3D' : '2D'}</button>
            <button onClick={() => { setFollowing(false); controls.current.home?.(); }} aria-label="Reset view" title="Back to the whole river" className={tool}><RotateCcw size={15} /></button>
            <hr className="border-line" />
            <button onClick={() => setView((v) => ({ ...v, mapLabels: !v.mapLabels }))} aria-pressed={!view.mapLabels} aria-label={view.mapLabels ? 'Hide map labels' : 'Show map labels'} title={view.mapLabels ? 'Hide labels' : 'Show labels'} className={`${tool} ${view.mapLabels ? '' : 'bg-[#e9efff] text-civic'}`}><Tag size={15} /></button>
            <button onClick={() => (touring ? controls.current.stopTour?.() : controls.current.startTour?.())} aria-pressed={touring} aria-label="Tour" title="Tour the five water points" className={`${tool} ${touring ? 'bg-[#e9efff] text-civic' : ''}`}><Plane size={15} /></button>
            <button onClick={() => { const on = !following; setFollowing(on); controls.current.setFollow?.(on); }} aria-pressed={following} aria-label="Follow the plume" title="Follow the plume" className={`${tool} ${following ? 'bg-[#e9efff] text-civic' : ''}`}><Crosshair size={15} /></button>
          {panelsMoved && (
              <>
                <hr className="border-line" />
                <button onClick={resetPanels} aria-label="Reset panels" title="Put all panels back" className={tool}><LayoutPanelLeft size={15} /></button>
              </>
            )}
          </Floating>

          {/* Right: details, only when asked for */}
          {rightOpen && (
            <Floating id="map-detail" label="Move the details panel" className={`${card} relative z-10 m-2 overflow-y-auto lg:absolute lg:right-[60px] lg:top-[64px] lg:m-0 lg:max-h-[calc(100vh-150px)] lg:w-[300px]`}>
              {probe ? (
                <HazardCard
                  spot={spot} live={live} onClose={() => { setProbe(null); setSpot(null); }}
                  onSpill={live.clock.mode === 'sim' ? (at) => post('/api/spill', { lat: at.lat, lon: at.lon }).then((r) => { notify?.(true, r.message); setProbe(null); setSpot(null); }).catch((e) => notify?.(false, e.message)) : null}
                />
              ) : (
                <Inspector st={selected} fc={live.forecast.stations?.[selected.id]} act={act} quick={quick} onInspect={onInspect} onDetails={onDetails}
                           onStreet={(id) => controls.current.street?.(id)} onSensors={(id) => controls.current.sensors?.(id)}
                           onClose={() => { setDetail(false); controls.current.home?.(); }} />
              )}
            </Floating>
          )}

          {/* Bottom: legend for the active layer, then time */}
          <Floating id="map-time" grip={false} className={`z-10 flex flex-wrap items-end gap-2 p-2 lg:absolute lg:bottom-3 lg:right-[220px] lg:p-0 ${panel ? 'lg:left-[364px]' : 'lg:left-3'}`}>
            <Legend view={view} />
            <Timeline live={live} time={time} />
          </Floating>
          <div className={`${card} absolute bottom-[12px] right-[38px] z-10 hidden w-[172px] whitespace-nowrap px-2 py-1 text-right text-[10.5px] tabular-nums text-ink-2 lg:block`}><span ref={readout}>Move over the map</span></div>

          {caption && (
            <div className={`${card} absolute bottom-[72px] left-1/2 z-10 hidden max-w-[440px] -translate-x-1/2 px-4 py-2 text-center lg:block`}>
              <div className="font-display text-sm font-semibold">{live.stations.find((s) => s.id === caption)?.name}</div>
              <div className="text-xs text-ink-2">{live.stations.find((s) => s.id === caption)?.note}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
