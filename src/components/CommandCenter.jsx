import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Box, Check, ChevronDown, Eye, Layers as LayersIcon, LayoutPanelLeft, Shapes, SlidersHorizontal, Table2, ChevronUp, Clock, Crosshair, Cpu, Droplets, FlaskConical, Lock, LockOpen, Menu, Minus, Navigation, Pause, Plane, Play, Plus, RotateCcw, Search, Send, Tag, TriangleAlert, Users, X,
} from 'lucide-react';
import { get, post, usePoll } from '../api';
import { BAND, CLOSED_EARLY, EDGE_LABEL, fmt, fmtClock, fmtMin, stationStatus } from '../lib/format';
import { WATER_KEY } from '../lib/waterColour';
import { AHEAD_S, PAST_S, exposure, fmtOffset } from '../lib/twinField';
import { useTwinTime } from '../lib/useTwinTime';
import MapCredits from './MapCredits';
import GuidedDemo from './GuidedDemo';
import { Floating, MapWindow, resetPanels, usePanelsMoved } from '../lib/floating';

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

/** Recorded history, now and the forecast on one line, with alerts marked where they happened. */
function Timeline({ live, time }) {
  const span = PAST_S + AHEAD_S;
  const pct = (s) => ((s + PAST_S) / span) * 100;
  const marks = live.events.filter((e) => (e.severity === 'danger' || e.severity === 'warning') && e.t_ms > live.clock.epoch_ms - PAST_S * 1000).slice(0, 40);
  const ticks = [-6, -4, -2, 0, 2, 4];
  const at = pct(time.tauStep);
  const isNow = time.tauStep === 0;
  return (
    <div className="flex min-w-[300px] flex-1 items-center gap-2">
      <button onClick={time.togglePlay} aria-label={time.playing ? 'Pause' : 'Play through time'} title={time.playing ? 'Pause' : 'Play'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-civic text-white">
        {time.playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button onClick={time.nextSpeed} aria-label={`Playback speed ${time.speed} times`} title="Change playback speed" className="h-7 w-8 shrink-0 rounded-md bg-[#eef2fb] text-[12px] font-semibold text-ink-2 hover:text-civic">{time.speed}×</button>
      <div className="relative mx-3.5 h-[34px] min-w-0 flex-1">
        <div className="absolute inset-x-0 top-[7px] h-[6px] overflow-hidden rounded-full bg-[#dbe4f8]">
          <i className="time-forecast absolute inset-y-0 right-0" style={{ left: `${pct(0)}%` }} />
          <i className="absolute inset-y-0 left-0 bg-civic" style={{ width: `${at}%` }} />
        </div>
        {marks.map((e, k) => <i key={`${e.t_ms}-${k}`} className="pointer-events-none absolute top-[5px] h-[10px] w-[3px] -translate-x-1/2 rounded-sm" style={{ left: `${pct((e.t_ms - live.clock.epoch_ms) / 1000)}%`, background: e.severity === 'danger' ? '#d03b3b' : '#e0a800' }} />)}
        <i className="pointer-events-none absolute top-[10px] h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-civic shadow-[0_1px_3px_rgba(16,24,40,0.45)]" style={{ left: `${at}%` }} />
        {ticks.map((h) => (
          <span key={h} className={`pointer-events-none absolute top-[19px] -translate-x-1/2 whitespace-nowrap text-[11px] ${h === 0 ? 'font-semibold text-ink' : 'text-muted'}`} style={{ left: `${pct(h * 3600)}%` }}>{h === 0 ? 'Now' : `${h > 0 ? '+' : '−'}${Math.abs(h)} h`}</span>
        ))}
        <input type="range" min={-PAST_S} max={AHEAD_S} step={time.step} value={time.tauStep} aria-label="Time" aria-valuetext={isNow ? 'Now' : fmtOffset(time.tauStep)} onChange={(e) => time.scrub(Number(e.target.value))} className="time-range" />
      </div>
      <div className="w-[76px] shrink-0 text-right leading-tight">
        <div className="text-[13px] font-semibold tabular-nums">{fmtClock(live.clock.epoch_ms + time.tauStep * 1000)}</div>
        {isNow ? <div className="text-[11.5px] text-muted">Now</div>
          : <button onClick={time.toNow} className="text-[11.5px] font-semibold text-civic hover:underline">Back to now</button>}
      </div>
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
  const tabs = [['intakes', 'Intakes', live.stations.filter((s) => s.valve).length], ['sensors', 'Sensors', live.stations.length], ['crews', 'Tasks', open.length], ['events', 'Events', feed.length], ['river', 'River', live.reaches.length], ['weather', 'Weather', ''], ['access', 'Access', access?.length ?? 0], ['sources', 'Sources', 0]];
  const line = 'flex w-full items-center gap-3 border-b border-line py-2 text-left text-[13px] last:border-0 hover:bg-panel-2';
  return (
    <div className="p-3">
      <div className="seg-flat mb-2" role="tablist" aria-label="Data">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div>
        {tab === 'sources' && <DataPanel />}
        {tab === 'intakes' && live.stations.filter((s) => s.valve).map((s) => (
          <button key={s.id} onClick={() => onPick(s.id)} className={line}>
            <span className="w-14 shrink-0 font-semibold">{s.id}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
            <span className="text-muted">{fmt(s.tank?.reserve_h, 1)} h</span>
            <span className={`pill ${s.valve.open ? 'pill-good' : 'pill-red'}`}>{s.valve.open ? 'Open' : 'Closed'}</span>
          </button>
        ))}
        {tab === 'sensors' && live.stations.map((s) => (
          <button key={s.id} onClick={() => onPick(s.id)} className={line}>
            <span className="w-14 shrink-0 font-semibold">{s.id}</span>
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
            <span className="w-14 shrink-0 font-semibold">{t.station}</span>
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
  risk: { label: 'Overall contamination risk', group: 'Water quality', low: 'Moderate', high: 'Severe', steps: ['Moderate', 'High', 'Severe'], note: 'How likely the water is to be contaminated, using all the sensors together. Low risk is left clear.' },
  turbidity: { label: 'Turbidity', group: 'Water quality', low: 'Clear', high: 'Cloudy', note: 'How cloudy the water is. Cloudy water can carry germs. The middle of the scale is the safe limit.' },
  ph: { label: 'pH', group: 'Water quality', low: 'Normal', high: 'Off range', note: 'How far the water is from a neutral level. The middle of the scale is the safe limit.' },
  tds: { label: 'Total dissolved solids', group: 'Water quality', low: 'Low', high: 'High', note: 'How much mineral and salt is dissolved in the water. The middle of the scale is the safe limit.' },
  bio: { label: 'Biological indicator', group: 'Water quality', low: 'Low', high: 'High', note: 'A sign of sewage or animal waste in the water.' },
  wells: { label: 'Shallow well exposure', group: 'Water access', low: 'Lower', high: 'Higher', note: 'Low ground near the river, where wells draw in river water. Our estimate.' },
  runoff: { label: 'Runoff sources', group: 'Water access', low: 'Low', high: 'High', note: 'Wet, steep ground that sends rain and pollution into the river. Our estimate.' },
  access: { label: 'Distance to water', group: 'Water access', low: 'Near', high: '5 km+', note: 'Straight-line distance to the nearest water point or district facility.' },
};
const HEAT = ['risk', 'turbidity', 'ph', 'tds', 'bio'];
const PALETTE_CSS = { hazard: ['#ffe05a', '#fa9628', '#e0342c'], ocean: ['#bae6fd', '#3896f0', '#1432a0'], clear: ['#fde725', '#21918c', '#440154'] };
const VIEW_KEY = 'bulos-view';
const DEFAULT_VIEW = { mapLabels: true, hazard: 'risk', opacity: 0.7, palette: 'hazard', base: 'satellite', relief: 1.5 };
const SWATCH = {
  buildings: 'bg-[#dfe5ee] border border-[#b7c2d3]', streams: 'line #62c0ff', pipes: 'line #4fd2ff', network: 'line #35e0c2', catchment: 'dash', particles: 'flow', labels: 'text', barangays: 'dots', assets: 'dot #2aa58c',
};
const OFF_BY_DEFAULT = ['network', 'barangays'];
const UI_KEY = 'bulos-ui';
const WELCOME_KEY = 'bulos-welcome-seen';
const rampCss = (h, [a, b, c]) => (h?.steps ? `linear-gradient(90deg, ${a} 0 33.3%, ${b} 33.3% 66.6%, ${c} 66.6%)` : `linear-gradient(90deg, ${a}, ${b}, ${c})`);
const DEFAULT_UI = { glass: false, timeline: true, colourBar: true, coords: true };
const KEYS = [['H', 'Presentation mode'], ['L', 'Layers'], ['G', 'Legend'], ['D', 'Data'], ['C', 'Customize']];
const TOGGLES = [['buildings', 'Real 3D buildings'], ['labels', 'Roads and place names'], ['streams', 'Streams'], ['pipes', 'Main pipelines'], ['network', 'Proposed barangay network'], ['barangays', 'Barangay access dots'], ['assets', 'Water district facilities'], ['particles', 'Water flow'], ['catchment', 'Watershed']];

function Swatch({ k }) {
  const kind = SWATCH[k] ?? '';
  if (kind.startsWith('line')) return <i className="block h-[3px] w-6 rounded-full" style={{ background: kind.split(' ')[1] }} />;
  if (kind.startsWith('dot ')) return <i className="ml-2 block h-2.5 w-2.5 rounded-full" style={{ background: kind.split(' ')[1] }} />;
  if (kind === 'dash') return <i className="block h-0 w-6 border-t-2 border-dashed border-[#5b6b85]" />;
  if (kind === 'flow') return <i className="block h-[5px] w-6 rounded-full bg-[repeating-linear-gradient(90deg,#2f5be7_0_5px,#cfe0ff_5px_8px)]" />;
  if (kind === 'text') return <span className="w-6 text-center text-[12px] font-semibold text-ink-2">Aa</span>;
  if (kind === 'dots') return <span className="flex w-6 justify-between">{['#2eb872', '#f2c200', '#d03b3b'].map((c) => <i key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />)}</span>;
  return <i className={`block h-3.5 w-6 rounded-[3px] ${kind}`} />;
}

const isOn = (layers, k) => (OFF_BY_DEFAULT.includes(k) ? layers[k] === true : layers[k] !== false);

/** Choose what colours the map and what is drawn on it. Finer settings stay folded away. */
function LayersWindow({ view, setView, layers, setLayers }) {
  const set = (patch) => setView((v) => ({ ...v, ...patch }));
  const pick = (k, options) => (
    <div className="seg-flat">
      {options.map(([v, label]) => <button key={v} role="tab" aria-selected={view[k] === v} onClick={() => set({ [k]: v })}>{label}</button>)}
    </div>
  );
  const group = (name) => (
    <div className="mt-1">
      <h3 className="px-1 pb-0.5 pt-2 text-[12px] font-semibold text-muted">{name}</h3>
      {Object.entries(HAZARDS).filter(([k, h]) => h.group === name && k !== 'none').map(([k, h]) => (
        <button key={k} onClick={() => set({ hazard: view.hazard === k ? 'none' : k })} aria-pressed={view.hazard === k} className="layer-row">{h.label}</button>
      ))}
    </div>
  );
  return (
    <div className="px-3 pb-3 text-[13px]">
      <h3 className="pt-0.5 font-display text-[13px] font-semibold">Colour the map by</h3>
      {group('Water quality')}
      {group('Water access')}
      {HAZARDS[view.hazard]?.note && <p className="mt-2 rounded-lg bg-[#f2f6ff] px-2.5 py-2 text-[12.5px] leading-snug text-ink-2">{HAZARDS[view.hazard].note}</p>}

      <h3 className="mt-3 border-t border-line pt-3 font-display text-[13px] font-semibold">Show on the map</h3>
      <div className="mt-1">
        {TOGGLES.map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2.5 py-1 text-ink-2">
            <span className="flex w-6 shrink-0 items-center justify-center"><Swatch k={k} /></span>
            <span className="min-w-0 flex-1">{label}</span>
            <input type="checkbox" role="switch" className="switch" checked={isOn(layers, k)} onChange={() => setLayers((l) => ({ ...l, [k]: OFF_BY_DEFAULT.includes(k) ? l[k] !== true : l[k] === false }))} />
          </label>
        ))}
      </div>

      <details className="mt-2 border-t border-line pt-2">
        <summary className="cursor-pointer py-1 font-display text-[13px] font-semibold">Map style</summary>
        <div className="grid gap-2.5 pt-1 text-ink-2">
          <div><div className="mb-1 text-[12.5px]">Base map</div>{pick('base', [['satellite', 'Satellite'], ...(import.meta.env.VITE_MAPBOX_TOKEN ? [['mapbox', 'Mapbox']] : []), ['light', 'Streets']])}</div>
          <div><div className="mb-1 text-[12.5px]">Colours</div>{pick('palette', [['hazard', 'Hazard'], ['clear', 'Colour-safe']])}</div>
          <label className="block text-[12.5px]">Layer strength {Math.round(view.opacity * 100)}%
            <input type="range" min={0.2} max={1} step={0.05} value={view.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="mt-1 w-full accent-[#2f5be7]" />
          </label>
          <label className="block text-[12.5px]">Terrain height ×{view.relief}
            <input type="range" min={1} max={3} step={0.25} value={view.relief} onChange={(e) => set({ relief: Number(e.target.value) })} className="mt-1 w-full accent-[#2f5be7]" />
          </label>
          <button onClick={() => setView(DEFAULT_VIEW)} className="btn-ghost justify-center">Reset to default</button>
        </div>
      </details>
    </div>
  );
}

/** First visit: what this is, and three good places to start. */
function Welcome({ onGuide, onDrop, onTour, onClose }) {
  const start = 'flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold';
  return (
    <Floating id="map-welcome" grip={false} role="region" aria-label="Welcome" className={`${card} absolute bottom-14 left-1/2 z-[24] hidden w-[520px] -ml-[260px] p-4 lg:block`}>
      <button onClick={onClose} aria-label="Close welcome" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"><X size={15} /></button>
      <h2 className="pr-7 font-display text-[17px] font-semibold">Welcome to Bulos 3D</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">A digital twin of the river from Mt. Isarog to Naga City. The map and weather are real. Sensor readings are simulated. Try one of these:</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onGuide} className={`${start} bg-civic text-white`}>Start the guided demo</button>
        <button onClick={onDrop} className={`${start} bg-[#f2f6ff] text-civic`}>Follow a drop</button>
        <button onClick={onTour} className={`${start} bg-[#f2f6ff] text-civic`}>Tour the sites</button>
      </div>
    </Floating>
  );
}

/** While a simulated event runs, say so, and offer the way out. */
function SimulationBar({ live }) {
  const ev = live.clock.mode === 'sim' ? live.events.find((e) => e.type === 'SCENARIO') : null;
  if (!ev || /Clear all events/i.test(ev.message)) return null;
  const what = ev.message.replace(/^Field scenario injected:\s*/, '').split('(')[0].trim();
  const mins = Math.max(0, Math.round((live.clock.epoch_ms - ev.t_ms) / 60000));
  const stop = () => { post('/api/scenario', { name: 'RESET' }).catch(() => {}); post('/api/speed', { speed: 60 }).catch(() => {}); };
  return (
    <div role="status" className={`${card} sim-bar absolute left-1/2 top-[84px] z-[24] hidden -translate-x-1/2 items-center gap-2.5 px-3 py-1.5 text-[12.5px] lg:flex`}>
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#d03b3b]" />
      <span className="max-w-[340px] truncate font-medium">{what}</span>
      <span className="shrink-0 text-muted tabular-nums">{mins} min in</span>
      <button onClick={stop} className="shrink-0 font-semibold text-civic hover:underline">Back to normal</button>
    </div>
  );
}

/** How the screen itself looks and behaves. */
function CustomizeWindow({ ui, setUi, view, setView, onPresent, onWelcome, onGuide }) {
  const flip = (k) => setUi((u) => ({ ...u, [k]: !u[k] }));
  const line = (label, on, change) => (
    <label key={label} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-ink-2">
      {label}<input type="checkbox" role="switch" className="switch" checked={on} onChange={change} />
    </label>
  );
  return (
    <div className="px-3 pb-3 text-[13px]">
      <button onClick={onPresent} className="btn-primary w-full justify-center"><Eye size={14} />Presentation mode</button>
      <p className="mt-1.5 text-[12px] leading-snug text-muted">Hides every panel so only the map shows. Good for your pitch.</p>
      <button onClick={onGuide} className="btn-ghost mt-2 w-full justify-center">Start the guided demo</button>
      <h3 className="mt-3 border-t border-line pt-3 font-display text-[13px] font-semibold">Panels</h3>
      <div className="seg-flat mt-1.5">
        <button role="tab" aria-selected={!ui.glass} onClick={() => setUi((u) => ({ ...u, glass: false }))}>Solid white</button>
        <button role="tab" aria-selected={ui.glass} onClick={() => setUi((u) => ({ ...u, glass: true }))}>See-through</button>
      </div>
      <h3 className="mt-3 border-t border-line pt-3 font-display text-[13px] font-semibold">Show on screen</h3>
      <div className="mt-1">
        {line('Time bar', ui.timeline, () => flip('timeline'))}
        {line('Layer colour bar', ui.colourBar, () => flip('colourBar'))}
        {line('Coordinates', ui.coords, () => flip('coords'))}
        {line('Water point labels', view.mapLabels !== false, () => setView((v) => ({ ...v, mapLabels: v.mapLabels === false })))}
      </div>
      <h3 className="mt-3 border-t border-line pt-3 font-display text-[13px] font-semibold">Keyboard shortcuts</h3>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1 text-ink-2">
        {KEYS.map(([k, label]) => <div key={k} className="contents"><dt><kbd className="key">{k}</kbd></dt><dd>{label}</dd></div>)}
      </dl>
      <button onClick={onWelcome} className="btn-ghost mt-3 w-full justify-center">Show the welcome card</button>
      <button onClick={() => { setUi(DEFAULT_UI); resetPanels(); }} className="btn-ghost mt-2 w-full justify-center">Reset screen layout</button>
    </div>
  );
}

/** What everything on the map means. Only lists what is switched on right now. */
function LegendWindow({ view, layers }) {
  const h = HAZARDS[view.hazard];
  const [a, b, c] = PALETTE_CSS[view.palette];
  const row = (key, mark, text) => <li key={key} className="flex items-center gap-2.5 py-[3px]"><span className="flex w-6 shrink-0 items-center justify-center">{mark}</span>{text}</li>;
  const heading = 'mt-3 border-t border-line pt-2.5 font-display text-[13px] font-semibold first:mt-0 first:border-0 first:pt-0';
  return (
    <div className="px-3 pb-3 text-[13px] text-ink-2">
      {h?.low && (
        <>
          <h3 className={heading}>{h.label}</h3>
          <i className="mt-1.5 block h-3 rounded-sm" style={{ background: rampCss(h, [a, b, c]) }} />
          {h.steps ? <div className="mt-0.5 grid grid-cols-3 text-[11.5px]">{h.steps.map((x) => <span key={x}>{x}</span>)}</div>
            : <div className="mt-0.5 flex justify-between text-[12px]"><span>{h.low}</span><span>{h.high}</span></div>}
          <p className="mt-1 text-[12px] text-muted">Fades out when you zoom in close.</p>
        </>
      )}
      <h3 className={heading}>Water points</h3>
      <ul className="mt-1">
        {[['Low risk', BAND.LOW.color], ['Moderate risk, plume coming, or sensor check', BAND.MODERATE.color], ['High risk', BAND.HIGH.color], ['Severe risk', BAND.SEVERE.color], ['Closed early, before the plume', CLOSED_EARLY]].map(([label, color]) => row(label, <i className="h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_#b7c2d3]" style={{ background: color }} />, label))}
      </ul>
      <p className="mt-1 text-[12px] text-muted">The number beside each name is its water health out of 100.</p>
      <h3 className={heading}>River</h3>
      <ul className="mt-1">
        {WATER_KEY.map(([label, color]) => row(label, <i className="h-[5px] w-6 rounded-full" style={{ background: color }} />, label))}
      </ul>
      <h3 className={heading}>Lines and places</h3>
      <ul className="mt-1">
        {TOGGLES.filter(([k]) => isOn(layers, k) && k !== 'labels' && k !== 'barangays').map(([k, label]) => row(k, <Swatch k={k} />, label))}
      </ul>
      {isOn(layers, 'pipes') && <p className="mt-1 text-[12px] text-muted">Pipelines turn yellow to red when their source water is polluted.</p>}
      {(isOn(layers, 'barangays') || view.hazard === 'access') && (
        <>
          <h3 className={heading}>Barangay distance to water</h3>
          <ul className="mt-1">
            {[['Under 1.5 km', '#2eb872'], ['1.5 to 3 km', '#f2c200'], ['3 to 6 km', '#ec835a'], ['Over 6 km', '#d03b3b']].map(([label, color]) => row(label, <i className="h-2.5 w-2.5 rounded-full border border-white shadow-[0_0_0_1px_#b7c2d3]" style={{ background: color }} />, label))}
          </ul>
        </>
      )}
    </div>
  );
}

const SOURCES = [
  ['Real', 'pill-good', ['Elevation model: Copernicus GLO-90 (90 m cells)', '3D map terrain: open elevation tiles on AWS', 'Satellite imagery: Esri, with Mapbox as an option. Capture dates are not known, and photos can show clouds', 'River, streams, roads and building outlines: OpenStreetMap', 'Water district facilities and barangay names: OpenStreetMap', 'Weather right now: Open-Meteo weather model, not a local rain gauge', 'River flow estimate: global model through Open-Meteo, too coarse for this small river']],
  ['Computed', 'pill-blue', ['River speed and travel time, from real slope', 'Watershed outline and drainage areas. These are rough in the flat lowlands near the city', 'Well exposure and runoff layers, from the 90 m elevation model', 'Forecasts and risk scores, from the twin']],
  ['Simulated', 'pill-amber', ['All sensor readings at the five water points', 'The rain the twin uses, which does not follow the real weather', 'Spills, valves, tanks, text messages, signal strength and battery levels']],
  ['Illustrative', 'pill-grey', ['The five water points are a proposed layout, not existing sites', 'People served and household counts', 'AG-02 and the rain gauge show where government stations could connect. No DOST data is connected', 'Pipelines and the barangay network follow real roads, but they are proposed routes', 'Most building heights are a 5 m default', 'Facility and people models']],
];

function DataPanel() {
  return (
    <div className="pt-1 text-[13px] text-ink-2">
      <div className="mb-1 font-display text-sm font-semibold text-ink">What is real here</div>
      {SOURCES.map(([label, pill, items]) => (
        <div key={label} className="mt-2">
          <span className={`pill ${pill}`}>{label}</span>
          <ul className="mt-1 grid list-disc gap-0.5 pl-4">{items.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      ))}
      <div className="mt-3 rounded-lg bg-[#f2f6ff] px-2.5 py-2">
        <div className="font-semibold text-ink">How we checked</div>
        <ul className="mt-1 grid list-disc gap-0.5 pl-4">
          <li>Elevations matched SRTM data within 4 m at 10 test points.</li>
          <li>The highest point in the model is 1,966 m, the published height of Mt. Isarog.</li>
          <li>The river is 29.6 km: 14.4 km mapped as the Naga River, and 15.2 km of unnamed stream above it.</li>
        </ul>
      </div>
      <p className="mt-2 text-[12px]">Real sensors can replace the simulated ones without changing the twin: they send readings to the same data server.</p>
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

/** What colours the map right now, with a quick way to change it. */
function LayerPicker({ view, setView, onLegend, past }) {
  const [open, setOpen] = useState(false);
  const h = HAZARDS[view.hazard];
  const [a, b, c] = PALETTE_CSS[view.palette];
  const pick = (k) => { setView((v) => ({ ...v, hazard: k })); setOpen(false); };
  return (
    <div className="relative shrink-0 border-l border-line pl-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" className="block w-[176px] text-left">
        <span className="flex items-center justify-between gap-1 text-[12.5px] font-semibold"><span className="truncate">{h?.low ? h.label : 'No colour layer'}</span><ChevronDown size={14} className={`shrink-0 text-muted ${open ? 'rotate-180' : ''}`} /></span>
        {h?.low && !past ? (
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">{h.low}<i className="h-[7px] flex-1 rounded-sm" style={{ background: rampCss(h, [a, b, c]) }} />{h.high}</span>
        ) : past ? <span className="mt-1 block text-[11px] text-muted">Shown at Now only. The river still changes.</span> : <span className="mt-1 block text-[11px] text-muted">Pick one to colour the map</span>}
      </button>
      {open && (
        <div className="site-panel absolute right-0 top-[calc(100%+10px)] z-40 w-[230px] p-1.5">
          {Object.entries(HAZARDS).map(([k, x]) => <button key={k} onClick={() => pick(k)} aria-pressed={view.hazard === k} className="layer-row">{x.label}</button>)}
          <button onClick={() => { setOpen(false); onLegend(); }} className="mt-1 w-full border-t border-line px-2 pb-1 pt-2 text-left text-[12.5px] font-semibold text-civic hover:underline">Open the legend</button>
        </div>
      )}
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
  const [wins, setWins] = useState({ layers: false, legend: false, data: false, custom: false });
  const [presenting, setPresenting] = useState(false);
  const [guide, setGuide] = useState(false);
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem(WELCOME_KEY); } catch { return false; } });
  const closeWelcome = () => { setWelcome(false); try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* it just shows again next time */ } };
  const [ui, setUi] = useState(() => { try { return { ...DEFAULT_UI, ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch { return DEFAULT_UI; } });
  useEffect(() => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* it still applies, it just will not be remembered */ } }, [ui]);
  useEffect(() => {
    const press = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === 'h') setPresenting((p) => !p);
      else if (k === 'escape') setPresenting(false);
      else if ({ l: 'layers', g: 'legend', d: 'data', c: 'custom' }[k]) { const name = { l: 'layers', g: 'legend', d: 'data', c: 'custom' }[k]; setWins((w) => ({ ...w, [name]: !w[name] })); setTop(name); }
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, []);
  const [top, setTop] = useState('layers');
  const toggleWin = (k) => { setWins((w) => ({ ...w, [k]: !w[k] })); setTop(k); };
  const winZ = (k) => (top === k ? 'z-[35]' : 'z-[30]');
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
      if (saved.base === 'dark' || (saved.base === 'mapbox' && !import.meta.env.VITE_MAPBOX_TOKEN)) saved.base = 'satellite';
      if (saved.palette === 'ocean') saved.palette = 'hazard';   // blue heat vanished into the water
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
    <div data-present={presenting || undefined} data-glass={ui.glass || undefined} className="map-root relative min-h-full overflow-x-hidden bg-[#eef2f6] lg:fixed lg:inset-0 lg:overflow-hidden">
      <div className="relative h-[60vh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Loading the map…</div>}>
          <TwinMapScene
            staticData={staticData} live={live} hazard={hazardPath ? hazardGrid : null} view={view} atTime={time.atTime} tauStep={time.tauStep} selectedId={selectedId}
            onPick={pick} onInspect={onInspect} layers={layers} controls={controls} onTour={setTouring} onCaption={setCaption} onProbe={checkSpot} probe={probe}
            insets={presenting ? { left: 20, right: 20, top: 16, bottom: 20 } : { left: panel ? 364 : 20, right: rightOpen ? 372 : 64, top: 92, bottom: 24 }} readout={readout} needle={needle}
          />
        </Suspense>
        <MapCredits className="absolute bottom-3 right-3 z-[36]" />
      </div>

      {/* Left: everything about the river, one panel */}
      <Floating id="map-main" label="Move this panel" role="region" aria-label="Bulos 3D" className={`${card} relative z-20 m-2 flex flex-col lg:absolute lg:left-3 lg:top-3 lg:m-0 lg:max-h-[calc(100vh-24px)] lg:w-[340px]`}>
        <div className="flex items-center gap-1.5 px-2 pt-1">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-panel-2"><Menu size={18} /></button>
          <button onClick={() => { controls.current.home?.(); }} title="Back to the whole river" className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
            <span className="truncate font-display text-[17px] font-semibold">Bulos 3D</span>
          </button>
          <button onClick={() => setPanel((v) => !v)} aria-expanded={panel} aria-label={panel ? 'Collapse panel' : 'Expand panel'} className="hidden h-9 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-2 lg:flex"><ChevronUp size={16} className={panel ? '' : 'rotate-180'} /></button>
        </div>
        <div className="px-2 pb-2 pt-1.5"><SearchBox live={live} tasks={tasks} onPick={focus} go={go} /></div>
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
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(
                <div className="border-t border-line p-3">
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
            </div>
          </>
        )}
        {live && (
          <div className="grid grid-cols-3 gap-1.5 border-t border-line p-2">
            {[['layers', 'Layers', LayersIcon], ['legend', 'Legend', Shapes], ['data', 'Data', Table2]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => toggleWin(k)} aria-pressed={wins[k]} className="door"><Icon size={15} />{label}</button>
            ))}
          </div>
        )}
        {!live && <p className="p-3 text-sm text-muted">{status === 'offline' ? 'The data server is not running. Run npm start in the project folder.' : 'Connecting to the twin…'}</p>}
      </Floating>

      {live && (
        <>
          {/* Top right: account-level actions, then map controls */}
          <div className="map-actions absolute right-3 top-3 z-[28] hidden items-center gap-2 lg:flex">{actions}</div>
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
          <hr className="border-line" />
            <button onClick={() => toggleWin('custom')} aria-pressed={wins.custom} aria-label="Customize" title="Customize the screen" className={tool}><SlidersHorizontal size={15} /></button>
            {panelsMoved && (
              <>
                <button onClick={resetPanels} aria-label="Reset panels" title="Put all panels back" className={tool}><LayoutPanelLeft size={15} /></button>
              </>
            )}
          </Floating>

          {/* Right: details, only when asked for */}
          {rightOpen && (
            <Floating id="map-detail" title="Details" label="Move the details panel" className={`${card} relative z-10 m-2 overflow-y-auto lg:absolute lg:right-[60px] lg:top-[92px] lg:m-0 lg:max-h-[calc(100vh-140px)] lg:w-[300px]`}>
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

          <SimulationBar live={live} />
          {guide && <GuidedDemo live={live} forecast={forecast} controls={controls} time={time} onClose={() => setGuide(false)} />}
          {welcome && !presenting && (
            <Welcome
              onClose={closeWelcome}
              onDrop={() => { closeWelcome(); go('map'); }}
              onTour={() => { closeWelcome(); controls.current.startTour?.(); }}
              onGuide={() => { closeWelcome(); setGuide(true); }}
            />
          )}
          {/* Separate windows, opened from the main panel */}
          {wins.layers && (
            <MapWindow id="win-layers" title="Layers" onClose={() => toggleWin('layers')} onRaise={() => setTop('layers')} className={`${winZ('layers')} lg:left-[364px] lg:top-[92px] lg:w-[290px]`}>
              <LayersWindow view={view} setView={setView} layers={layers} setLayers={setLayers} />
            </MapWindow>
          )}
          {wins.custom && (
            <MapWindow id="win-custom" title="Customize" dock={3} onClose={() => toggleWin('custom')} onRaise={() => setTop('custom')} className={`${winZ('custom')} lg:right-[60px] lg:top-[92px] lg:w-[270px]`}>
              <CustomizeWindow ui={ui} setUi={setUi} view={view} setView={setView} onPresent={() => setPresenting(true)} onWelcome={() => setWelcome(true)} onGuide={() => { setWins((w) => ({ ...w, custom: false })); setGuide(true); }} />
            </MapWindow>
          )}
          {wins.legend && (
            <MapWindow id="win-legend" title="Legend" dock={1} onClose={() => toggleWin('legend')} onRaise={() => setTop('legend')} className={`${winZ('legend')} lg:left-[666px] lg:top-[92px] lg:w-[250px]`}>
              <LegendWindow view={view} layers={layers} />
            </MapWindow>
          )}
          {wins.data && (
            <MapWindow id="win-data" title="Data" dock={2} onClose={() => toggleWin('data')} onRaise={() => setTop('data')} className={`${winZ('data')} lg:left-[364px] lg:top-[200px] lg:!max-h-[calc(100vh-212px)] lg:w-[580px]`}>
              <Tables live={live} tasks={tasks} quick={quick} onPick={focus} weather={weather} access={staticData?.access} />
            </MapWindow>
          )}

          {/* Top: time, and what colours the map */}
          {(ui.timeline || ui.colourBar) && (
            <Floating id="map-time" label="Move the time bar" className={`${card} relative z-[25] m-2 lg:absolute lg:left-[364px] lg:right-[190px] lg:top-3 lg:m-0`}>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 px-2.5 pb-1.5 pt-1 lg:pt-0">
                {ui.timeline && <Timeline live={live} time={time} />}
                {ui.colourBar && <LayerPicker view={view} setView={setView} past={time.tauStep !== 0} onLegend={() => { setWins((w) => ({ ...w, legend: true })); setTop('legend'); }} />}
              </div>
            </Floating>
          )}
          {presenting && <button onClick={() => setPresenting(false)} className={`${card} absolute bottom-4 left-1/2 z-40 -translate-x-1/2 px-3.5 py-2 text-[13px] font-semibold text-civic`}>Exit presentation (H)</button>}
          <div className={`${card} map-readout absolute bottom-3 right-[48px] z-10 hidden w-[172px] whitespace-nowrap px-2 py-1 text-right text-[10.5px] tabular-nums text-ink-2 ${ui.coords ? 'lg:block' : ''}`}><span ref={readout}>Move over the map</span></div>

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
