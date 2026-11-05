import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { Layers, Pause, Play, Plane, RotateCcw, X } from 'lucide-react';
import { usePoll } from '../api';
import { AHEAD_S, PAST_S, exposure, fmtOffset } from '../lib/twinField';
import { useTwinTime } from '../lib/useTwinTime';

// One digital twin, three ways to look at it. Each engine loads only when chosen.
const ENGINES = {
  water: { label: 'Water 3D', Scene: lazy(() => import('./WaterScene')), note: 'Our elevation model with shader-drawn water. Still works if the imagery cannot load.' },
  terrain: { label: 'Terrain', Scene: lazy(() => import('./TerrainMapScene')), note: 'MapLibre 3D map with satellite imagery.' },
  globe: { label: 'Globe', Scene: lazy(() => import('./CesiumScene')), note: 'CesiumJS globe with satellite imagery.' },
};
const ENGINE_KEY = 'bulos-engine';

const CATALOGUE = [
  ['Hazard', [['heatmap', 'Contamination risk'], ['flood', 'Flood-prone ground']]],
  ['Water', [['particles', 'River and pipe flow'], ['streams', 'Streams'], ['pipes', 'Gravity pipelines']]],
  ['Context', [['columns', 'Risk columns'], ['catchment', 'Watershed boundary']]],
];

function LayerPanel({ engine, layers, setLayers, onClose }) {
  return (
    <div className="absolute right-2 top-12 z-20 max-h-[calc(100%-132px)] w-[218px] overflow-y-auto rounded-2xl bg-white/95 p-3 text-xs text-ink-2 shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-ink">Layers</span>
        <button onClick={onClose} aria-label="Close layers" className="rounded p-0.5 hover:bg-panel-2"><X size={14} /></button>
      </div>
      {CATALOGUE.map(([group, items]) => (
        <div key={group} className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{group}</div>
          {items.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={Boolean(layers[k])} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className="h-3.5 w-3.5 accent-[#2f5be7]" />
              {label}
            </label>
          ))}
        </div>
      ))}
      <div className="mt-3 border-t border-line pt-2">
        <div className="h-1.5 rounded" style={{ background: 'linear-gradient(90deg, rgb(64,184,255), rgb(150,120,90), rgb(190,30,30))' }} />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted"><span>clean water</span><span>polluted</span></div>
        {layers.flood && (
          <p className="mt-2 text-[10px] leading-snug text-muted">
            Flood-prone ground is our estimate from the 90 m elevation model. It is not an official hazard map.
          </p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-muted">
          {engine === 'water' ? 'Water widths, flow speed and terrain height are exaggerated so they can be seen.' : 'Flow is sped up so it can be seen.'}
        </p>
      </div>
    </div>
  );
}

