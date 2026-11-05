import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Bell, ChevronDown, CloudRain, MapPinned, PlayCircle, TriangleAlert, X } from 'lucide-react';
import Home, { MaintenancePage } from './components/Home';
import { FlowPage, MapPage, ReportsPage, WaterPointsPage } from './components/Pages';
import AboutPage from './components/About';
import { AdvisoryModal, LogMaintenanceModal, ReminderModal, WaterTestModal } from './components/Actions';
import ErrorBoundary from './components/ErrorBoundary';
import { post, usePoll } from './api';
import { fmtClock, fmtMin } from './lib/format';

// Heavy 3D libraries load on demand so the page itself appears immediately.
const TwinView = lazy(() => import('./components/TwinView'));
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
  ['home', 'Home'],
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
  const { data: live, status, refresh } = usePoll('/api/state', 1000);
  const { data: forecast } = usePoll('/api/forecast', 4000);
  const [heatIndex, setHeatIndex] = useState('risk');
  const { data: heatmap } = usePoll(`/api/heatmap?index=${heatIndex}`, 4000);
  const { data: maint, refresh: refreshMaint } = usePoll('/api/maintenance', 3000);
  const { data: trend } = usePoll('/api/trend?hours=12&bucket_min=30', 15000);
  const deepLink = new URLSearchParams(window.location.search).get('inspect');
  const [page, setPage] = useState(deepLink ? 'points' : 'home');
  const [selectedId, setSelectedId] = useState(deepLink ?? 'KS-03');
  const [inspectId, setInspectId] = useState(deepLink);
  const [layers, setLayers] = useState({ heatmap: true, flood: false, particles: true, streams: true, pipes: true, columns: true, catchment: true });
  const [dialog, setDialog] = useState(null);           // { kind, arg }
  const [toast, setToast] = useState(null);
  // Lite mode: no 3D map (for slow PCs or a crashing graphics driver). Remembered in this browser.
  const [lite, setLiteState] = useState(() => !hasWebGL || localStorage.getItem('bulos-lite') === '1');
  const setLite = useCallback((v) => { localStorage.setItem('bulos-lite', v ? '1' : '0'); setLiteState(v); }, []);
  const { data: history } = usePoll(`/api/history/${selectedId}?minutes=360`, 5000);

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

  const map = lite ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#dfe8ff] to-[#cfe6fb] p-6 text-center">
      <MapPinned size={34} className="text-civic" />
      <div className="font-display text-base font-semibold">3D map is off (Lite mode)</div>
      <p className="max-w-[46ch] text-sm text-ink-2">
        {hasWebGL ? 'Everything else keeps working. Turn the map back on when your computer can handle 3D graphics.'
          : 'This browser has WebGL turned off, so the 3D map cannot run. Enable hardware acceleration in the browser settings.'}
      </p>
      {hasWebGL && <button onClick={() => setLite(false)} className="btn-primary">Turn on the 3D map</button>}
    </div>
  ) : (
    <ErrorBoundary label="The 3D map" compact onDisable={() => setLite(true)}>
      <Suspense fallback={<div className="flex h-full items-center justify-center bg-panel-2 text-sm text-muted">Loading the 3D map…</div>}>
        {/* click a water point: isometric 3D site view; double-click: its details page. */}
        <TwinView staticData={staticData} live={live} forecast={forecast} heatmap={heatmap} selectedId={selectedId}
                     onSelect={onInspect} onInspect={openPoint} layers={layers} setLayers={setLayers} />
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <div className="min-h-full pb-8">
      {/* ---------------- top bar ---------------- */}
      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="glass mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-3 gap-y-2 !bg-white/90 px-4 py-2.5 lg:flex-nowrap">
          <button onClick={() => go('home')} className="flex shrink-0 items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block font-display text-base font-semibold">Bulos 3D</span>
              <span className="block text-[11px] text-muted">{staticData?.site.title ?? 'Water quality digital twin'}</span>
            </span>
          </button>
          <nav className="order-last flex w-full min-w-0 gap-1 overflow-x-auto rounded-2xl bg-white/60 p-1 lg:order-none lg:mx-auto lg:w-auto">
            {PAGES.map(([id, label]) => (
              <button key={id} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}
                      className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${page === id ? 'bg-civic text-white shadow-[0_6px_14px_rgba(47,91,231,0.3)]' : 'text-ink-2 hover:bg-white hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            {live && (
              <span className="hidden items-center gap-1.5 rounded-xl bg-white/70 px-2.5 py-1.5 text-xs text-ink-2 2xl:inline-flex">
                <CloudRain size={14} className="text-civic" />{live.rain_mm_hr} mm/h
              </span>
            )}
            <span className={`hidden items-center gap-1.5 rounded-xl bg-white/70 px-2.5 py-1.5 text-xs xl:inline-flex ${status === 'online' ? 'text-ink-2' : 'text-[#a32626]'}`}>
              <span className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-good' : 'bg-critical'}`} />
              {status === 'online' && live ? fmtClock(live.clock.epoch_ms) : 'Offline'}
            </span>
            <button onClick={() => setLite(!lite)} title={lite ? 'Turn the 3D map on' : 'Turn the 3D map off for a faster, lighter page'}
                    className="hidden items-center gap-1.5 whitespace-nowrap rounded-xl bg-white/70 px-2.5 py-1.5 text-xs text-ink-2 hover:bg-white lg:inline-flex">
              <MapPinned size={14} className={lite ? 'text-muted' : 'text-civic'} />3D map {lite ? 'off' : 'on'}
            </button>
            <AlertBell live={live} go={go} />
            {live?.clock.mode === 'sim' && <SimulationMenu speed={live.clock.speed} onScenario={runScenario} onSpeed={setSpeed} />}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-5 max-w-[1560px] px-4">
        <Connection status={status} hasData={Boolean(live)} />
        <SimulationStatus live={live} onReset={() => runScenario('RESET')} />
        <Advisory live={live} forecast={forecast} onOpen={openPoint} onSend={() => quick('advisory')} />

        {page === 'home' && (
          <Home live={live} forecast={forecast} staticData={staticData} trend={trend?.series} tasks={maint?.tasks}
                map={map} selectedId={selectedId} onSelectPoint={setSelectedId} onOpenPoint={openPoint} onInspect={onInspect} go={go} quick={quick} />
        )}
        {page === 'map' && (
          <MapPage live={live} staticData={staticData} map={map} layers={layers} setLayers={setLayers} onOpen={openPoint}
                   heatIndex={heatIndex} setHeatIndex={setHeatIndex} />
        )}
        {page === 'flow' && <FlowPage live={live} forecast={forecast} staticData={staticData} onPreempt={setPreempt} onOpen={openPoint} />}
        {page === 'points' && (
          <WaterPointsPage live={live} selected={selected} history={history} staticData={staticData}
                           onSelect={setSelectedId} onInspect={setInspectId} onChanged={refresh} />
        )}
        {page === 'maintenance' && <MaintenancePage live={live} tasks={maint?.tasks} quick={quick} />}
        {page === 'reports' && <ReportsPage live={live} />}
        {page === 'about' && <AboutPage live={live} staticData={staticData} go={go} />}
      </main>

      <footer className="mx-auto mt-8 max-w-[1560px] px-6 text-xs leading-relaxed text-muted">
        Bulos 3D prototype for the Xylem Global Student Innovation Challenge, Camarines Sur National High School. Not an official
        government system. Elevation: Copernicus GLO-90 (ESA). Imagery © Esri. Water-point locations are an illustrative pilot layout;
        standards follow PNSDW 2017.
      </footer>

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
      {dialog?.kind === 'advisory' && live && (
        <AdvisoryModal live={live} forecast={forecast} act={act} onClose={() => setDialog(null)} />
      )}
      {inspected && (
        <ErrorBoundary label="The 3D site view">
          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16204a]/30 text-sm text-white">Loading the 3D site view…</div>}>
            <AssetInspector st={inspected} onClose={() => setInspectId(null)} />
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

/* ------------------------------------------------------------- alerts bell */
function AlertBell({ live, go }) {
  const [open, setOpen] = useState(false);
  if (!live) return null;
  const recent = live.events.filter((e) => (e.severity === 'danger' || e.severity === 'warning') && e.t_ms > live.clock.epoch_ms - 6 * 3600e3);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`${recent.length} alerts`} aria-expanded={open}
              className="relative rounded-xl bg-white/70 p-2 text-ink-2 hover:bg-white hover:text-ink">
        <Bell size={18} />
        {recent.length > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-critical px-1 text-center text-[10px] font-bold leading-[18px] text-white">{Math.min(99, recent.length)}</span>}
      </button>
      {open && (
        <div className="glass absolute right-0 top-11 z-40 w-96 bg-white/95 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-semibold">Alerts, last 6 hours</span>
            <button onClick={() => { setOpen(false); go('reports'); }} className="link">See all</button>
          </div>
          {!recent.length ? <p className="px-1 py-2 text-sm text-muted">No alerts. All water points are normal.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {recent.slice(0, 12).map((e, i) => (
                <li key={`${e.t_ms}-${i}`} className="px-1 py-2 text-sm">
                  <div className="flex justify-between gap-2 text-xs text-muted"><span>{e.station ?? 'System'}</span><span>{fmtClock(e.t_ms)}</span></div>
                  <div className={e.severity === 'danger' ? 'text-[#a32626]' : 'text-ink'}>{e.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- simulation */
function SimulationMenu({ speed, onScenario, onSpeed }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary !px-3 !py-2">
        <PlayCircle size={16} /> Simulate <ChevronDown size={14} />
      </button>
      {open && (
        <div className="glass absolute right-0 top-11 z-40 w-80 bg-white/95 p-2">
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
      <button onClick={onSend} className="btn-primary self-start">Send SMS advisory</button>
    </section>
  );
}
