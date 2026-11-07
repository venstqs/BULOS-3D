import { useState } from 'react';
import { X } from 'lucide-react';
import SiteViewCanvas, { viewsOf } from './SiteViewCanvas';
import { Floating } from '../lib/floating';
import { CLASS_LABEL, EDGE_LABEL, fmt, notFitted, stationStatus } from '../lib/format';

const STATUS_COLOR = { good: '#1c8a4a', warning: '#b57c00', critical: '#c22a2a', info: '#2f5be7' };
const STATUS_TEXT = { good: 'Within limit', warning: 'Near limit', critical: 'Out of limit', info: '' };

function readings(st) {
  const r = st.reading;
  const b = st.baseline;
  return [
    { k: 'turbidity', label: 'Turbidity', unit: 'NTU', v: r.turbidity, min: 0, max: 50, d: 1, s: r.turbidity <= 5 ? 'good' : r.turbidity <= 10 ? 'warning' : 'critical' },
    { k: 'orp', label: 'ORP', unit: 'mV', v: r.orp, min: 0, max: 600, d: 0, s: r.orp >= b.orp - 60 ? 'good' : r.orp >= b.orp - 150 ? 'warning' : 'critical' },
    { k: 'ph', label: 'pH', unit: '', v: r.ph, min: 4, max: 10, d: 2, s: r.ph >= 6.5 && r.ph <= 8.5 ? 'good' : r.ph >= 6 && r.ph <= 9 ? 'warning' : 'critical' },
    { k: 'tds', label: 'TDS', unit: 'mg/L', v: r.tds, min: 0, max: 1000, d: 0, s: r.tds <= 500 ? 'good' : r.tds <= 600 ? 'warning' : 'critical' },
    { k: 'bio', label: 'Biological', unit: 'ppb', v: r.bio ?? 0, min: 0, max: 40, d: 1, s: r.bio == null ? 'info' : r.bio < 5 ? 'good' : r.bio < 10 ? 'warning' : 'critical' },
    { k: 'temp', label: 'Water temperature', unit: '°C', v: r.temp, min: 15, max: 40, d: 1, s: 'info' },
  ];
}

function Reading({ label, unit, v, min, max, d, s }) {
  const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-semibold tabular">{fmt(v, d)}<span className="ml-1 text-[11.5px] font-normal text-muted">{unit}</span></span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[#e9efff]"><div className="h-full rounded-full" style={{ width: `${t * 100}%`, background: STATUS_COLOR[s] }} /></div>
      {STATUS_TEXT[s] && <div className="mt-0.5 text-[11.5px]" style={{ color: STATUS_COLOR[s] }}>{STATUS_TEXT[s]}</div>}
    </div>
  );
}

/** The site model on its own. The mobile app embeds this (?embed=site). */
export function SiteScene({ st }) {
  return <div className="relative h-full w-full"><SiteViewCanvas st={st} light /></div>;
}

/** Full-screen look at one water point, with hanging panels like the map. */
export default function AssetInspector({ st, stations = [], onPick, onClose, act }) {
  const [view, setView] = useState('site');
  const [orbit, setOrbit] = useState(false);
  const [parts, setParts] = useState({});
  if (!st) return null;
  const status = stationStatus(st);
  const choose = (id) => { setView('site'); onPick?.(id); };

  return (
    <div className="fixed inset-0 z-50 bg-[#dbe9f7]" role="dialog" aria-label={`3D site view of ${st.name}`}>
      <SiteViewCanvas st={st} view={view} orbit={orbit} onView={setView} onReady={(ctx) => setParts(viewsOf(ctx))} />

      <div className="pointer-events-none absolute inset-0">
        <Floating id="site-title" title="Site details" label="Move site details" className="site-panel pointer-events-auto absolute left-3 top-3 w-[min(340px,calc(100vw-24px))]">
          <div className="px-3.5 pb-3">
            <div className="seg-flat" role="tablist" aria-label="Water points">
              {stations.map((s) => <button key={s.id} role="tab" aria-selected={s.id === st.id} onClick={() => choose(s.id)}>{s.id}</button>)}
            </div>
            <h2 className="mt-3 font-display text-[19px] font-semibold leading-snug">{st.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">{status.label} risk. {st.valve ? (st.valve.open ? 'Intake open.' : 'Intake closed.') : 'Monitoring only.'}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#f2f6ff] px-3 py-2">
                <div className="text-[12px] text-ink-2">Water health</div>
                <div className="font-display text-[24px] font-semibold leading-tight">{st.wqhi.score}<span className="ml-0.5 text-[12px] font-normal text-muted">/100</span></div>
              </div>
              <div className="rounded-lg bg-[#f2f6ff] px-3 py-2">
                <div className="text-[12px] text-ink-2">Contamination risk</div>
                <div className="font-display text-[24px] font-semibold leading-tight">{fmt(st.risk, 2)}</div>
              </div>
            </div>
          </div>
        </Floating>

        <Floating id="site-readings" title="Sensor readings" label="Move readings" className="site-panel pointer-events-auto absolute right-3 top-14 hidden max-h-[calc(100vh-78px)] w-[300px] overflow-y-auto md:block">
          <div className="px-3.5 pb-3.5">
            <h3 className="font-display text-[15px] font-semibold">Sensor readings</h3>
            <p className="text-[12px] text-muted">Simulated for the competition.</p>
            <div className="mt-2.5 space-y-2.5">{readings(st).filter((g) => !notFitted(st, g.k)).map((g) => <Reading key={g.k} {...g} />)}</div>
            {st.valve && act && (
              <button onClick={() => act('/api/valve', { station_id: st.id, action: st.valve.open ? 'SHUT' : 'REARM' }, `Intake at ${st.id} ${st.valve.open ? 'closed' : 'reopened'}.`)} className={`${st.valve.open ? 'btn-danger' : 'btn-primary'} mt-3 w-full justify-center`}>
                {st.valve.open ? 'Close intake' : 'Reopen intake'}
              </button>
            )}
            <h3 className="mt-4 font-display text-[15px] font-semibold">Assessment</h3>
            <dl className="mt-1 space-y-1 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Condition</dt><dd className="text-right font-medium">{CLASS_LABEL[st.classification]}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Sensor node</dt><dd className="text-right font-medium">{EDGE_LABEL[st.edge_state]}</dd></div>
              {st.drift && <div className="flex justify-between gap-3"><dt className="text-ink-2">Turbidity drift</dt><dd className="text-right font-medium tabular">{fmt(st.drift.slope_ntu_per_min * 60, 2)} NTU/h</dd></div>}
            </dl>
          </div>
        </Floating>

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
          <div className="seg pointer-events-auto shadow-[0_1px_2px_rgba(16,24,40,0.2),0_4px_14px_rgba(16,24,40,0.14)]" role="group" aria-label="Look at">
            {Object.entries(parts).map(([k, v]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{v.label}</button>)}
            <button aria-pressed={orbit} onClick={() => setOrbit((o) => !o)} title="Slowly circle the site">Orbit</button>
          </div>
        </div>

        <button onClick={onClose} aria-label="Close the site view" className="pointer-events-auto absolute right-3 top-3 flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,40,0.2),0_4px_14px_rgba(16,24,40,0.14)] hover:text-civic">
          <X size={15} />Close
        </button>
      </div>
    </div>
  );
}