export default function TwinView({ staticData, live, forecast, heatmap, selectedId, onSelect, onInspect, layers, setLayers, defaultEngine = 'water' }) {
  const [engine, setEngineState] = useState(() => {
    const saved = localStorage.getItem(ENGINE_KEY);
    return ENGINES[saved] ? saved : defaultEngine;
  });
  const setEngine = useCallback((e) => { localStorage.setItem(ENGINE_KEY, e); setEngineState(e); }, []);
  const time = useTwinTime(live, forecast);
  const { data: floodmap } = usePoll(layers.flood && engine !== 'water' ? '/api/heatmap?index=flood' : null, 15000);
  const [showLayers, setShowLayers] = useState(false);
  const [touring, setTouring] = useState(false);
  const controls = useRef({});                       // the active engine fills in home, startTour, stopTour

  const { tauStep } = time;
  const isLive = tauStep === 0;
  const danger = live ? exposure(live) : null;
  const syncedS = live ? Math.max(0, Math.round((live.clock.t - Math.max(...live.stations.map((s) => s.link?.last_seen_t ?? 0))) / Math.max(1, live.clock.speed))) : null;
  const source = live?.live_nodes?.length ? 'real node + virtual field' : live?.clock.mode === 'sim' ? 'virtual field' : 'field sensors';
  const button = 'flex h-8 items-center gap-1.5 rounded-xl bg-white/95 px-2.5 text-xs font-medium text-ink-2 shadow-sm backdrop-blur hover:text-civic';
  const { Scene } = ENGINES[engine];

  return (
    <div className="relative h-full w-full">
      <Suspense fallback={<div className="flex h-full items-center justify-center bg-panel-2 text-sm text-muted">Loading {ENGINES[engine].label}…</div>}>
        <Scene
          key={engine} staticData={staticData} live={live} heatmap={heatmap} floodmap={floodmap} selectedId={selectedId}
          onSelect={onSelect} onInspect={onInspect} layers={layers} tauStep={tauStep} atTime={time.atTime}
          controls={controls} onTour={setTouring}
        />
      </Suspense>

      <div className="pointer-events-none absolute left-2 top-2 z-10 grid max-w-[58%] justify-items-start gap-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm ${isLive ? 'bg-[#0b7a43]' : tauStep > 0 ? 'bg-[#2f5be7]' : 'bg-[#4a5a6a]'}`}>
          <span className={`h-1.5 w-1.5 rounded-full bg-white ${isLive ? 'animate-pulse' : ''}`} />
          {isLive ? 'LIVE' : tauStep > 0 ? `FORECAST ${fmtOffset(tauStep)}` : `REPLAY ${fmtOffset(tauStep)}`}
        </span>
        {isLive && live && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-ink-2 shadow-sm">Synced {syncedS} s ago · {source}</span>}
        {isLive && danger?.points > 0 && (
          <span className="rounded-xl bg-[#a32626]/95 px-2.5 py-1 text-[11px] font-semibold leading-tight text-white shadow-sm">
            {danger.people.toLocaleString()} people in the path
            {danger.next && <span className="block font-normal">Next: {danger.next.id} in {Math.round(danger.next.s / 60)} min</span>}
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        <button onClick={() => setShowLayers((v) => !v)} className={button} aria-label="Layers"><Layers size={14} /> Layers</button>
        <button onClick={() => (touring ? controls.current.stopTour?.() : controls.current.startTour?.())} className={button} aria-label="Fly the river"><Plane size={14} /> {touring ? 'Stop' : 'Fly'}</button>
        <button onClick={() => { controls.current.stopTour?.(); controls.current.home?.(); }} className={button} aria-label="Reset view"><RotateCcw size={14} /></button>
      </div>
      {showLayers && <LayerPanel engine={engine} layers={layers} setLayers={setLayers} onClose={() => setShowLayers(false)} />}

      <div className="absolute bottom-[68px] right-2 z-10 flex rounded-xl bg-white/95 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="3D engine">
        {Object.entries(ENGINES).map(([k, e]) => (
          <button
            key={k} onClick={() => { controls.current.stopTour?.(); setTouring(false); setEngine(k); }} title={e.note} aria-pressed={engine === k}
            className={`rounded-[10px] px-2 py-1 text-[11px] font-semibold ${engine === k ? 'bg-[#2f5be7] text-white' : 'text-ink-2 hover:text-civic'}`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="absolute inset-x-2 bottom-2 z-10 rounded-2xl bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={time.togglePlay} aria-label={time.playing ? 'Pause' : 'Play the last 6 hours and next 4 hours'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2f5be7] text-white"
          >
            {time.playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <input
            type="range" min={-PAST_S} max={AHEAD_S} step={time.step} value={tauStep} aria-label="Time"
            onChange={(e) => time.scrub(Number(e.target.value))} className="min-w-0 flex-1 accent-[#2f5be7]"
          />
          <button onClick={time.toNow} disabled={isLive} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2 disabled:opacity-40">Now</button>
        </div>
        <div className="relative mt-0.5 h-3 pl-9 pr-11 text-[10px] text-muted">
          <div className="relative h-full">
            <span className="absolute left-0">−6 h recorded</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${(PAST_S / (PAST_S + AHEAD_S)) * 100}%` }}>now</span>
            <span className="absolute right-0">+4 h forecast</span>
          </div>
        </div>
      </div>
    </div>
  );
}
