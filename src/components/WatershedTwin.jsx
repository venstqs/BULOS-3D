import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Droplets, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { usePoll } from '../api';
import { fmt } from '../lib/format';
import { useTwinTime } from '../lib/useTwinTime';
import { Floating } from '../lib/floating';

const TwinMapScene = lazy(() => import('./TwinMapScene'));

const LAYERS = [['risk', 'Risk'], ['turbidity', 'Turbidity'], ['ph', 'pH'], ['tds', 'TDS'], ['bio', 'Biological'], ['none', 'None']];
const RIVER_SPEED = 430;        // metres of river shown per real second
const STOP_SECONDS = 3.4;       // pause at each water point
const hours = (s) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

function Stat({ label, value, unit }) {
  return (
    <div>
      <div className="font-display text-[20px] font-semibold leading-tight tabular-nums">{value}{unit && <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span>}</div>
      <div className="text-[12px] text-ink-2">{label}</div>
    </div>
  );
}

/** The river's fall from the mountain to the city, with the drop on it. Click anywhere to jump there. */
function Profile({ river, stations, at, onSeek }) {
  const { stem, length, top } = river;
  const x = (s) => (s / length) * 1000;
  const y = (z) => 74 - (z / top) * 66;
  const line = stem.map((p) => `${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`).join(' ');
  const elevAt = river.sample(at).z;
  const seek = (e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * length); };
  return (
    <div className="relative cursor-pointer" onClick={seek} role="slider" aria-label="Position along the river" aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(at)} tabIndex={0}
         onKeyDown={(e) => { const d = { ArrowLeft: -500, ArrowRight: 500 }[e.key]; if (d) onSeek(Math.min(length, Math.max(0, at + d))); }}>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="block h-[84px] w-full" aria-hidden="true">
        <defs><linearGradient id="shed-fall" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2f5be7" stopOpacity="0.28" /><stop offset="1" stopColor="#2f5be7" stopOpacity="0.03" /></linearGradient></defs>
        <polygon points={`0,100 ${line} 1000,100`} fill="url(#shed-fall)" />
        <polyline points={line} fill="none" stroke="#b8cbf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={stem.filter((p) => p[3] <= at).map((p) => `${x(p[3]).toFixed(1)},${y(p[2]).toFixed(1)}`).join(' ')} fill="none" stroke="#2f5be7" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      {stations.map((st) => (
        <div key={st.id} className="pointer-events-none absolute top-0 h-full -translate-x-1/2 text-center" style={{ left: `${(st.chainage_m / length) * 100}%` }}>
          <span className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${st.chainage_m <= at ? 'bg-civic' : 'bg-[#9db4ec]'}`} style={{ top: `${y(st.elevation_m ?? 0) * 0.84}px` }} />
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] font-semibold text-ink-2">{st.id}</span>
        </div>
      ))}
      <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-civic shadow-[0_0_0_5px_rgba(47,91,231,0.25)]" style={{ left: `${(at / length) * 100}%`, top: `${y(elevAt) * 0.84}px` }} />
    </div>
  );
}

/** The Watershed page: the same twin as the map, telling the story of the water through it. */
export default function WatershedTwin({ live, forecast, staticData, layers, lite, onLite, canUse3D, onInspect, act }) {
  const controls = useRef({});
  const time = useTwinTime(live, forecast);
  const [index, setIndex] = useState('risk');
  const { data: grid } = usePoll(index === 'none' ? null : `/api/heatmap?index=${index}`, 8000);
  const [phase, setPhase] = useState('idle');          // idle, playing, paused, done
  const [at, setAt] = useState(0);
  const [stop, setStop] = useState(null);
  const pos = useRef({ s: 0, bearing: 0, wait: 0, passed: new Set(), lastPaint: 0 });
  const view = useMemo(() => ({ mapLabels: true, hazard: index, opacity: 0.7, palette: 'hazard', base: 'satellite', relief: 1.5 }), [index]);
  const stations = live?.stations ?? [];

  // Along the river: where, how high, how fast, and how long the water has been travelling
  const rain = Math.round(live?.rain_mm_hr ?? 0);
  const hasRiver = Boolean(staticData?.main_stem?.length && live?.channel);
  const river = useMemo(() => {
    if (!hasRiver) return null;
    // The river line has 116 m steps; rounding its corners keeps the drop gliding along the bends
    let stem = staticData.main_stem;
    for (let pass = 0; pass < 3; pass += 1) {
      stem = stem.map((p, i) => {
        const [a, b] = [stem[Math.max(0, i - 1)], stem[Math.min(stem.length - 1, i + 1)]];
        return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4, p[2], p[3]];
      });
    }
    const v = live.channel.velocity_mps;
    const q = live.channel.discharge_m3s;
    const clock = [0];
    for (let i = 1; i < stem.length; i += 1) clock[i] = clock[i - 1] + (stem[i][3] - stem[i - 1][3]) / Math.max(0.2, v[Math.min(v.length - 1, i - 1)] ?? 0.6);
    const length = stem.at(-1)[3];
    const sample = (s) => {
      let i = 1;
      while (i < stem.length - 1 && stem[i][3] < s) i += 1;
      const [a, b] = [stem[i - 1], stem[i]];
      const f = Math.min(1, Math.max(0, (s - a[3]) / (b[3] - a[3] || 1)));
      const mix = (p, r) => p + (r - p) * f;
      return { lon: mix(a[0], b[0]), lat: mix(a[1], b[1]), z: mix(a[2], b[2]), t: mix(clock[i - 1], clock[i]), v: v[Math.min(v.length - 1, i)] ?? 0, q: q[Math.min(q.length - 1, i)] ?? 0 };
    };
    return { stem, length, top: stem[0][2], sample };
  }, [hasRiver, staticData, rain]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = river?.sample(at);
  const next = stations.find((s) => s.chainage_m > at + 1);
  const downstream = stations.filter((s) => s.chainage_m > at).reduce((a, s) => a + (s.population ?? 0), 0);
  const draining = useMemo(() => {
    if (!river) return 0;
    const pts = [[0, 0], ...stations.map((s) => [s.chainage_m, s.catchment_km2]), [river.length, staticData.catchment.area_km2]];
    const k = pts.findIndex((p) => p[0] >= at);
    if (k <= 0) return 0;
    const [a, b] = [pts[k - 1], pts[k]];
    return a[1] + ((b[1] - a[1]) * (at - a[0])) / (b[0] - a[0] || 1);
  }, [at, river, stations, staticData]);

  const stations$ = useRef(stations);
  stations$.current = stations;

  const place = useCallback((s, dt) => {
    if (!river) return;
    const p = river.sample(s);
    const ahead = river.sample(Math.min(river.length, s + 1400));
    const want = (Math.atan2((ahead.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180), ahead.lat - p.lat) * 180) / Math.PI;
    const r = pos.current;
    const turn = ((want - r.bearing + 540) % 360) - 180;
    r.bearing += turn * Math.min(1, dt * 1.1);
    controls.current.dropAt?.(p.lon, p.lat, r.bearing);
  }, [river]);

  const start = () => {
    const r = pos.current;
    if (phase === 'paused') { setPhase('playing'); return; }
    Object.assign(r, { s: 0, wait: 0, passed: new Set() });
    setAt(0);
    setStop(null);
    if (river) {
      const a = river.sample(0);
      const b = river.sample(1400);
      r.bearing = (Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
      controls.current.dropStart?.(a.lon, a.lat, r.bearing);
      r.wait = 2.2;
    }
    setPhase('playing');
  };
  const reset = () => {
    controls.current.dropEnd?.();
    pos.current.s = 0;
    setAt(0);
    setStop(null);
    setPhase('idle');
  };
  const seek = (s) => {
    const r = pos.current;
    if (phase === 'idle') {
      const a = river.sample(s);
      controls.current.dropStart?.(a.lon, a.lat, r.bearing);
      setPhase('paused');
    }
    r.s = s;
    r.wait = 0;
    r.passed = new Set(stations.filter((x) => x.chainage_m <= s).map((x) => x.id));
    setAt(s);
    setStop(null);
    place(s, 1);
  };

  useEffect(() => {
    if (phase !== 'playing' || !river) return undefined;
    let raf = 0;
    let last = performance.now();
    const r = pos.current;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (r.wait > 0) {
        r.wait -= dt;
        if (r.wait <= 0) setStop(null);
        return;
      }
      r.s = Math.min(river.length, r.s + RIVER_SPEED * dt);
      const reached = stations$.current.find((x) => x.chainage_m <= r.s && !r.passed.has(x.id));
      if (reached) {
        r.passed.add(reached.id);
        r.s = reached.chainage_m;
        r.wait = STOP_SECONDS;
        setStop(reached.id);
      }
      place(r.s, dt);
      if (now - r.lastPaint > 90) { r.lastPaint = now; setAt(r.s); }
      if (r.s >= river.length) { setAt(river.length); setPhase('done'); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, river, place]);

  const stopped = stations.find((s) => s.id === stop);
  const label = phase === 'playing' ? 'Pause' : phase === 'paused' ? 'Continue' : phase === 'done' ? 'Watch again' : 'Follow a drop';

  return (
    <section aria-label="Watershed digital twin" className="relative h-[calc(100vh-104px)] min-h-[600px] overflow-hidden rounded-xl bg-[#dfe8ff]">
      {lite ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 pb-40 text-center">
          <div className="font-display text-base font-semibold">The 3D map is off</div>
          <p className="max-w-[46ch] text-sm text-ink-2">{canUse3D ? 'The river story below still works. Turn the map on to fly along the real terrain.' : 'This browser has WebGL turned off, so the 3D map cannot run.'}</p>
          {canUse3D && <button onClick={onLite} className="btn-primary">Turn on the 3D map</button>}
        </div>
      ) : (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Loading the twin…</div>}>
          <TwinMapScene
            staticData={staticData} live={live} hazard={index === 'none' ? null : grid} view={view} atTime={time.atTime} tauStep={0} selectedId=""
            onPick={onInspect} onInspect={onInspect} layers={layers} controls={controls} insets={{ left: 24, right: 24, top: 16, bottom: 150 }}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute inset-0 z-10">
        <Floating id="shed-story" title="River story" label="Move the story panel" className="site-panel pointer-events-auto absolute left-3 top-3 w-[min(320px,calc(100%-24px))]">
          <div className="px-3.5 pb-3.5">
            <h2 className="font-display text-[17px] font-semibold leading-snug">{stopped ? stopped.name : 'Where does the water go?'}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {stopped ? stopped.note : phase === 'done' ? 'The drop has reached the end of the river, in Naga City. Anything spilled upstream takes this same path.' : 'Follow one drop down the real Naga River, from Mt. Isarog to the city, and see what it passes on the way.'}
            </p>
            {river && phase !== 'idle' && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3">
                <Stat label="Distance travelled" value={fmt(at / 1000, 1)} unit="km" />
                <Stat label="Elevation" value={Math.round(here.z)} unit="m" />
                <Stat label="Time in the river" value={hours(here.t)} />
                <Stat label="River speed" value={fmt(here.v, 2)} unit="m/s" />
                <Stat label="Land draining here" value={fmt(draining, 1)} unit="km²" />
                <Stat label="People downstream" value={downstream.toLocaleString()} />
              </dl>
            )}
            {river && phase !== 'idle' && next && (
              <p className="mt-2.5 rounded-lg bg-[#f2f6ff] px-2.5 py-2 text-[13px] text-ink-2">
                <b className="font-semibold text-ink">{next.id}</b> is {fmt((next.chainage_m - at) / 1000, 1)} km ahead, about {hours(Math.max(0, river.sample(next.chainage_m).t - here.t))} at today’s flow.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={phase === 'playing' ? () => setPhase('paused') : start} disabled={!river} className="btn-primary flex-1 justify-center">
                {phase === 'playing' ? <Pause size={14} /> : phase === 'idle' ? <Droplets size={14} /> : <Play size={14} />}{label}
              </button>
              {phase !== 'idle' && <button onClick={reset} aria-label="Back to the whole river" title="Back to the whole river" className="btn-ghost px-2.5"><RotateCcw size={14} /></button>}
            </div>
            {river && phase !== 'idle' && live?.clock.mode === 'sim' && (
              <button onClick={() => act('/api/spill', { lat: here.lat, lon: here.lon }, 'Simulated spill started at this spot. Open Forecast to see when it arrives.')} className="mt-2 flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-civic hover:underline">
                <TriangleAlert size={13} />Simulate a spill here
              </button>
            )}
          </div>
        </Floating>

        {!lite && (
          <Floating id="shed-layers" grip={false} className="pointer-events-auto absolute right-3 top-3">
            <div className="seg shadow-[0_1px_2px_rgba(16,24,40,0.2),0_4px_14px_rgba(16,24,40,0.14)]" role="group" aria-label="Show on the map">
              {LAYERS.map(([k, name]) => <button key={k} aria-pressed={index === k} onClick={() => setIndex(k)}>{name}</button>)}
            </div>
          </Floating>
        )}

        {river && (
          <Floating id="shed-profile" title="River profile" label="Move the river profile" className="site-panel pointer-events-auto absolute bottom-3 left-3 right-3">
            <div className="px-3.5 pb-2">
              <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-ink-2">
                <span className="font-semibold text-ink">The river from source to city</span>
                <span className="hidden sm:inline">{Math.round(river.top)} m at the source, {fmt(river.length / 1000, 1)} km long. Click anywhere to go there.</span>
              </div>
              <Profile river={river} stations={stations} at={at} onSeek={seek} />
            </div>
          </Floating>
        )}
      </div>
    </section>
  );
}
