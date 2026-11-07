import { useState } from 'react';
import { Download, Box, Lock, LockOpen, MessageSquareText, Printer } from 'lucide-react';
import LineChart from './charts/LineChart';
import RiverSchematic from './RiverSchematic';
import StationPanel, { StatusBadge } from './StationPanel';
import TwinLoop from './TwinLoop';
import { usePoll } from '../api';
import { BAND, STATION_COLOR, fmt, fmtClock, fmtMin, stationStatus } from '../lib/format';
import { WATER_KEY } from '../lib/waterColour';

export function Section({ title, note, right, children, flush = false, className = '' }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
        </div>
        {right}
      </div>
      <div className={flush ? '' : 'section-body'}>{children}</div>
    </section>
  );
}

const Wait = ({ text = 'Loading data from the twin…' }) => <p className="text-sm text-muted">{text}</p>;

function Dot({ id }) {
  return <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: STATION_COLOR[id] }} />;
}

/* ------------------------------------------------------------------ status table */
export function StatusTable({ live, forecast, onOpen }) {
  if (!live) return <Wait />;
  return (
    <table className="data">
      <thead>
        <tr><th>Water point</th><th>Status</th><th>WQHI</th><th>Intake</th><th>Next arrival</th></tr>
      </thead>
      <tbody>
        {live.stations.map((s) => {
          const f = forecast?.stations?.[s.id];
          return (
            <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-panel-2">
              <td>
                <Dot id={s.id} /><span className="font-medium">{s.name}</span>
                <div className="ml-[18px] text-xs text-muted">{s.id}, {fmt(s.elevation_m, 0)} m above sea level</div>
              </td>
              <td><StatusBadge status={stationStatus(s)} /></td>
              <td className="num">{s.wqhi.score}</td>
              <td>
                {!s.valve ? <span className="text-xs text-muted">monitoring only</span>
                  : s.valve.open ? <span className="inline-flex items-center gap-1 text-xs"><LockOpen size={13} className="text-good" />open</span>
                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#a32626]"><Lock size={13} />closed</span>}
              </td>
              <td className="num">{f?.arrival_s > 0 ? fmtMin(f.arrival_s) : f?.arrival_s === 0 ? 'now' : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const KIND_LABEL = { ADVISORY_SENT: 'Advisory logged',
  FORECAST_ADVISORY: 'Water advisory', EDGE_AUTO_TRIP: 'Intake closed automatically', CMD_PREEMPT_SHUT: 'Intake closed ahead of plume',
  ANOMALY: 'Contamination detected', BIOFOULING: 'Sensor maintenance needed', RESERVE_LOW: 'Stored water running low',
  SCENARIO: 'Simulation', REARM_RECOMMENDED: 'Safe to reopen intake', RECOVERED: 'Back to normal', TRANSIT_CALIBRATION: 'Model updated from field data',
};

/* ------------------------------------------------------------------ forecast pieces */
function ForecastChart({ live, forecast, staticData, height = 200 }) {
  const thr = staticData?.thresholds ?? { suspect: 0.45, trip: 0.6 };
  const ids = Object.keys(forecast.stations);
  const series = ids.map((id) => ({
    id, label: id, color: STATION_COLOR[id],
    points: [{ x: 0, y: live.stations.find((s) => s.id === id)?.risk ?? 0 }]
      .concat(forecast.stations[id].series.map((p) => ({ x: p.tau / 60, y: p.risk }))),
  }));
  return (
    <LineChart series={series} height={height} xFormat={(x) => (x < 1 ? "Now" : `+${(x / 60).toFixed(1)} h`)} yFormat={(y) => y.toFixed(2)}
               yDomain={[0, 1]} refLines={[{ y: thr.suspect, label: 'watch level' }, { y: thr.trip, label: 'close intake' }]} directLabels={false} />
  );
}

function ArrivalTable({ forecast, live }) {
  const ids = Object.keys(forecast.stations);
  return (
    <table className="data">
      <thead><tr><th>Water point</th><th>Arrives in</th><th>Worst at</th><th>Clears in</th><th>Peak risk</th></tr></thead>
      <tbody>
        {ids.map((id) => {
          const f = forecast.stations[id];
          const band = BAND[f.peak_band];
          const name = live.stations.find((s) => s.id === id)?.name ?? id;
          return (
            <tr key={id}>
              <td><Dot id={id} />{name}</td>
              <td className="num">{f.arrival_s == null ? '—' : f.arrival_s === 0 ? 'now' : fmtMin(f.arrival_s)}</td>
              <td className="num">{f.peak_s == null ? '—' : fmtMin(f.peak_s)}</td>
              <td className="num">{f.clear_s == null ? (f.arrival_s == null ? '—' : 'over 4 h') : fmtMin(f.clear_s)}</td>
              <td><span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium" style={{ color: band.ink }}><band.Icon size={13} style={{ color: band.color }} />{fmt(f.peak_risk, 2)} {band.label.toLowerCase()}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RiverLegend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-muted md:flex">
      {WATER_KEY.map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded" style={{ background: color }} />{label}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-[#a32626]" />intake closed</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full bg-advisory" />expected arrival</span>
    </div>
  );
}

/* ================================================================== WATERSHED MAP */
const EVIDENCE = ['turbidity', 'orp', 'ph', 'tds', 'bio', 'rain'];
const EV_LABEL = { turbidity: 'Turbidity', orp: 'ORP drop', ph: 'pH shift', tds: 'TDS rise', bio: 'Biological', rain: 'Rainfall' };
const seq = (t) => ['#f3f6f9', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab'][Math.min(5, Math.round(t * 5))];

export function MapPage({ live, staticData, map, onOpen }) {
  return (
    <div className="grid gap-3">
      {map}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {staticData && live && (
          <Section title="About this watershed">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Area</dt><dd className="tabular">{fmt(staticData.catchment.area_km2, 1)} km²</dd>
              <dt className="text-muted">Main river length</dt><dd className="tabular">{fmt(live.channel.chainage_m.at(-1) / 1000, 1)} km</dd>
              <dt className="text-muted">Highest point on river</dt><dd className="tabular">{Math.round(live.channel.elev_m[0]).toLocaleString()} m</dd>
              <dt className="text-muted">Stream reaches</dt><dd className="tabular">{staticData.streams.length}</dd>
              <dt className="text-muted">Elevation data</dt><dd>Copernicus 90 m</dd>
              <dt className="text-muted">River and roads</dt><dd>OpenStreetMap</dd>
            </dl>
          </Section>
        )}
        {live && (
          <Section title="What is driving the risk" note="Evidence from each sensor reading, 0 to 1.">
            <div className="grid grid-cols-[48px_repeat(6,1fr)] gap-[3px] text-[11px]">
              <span />
              {EVIDENCE.map((k) => <span key={k} className="pb-1 text-center leading-tight text-muted">{EV_LABEL[k]}</span>)}
              {live.stations.map((s) => (
                <div key={s.id} className="contents">
                  <button onClick={() => onOpen(s.id)} className="self-center text-left text-[13px] font-medium text-ink-2 hover:text-civic">{s.id}</button>
                  {EVIDENCE.map((k) => {
                    const v = s.risk_parts?.[k] ?? 0;
                    return (
                      <span key={k} title={`${s.id} ${EV_LABEL[k]}: ${fmt(v, 2)}`} className="flex h-7 items-center justify-center rounded-sm font-mono tabular"
                            style={{ background: seq(v), color: v > 0.6 ? '#ffffff' : '#3e4f5c' }}>{v > 0.05 ? fmt(v, 1) : ''}</span>
                    );
                  })}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
      <TwinLoop live={live} />
    </div>
  );
}

/* ================================================================== FLOW & FORECAST */
export function FlowPage({ live, forecast, staticData, onPreempt, onOpen }) {
  if (!live || !forecast?.stations) return <Wait text="Waiting for the first forecast run…" />;
  const ch = live.channel;
  const km = ch.chainage_m.map((s) => s / 1000);
  const mk = live.stations.map((s) => ({ x: s.chainage_m / 1000, label: s.id, color: STATION_COLOR[s.id] }));
  const next = Object.entries(forecast.stations).map(([id, f]) => ({ id, ...f })).filter((f) => f.arrival_s > 0)
    .sort((a, b) => a.arrival_s - b.arrival_s)[0];
  return (
    <div className="grid gap-3">
      <section className="section grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className={`flex flex-col rounded-t-xl p-4 text-white lg:rounded-l-xl lg:rounded-tr-none ${next ? 'bg-[#b5302a]' : 'bg-civic'}`}>
          <p className="text-[13px] opacity-85">Next polluted water</p>
          <p className="mt-0.5 font-display text-[32px] font-semibold leading-tight">{next ? `${next.id} in ${fmtMin(next.arrival_s)}` : 'None expected'}</p>
          <p className="mt-1.5 text-sm leading-relaxed opacity-90">
            {next ? `Worst in ${fmtMin(next.peak_s)}, peak risk ${fmt(next.peak_risk, 2)}. Clears in ${next.clear_s ? fmtMin(next.clear_s) : 'over 4 hours'}.`
              : 'No polluted water is forecast to reach any intake in the next 4 hours.'}
          </p>
          <label className="mt-auto flex items-start gap-2 pt-4 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-white" checked={live.auto_preempt} onChange={(e) => onPreempt(e.target.checked)} />
            Close intakes automatically up to 30 minutes before contamination arrives
          </label>
        </div>
        <div className="min-w-0 p-3">
          <p className="mb-1 px-1 text-[13px] font-semibold">Risk at each water point, next 4 hours</p>
          <ForecastChart live={live} forecast={forecast} staticData={staticData} height={260} />
        </div>
      </section>

      <Section title="The next 4 hours at a glance" note="Each row is a water point, each block is 15 minutes." flush>
        <RiskStrip live={live} forecast={forecast} onOpen={onOpen} />
      </Section>

      <Section title="Where the water is now" right={<RiverLegend />} flush>
        <div className="h-[150px] px-2"><RiverSchematic live={live} forecast={forecast} staticData={staticData} onSelect={onOpen} /></div>
      </Section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="Arrival windows" flush><ArrivalTable forecast={forecast} live={live} /></Section>
        <Section title="Travel time between water points" flush>
          <table className="data">
            <thead><tr><th>Stretch</th><th>Length</th><th>Speed</th><th>Travel time</th><th>Tuned</th></tr></thead>
            <tbody>
              {live.reaches.map((r) => (
                <tr key={r.reach}>
                  <td className="num">{r.reach}</td><td className="num">{(r.length_m / 1000).toFixed(1)} km</td>
                  <td className="num">{fmt(r.mean_velocity_mps, 2)} m/s</td>
                  <td className="num">{fmtMin(r.travel_time_s)}</td>
                  <td className="num">{r.velocity_factor !== 1 ? `×${fmt(r.velocity_factor, 2)}` : 'not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="Water speed along the river" note={`From the real slope. Current runoff ${fmt(live.runoff_mm_hr, 1)} mm/h.`}>
          <LineChart series={[{ id: 'v', label: 'Velocity', color: '#2f5be7', points: ch.velocity_mps.map((y, i) => ({ x: km[i], y })) }]}
                     height={170} xFormat={(x) => `${x.toFixed(0)} km`} yFormat={(y) => `${y.toFixed(1)}`} yLabel="m/s" markers={mk} directLabels={false} />
        </Section>
        <Section title="Modelled turbidity in the river now" note="NTU above each point's normal level.">
          <LineChart series={[{ id: 't', label: 'Turbidity above normal', color: '#2f5be7', area: true, points: ch.turb_excess.map((y, i) => ({ x: km[i], y })) }]}
                     height={170} xFormat={(x) => `${x.toFixed(0)} km`} yFormat={(y) => y.toFixed(0)} markers={mk}
                     directLabels={false} yDomain={[0, Math.max(10, ...ch.turb_excess) * 1.1]} />
        </Section>
      </div>

      <Section title="Gravity-fed pipelines" note="Proposed routes along real roads. Flow comes from the elevation drop and stops when a source tank runs empty." flush>
        <table className="data">
          <thead><tr><th>Line</th><th>Route</th><th>Length</th><th>Pipe</th><th>Head</th><th>Flow</th><th>Speed</th><th>Status</th></tr></thead>
          <tbody>
            {(staticData?.pipes ?? []).map((p) => {
              const d = live.pipes?.find((x) => x.id === p.id);
              return (
                <tr key={p.id}>
                  <td><b>{p.id}</b><div className="text-xs text-muted">{p.name}</div></td>
                  <td className="num">{p.src} to {p.dst}</td>
                  <td className="num">{(p.length_m / 1000).toFixed(1)} km</td>
                  <td className="num">{Math.round(p.diameter_m * 1000)} mm {p.material}</td>
                  <td className="num">{fmt(p.static_head_m, 0)} m</td>
                  <td className="num">{d ? `${fmt(d.flow_lps, 1)} L/s` : '—'}</td>
                  <td className="num">{d ? `${fmt(d.velocity_mps, 2)} m/s` : '—'}</td>
                  <td><span className={`pill ${d?.flowing ? 'pill-good' : 'pill-amber'}`}>{d?.status ?? '—'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Model updates from field measurements" note="Each pollution pulse that passes two sensors measures the real travel time.">
        {live.calibration.length === 0 ? (
          <p className="text-sm text-muted">No pulse measured yet. Run the piggery spill simulation to see the model correct itself.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Stretch</th><th>Measured</th><th>Model said</th><th>New factor</th></tr></thead>
            <tbody>
              {[...live.calibration].reverse().map((c) => (
                <tr key={`${c.reach}-${c.t}`}><td className="num">{c.reach}</td><td className="num">{fmtMin(c.measured_s)}</td>
                  <td className="num">{fmtMin(c.modelled_s)}</td><td className="num">×{c.velocity_factor}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

/** Forecast risk as a grid: rows are water points, columns are time. */
const GRID_KEY = [['Clear', '#dfe8ff'], ['Rising', '#9ec0ff'], ['Moderate', BAND.MODERATE.color], ['High', BAND.HIGH.color], ['Severe', BAND.SEVERE.color]];
const riskColor = (r) => GRID_KEY[r >= 0.6 ? 4 : r >= 0.45 ? 3 : r >= 0.25 ? 2 : r >= 0.1 ? 1 : 0][1];

function RiskStrip({ live, forecast, onOpen }) {
  const hours = [0, 1, 2, 3, 4];
  return (
    <div className="px-4 pb-3">
      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-1">
        {live.stations.map((st) => {
          const series = forecast.stations[st.id]?.series ?? [];
          const cells = Array.from({ length: 16 }, (_, i) => {
            const part = series.filter((p) => p.tau > i * 900 && p.tau <= (i + 1) * 900);
            return part.length ? Math.max(...part.map((p) => p.risk)) : 0;
          });
          return (
            <div key={st.id} className="contents">
              <button onClick={() => onOpen(st.id)} className="truncate text-left text-[13px] font-medium hover:text-civic"><Dot id={st.id} />{st.id}</button>
              <div className="grid grid-cols-16 gap-[3px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                {cells.map((r, i) => <span key={i} title={`${st.id}, +${(i + 1) * 15} min: risk ${fmt(r, 2)}`} className="h-[22px] rounded-[3px]" style={{ background: riskColor(r) }} />)}
              </div>
            </div>
          );
        })}
        <span />
        <div className="flex justify-between pt-0.5 text-[11.5px] text-muted">{hours.map((h) => <span key={h}>{h ? `+${h} h` : 'Now'}</span>)}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {GRID_KEY.map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px]" style={{ background: color }} />{label}</span>)}
      </div>
    </div>
  );
}

/* ================================================================== WATER POINTS */
/** Every water point side by side, for spotting the odd one out. */
function CompareAll({ live, selected, onSelect }) {
  const best = Math.max(...live.stations.map((s) => s.wqhi.score));
  return (
    <details className="section compare no-print">
      <summary>Compare all water points</summary>
      <table className="data">
        <thead><tr><th>Water point</th><th>Status</th><th>Water health</th><th>Risk</th><th>Turbidity</th><th>pH</th><th>TDS</th><th>Intake</th><th>People</th></tr></thead>
        <tbody>
          {live.stations.map((s) => {
            const st = stationStatus(s);
            return (
              <tr key={s.id} onClick={() => onSelect(s.id)} aria-selected={s.id === selected.id} className="cursor-pointer hover:bg-[#f2f6ff]">
                <td className="font-semibold">{s.id}</td>
                <td><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: st.color }} />{st.label}</span></td>
                <td className="num"><span className="inline-flex items-center gap-2">{s.wqhi.score}<i className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#e4ecff] sm:block"><b className="block h-full bg-civic" style={{ width: `${(s.wqhi.score / Math.max(best, 1)) * 100}%` }} /></i></span></td>
                <td className="num">{fmt(s.risk, 2)}</td>
                <td className="num">{fmt(s.reading?.turbidity, 1)} NTU</td>
                <td className="num">{fmt(s.reading?.ph, 2)}</td>
                <td className="num">{Math.round(s.reading?.tds ?? 0)} mg/L</td>
                <td>{s.valve ? (s.valve.open ? 'Open' : 'Closed') : 'None'}</td>
                <td className="num">{(s.population ?? 0).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

export function WaterPointsPage({ live, selected, history, staticData, onSelect, onInspect, onChanged }) {
  if (!live || !selected) return <Wait />;
  const s = history?.series ?? [];
  const t0 = s[0]?.t_ms ?? 0;
  const pts = (k) => s.map((h) => ({ x: (h.t_ms - t0) / 3.6e6, y: h[k] }));
  return (
    <div className="grid gap-3">
      {/* The five sites in river order, upstream first */}
      <div className="point-tabs" role="tablist" aria-label="Water points, upstream to downstream">
        {live.stations.map((st) => {
          const status = stationStatus(st);
          return (
            <button key={st.id} role="tab" aria-selected={st.id === selected.id} onClick={() => onSelect(st.id)} className="point-tab">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{st.id}</span>
                <span className="point-score font-display text-[17px] font-semibold tabular">{st.wqhi.score}</span>
              </span>
              <span className="mt-0.5 block truncate text-left text-[12px] opacity-80">{st.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11.5px]"><i className="h-2 w-2 rounded-full" style={{ background: status.color }} />{status.label}</span>
            </button>
          );
        })}
      </div>
      <CompareAll live={live} selected={selected} onSelect={onSelect} />

      <Section title={selected.name} note={`${selected.owner}. Sensor readings are simulated.`}
               right={<button onClick={() => onInspect(selected.id)} className="btn-primary !py-1.5"><Box size={14} />Open 3D site view</button>} flush>
        <StationPanel key={selected.id} st={selected} history={history} forecast={live.forecast.stations} pnsdw={staticData?.pnsdw ?? {}} onChanged={onChanged} />
      </Section>
      {s.length > 1 && (
        <Section title="Readings, last 6 hours">
          <div className="grid gap-4 md:grid-cols-3">
            {[['turbidity', 'Turbidity (NTU)', 0], ['orp', 'ORP (mV)', 0], ['risk', 'Contamination risk', 2]].map(([k, label, d]) => (
              <div key={k}>
                <p className="mb-1 text-xs text-muted">{label}</p>
                <LineChart series={[{ id: k, label, color: '#2f5be7', points: pts(k) }]} height={120}
                           xFormat={(x) => fmtClock(t0 + x * 3.6e6)} yFormat={(y) => y.toFixed(d)} directLabels={false}
                           yDomain={k === 'risk' ? [0, 1] : undefined} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ================================================================== REPORTS */
const pctClass = (v) => (v >= 99 ? 'text-ink' : v >= 90 ? 'bg-[#fff3cf] text-[#7a5600]' : 'bg-[#fde6e6] text-[#a32626]');
const FILTERS = [['all', 'All', () => true], ['alerts', 'Alerts', (e) => e.severity !== 'info'], ['actions', 'Actions', (e) => /^(CMD_|TASK_|ADVISORY)/.test(e.type)]];

function downloadEvents(events) {
  const safe = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = [['Time', 'Water point', 'Severity', 'Event', 'Details'], ...events.map((e) => [new Date(e.t_ms).toISOString(), e.station ?? 'system', e.severity, e.type, e.message])];
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(safe).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulos-3d-events-simulated.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function ReportTile({ label, value, alert }) {
  return (
    <div className="section px-4 py-3">
      <div className={`font-display text-[26px] font-semibold leading-tight tabular-nums ${alert ? 'text-[#a32626]' : ''}`}>{value}</div>
      <div className="text-[13px] text-ink-2">{label}</div>
    </div>
  );
}

export function ReportsPage({ live }) {
  const { data } = usePoll('/api/compliance?hours=24', 15000);
  const [filter, setFilter] = useState('all');
  const keep = FILTERS.find(([k]) => k === filter)[2];
  const events = live?.events ?? [];
  const pcts = (data?.stations ?? []).flatMap((s) => [s.turbidity_pct, s.ph_pct, s.tds_pct]);
  const compliance = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const alerts = events.filter((e) => e.severity === 'danger').length;
  const closed = (live?.stations ?? []).filter((s) => s.valve && !s.valve.open).length;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportTile label="Samples within the standard" value={compliance == null ? '…' : `${compliance}%`} />
        <ReportTile label="Serious alerts in the log" value={alerts} alert={alerts > 0} />
        <ReportTile label="Intakes closed now" value={closed} alert={closed > 0} />
        <ReportTile label="Advisories logged" value={live?.sms.length ?? 0} />
      </div>
      <Section title="Drinking-water compliance, last 24 hours"
               note="Share of raw intake samples within the Philippine National Standards for Drinking Water (PNSDW 2017). Readings are simulated."
               right={<span className="no-print flex gap-2"><button onClick={() => downloadEvents(events)} className="btn-ghost inline-flex items-center gap-1.5 !py-1.5"><Download size={14} />Download events</button><button onClick={() => window.print()} className="btn-ghost inline-flex items-center gap-1.5 !py-1.5"><Printer size={14} />Print report</button></span>} flush>
        {!data ? <div className="section-body"><Wait /></div> : (
          <table className="data">
            <thead><tr><th>Water point</th><th>Samples</th><th>Turbidity ≤ {data.limits.turbidity_ntu} NTU</th><th>pH {data.limits.ph_min}–{data.limits.ph_max}</th><th>TDS ≤ {data.limits.tds_mgL}</th><th>Avg WQHI</th><th>Intake closed</th></tr></thead>
            <tbody>
              {data.stations.map((s) => (
                <tr key={s.station_id}>
                  <td><Dot id={s.station_id} />{s.station_id}</td><td className="num">{s.samples}</td>
                  {[s.turbidity_pct, s.ph_pct, s.tds_pct].map((v, i) => <td key={i} className={`num ${pctClass(v)}`}>{v}%</td>)}
                  <td className="num">{s.wqhi_avg}</td><td className="num">{s.intake_closed_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Event log" flush right={(
          <div className="no-print flex rounded-lg bg-panel-2 p-0.5" role="group" aria-label="Filter events">
            {FILTERS.map(([k, label]) => <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${filter === k ? 'bg-white text-civic shadow-sm' : 'text-ink-2'}`}>{label}</button>)}
          </div>
        )}>
          {!live ? <div className="section-body"><Wait /></div> : (
            <table className="data">
              <thead><tr><th>Time</th><th>Water point</th><th>Event</th></tr></thead>
              <tbody>
                {live.events.filter(keep).slice(0, 40).map((e, i) => (
                  <tr key={`${e.t_ms}-${i}`}>
                    <td className="num whitespace-nowrap">{fmtClock(e.t_ms)}</td>
                    <td className="num">{e.station ?? 'system'}</td>
                    <td>
                      <span className="font-medium" style={{ color: e.severity === 'danger' ? '#a32626' : e.severity === 'warning' ? '#7a5600' : '#14212b' }}>
                        {KIND_LABEL[e.type] ?? e.type.replaceAll('_', ' ').toLowerCase()}
                      </span>
                      <div className="text-[13px] text-ink-2">{e.message}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Text message log" note={live?.sms_provider === 'outbox' ? 'Prototype: no phone numbers are set up, so nothing is really sent. This shows what each contact would receive.' : `Sent through ${live?.sms_provider}.`}>
          {!live || live.sms.length === 0 ? <p className="text-sm text-muted">No advisories yet. Run a simulation to see what contacts would receive.</p> : (
            <ul className="m-0 divide-y divide-line p-0">
              {live.sms.map((m, i) => (
                <li key={`${m.t}-${i}`} className="list-none py-2.5 first:pt-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted"><MessageSquareText size={13} />To {m.role}</div>
                  <p className="mt-1 text-[13px] leading-relaxed">{m.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
