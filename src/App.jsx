import { Suspense, lazy, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ChevronDown, CloudRain, FlaskConical, PlayCircle, Sun, TriangleAlert, X } from 'lucide-react';
import Home, { MaintenancePage } from './components/Home';
import { FlowPage, MapPage, ReportsPage, WaterPointsPage } from './components/Pages';
import AboutPage from './components/About';
import { AdvisoryModal, LogMaintenanceModal, ReminderModal, WaterTestModal } from './components/Actions';
import { AlertBell } from './components/Alerts';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/PageShell';
import { SafeModal } from './components/SafeCheck';
import WaterDisc from './components/WaterDisc';
import { post, usePoll } from './api';
import { fmtClock, fmtMin } from './lib/format';
import { moodOf } from './lib/safety';
import { waterAt, waterName, waterRgb } from './lib/waterColour';

// Heavy 3D libraries load on demand so the page itself appears immediately.
const WatershedTwin = lazy(() => import('./components/WatershedTwin'));
const CommandCenter = lazy(() => import('./components/CommandCenter'));
const AssetInspector = lazy(() => import('./components/AssetInspector'));

const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

const PAGES = [
  ['home', 'Map'],
  ['overview', 'Overview'],
  ['map', 'Watershed'],
  ['flow', 'Forecast'],
  ['points', 'Water points'],
  ['maintenance', 'Maintenance'],
  ['reports', 'Reports'],
  ['about', 'About'],
];

const SCENARIOS = [
  ['MONSOON', 'Heavy monsoon rain', '45 mm/h over the watershed for one hour'],
  ['SEPTIC', 'Piggery lagoon spill', 'Raw effluent enters the farm tributary in dry weather'],
  ['BIOFOULING', 'Dirty sensor at KS-03', 'Biofilm on the turbidity probe; the water itself is clean'],
  ['RESET', 'Back to normal', 'Clear all simulated events'],
];
const SCENARIO_STARTED = {
  MONSOON: 'Heavy rain started. Rainfall builds over 15 simulated minutes; the upland points turn turbid first.',
  SEPTIC: 'Piggery spill started. AG-02 should detect it in about 20 seconds, then the forecast warns the kiosk.',
  BIOFOULING: 'Biofilm is growing on the KS-03 turbidity probe. In about a minute the twin flags it and adds a cleaning task.',
  RESET: 'All simulated events cleared. Readings return to normal over the next few minutes.',
};

