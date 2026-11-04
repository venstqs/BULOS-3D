import {
  Activity, BellPlus, CalendarDays, ChevronDown, ClipboardCheck, Droplet, Droplets, FlaskConical, Gauge,
  MessageSquareWarning, Microscope, Mountain, SunMedium, Thermometer, Waves,
} from 'lucide-react';
import LineChart from './charts/LineChart';
import { fmt, fmtClock, isRealNode, notFitted, stationStatus } from '../lib/format';

const DAY = 86_400_000;
const KIND_ICON = { SPRING_INTAKE: Mountain, EXISTING_GOV_SENSOR: Gauge, COMMUNAL_KIOSK: Droplet, SOLAR_PUMP_WELL: SunMedium, MUNICIPAL_RESERVOIR: Waves, CRITICAL_ENDPOINT: Droplets };

export function quality(score) {
  if (score >= 85) return ['Excellent', 'pill-good'];
  if (score >= 70) return ['Good', 'pill-good'];
  if (score >= 50) return ['Fair', 'pill-amber'];
  return ['Poor', 'pill-red'];
}

export function taskPill(status) {
  return {
    OVERDUE: ['Overdue', 'pill-red'], DUE_TODAY: ['Due today', 'pill-amber'],
    UPCOMING: ['Upcoming', 'pill-blue'], COMPLETED: ['Completed', 'pill-good'],
  }[status];
}

export function DateBadge({ ms }) {
  const d = new Date(ms);
  return (
    <div className="w-12 shrink-0 overflow-hidden rounded-xl bg-white text-center shadow-sm">
      <div className="bg-civic py-0.5 text-[10px] font-semibold text-white">{d.toLocaleDateString([], { month: 'short' })}</div>
      <div className="font-display text-lg font-semibold leading-8">{d.getDate()}</div>
    </div>
  );
}

const dueIn = (ms, now) => {
  const d = Math.round((ms - now) / DAY);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Today';
  return `In ${d} day${d === 1 ? '' : 's'}`;
};

function Card({ children, className = '' }) {
  return <section className={`glass flex flex-col p-5 ${className}`}>{children}</section>;
}

