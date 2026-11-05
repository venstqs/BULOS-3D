import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import {
  Activity, Box, Check, Clock, Compass, Crosshair, Droplets, FlaskConical, Layers, Lock, LockOpen, Minus, Pause, Plane, Play, Plus, RotateCcw, Search, Send, ShieldCheck, TriangleAlert, Truck, Users, X,
} from 'lucide-react';
import { get, usePoll } from '../api';
import { EDGE_LABEL, fmt, fmtClock, fmtMin, stationStatus } from '../lib/format';
import { AHEAD_S, PAST_S, exposure, fmtOffset } from '../lib/twinField';
import { useTwinTime } from '../lib/useTwinTime';

const TwinMapScene = lazy(() => import('./TwinMapScene'));
const card = 'rounded-2xl bg-white/95 shadow-[0_8px_26px_rgba(30,50,110,0.12)] backdrop-blur';

function Stat({ Icon, label, value, sub, tone = 'text-civic' }) {
  return (
    <div className={`${card} flex min-w-[148px] items-center gap-2.5 px-3 py-2`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e9efff] ${tone}`}><Icon size={17} /></span>
      <div className="min-w-0">
        <div className="text-[10.5px] text-muted">{label}</div>
        <div className="font-display text-lg font-semibold leading-tight">{value}</div>
        <div className="truncate text-[10.5px] text-ink-2">{sub}</div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-xs last:border-0"><span className="text-muted">{label}</span><span className="text-right font-medium">{children}</span></div>;
}

function Inspector({ st, fc, act, quick, onInspect, onDetails, onClose, onStreet }) {
  const status = stationStatus(st);
  const r = st.reading ?? {};
  const closed = st.valve && !st.valve.open;
  const eta = fc?.arrival_s > 0 ? fc.arrival_s : null;
  return (
    <div className={`${card} p-3.5`}>
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
        <Row label="Turbidity">{fmt(r.turbidity, 1)} NTU</Row>
        <Row label="pH">{fmt(r.ph, 2)}</Row>
        {r.bio != null && <Row label="Biological (TLF)">{fmt(r.bio, 1)} ppb</Row>}
        {st.tank && <Row label="Stored water">{st.tank.pct}% · {fmt(st.tank.reserve_h, 1)} h</Row>}
        <Row label="People served">{(st.population ?? 0).toLocaleString()}</Row>
        <Row label="Node state">{EDGE_LABEL[st.edge_state] ?? st.edge_state}</Row>
      </div>
      {st.valve && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button disabled={closed} onClick={() => act('/api/valve', { station_id: st.id, action: 'SHUT' }, `Intake at ${st.id} closed.`)}
                  className="flex items-center justify-center gap-1 rounded-xl bg-[#d03b3b] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><Lock size={13} />Close intake</button>
          <button disabled={!closed} onClick={() => act('/api/valve', { station_id: st.id, action: 'REARM' }, `Intake at ${st.id} re-opened.`)}
                  className="flex items-center justify-center gap-1 rounded-xl border border-line bg-white px-2 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40"><LockOpen size={13} />Re-arm</button>
        </div>
      )}
      <button onClick={() => onStreet(st.id)} className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl bg-[#e9efff] px-2 py-1.5 text-xs font-semibold text-civic"><Users size={13} />Street view</button>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <button onClick={() => onInspect(st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><Box size={12} />3D site</button>
        <button onClick={() => quick('test', st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><FlaskConical size={12} />Test</button>
        <button onClick={() => onDetails(st.id)} className="flex items-center justify-center gap-1 rounded-xl border border-line px-1 py-1.5 text-[11px] font-semibold text-ink-2 hover:text-civic"><Activity size={12} />Details</button>
      </div>
    </div>
  );
}

/** Where the plume is along the river, as a route of water points. */
function Tracker({ live, danger, quick, time, onPick }) {
  const fc = live.forecast.stations ?? {};
  const steps = live.stations.map((s) => {
    const arrival = fc[s.id]?.arrival_s > 0 ? fc[s.id].arrival_s : null;
    const hit = s.risk >= 0.45;
    const closed = s.valve && !s.valve.open;
    const label = hit ? 'Contaminated' : arrival ? `in ${fmtMin(arrival)}` : s.classification === 'SENSOR_BIOFOULING' ? 'Dirty sensor' : 'Clear';
    return { s, hit, arrival, closed, label };
  });
  const active = danger.points > 0;
  return (
    <div className={`${card} p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-display text-sm font-semibold"><Activity size={15} className="text-civic" />Plume tracking</div>
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
            {closed && <div className="text-[10px] font-semibold text-[#a32626]">Closed</div>}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <button onClick={time.togglePlay} aria-label={time.playing ? 'Pause' : 'Play the last 6 hours and next 4 hours'} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-civic text-white">
          {time.playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <input type="range" min={-PAST_S} max={AHEAD_S} step={time.step} value={time.tauStep} aria-label="Time" onChange={(e) => time.scrub(Number(e.target.value))} className="min-w-0 flex-1 accent-[#2f5be7]" />
        <button onClick={time.toNow} disabled={time.tauStep === 0} className="shrink-0 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold text-ink-2 disabled:opacity-60">
          {time.tauStep === 0 ? 'Live' : `${fmtOffset(time.tauStep)} · Now`}
        </button>
        <button onClick={() => quick('advisory')} className="flex shrink-0 items-center gap-1 rounded-full bg-civic px-2.5 py-1 text-[11px] font-semibold text-white"><Send size={11} />Advisory</button>
      </div>
    </div>
  );
}

function Tables({ live, tasks, quick, onPick }) {
  const [tab, setTab] = useState('intakes');
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const feed = live.events.filter((e) => e.type !== 'TRANSIT_CALIBRATION').slice(0, 12);
  const tabs = [['intakes', 'Intakes', live.stations.filter((s) => s.valve).length], ['sensors', 'Sensors', live.stations.length], ['crews', 'Crew', open.length], ['events', 'Events', feed.length], ['river', 'River', live.reaches.length]];
  const line = 'flex w-full items-center gap-2 border-b border-line py-1.5 text-left text-xs last:border-0 hover:bg-panel-2';
  return (
    <div className={`${card} p-3`}>
      <div className="mb-1 flex gap-3 border-b border-line text-xs font-semibold" role="tablist">
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-0.5 pb-1.5 ${tab === k ? 'border-civic text-civic' : 'border-transparent text-muted hover:text-ink'}`}>
            {label} <span className="font-medium opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[118px] overflow-y-auto">
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

const CATALOGUE = [
  ['flood', 'Flood-prone ground (our estimate)'], ['heatmap', 'Contamination risk'], ['buildings', 'Real 3D buildings'], ['labels', 'Roads and place names'],
  ['streams', 'Streams'], ['pipes', 'Gravity pipelines'], ['particles', 'Water flow'], ['catchment', 'Watershed'],
];

function LayerMenu({ layers, setLayers, onClose }) {
  return (
    <div className={`${card} absolute right-14 top-[62px] z-20 w-[230px] p-3 text-xs text-ink-2`}>
      <div className="mb-1 flex items-center justify-between font-display text-sm font-semibold text-ink">Layers
        <button onClick={onClose} aria-label="Close layers" className="rounded p-0.5 hover:bg-panel-2"><X size={14} /></button>
      </div>
      {CATALOGUE.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 py-0.5">
          <input type="checkbox" checked={layers[k] !== false && Boolean(layers[k] ?? true)} onChange={() => setLayers((l) => ({ ...l, [k]: !(l[k] ?? true) }))} className="h-3.5 w-3.5 accent-[#2f5be7]" />{label}
        </label>
      ))}
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
    <div className="relative hidden w-[210px] shrink-0 xl:block">
      <Search size={14} className="absolute left-2.5 top-2 text-muted" />
      <input
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Search water points, tasks…" aria-label="Search" className="h-[30px] w-full rounded-xl border border-line bg-white pl-8 pr-2 text-xs"
      />
      {open && (points.length > 0 || jobs.length > 0) && (
        <div className={`${card} absolute left-0 top-9 z-30 w-[280px] p-1.5 text-xs`}>
          {points.map((s) => <button key={s.id} onMouseDown={() => { onPick(s.id); setQ(''); }} className="block w-full truncate rounded-lg px-2 py-1.5 text-left hover:bg-panel-2"><b>{s.id}</b> {s.name}</button>)}
          {jobs.map((t) => <button key={t.id} onMouseDown={() => go('maintenance')} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-ink-2 hover:bg-panel-2">{t.station}: {t.title}</button>)}
        </div>
      )}
    </div>
  );
}

const FLOOD_CLASS = {
  HIGH: ['High', 'pill-red', 'Very low ground right beside the river.'],
  MEDIUM: ['Medium', 'pill-amber', 'Low ground near the river.'],
  LOW: ['Low', 'pill-amber', 'A little above the river.'],
  MINIMAL: ['Minimal', 'pill-good', 'Well above or far from the river.'],
};

/** Tap anywhere on the map to see what the terrain model says about that spot. */
function HazardCard({ spot, onClose }) {
  const c = spot?.flood_class ? FLOOD_CLASS[spot.flood_class] : null;
  return (
    <div className={`${card} p-3`}>
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-semibold">Check this location</div>
        <button onClick={onClose} aria-label="Close location check" className="rounded p-0.5 text-muted hover:bg-panel-2"><X size={14} /></button>
      </div>
      {!spot && <p className="mt-1 text-xs text-muted">Checking…</p>}
      {spot?.error && <p className="mt-1 text-xs text-ink-2">{spot.error}</p>}
      {spot && !spot.error && (
        <>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="text-muted">Flood-prone ground</span>
            {c ? <span className={`pill ${c[1]}`}>{c[0]}</span> : <span className="pill pill-grey">Outside the watershed</span>}
          </div>
          {c && <p className="mt-1 text-xs text-ink-2">{c[2]}</p>}
          <div className="mt-1">
            <Row label="Elevation">{fmt(spot.elevation_m, 0)} m</Row>
            {spot.height_above_river_m != null && <Row label="Height above river">{fmt(spot.height_above_river_m, 1)} m</Row>}
            {spot.river_distance_m != null && <Row label="Distance to river">{spot.river_distance_m.toLocaleString()} m</Row>}
            <Row label="Nearest water point">{spot.nearest_id} · {fmt(spot.nearest_km, 1)} km</Row>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">Estimate from a 90 m elevation model. Not an official hazard map.</p>
        </>
      )}
    </div>
  );
}

function FloodLegend() {
  const items = [['#ffe05a', 'Low'], ['#fa9628', 'Medium'], ['#e0342c', 'High']];
  return (
    <div className={`${card} flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-ink-2`}>
      <span className="font-semibold text-ink">Flood-prone ground</span>
      {items.map(([c, t]) => <span key={t} className="inline-flex items-center gap-1"><i className="h-2.5 w-3.5 rounded-sm" style={{ background: c }} />{t}</span>)}
      <span className="text-muted">Our estimate</span>
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
    <div className={`${card} border-l-4 border-[#ec835a] p-3`}>
      <div className="flex items-start gap-2">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-[#c9551f]" />
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Action needed</div>
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

export default function CommandCenter({ live, forecast, tasks, staticData, heatmap, layers, setLayers, status, selectedId, onSelect, onInspect, onDetails, act, quick, pages, page, go, actions }) {
  const time = useTwinTime(live, forecast);
  const controls = useRef({});
  const [showInspector, setShowInspector] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [touring, setTouring] = useState(false);
  const [following, setFollowing] = useState(false);
  const [caption, setCaption] = useState(null);
  const { data: floodmap } = usePoll(layers.flood ? '/api/heatmap?index=flood' : null, 15000);
  const [probe, setProbe] = useState(null);
  const [spot, setSpot] = useState(null);
  const checkSpot = useMemo(() => (at) => {
    setProbe(at);
    setSpot(null);
    get(`/api/hazard?lat=${at.lat}&lon=${at.lon}`).then(setSpot).catch(() => setSpot({ error: 'That spot is outside the modelled area.' }));
  }, []);
  const selected = live?.stations.find((s) => s.id === selectedId);
  const danger = live ? exposure(live) : null;

  const pick = useMemo(() => (id) => { onSelect(id); setShowInspector(true); }, [onSelect]);
  const focus = (id) => { pick(id); controls.current.focus?.(id); };
  // the crew heads for the most pressing open task
  const crewTask = useMemo(() => {
    const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
    const rank = (t) => (t.urgent ? 0 : t.status === 'OVERDUE' ? 1 : t.status === 'DUE_TODAY' ? 2 : 3);
    const top = open.sort((a, b) => rank(a) - rank(b))[0];
    return top && rank(top) < 3 ? { id: top.id, station: top.station } : null;
  }, [tasks]);

  const total = live?.stations.reduce((a, s) => a + (s.population ?? 0), 0) ?? 0;
  const avg = live ? Math.round(live.stations.reduce((a, s) => a + s.wqhi.score, 0) / live.stations.length) : 0;
  const valves = live?.stations.filter((s) => s.valve) ?? [];
  const closed = valves.filter((s) => !s.valve.open).length;
  const tool = 'flex h-8 w-8 items-center justify-center rounded-xl text-ink-2 hover:bg-panel-2 hover:text-civic';
  const isLive = time.tauStep === 0;

  return (
    <div className="relative min-h-full overflow-x-hidden bg-gradient-to-b from-[#eef3fc] to-[#e6eeff] lg:fixed lg:inset-0 lg:overflow-hidden">
      <div className="relative h-[62vh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Building the watershed…</div>}>
          <TwinMapScene
            staticData={staticData} live={live} heatmap={heatmap} floodmap={floodmap} atTime={time.atTime} tauStep={time.tauStep} selectedId={selectedId}
            onPick={pick} onInspect={onInspect} crewTask={crewTask} layers={layers} controls={controls} onTour={setTouring} onCaption={setCaption} onProbe={checkSpot} probe={probe}
          />
        </Suspense>
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-white/90 px-3 py-2 shadow-[0_2px_14px_rgba(30,50,110,0.08)] backdrop-blur">
        <button onClick={() => go('home')} className="flex shrink-0 items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block font-display text-sm font-semibold">Bulos 3D</span>
            <span className="block text-[10.5px] text-muted">{staticData?.site.title ?? 'Water quality digital twin'}</span>
          </span>
        </button>
        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-2">
          {pages.map(([id, label]) => (
            <button key={id} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-xl px-2.5 py-1 text-[13px] font-medium ${page === id ? 'bg-civic text-white' : 'text-ink-2 hover:bg-[#e9efff]'}`}>{label}</button>
          ))}
        </nav>
        <SearchBox live={live} tasks={tasks} onPick={focus} go={go} />
        <span className={`hidden shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold md:inline-flex ${status === 'online' ? (isLive ? 'bg-[#e3f6ea] text-[#157a3e]' : 'bg-[#e7edff] text-civic') : 'bg-[#fde6e6] text-[#a32626]'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'online' ? 'bg-good' : 'bg-critical'}`} />
          {status !== 'online' ? 'Offline' : isLive ? `Live ${live ? fmtClock(live.clock.epoch_ms) : ''}` : `${time.tauStep > 0 ? 'Forecast' : 'Replay'} ${fmtOffset(time.tauStep)}`}
        </span>
        {actions}
      </header>

      {live ? (
        <>
          <div className="z-10 flex gap-2 overflow-x-auto p-2 lg:absolute lg:left-3 lg:top-[62px] lg:overflow-visible lg:p-0">
            <Stat Icon={Droplets} label="Water quality" value={`${avg}%`} sub={danger.points ? 'Event in progress' : 'All water points good'} />
            <Stat Icon={Users} label="People not affected" value={(total - danger.people).toLocaleString()} sub={danger.people ? `${danger.people.toLocaleString()} in the path` : `of ${total.toLocaleString()} served`} tone={danger.people ? 'text-[#d03b3b]' : 'text-civic'} />
            <Stat Icon={ShieldCheck} label="Intakes open" value={`${valves.length - closed} of ${valves.length}`} sub={closed ? `${closed} closed for safety` : 'All running'} tone={closed ? 'text-[#d03b3b]' : 'text-civic'} />
            <Stat Icon={Clock} label="Next arrival" value={danger.next ? fmtMin(danger.next.s) : 'None'} sub={danger.next ? `at ${danger.next.id}` : 'No plume forecast'} tone={danger.next ? 'text-[#c47a00]' : 'text-civic'} />
          </div>

          <div className={`${card} absolute right-3 top-[62px] z-10 hidden flex-col p-1 lg:flex ${showInspector && selected ? 'lg:right-[316px]' : ''}`}>
            <button onClick={() => controls.current.zoom?.(0.8)} aria-label="Zoom in" className={tool}><Plus size={16} /></button>
            <button onClick={() => controls.current.zoom?.(-0.8)} aria-label="Zoom out" className={tool}><Minus size={16} /></button>
            <button onClick={() => controls.current.tilt?.()} aria-label="Rotate view" title="Rotate" className={tool}><Compass size={15} /></button>
            <button onClick={() => { setFollowing(false); controls.current.home?.(); }} aria-label="Reset view" title="Back to the whole river" className={tool}><RotateCcw size={15} /></button>
            <button onClick={() => setShowLayers((v) => !v)} aria-label="Layers" title="Layers" className={tool}><Layers size={15} /></button>
            <button onClick={() => (touring ? controls.current.stopTour?.() : controls.current.startTour?.())} aria-label="Tour" title="Guided tour of all five water points" className={`${tool} ${touring ? 'bg-civic text-white' : ''}`}><Plane size={15} /></button>
            <button onClick={() => { const on = !following; setFollowing(on); controls.current.setFollow?.(on); }} aria-label="Follow the plume" title="Follow the plume" className={`${tool} ${following ? 'bg-civic text-white' : ''}`}><Crosshair size={15} /></button>
          </div>

          {showLayers && <LayerMenu layers={layers} setLayers={setLayers} onClose={() => setShowLayers(false)} />}
          {caption && (
            <div className={`${card} absolute bottom-[190px] left-1/2 z-10 hidden max-w-[440px] -translate-x-1/2 px-4 py-2 text-center lg:block`}>
              <div className="font-display text-sm font-semibold">{live.stations.find((s) => s.id === caption)?.name}</div>
              <div className="text-xs text-ink-2">{live.stations.find((s) => s.id === caption)?.note}</div>
            </div>
          )}
          <div className="z-10 grid gap-2 p-2 lg:absolute lg:left-3 lg:top-[146px] lg:w-[330px] lg:p-0">
            <ActionCard live={live} act={act} quick={quick} onPick={focus} />
            {probe && <HazardCard spot={spot} onClose={() => { setProbe(null); setSpot(null); }} />}
          </div>
          {layers.flood && <div className="absolute bottom-[34px] left-1/2 z-[9] hidden -translate-x-1/2 xl:block"><FloodLegend /></div>}

          {showInspector && selected && (
            <div className="z-10 p-2 lg:absolute lg:right-3 lg:top-[62px] lg:w-[296px] lg:p-0">
              <Inspector st={selected} fc={live.forecast.stations?.[selected.id]} act={act} quick={quick} onInspect={onInspect} onDetails={onDetails} onStreet={(id) => controls.current.street?.(id)} onClose={() => { setShowInspector(false); controls.current.home?.(); }} />
            </div>
          )}

          <div className="z-10 p-2 lg:absolute lg:bottom-3 lg:left-3 lg:w-[min(560px,46vw)] lg:p-0">
            <Tracker live={live} danger={danger} quick={quick} time={time} onPick={focus} />
          </div>
          <div className="z-10 p-2 lg:absolute lg:bottom-3 lg:right-3 lg:w-[min(430px,36vw)] lg:p-0">
            <Tables live={live} tasks={tasks} quick={quick} onPick={focus} />
          </div>
          <p className="px-3 pb-3 text-[10px] text-muted lg:absolute lg:bottom-[3px] lg:left-1/2 lg:z-[5] lg:-translate-x-1/2 lg:p-0 lg:text-center">
            <Truck size={10} className="mr-1 inline" />Models are enlarged when zoomed out; site layouts are illustrative. Live data from a {live.clock.mode === 'sim' ? 'simulated field' : 'field network'}.
          </p>
        </>
      ) : (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted">{status === 'offline' ? 'Cannot reach the data server. Run npm start.' : 'Connecting to the twin…'}</div>
      )}
    </div>
  );
}