export default function App() {
  const { data: staticData } = usePoll('/api/static', 0);
  // The page in view decides what is fetched: each request also redraws the app
  const [page, setPage] = useState(() => (new URLSearchParams(window.location.search).get('inspect') ? 'points' : 'home'));
  const { data: live, status, refresh } = usePoll('/api/state', page === 'home' ? 2500 : 1500);
  const { data: forecast } = usePoll('/api/forecast', 8000);
  const { data: maint, refresh: refreshMaint } = usePoll('/api/maintenance', 10000);
  const { data: trend } = usePoll(page === 'overview' ? '/api/trend?hours=12&bucket_min=30' : null, 15000);
  const { data: weather } = usePoll('/api/weather', 600000);
  const deepLink = new URLSearchParams(window.location.search).get('inspect');
  const [myPoint, setMyPoint] = useState(() => localStorage.getItem('bulos-my-point'));
  const toggleMine = useCallback((id) => setMyPoint((now) => {
    const next = now === id ? null : id;
    if (next) localStorage.setItem('bulos-my-point', next); else localStorage.removeItem('bulos-my-point');
    return next;
  }), []);
  const [selectedId, setSelectedId] = useState(() => deepLink ?? localStorage.getItem('bulos-my-point') ?? 'KS-03');
  const [inspectId, setInspectId] = useState(deepLink);
  const [layers, setLayers] = useState({ heatmap: true, particles: true, streams: true, pipes: true, columns: true, catchment: true, buildings: true, labels: true, assets: true });
  const [dialog, setDialog] = useState(null);           // { kind, arg }
  const [toast, setToast] = useState(null);
  // Lite mode: no 3D map (for slow PCs or a crashing graphics driver). Remembered in this browser.
  const [lite, setLiteState] = useState(() => !hasWebGL || localStorage.getItem('bulos-lite') === '1');
  const setLite = useCallback((v) => { localStorage.setItem('bulos-lite', v ? '1' : '0'); setLiteState(v); }, []);
  const { data: history } = usePoll(page === 'points' ? `/api/history/${selectedId}?minutes=360` : null, 5000);

  const selected = useMemo(() => live?.stations.find((s) => s.id === selectedId), [live, selectedId]);
  const inspected = useMemo(() => live?.stations.find((s) => s.id === inspectId), [live, inspectId]);
  const go = useCallback((p) => { setPage(p); window.scrollTo({ top: 0 }); }, []);
  const openPoint = useCallback((id) => { setSelectedId(id); go('points'); }, [go]);
  const onInspect = useCallback((id) => { setSelectedId(id); setInspectId(id); }, []);

  const notify = useCallback((ok, text) => {
    const id = Date.now();
    setToast({ ok, text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000);
  }, []);
  /** POST an action, show the outcome, refresh. Resolves to true on success. */
  const act = useCallback(async (path, body, success) => {
    try {
      const r = await post(path, body);
      notify(true, typeof success === 'function' ? success(r) : success);
      refresh();
      refreshMaint();
      return true;
    } catch (e) {
      notify(false, e.message);
      return false;
    }
  }, [notify, refresh, refreshMaint]);
  const runScenario = (name) => act('/api/scenario', { name }, SCENARIO_STARTED[name]);
  const setSpeed = (speed) => act('/api/speed', { speed }, `Simulation speed set to ${speed}× real time.`);
  const setPreempt = (v) => act('/api/policy', { auto_preempt: v },
    v ? 'Automatic intake closing is on.' : 'Automatic intake closing is off. Operators must close intakes by hand.');
  const quick = useCallback((kind, arg) => setDialog({ kind, arg }), []);

  const map = (
    <ErrorBoundary label="The 3D map" compact onDisable={() => setLite(true)}>
      <Suspense fallback={<div className="flex h-[70vh] items-center justify-center rounded-xl bg-white text-sm text-muted">Loading the twin…</div>}>
        <WatershedTwin live={live} forecast={forecast} staticData={staticData} layers={layers} lite={lite} onLite={() => setLite(false)} canUse3D={hasWebGL} onInspect={setInspectId} act={act} />
      </Suspense>
    </ErrorBoundary>
  );

  const command = page === 'home' && !lite;
  const affected = live ? live.stations.filter((x) => x.risk >= 0.45 || live.forecast.stations?.[x.id]?.arrival_s > 0).length : 0;
  const introByPage = {
    home: { title: affected ? `${affected} water point${affected > 1 ? 's' : ''} affected` : 'The river is clear', sub: live ? `Updated ${fmtClock(live.clock.epoch_ms)}. Sensor readings are ${live.clock.mode === 'sim' ? 'simulated' : 'from the field'}.` : '' },
    map: { title: 'Watershed', sub: 'Follow the water from Mt. Isarog to Naga City, and see what is driving the risk.' },
    flow: { title: 'Forecast', sub: 'Where polluted water is expected in the next 4 hours.' },
    points: { title: 'Water points', sub: 'Readings, controls and history for each site, from the spring to the city.' },
    maintenance: { title: 'Maintenance', sub: 'Recurring tasks reschedule themselves when you mark them done.' },
    reports: { title: 'Reports', sub: 'Compliance, events and messages from the last 24 hours.' },
    about: { title: 'About Bulos 3D', sub: 'The problem, the solution, and how the twin works.' },
  };
  introByPage.overview = introByPage.home;
  const intro = introByPage[page] ?? {};
  const fcNow = forecast?.stations ?? live?.forecast.stations ?? {};
  const mood = moodOf(live, fcNow);
  // Stays on one point unless something needs attention, so it does not jump with every reading
  const homeDisc = live && (mood !== 'calm' ? [...live.stations].sort((a, b) => b.risk - a.risk)[0]
    : live.stations.find((s) => s.id === (myPoint ?? 'KS-03')) ?? live.stations[0]);
  const disc = !live ? null : page === 'points' ? selected : page === 'overview' || page === 'home' ? homeDisc : null;
  const discWater = disc ? waterAt(live, disc.chainage_m) : null;
  const rainy = /rain|shower|drizzle|thunder/i.test(weather?.condition ?? '');

  return (
    <div className={command ? 'min-h-full' : 'min-h-full pb-8'}>
      {command ? (
        <ErrorBoundary label="The 3D command view" onDisable={() => setLite(true)}>
          <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted">Loading Bulos 3D…</div>}>
            <CommandCenter
              live={live} forecast={forecast} tasks={maint?.tasks} staticData={staticData} layers={layers} setLayers={setLayers} status={status} selectedId={selectedId}
              onSelect={setSelectedId} onInspect={onInspect} onDetails={openPoint} act={act} quick={quick} notify={notify} pages={PAGES} page={page} go={go}
              actions={(
                <>
                  <AlertBell live={live} go={go} onOpen={openPoint} />
                  {live?.clock.mode === 'sim' && <SimulationMenu speed={live.clock.speed} onScenario={runScenario} onSpeed={setSpeed} />}
                </>
              )}
            />
          </Suspense>
        </ErrorBoundary>
      ) : (
      <PageShell
        pages={PAGES} page={page} go={go} status={status} lite={lite} setLite={setLite} title={intro.title} sub={intro.sub} mood={mood}
        chips={page === 'about' ? null : (
          <>
            {live?.clock.mode === 'sim' && <span className="sky-chip"><FlaskConical size={12} />Simulated</span>}
            {weather?.available && <span className="sky-chip" title={`Live weather from ${weather.source}`}>{rainy ? <CloudRain size={13} /> : <Sun size={13} />}{Math.round(weather.temp_c)}°C, {weather.condition}</span>}
          </>
        )}
        side={disc && (
          <WaterDisc key={disc.id} size={108} rgb={waterRgb(...discWater)} className="hidden shrink-0 border-[3px] border-white sm:block">
            <b className="font-display text-[29px] leading-none">{disc.wqhi.score}</b>
            <span className="mt-0.5 text-[11px] leading-tight">{disc.id} health<br />{waterName(...discWater)}</span>
          </WaterDisc>
        )}
        actions={(
          <>
            <AlertBell live={live} go={go} onOpen={openPoint} />
            {live?.clock.mode === 'sim' && <SimulationMenu speed={live.clock.speed} onScenario={runScenario} onSpeed={setSpeed} />}
          </>
        )}
        footer={(
          <footer className="mt-5 px-1 text-xs leading-relaxed text-muted">
            Bulos 3D prototype for the Xylem Global Student Innovation Challenge, Camarines Sur National High School. Not an official
            government system. Elevation: Copernicus GLO-90 (ESA). Waterways and buildings © OpenStreetMap contributors. Imagery © Esri. Water-point locations are an illustrative pilot layout;
            standards follow PNSDW 2017.
          </footer>
        )}
      >
        <Connection status={status} hasData={Boolean(live)} />
        <SimulationStatus live={live} onReset={() => runScenario('RESET')} />
        <Advisory live={live} forecast={forecast} onOpen={openPoint} onSend={() => quick('advisory')} />

        {(page === 'overview' || page === 'home') && (
          <Home live={live} forecast={forecast} staticData={staticData} trend={trend?.series} tasks={maint?.tasks} onOpenPoint={openPoint} go={go} quick={quick} />
        )}
        {page === 'map' && (
          <MapPage live={live} staticData={staticData} map={map} onOpen={openPoint} />
        )}
        {page === 'flow' && <FlowPage live={live} forecast={forecast} staticData={staticData} onPreempt={setPreempt} onOpen={openPoint} />}
        {page === 'points' && (
          <WaterPointsPage live={live} selected={selected} history={history} staticData={staticData} quick={quick} myPoint={myPoint} onToggleMine={toggleMine}
                           onSelect={setSelectedId} onInspect={setInspectId} onChanged={refresh} />
        )}
        {page === 'maintenance' && <MaintenancePage live={live} tasks={maint?.tasks} quick={quick} />}
        {page === 'reports' && <ReportsPage live={live} />}
        {page === 'about' && <AboutPage live={live} go={go} />}
      </PageShell>
      )}

      {/* ---------------- dialogs ---------------- */}
      {dialog?.kind === 'test' && live && (
        <WaterTestModal live={live} pnsdw={staticData?.pnsdw ?? {}} initialId={dialog.arg ?? selectedId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reminder' && live && (
        <ReminderModal live={live} kinds={staticData?.task_kinds ?? {}} initialId={dialog.arg ?? selectedId} act={act} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'log' && live && (
        <LogMaintenanceModal live={live} tasks={maint?.tasks} initialTaskId={dialog.arg} act={act} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'safe' && live && (
        <SafeModal live={live} forecast={forecast} initialId={dialog.arg} myPoint={myPoint} onToggleMine={toggleMine} onOpen={openPoint} notify={notify} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'advisory' && live && (
        <AdvisoryModal live={live} forecast={forecast} act={act} onClose={() => setDialog(null)} />
      )}
      {inspected && (
        <ErrorBoundary label="The 3D site view">
          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16204a]/30 text-sm text-white">Loading the 3D site view…</div>}>
            <AssetInspector st={inspected} stations={live.stations} onPick={setInspectId} act={act} onClose={() => setInspectId(null)} />
          </Suspense>
        </ErrorBoundary>
      )}
      {toast && (
        <div role="status" className={`glass fixed bottom-5 right-5 z-[60] max-w-sm px-4 py-3 text-sm ${toast.ok ? 'text-[#157a3e]' : 'text-[#a32626]'}`}>
          <div className="flex items-start gap-3">
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- simulation */
function SimulationMenu({ speed, onScenario, onSpeed }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary !px-3 !py-2">
        <PlayCircle size={16} /> Simulate <ChevronDown size={14} />
      </button>
      {open && (
        <div className="site-panel absolute right-0 top-11 z-40 w-80 p-2">
          <div className="px-2 pb-1 pt-1 text-sm font-semibold">Simulate a field event</div>
          {SCENARIOS.map(([id, label, desc]) => (
            <button key={id} onClick={() => { onScenario(id); setOpen(false); }} className="block w-full rounded-xl px-2.5 py-2 text-left hover:bg-panel-2">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted">{desc}</div>
            </button>
          ))}
          <label className="mt-1 flex items-center justify-between border-t border-line px-2 pt-2 text-sm text-ink-2">
            Speed
            <select value={speed} onChange={(e) => onSpeed(+e.target.value)}>
              {[1, 10, 30, 60, 120, 240].map((s) => <option key={s} value={s}>{s}× real time</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function SimulationStatus({ live, onReset }) {
  if (!live || live.clock.mode !== 'sim') return null;
  const ev = live.events.find((e) => e.type === 'SCENARIO');
  if (!ev || /Clear all events/i.test(ev.message)) return null;
  const mins = Math.max(0, Math.round((live.clock.epoch_ms - ev.t_ms) / 60000));
  const what = ev.message.replace(/^Field scenario injected:\s*/, '');
  return (
    <div className="glass mb-5 flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" role="status">
      <span className="pill pill-blue">Simulation running</span>
      <span className="text-ink-2">{what}. {mins} simulated minutes so far at {live.clock.speed}× speed.</span>
      <button onClick={onReset} className="btn-ghost ml-auto !py-1.5">Back to normal</button>
    </div>
  );
}

function Connection({ status, hasData }) {
  if (status === 'online') return null;
  if (hasData) {
    return <div className="glass mb-5 px-4 py-2.5 text-sm text-[#a32626]" role="status">Lost connection to the data server. Showing the last readings and retrying every second.</div>;
  }
  if (status === 'connecting') return <div className="mb-5 px-1 text-sm text-muted" role="status">Connecting to the data server…</div>;
  if (!/^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname)) {
    return (
      <section className="glass mb-5 p-6" role="status">
        <h2 className="font-display text-lg font-semibold">Waking up the demo server</h2>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
          The free hosting plan sleeps when nobody is using it. It usually takes about a minute to start, and this page fills in by itself.
        </p>
      </section>
    );
  }
  return (
    <section className="glass mb-5 p-6" role="alert">
      <h2 className="font-display text-lg font-semibold">The data server is not running</h2>
      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
        This page shows live readings from the Bulos 3D data server at 127.0.0.1:8000, and it is not answering. Open a terminal in the project folder and run:
      </p>
      <pre className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 font-mono text-sm text-white">npm start</pre>
      <p className="mt-3 text-sm text-ink-2">Keep this tab open. It checks again every few seconds and fills in by itself once the server is up.</p>
    </section>
  );
}

function Advisory({ live, forecast, onOpen, onSend }) {
  if (!live) return null;
  const fc = forecast?.stations ?? live.forecast.stations ?? {};
  const now = live.stations.filter((s) => s.classification === 'ACUTE_EVENT');
  const coming = live.stations.filter((s) => fc[s.id]?.arrival_s > 0 && fc[s.id].peak_risk >= 0.45);
  const closed = live.stations.filter((s) => s.valve && !s.valve.open);
  if (!now.length && !coming.length) return null;
  const issued = live.events.filter((e) => ['FORECAST_ADVISORY', 'EDGE_AUTO_TRIP', 'ANOMALY'].includes(e.type));
  return (
    <section className="glass mb-5 flex gap-4 !border-[#f4dd8a] !bg-[#fff8e1]/90 p-5" role="alert">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-advisory text-ink"><TriangleAlert size={22} /></span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-display text-lg font-semibold">Water advisory No. {Math.max(1, issued.length)}</h2>
          <span className="text-xs text-ink-2">Issued {fmtClock(issued[0]?.t_ms ?? live.clock.epoch_ms)}</span>
        </div>
        {now.length > 0 && <p><b>Contaminated water detected</b> at {now.map((s) => s.name).join(', ')}.</p>}
        {coming.length > 0 && (
          <p>
            <b>Expected to arrive</b> at{' '}
            {coming.map((s, i) => (
              <span key={s.id}>{i ? ', ' : ''}<button onClick={() => onOpen(s.id)} className="font-medium text-civic underline-offset-2 hover:underline">{s.name}</button> in {fmtMin(fc[s.id].arrival_s)}</span>
            ))}.
          </p>
        )}
        {closed.length > 0 && <p>Intakes closed at {closed.map((s) => s.name).join(', ')}; these sites are serving stored water.</p>}
        <p className="text-ink-2">Do not drink untreated water from the river, springs or shallow wells along this stretch. Boil water for at least one minute.</p>
      </div>
      <button onClick={onSend} className="btn-primary self-start">Send advisory</button>
    </section>
  );
}
