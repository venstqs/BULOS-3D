import { useState } from 'react';
import { BellPlus, CalendarDays, ClipboardCheck, Droplet, Droplets, FlaskConical, Gauge, MessageSquareWarning } from 'lucide-react';
import LineChart from './charts/LineChart';
import RiverSchematic from './RiverSchematic';
import { RiverLegend, Section, StatusTable } from './Pages';
import { fmtClock, fmtMin, stationStatus } from '../lib/format';

const DAY = 86_400_000;

function taskPill(status) {
  return {
    OVERDUE: ['Overdue', 'pill-red'], DUE_TODAY: ['Due today', 'pill-amber'],
    UPCOMING: ['Upcoming', 'pill-blue'], COMPLETED: ['Completed', 'pill-good'],
  }[status];
}

const dueIn = (ms, now) => {
  const d = Math.round((ms - now) / DAY);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Today';
  return `In ${d} day${d === 1 ? '' : 's'}`;
};

function Figure({ value, label, alert = false }) {
  return (
    <div className="px-4 py-3">
      <dd className={`m-0 font-display text-[22px] font-semibold leading-tight tabular ${alert ? 'text-[#a32626]' : 'text-ink'}`}>{value}</dd>
      <dt className="text-[12px] text-muted">{label}</dt>
    </div>
  );
}