function CardHead({ title, sub, icon: Icon, action }) {
  return (
    <div className="mb-4 flex min-h-[42px] items-center gap-3">
      {Icon && <span className="icon-tile shrink-0"><Icon size={20} /></span>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-[15.5px] font-semibold leading-tight">{title}</h2>
        {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ================================================================ HOME */
export default function Home({
  live, forecast, staticData, trend, tasks, map, selectedId, onSelectPoint, onOpenPoint, onInspect, go, quick,
}) {
  if (!live) return null;
  const now = live.clock.epoch_ms;
  const st = live.stations.find((s) => s.id === selectedId) ?? live.stations[0];
  const avg = Math.round(live.stations.reduce((a, s) => a + s.wqhi.score, 0) / live.stations.length);
  const [qLabel, qPill] = quality(avg);
  const attention = live.stations.filter((s) => stationStatus(s).label !== 'Low');
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const next = open[0];
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const advisory = live.stations.some((s) => s.classification === 'ACUTE_EVENT')
    || Object.values(forecast?.stations ?? {}).some((f) => f.arrival_s > 0 && f.peak_risk >= 0.45);

  return (
    <div className="home-grid">
      {/* ---------------- left column (a row of cards on laptops) ---------------- */}
      <div className="home-left">
        <Card className="home-brand text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-20 w-20" />
          <div className="mt-2 font-display text-2xl font-semibold">Bulos 3D</div>
          <div className="text-sm text-ink-2">Water quality digital twin</div>
          <div className="mt-1 text-xs text-muted">{staticData?.site.title}</div>
        </Card>

        <Card>
          <CardHead icon={Droplet} title="Water quality"
                    sub={attention.length ? `${attention.length} water point${attention.length > 1 ? 's' : ''} need attention` : 'All water points good'} />
          <div className="tile mt-auto flex items-end justify-between gap-3 p-4">
            <div className="shrink-0">
              <div className="font-display text-4xl font-semibold leading-none text-civic tabular">{avg}<span className="text-xl">%</span></div>
              <span className={`pill mt-2 ${qPill}`}>{qLabel}</span>
            </div>
            <Spark values={(trend ?? []).map((p) => p.avg)} />
          </div>
        </Card>

        <Card>
          <CardHead icon={CalendarDays} title="Next maintenance" sub={next ? dueIn(next.due_ms, now) : 'Nothing scheduled'} />
          {next ? (
            <button onClick={() => quick('log', next.id)} className="tile mt-auto block w-full p-4 text-left hover:ring-2 hover:ring-civic/20">
              <div className="truncate font-semibold">{next.title}</div>
              <div className="mt-0.5 truncate text-xs text-ink-2">{live.stations.find((s) => s.id === next.station)?.name}</div>
              <div className="mt-1 text-xs text-muted">{new Date(next.due_ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </button>
          ) : <p className="mt-auto text-sm text-muted">Add a reminder to plan the next visit.</p>}
        </Card>

        <Card>
          <CardHead title="Quick actions" />
          <div className="mt-auto grid grid-cols-4 gap-1">
            {[
              ['test', 'Water test', FlaskConical],
              ['reminder', 'Add reminder', BellPlus],
              ['log', 'Log maintenance', ClipboardCheck],
              ['advisory', 'Send advisory', MessageSquareWarning],
            ].map(([id, label, Icon]) => (
              <button key={id} onClick={() => quick(id)} className="group grid justify-items-center gap-1.5 rounded-xl p-1 text-center">
                <span className="tile flex h-12 w-12 items-center justify-center rounded-full text-civic transition group-hover:bg-civic group-hover:text-white"><Icon size={20} /></span>
                <span className="text-[11px] leading-tight text-ink-2">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ---------------- main column ---------------- */}
      <div className="home-main">
        <div className="px-1">
          <p className="text-sm text-ink-2">{greet}, operator 👋</p>
          <h1 className="font-display text-2xl font-semibold leading-tight">Keep every water point safe</h1>
          <p className="mt-0.5 text-sm text-muted">{staticData?.site.subtitle}. Updated {fmtClock(now)}.</p>
        </div>

        {/* hero: the 3D watershed in a square box, the selected water point beside it */}
        <section className="glass grid gap-2 p-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-panel-2">
            {map}
            <span className={`pill absolute left-3 top-3 shadow-sm ${advisory ? 'pill-amber' : 'pill-good'}`}>
              <span className={`h-2 w-2 rounded-full ${advisory ? 'bg-[#e0a800]' : 'bg-good'}`} />{advisory ? 'Advisory' : 'Healthy'}
            </span>
          </div>
          <PointPanel st={st} live={live} forecast={forecast} onSelectPoint={onSelectPoint} onOpenPoint={onOpenPoint} onInspect={onInspect} />
        </section>

        <Card>
          <CardHead title="Today's overview" sub={st.name} action={<button onClick={() => onOpenPoint(st.id)} className="link">View all</button>} />
          <Overview st={st} pnsdw={staticData?.pnsdw} />
        </Card>

        <Card>
          <CardHead title="Recent activities" action={<button onClick={() => go('reports')} className="link">View all</button>} />
          <Activities live={live} />
        </Card>
      </div>

      {/* ---------------- right column ---------------- */}
      <div className="home-right">
        <Card>
          <CardHead title="Maintenance schedule" action={<button onClick={() => go('maintenance')} className="link">This week</button>} />
          <div className="grid gap-2.5">
            {open.slice(0, 3).map((t) => {
              const [label, pill] = taskPill(t.status);
              return (
                <button key={t.id} onClick={() => quick('log', t.id)}
                        className="tile grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 p-2.5 text-left hover:ring-2 hover:ring-civic/20">
                  <DateBadge ms={t.due_ms} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="truncate text-xs text-muted">{t.station} · {new Date(t.due_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <span className={`pill whitespace-nowrap ${pill}`}>{t.urgent && t.status !== 'COMPLETED' ? 'Urgent' : label}</span>
                </button>
              );
            })}
            {!open.length && <p className="text-sm text-muted">No open tasks.</p>}
          </div>
          <button onClick={() => go('maintenance')} className="btn-primary mt-4 w-full">View full schedule</button>
        </Card>

        <Card>
          <CardHead title="Water quality trend" action={<span className="text-xs font-semibold text-civic">Last 12 hours</span>} />
          {trend?.length > 1 ? (
            <LineChart series={[{ id: 'wq', label: 'Network WQHI', color: '#2f5be7', area: true, points: trend.map((p) => ({ x: (p.t_ms - trend[0].t_ms) / 3.6e6, y: p.avg })) }]}
                       height={170} xFormat={(x) => fmtClock(trend[0].t_ms + x * 3.6e6)} yFormat={(y) => y.toFixed(0)}
                       yDomain={[0, 100]} directLabels={false} />
          ) : <p className="text-sm text-muted">Collecting history…</p>}
        </Card>

        <Card>
          <CardHead title="Water points" action={<button onClick={() => go('points')} className="link">View all</button>} />
          <ul className="grid gap-2">
            {live.stations.map((s) => {
              const Icon = KIND_ICON[s.kind] ?? Droplet;
              const status = stationStatus(s);
              return (
                <li key={s.id}>
                  <button onClick={() => onOpenPoint(s.id)}
                          className="tile grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 p-2.5 text-left hover:ring-2 hover:ring-civic/20">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-2 text-civic"><Icon size={19} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-muted">{s.id} · {status.label}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-display text-sm font-semibold tabular" style={{ color: status.ink }}>{s.wqhi.score}</span>
                      <span className="block text-[10.5px] text-muted">WQHI</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* Selected water point, shown beside the square map */
function PointPanel({ st, live, forecast, onSelectPoint, onOpenPoint, onInspect }) {
  const status = stationStatus(st);
  const f = forecast?.stations?.[st.id] ?? live.forecast.stations?.[st.id];
  const [qLabel, qPill] = quality(st.wqhi.score);
  const rows = [
    ['Status', <span key="s" className="inline-flex items-center gap-1 font-semibold" style={{ color: status.ink }}><status.Icon size={14} style={{ color: status.color }} />{status.label}</span>],
    ['Intake', !st.valve ? 'Monitoring only' : st.valve.open ? 'Open' : <b key="v" className="text-[#a32626]">Closed, using stored water</b>],
    ['Serves', st.population ? `${st.population.toLocaleString()} people` : 'Not a supply point'],
    ['Elevation', `${fmt(st.elevation_m, 0)} m above sea level`],
    ['Next contamination', f?.arrival_s > 0 ? `in ${Math.round(f.arrival_s / 60)} min` : f?.arrival_s === 0 ? 'Now' : 'None in 4 hours'],
  ];
  return (
    <div className="flex min-w-0 flex-col rounded-[18px] bg-white/70 p-5">
      <label className="text-xs font-medium text-muted" htmlFor="hero-point">Water point</label>
      <div className="relative mt-1">
        <select id="hero-point" value={st.id} onChange={(e) => onSelectPoint(e.target.value)}
                className="w-full cursor-pointer appearance-none !rounded-xl !py-2.5 !pr-9 font-display text-base font-semibold">
          {live.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="tile flex h-20 w-20 shrink-0 flex-col items-center justify-center">
          <span className="font-display text-2xl font-semibold leading-none text-civic tabular">{st.wqhi.score}</span>
          <span className="mt-1 text-[10.5px] text-muted">WQHI</span>
        </div>
        <div className="min-w-0">
          <span className={`pill ${qPill}`}>{qLabel}</span>
          {isRealNode(st) && <span className="pill pill-good ml-1">Real sensor</span>}
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-2">{st.note}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
            <dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 truncate text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <button onClick={() => onOpenPoint(st.id)} className="btn-ghost">View details</button>
        <button onClick={() => onInspect(st.id)} className="btn-primary">3D site view</button>
      </div>
    </div>
  );
}

function Spark({ values }) {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  const w = 120;
  const h = 44;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - ((v - lo) / (hi - lo || 1)) * h}`).join('');
  return (
    <svg width={w} height={h} aria-label="Water quality, last 12 hours">
      <path d={`${d}L${w},${h}L0,${h}Z`} fill="#2f5be7" opacity="0.10" />
      <path d={d} fill="none" stroke="#2f5be7" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function Overview({ st, pnsdw = {} }) {
  const r = st.reading;
  const tiles = [
    { label: 'Temperature', value: `${fmt(r.temp, 1)}°C`, Icon: Thermometer, ok: r.temp < 32 },
    { label: 'pH level', value: fmt(r.ph, 1), Icon: Droplet, ok: r.ph >= (pnsdw.ph_min ?? 6.5) && r.ph <= (pnsdw.ph_max ?? 8.5) },
    { label: 'TDS', value: `${fmt(r.tds, 0)} ppm`, Icon: Activity, ok: r.tds <= (pnsdw.tds_mgL ?? 600) },
    { label: 'Turbidity', value: `${fmt(r.turbidity, 1)} NTU`, Icon: Waves, ok: st.classification === 'SENSOR_BIOFOULING' ? null : r.turbidity <= (pnsdw.turbidity_ntu ?? 5) },
    { label: 'ORP', value: `${fmt(r.orp, 0)} mV`, Icon: Gauge, ok: r.orp >= st.baseline.orp - 100 },
    { label: 'Biological (TLF)', value: r.bio == null ? 'no sensor' : `${fmt(r.bio, 1)} ppb`, Icon: Microscope, ok: r.bio == null ? null : r.bio < 10 },
  ];
  const keys = ['temp', 'ph', 'tds', 'turbidity', 'orp', 'bio'];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-6">
      {tiles.map((t, i) => (notFitted(st, keys[i]) ? { ...t, value: 'not fitted', ok: null, unfitted: true } : t)).map(({ label, value, Icon, ok, unfitted }) => (
        <div key={label} className="tile p-3">
          <Icon size={18} className="text-civic" />
          <div className="mt-2 font-display text-lg font-semibold tabular">{value}</div>
          <div className="text-xs text-muted">{label}</div>
          <div className={`mt-0.5 text-xs font-semibold ${ok == null ? 'text-[#7a5600]' : ok ? 'text-good' : 'text-[#a32626]'}`}>
            {unfitted ? 'No sensor here' : ok == null ? (label.startsWith('Biological') ? 'Not fitted' : 'Check sensor') : ok ? 'Good' : 'Out of range'}
          </div>
        </div>
      ))}
    </div>
  );
}

const ACTIVITY = {
  TASK_DONE: ['Maintenance done', ClipboardCheck, 'Completed', 'pill-good'],
  TASK_ADDED: ['Reminder added', BellPlus, 'Scheduled', 'pill-blue'],
  ADVISORY_SENT: ['SMS advisory sent', MessageSquareWarning, 'Sent', 'pill-blue'],
  CMD_SHUT: ['Intake closed by operator', Droplet, 'Closed', 'pill-amber'],
  CMD_PREEMPT_SHUT: ['Intake closed ahead of plume', Droplet, 'Closed', 'pill-amber'],
  CMD_REARM: ['Intake reopened', Droplet, 'Reopened', 'pill-good'],
  CMD_FORCE_REARM: ['Intake reopened (override)', Droplet, 'Override', 'pill-red'],
  CMD_CLEANED: ['Probe cleaned', Droplets, 'Completed', 'pill-good'],
  EDGE_AUTO_TRIP: ['Intake closed automatically', Droplet, 'Closed', 'pill-red'],
  FORECAST_ADVISORY: ['Contamination forecast', CalendarDays, 'Warning', 'pill-amber'],
  BIOFOULING: ['Dirty sensor detected', Gauge, 'Maintenance', 'pill-amber'],
};

function Activities({ live }) {
  const items = live.events.filter((e) => ACTIVITY[e.type]).slice(0, 5);
  if (!items.length) return <p className="text-sm text-muted">No activity yet. Actions you take and alerts from the twin appear here.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((e, i) => {
        const [label, Icon, pillText, pill] = ACTIVITY[e.type];
        return (
          <li key={`${e.t_ms}-${i}`} className="flex items-center gap-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-civic"><Icon size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{label}{e.station ? `, ${e.station}` : ''}</div>
              <div className="truncate text-xs text-muted">{fmtClock(e.t_ms)} · {e.message}</div>
            </div>
            <span className={`pill ${pill}`}>{pillText}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ================================================================ MAINTENANCE PAGE */
export function MaintenancePage({ live, tasks, quick }) {
  if (!live || !tasks) return null;
  const now = live.clock.epoch_ms;
  const groups = [
    ['Overdue', tasks.filter((t) => t.status === 'OVERDUE')],
    ['Due today', tasks.filter((t) => t.status === 'DUE_TODAY')],
    ['Upcoming', tasks.filter((t) => t.status === 'UPCOMING')],
    ['Completed', tasks.filter((t) => t.status === 'COMPLETED').sort((a, b) => b.done_ms - a.done_ms).slice(0, 12)],
  ];
  const name = (sid) => live.stations.find((s) => s.id === sid)?.name ?? sid;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">Maintenance schedule</h1>
          <p className="text-sm text-muted">Probe cleaning, calibration, filters and solar checks for every water point. Recurring tasks reschedule themselves when done.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => quick('reminder')} className="btn-ghost">Add reminder</button>
          <button onClick={() => quick('log')} className="btn-primary">Log maintenance</button>
        </div>
      </div>
      {groups.map(([title, list]) => (
        <section key={title} className="glass p-5">
          <h2 className="mb-3 font-display text-[15.5px] font-semibold">{title} <span className="text-sm font-normal text-muted">({list.length})</span></h2>
          {!list.length ? <p className="text-sm text-muted">Nothing here.</p> : (
            <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
              {list.map((t) => {
                const [label, pill] = taskPill(t.status);
                return (
                  <div key={t.id} className="tile flex items-center gap-3 p-3">
                    <DateBadge ms={t.done_ms ?? t.due_ms} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{t.title}</div>
                      <div className="truncate text-xs text-ink-2">{name(t.station)}</div>
                      <div className="text-xs text-muted">
                        {t.done_ms ? `Done by ${t.done_by}` : `${dueIn(t.due_ms, now)}${t.recurring_days ? `, repeats every ${t.recurring_days} days` : ''}`}
                      </div>
                    </div>
                    {t.done_ms ? <span className={`pill ${pill}`}>{label}</span> : (
                      <div className="grid justify-items-end gap-1">
                        <span className={`pill ${pill}`}>{t.urgent ? 'Urgent' : label}</span>
                        <button onClick={() => quick('log', t.id)} className="link">Mark done</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

