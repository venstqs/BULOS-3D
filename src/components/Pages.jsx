import { Box, Clock, Lock, LockOpen, MessageSquareText } from 'lucide-react';
import LineChart from './charts/LineChart';
import RiverSchematic from './RiverSchematic';
import StationPanel, { StatusBadge } from './StationPanel';
import TwinLoop from './TwinLoop';
import { usePoll } from '../api';
import { BAND, STATION_COLOR, fmt, fmtClock, fmtMin, stationStatus } from '../lib/format';

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
            <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-page">
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

/* ------------------------------------------------------------------ bulletins */
const KIND_LABEL = {
  FORECAST_ADVISORY: 'Water advisory', EDGE_AUTO_TRIP: 'Intake closed automatically', CMD_PREEMPT_SHUT: 'Intake closed ahead of plume',
  ANOMALY: 'Contamination detected', BIOFOULING: 'Sensor maintenance needed', RESERVE_LOW: 'Stored water running low',
  REARM_RECOMMENDED: 'Safe to reopen intake', RECOVERED: 'Back to normal', TRANSIT_CALIBRATION: 'Model updated from field data',
};

export function Bulletins({ live, limit = 8 }) {
  if (!live) return <Wait />;
  const items = live.events.filter((e) => KIND_LABEL[e.type]).slice(0, limit);
  if (!items.length) return <p className="text-sm text-muted">No bulletins in this period. All water points are at their normal baseline.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((e, i) => (
        <li key={`${e.t_ms}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold" style={{ color: e.severity === 'danger' ? '#a32626' : e.severity === 'warning' ? '#7a5600' : '#14212b' }}>
              {KIND_LABEL[e.type]}{e.station ? `, ${e.station}` : ''}
            </span>
            <span className="shrink-0 text-xs text-muted tabular">{fmtClock(e.t_ms)}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{e.message}</p>
        </li>
      ))}
    </ul>
  );
}

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
    <LineChart series={series} height={height} xFormat={(x) => `+${Math.round(x)} min`} yFormat={(y) => y.toFixed(2)}
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
              <td><span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: band.ink }}><band.Icon size={13} style={{ color: band.color }} />{fmt(f.peak_risk, 2)} {band.label.toLowerCase()}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ================================================================== OVERVIEW */
export function OverviewPage({ live, forecast, staticData, map, onOpen }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section title="Watershed map" note="3D terrain with live water points, flow and contamination risk." flush>
          <div className="h-[460px]">{map}</div>
        </Section>
        <Section title="Status of water points" note="Click a row for readings, controls and the 3D site view." flush>
          <StatusTable live={live} forecast={forecast} onOpen={onOpen} />
        </Section>
      </div>
      <Section title="River line diagram" note={staticData ? `${staticData.site.subtitle}. Water colour shows the modelled contamination right now.` : ''}
               right={<RiverLegend />} flush>
        <div className="h-[150px] px-2"><RiverSchematic live={live} forecast={forecast} staticData={staticData} onSelect={onOpen} /></div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Contamination forecast, next 4 hours" note="When polluted water is expected at each intake.">
          {live && forecast?.stations ? <ArrivalTable forecast={forecast} live={live} /> : <Wait />}
        </Section>
        <Section title="Latest bulletins">
          <Bulletins live={live} limit={6} />
        </Section>
      </div>
    </div>
  );
}

function RiverLegend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-muted md:flex">
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-6 rounded" style={{ background: 'linear-gradient(90deg,rgb(64,191,255),rgb(140,140,90),rgb(204,100,150))' }} />clear to polluted</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 bg-[#a32626]" />intake closed</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full bg-advisory" />expected arrival</span>
    </div>
  );
}

/* ================================================================== WATERSHED MAP */
const EVIDENCE = ['turbidity', 'orp', 'ph', 'tds', 'bio', 'rain'];
const EV_LABEL = { turbidity: 'Turbidity', orp: 'ORP drop', ph: 'pH shift', tds: 'TDS rise', bio: 'Biological', rain: 'Rainfall' };
const HEAT_LABEL = { risk: 'Overall contamination risk', turbidity: 'Turbidity', ph: 'pH', tds: 'Total dissolved solids', bio: 'Biological indicator (TLF)' };
const seq = (t) => ['#f3f6f9', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab'][Math.min(5, Math.round(t * 5))];

export function MapPage({ live, staticData, map, layers, setLayers, onOpen, heatIndex, setHeatIndex }) {
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const items = [['heatmap', 'Contamination risk heatmap'], ['flood', 'Flood-prone ground (our estimate)'], ['particles', 'Animated water flow'], ['pipes', 'Gravity pipelines'], ['columns', 'Risk columns'], ['streams', 'Streams from the elevation model'], ['catchment', 'Watershed boundary']];
  return (
    <div className="grid gap-4">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Watershed digital twin" note="Drag to rotate, scroll to zoom. Use the time bar to replay the last 6 hours or look 4 hours ahead." flush>
        <div className="p-2"><div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-panel-2">{map}</div></div>
      </Section>
      <div className="grid content-start gap-4">
        <Section title="Map layers">
          <div className="grid gap-1.5">
            {items.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-[#0b4f8a]" /> {label}
              </label>
            ))}
          </div>
          <label className="mt-4 grid gap-1 text-sm">
            <span className="font-medium text-ink-2">Heatmap shows</span>
            <select value={heatIndex} onChange={(e) => setHeatIndex(e.target.value)}>
              {(staticData?.heat_indices ?? Object.keys(HEAT_LABEL)).map((k) => <option key={k} value={k}>{HEAT_LABEL[k] ?? k}</option>)}
            </select>
          </label>
          <p className="mt-3 text-xs text-muted">{HEAT_LABEL[heatIndex]}: colour</p>
          <div className="mt-1 h-2 rounded" style={{ background: 'linear-gradient(90deg, rgba(250,200,120,0.3), rgb(220,115,75), rgb(190,30,30))' }} />
          <div className="mt-0.5 flex justify-between text-xs text-muted"><span>none</span><span>severe</span></div>
        </Section>
        {staticData && live && (
          <Section title="About this watershed">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Area</dt><dd className="tabular">{fmt(staticData.catchment.area_km2, 1)} km²</dd>
              <dt className="text-muted">Main river length</dt><dd className="tabular">{fmt(live.channel.chainage_m.at(-1) / 1000, 1)} km</dd>
              <dt className="text-muted">Highest point on river</dt><dd className="tabular">{Math.round(live.channel.elev_m[0]).toLocaleString()} m</dd>
              <dt className="text-muted">Stream reaches</dt><dd className="tabular">{staticData.streams.length}</dd>
              <dt className="text-muted">Elevation data</dt><dd>Copernicus 90 m</dd>
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
                  <button onClick={() => onOpen(s.id)} className="self-center text-left font-mono text-ink-2 hover:text-civic">{s.id}</button>
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
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section title="Contamination forecast, next 4 hours" note="Expected contamination risk at each water point. Updated every 5 minutes.">
          <ForecastChart live={live} forecast={forecast} staticData={staticData} />
        </Section>
        <Section title="Next expected arrival">
          <div className="flex items-start gap-3">
            <Clock size={28} className={next ? 'text-[#7a5600]' : 'text-civic'} />
            <div>
              <p className="font-display text-2xl font-semibold">{next ? `${next.id} in ${fmtMin(next.arrival_s)}` : 'None expected'}</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {next ? `Worst in ${fmtMin(next.peak_s)}, peak risk ${fmt(next.peak_risk, 2)}. Clears in ${next.clear_s ? fmtMin(next.clear_s) : 'over 4 hours'}.`
                  : 'No polluted water is forecast to reach any intake in the next 4 hours.'}
              </p>
            </div>
          </div>
          <label className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-sm text-ink-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0b4f8a]" checked={live.auto_preempt} onChange={(e) => onPreempt(e.target.checked)} />
            Close intakes automatically up to 30 minutes before forecast contamination arrives
          </label>
        </Section>
      </div>
      <Section title="Arrival windows" flush><ArrivalTable forecast={forecast} live={live} /></Section>
      <Section title="River line diagram" right={<RiverLegend />} flush>
        <div className="h-[150px] px-2"><RiverSchematic live={live} forecast={forecast} staticData={staticData} onSelect={onOpen} /></div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Water speed along the river" note={`Manning equation on slopes from the elevation model. Current runoff ${fmt(live.runoff_mm_hr, 1)} mm/h.`}>
          <LineChart series={[{ id: 'v', label: 'Velocity', color: '#0b4f8a', points: ch.velocity_mps.map((y, i) => ({ x: km[i], y })) }]}
                     height={170} xFormat={(x) => `${x.toFixed(0)} km`} yFormat={(y) => `${y.toFixed(1)}`} yLabel="m/s" markers={mk} directLabels={false} />
        </Section>
        <Section title="Modelled turbidity in the river now" note="NTU above each point's normal level.">
          <LineChart series={[{ id: 't', label: 'Turbidity above normal', color: '#0b4f8a', area: true, points: ch.turb_excess.map((y, i) => ({ x: km[i], y })) }]}
                     height={170} xFormat={(x) => `${x.toFixed(0)} km`} yFormat={(y) => y.toFixed(0)} markers={mk}
                     directLabels={false} yDomain={[0, Math.max(10, ...ch.turb_excess) * 1.1]} />
        </Section>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Gravity-fed pipelines" note="Hazen–Williams flow from the elevation drop; stops when telemetry reports an empty source tank." flush className="xl:col-span-2">
          <table className="data">
            <thead><tr><th>Line</th><th>Route</th><th>Length</th><th>Pipe</th><th>Head</th><th>Flow</th><th>Speed</th><th>Status</th></tr></thead>
            <tbody>
              {(staticData?.pipes ?? []).map((p) => {
                const d = live.pipes?.find((x) => x.id === p.id);
                return (
                  <tr key={p.id}>
                    <td><b>{p.id}</b><div className="text-xs text-muted">{p.name}</div></td>
                    <td className="num">{p.src} → {p.dst}</td>
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
        <Section title="Travel time between water points" flush>
          <table className="data">
            <thead><tr><th>Stretch</th><th>Length</th><th>Slope</th><th>Speed</th><th>Travel time</th><th>Tuned</th></tr></thead>
            <tbody>
              {live.reaches.map((r) => (
                <tr key={r.reach}>
                  <td className="num">{r.reach}</td><td className="num">{(r.length_m / 1000).toFixed(1)} km</td>
                  <td className="num">{(r.slope * 100).toFixed(1)}%</td><td className="num">{fmt(r.mean_velocity_mps, 2)} m/s</td>
                  <td className="num">{fmtMin(r.travel_time_s)}</td>
                  <td className="num">{r.velocity_factor !== 1 ? `×${fmt(r.velocity_factor, 2)}` : 'not yet'}</td>
                </tr>
              ))}
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
    </div>
  );
}

/* ================================================================== WATER POINTS */
export function WaterPointsPage({ live, selected, history, staticData, onSelect, onInspect, onChanged }) {
  if (!live || !selected) return <Wait />;
  const s = history?.series ?? [];
  const t0 = s[0]?.t_ms ?? 0;
  const pts = (k) => s.map((h) => ({ x: (h.t_ms - t0) / 3.6e6, y: h[k] }));
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Section title="Water points" flush className="self-start">
        <ul>
          {live.stations.map((st) => {
            const status = stationStatus(st);
            const on = st.id === selected.id;
            return (
              <li key={st.id}>
                <button onClick={() => onSelect(st.id)}
                        className={`flex w-full items-start gap-2 border-b border-line px-4 py-3 text-left last:border-0 ${on ? 'bg-[#e8f0f8] shadow-[inset_3px_0_0_#0b4f8a]' : 'hover:bg-page'}`}>
                  <Dot id={st.id} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{st.name}</div>
                    <div className="mt-1 flex items-center gap-2"><StatusBadge status={status} /><span className="text-xs text-muted">{st.id}</span></div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      <div className="grid content-start gap-4">
        <Section title={selected.name} note={`${selected.owner}. ${selected.kind.replaceAll('_', ' ').toLowerCase()}.`}
                 right={<button onClick={() => onInspect(selected.id)} className="inline-flex items-center gap-1.5 rounded bg-civic px-3 py-1.5 text-xs font-semibold text-white hover:bg-civic-dark"><Box size={14} />Open 3D site view</button>}
                 flush>
          <StationPanel key={selected.id} st={selected} history={history} forecast={live.forecast.stations} pnsdw={staticData?.pnsdw ?? {}}
                        onChanged={onChanged} />
        </Section>
        {s.length > 1 && (
          <Section title="Readings, last 6 hours">
            <div className="grid gap-4 md:grid-cols-3">
              {[['turbidity', 'Turbidity (NTU)', 0], ['orp', 'ORP (mV)', 0], ['risk', 'Contamination risk', 2]].map(([k, label, d]) => (
                <div key={k}>
                  <p className="mb-1 text-xs text-muted">{label}</p>
                  <LineChart series={[{ id: k, label, color: '#0b4f8a', points: pts(k) }]} height={110}
                             xFormat={(x) => fmtClock(t0 + x * 3.6e6)} yFormat={(y) => y.toFixed(d)} directLabels={false}
                             yDomain={k === 'risk' ? [0, 1] : undefined} />
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

/* ================================================================== REPORTS */
export function ReportsPage({ live }) {
  const { data } = usePoll('/api/compliance?hours=24', 15000);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Section title="Drinking-water standard compliance, last 24 hours"
                 note="Share of raw intake samples within the Philippine National Standards for Drinking Water (PNSDW 2017)." flush>
          {!data ? <div className="section-body"><Wait /></div> : (
            <table className="data">
              <thead><tr><th>Water point</th><th>Samples</th><th>Turbidity ≤ {data.limits.turbidity_ntu} NTU</th><th>pH {data.limits.ph_min}–{data.limits.ph_max}</th><th>TDS ≤ {data.limits.tds_mgL}</th><th>Avg WQHI</th><th>Intake closed</th></tr></thead>
              <tbody>
                {data.stations.map((s) => (
                  <tr key={s.station_id}>
                    <td><Dot id={s.station_id} />{s.station_id}</td><td className="num">{s.samples}</td><td className="num">{s.turbidity_pct}%</td>
                    <td className="num">{s.ph_pct}%</td><td className="num">{s.tds_pct}%</td><td className="num">{s.wqhi_avg}</td><td className="num">{s.intake_closed_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Event log" flush>
          {!live ? <div className="section-body"><Wait /></div> : (
            <table className="data">
              <thead><tr><th>Time</th><th>Water point</th><th>Event</th></tr></thead>
              <tbody>
                {live.events.slice(0, 40).map((e, i) => (
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
      </div>
      <Section title="Text messages sent" className="self-start"
               note={live?.sms_provider === 'outbox' ? 'No SMS gateway configured, so messages are logged here only.' : `Sent through ${live?.sms_provider}.`}>
        {!live || live.sms.length === 0 ? <p className="text-sm text-muted">No messages sent yet.</p> : (
          <ul className="divide-y divide-line">
            {live.sms.map((m, i) => (
              <li key={`${m.t}-${i}`} className="py-2.5 first:pt-0">
                <div className="flex items-center gap-1.5 text-xs text-muted"><MessageSquareText size={13} />To {m.role}, {m.status}</div>
                <p className="mt-1 text-[13px] leading-relaxed">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