/* ================================================================ OVERVIEW */
export default function Home({ live, forecast, staticData, trend, tasks, onOpenPoint, go, quick }) {
  if (!live) return null;
  const now = live.clock.epoch_ms;
  const fc = forecast?.stations ?? live.forecast.stations ?? {};
  const avg = Math.round(live.stations.reduce((a, s) => a + s.wqhi.score, 0) / live.stations.length);
  const total = live.stations.reduce((a, s) => a + (s.population ?? 0), 0);
  const hit = live.stations.filter((s) => s.risk >= 0.45 || fc[s.id]?.arrival_s > 0);
  const people = hit.reduce((a, s) => a + (s.population ?? 0), 0);
  const valves = live.stations.filter((s) => s.valve);
  const closed = valves.filter((s) => !s.valve.open).length;
  const next = live.stations.map((s) => ({ id: s.id, t: fc[s.id]?.arrival_s })).filter((x) => x.t > 0).sort((a, b) => a.t - b.t)[0];
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const attention = live.stations.filter((s) => stationStatus(s).label !== 'Low').length;

  return (
    <div className="grid gap-3">
      <Section title="The river right now" note="From the Isarog slope to Naga City. The water changes colour with the contamination the twin sees." right={<RiverLegend />} flush>
        <div className="h-[150px] px-2"><RiverSchematic live={live} forecast={forecast} staticData={staticData} onSelect={onOpenPoint} /></div>
        <dl className="m-0 grid grid-cols-2 border-t border-line md:grid-cols-4">
          <Figure value={`${avg}%`} label={attention ? `Water quality, ${attention} need attention` : 'Water quality'} />
          <Figure value={(total - people).toLocaleString()} label="People not affected" alert={people > 0} />
          <Figure value={`${valves.length - closed} of ${valves.length}`} label="Intakes open" alert={closed > 0} />
          <Figure value={next ? fmtMin(next.t) : 'None'} label={next ? `Next plume, at ${next.id}` : 'Next plume'} alert={Boolean(next)} />
        </dl>
      </Section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Section title="Water points" right={<button onClick={() => go('points')} className="link">Open water points</button>} flush>
          <StatusTable live={live} forecast={forecast} onOpen={onOpenPoint} />
        </Section>
        <Section title="Next up" right={<button onClick={() => go('maintenance')} className="link">See schedule</button>}>
          {open.length ? (
            <ul className="m-0 divide-y divide-line p-0">
              {open.slice(0, 4).map((t) => {
                const [label, pill] = taskPill(t.status);
                return (
                  <li key={t.id} className="list-none">
                    <button onClick={() => quick('log', t.id)} className="flex w-full items-center gap-2 py-2 text-left hover:text-civic">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted">{t.station}, {dueIn(t.due_ms, now).toLowerCase()}</span>
                      </span>
                      <span className={`pill ${pill}`}>{t.urgent ? 'Urgent' : label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">No open tasks.</p>}
          <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-line pt-3">
            {[['test', 'Water test', FlaskConical], ['reminder', 'Add reminder', BellPlus], ['log', 'Log maintenance', ClipboardCheck], ['advisory', 'Send advisory', MessageSquareWarning]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => quick(id)} className="btn-ghost flex items-center justify-center gap-1.5 !px-2 !py-1.5 !text-[12.5px]"><Icon size={14} />{label}</button>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Section title="Water quality, last 12 hours">
          {trend?.length > 1 ? (
            <LineChart series={[{ id: 'wq', label: 'Network WQHI', color: '#2f5be7', area: true, points: trend.map((p) => ({ x: (p.t_ms - trend[0].t_ms) / 3.6e6, y: p.avg })) }]}
                       height={190} xFormat={(x) => fmtClock(trend[0].t_ms + x * 3.6e6)} yFormat={(y) => y.toFixed(0)} yDomain={[0, 100]} directLabels={false} />
          ) : <p className="text-sm text-muted">Collecting history…</p>}
        </Section>
        <Section title="Recent activity" right={<button onClick={() => go('reports')} className="link">See reports</button>}>
          <Activities live={live} />
        </Section>
      </div>
    </div>
  );
}

const ACTIVITY = {
  TASK_DONE: ['Maintenance done', ClipboardCheck],
  TASK_ADDED: ['Reminder added', BellPlus],
  ADVISORY_SENT: ['Advisory logged', MessageSquareWarning],
  CMD_SHUT: ['Intake closed by operator', Droplet],
  CMD_PREEMPT_SHUT: ['Intake closed ahead of plume', Droplet],
  CMD_REARM: ['Intake reopened', Droplet],
  CMD_FORCE_REARM: ['Intake reopened (override)', Droplet],
  CMD_CLEANED: ['Probe cleaned', Droplets],
  EDGE_AUTO_TRIP: ['Intake closed automatically', Droplet],
  FORECAST_ADVISORY: ['Contamination forecast', CalendarDays],
  BIOFOULING: ['Dirty sensor detected', Gauge],
};

function Activities({ live }) {
  const items = live.events.filter((e) => ACTIVITY[e.type]).slice(0, 5);
  if (!items.length) return <p className="text-sm text-muted">No activity yet. Actions you take and alerts from the twin appear here.</p>;
  return (
    <ul className="m-0 divide-y divide-line p-0">
      {items.map((e, i) => {
        const [label, Icon] = ACTIVITY[e.type];
        return (
          <li key={`${e.t_ms}-${i}`} className="flex list-none items-center gap-2.5 py-2">
            <Icon size={15} className="shrink-0 text-civic" />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{label}{e.station ? `, ${e.station}` : ''}</span>
            <span className="shrink-0 text-xs text-muted tabular">{fmtClock(e.t_ms)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ================================================================ MAINTENANCE */
function Task({ t, name, now, quick }) {
  const [label, pill] = taskPill(t.status);
  return (
    <li className="board-task list-none">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[13.5px] font-semibold leading-snug">{t.title}</span>
        {t.urgent && <span className="pill pill-red shrink-0">Urgent</span>}
      </div>
      <div className="mt-0.5 truncate text-xs text-ink-2">{name(t.station)}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{dueIn(t.due_ms, now)}{t.recurring_days ? `, every ${t.recurring_days} days` : ''}</span>
        <button onClick={() => quick('log', t.id)} className="link shrink-0" aria-label={`Mark ${t.title} done, currently ${label}`}>Mark done</button>
      </div>
      <span className={`sr-only ${pill}`}>{label}</span>
    </li>
  );
}

export function MaintenancePage({ live, tasks: allTasks, quick }) {
  const [only, setOnly] = useState('all');
  if (!live || !allTasks) return null;
  const now = live.clock.epoch_ms;
  const tasks = only === 'all' ? allTasks : allTasks.filter((t) => t.station === only);
  const columns = [
    ['Overdue', tasks.filter((t) => t.status === 'OVERDUE'), 'Nothing is overdue.'],
    ['Due today', tasks.filter((t) => t.status === 'DUE_TODAY'), 'Nothing is due today.'],
    ['Upcoming', tasks.filter((t) => t.status === 'UPCOMING'), 'Nothing is planned yet. Add a reminder.'],
  ];
  const done = tasks.filter((t) => t.status === 'COMPLETED').sort((a, b) => b.done_ms - a.done_ms).slice(0, 12);
  const name = (sid) => live.stations.find((s) => s.id === sid)?.name ?? sid;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => quick('log')} className="btn-primary">Log maintenance</button>
        <button onClick={() => quick('reminder')} className="btn-ghost">Add reminder</button>
        <div className="seg ml-auto" role="group" aria-label="Filter by water point">
          {[['all', 'All sites'], ...live.stations.map((s) => [s.id, s.id])].map(([k, label]) => (
            <button key={k} onClick={() => setOnly(k)} aria-pressed={only === k}>{label}</button>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {columns.map(([title, list, empty]) => (
          <section key={title} className="section">
            <h2 className="flex items-center justify-between px-3 pb-1.5 pt-3 font-display text-[15px] font-semibold">{title}<span className={`count ${title === 'Overdue' && list.length ? 'is-alert' : ''}`}>{list.length}</span></h2>
            {list.length ? (
              <ul className="m-0 grid gap-2 p-2 pt-1">{list.map((t) => <Task key={t.id} t={t} name={name} now={now} quick={quick} />)}</ul>
            ) : <p className="px-3 pb-4 text-sm text-muted">{empty}</p>}
          </section>
        ))}
      </div>
      {done.length > 0 && (
        <Section title="Recently completed" flush>
          <table className="data">
            <tbody>
              {done.map((t) => (
                <tr key={t.id}><td className="font-medium">{t.title}</td><td className="text-ink-2">{name(t.station)}</td><td className="text-ink-2">{t.done_by}</td><td className="num whitespace-nowrap text-right">{new Date(t.done_ms).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
