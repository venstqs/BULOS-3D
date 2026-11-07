import { useEffect, useRef, useState } from 'react';
import { Activity, Bell, Check, Clock, FlaskConical, Lock, LockOpen, Wrench } from 'lucide-react';
import { fmtClock, fmtDate } from '../lib/format';

const SEEN = 'bulos-alerts-seen';
const FILTERS = [['all', 'All'], ['danger', 'Urgent'], ['warning', 'Warnings'], ['info', 'Updates']];
const TINT = { blue: ['#e3ecff', '#2f5be7'], aqua: ['#d8f4f1', '#0a7a73'], sun: ['#fff0c4', '#8f6300'], coral: ['#ffe3da', '#c0442a'], violet: ['#ebe5ff', '#5b3fd1'] };
const EVENTS = {
  TASK_DONE: ['Maintenance done', Check, 'aqua'],
  TASK_ADDED: ['Reminder added', Bell, 'blue'],
  ADVISORY_SENT: ['Advisory logged', Bell, 'blue'],
  CMD_SHUT: ['Intake closed by operator', Lock, 'sun'],
  CMD_PREEMPT_SHUT: ['Intake closed ahead of plume', Lock, 'sun'],
  CMD_REARM: ['Intake reopened', LockOpen, 'aqua'],
  CMD_FORCE_REARM: ['Intake reopened by override', LockOpen, 'coral'],
  CMD_CLEANED: ['Probe cleaned', Check, 'aqua'],
  EDGE_AUTO_TRIP: ['Intake closed automatically', Lock, 'coral'],
  FORECAST_ADVISORY: ['Contamination forecast', Clock, 'sun'],
  BIOFOULING: ['Dirty sensor detected', Wrench, 'sun'],
  ANOMALY: ['Unusual reading', Activity, 'coral'],
  SCENARIO: ['Simulation update', FlaskConical, 'violet'],
};

function infoFor(e) {
  const known = EVENTS[e.type];
  if (known) return known;
  const words = e.type.replaceAll('_', ' ').toLowerCase();
  return [words[0].toUpperCase() + words.slice(1), Bell, e.severity === 'danger' ? 'coral' : e.severity === 'warning' ? 'sun' : 'blue'];
}

/** The bell: what is new since you last looked, with the same filters as the mobile app. */
export function AlertBell({ live, onOpen, go }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [seen, setSeen] = useState(() => Number(localStorage.getItem(SEEN)) || 0);
  const [before, setBefore] = useState(seen);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  if (!live) return null;
  const unread = live.events.filter((e) => e.t_ms > seen && e.severity !== 'info').length;
  const list = live.events.filter((e) => filter === 'all' || e.severity === filter).slice(0, 30);

  const toggle = () => {
    if (!open) {
      const latest = live.events[0]?.t_ms ?? seen;
      setBefore(seen);
      setSeen(latest);
      localStorage.setItem(SEEN, String(latest));
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-label={unread ? `${unread} new alerts` : 'No new alerts'} aria-expanded={open}
              className="relative rounded-xl bg-white/70 p-2 text-ink-2 hover:bg-white hover:text-ink">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-critical px-1 text-center text-[10px] font-bold leading-[18px] text-white">{Math.min(99, unread)}</span>}
      </button>
      {open && (
        <div className="site-panel absolute right-0 top-11 z-40 w-[400px] max-w-[calc(100vw-24px)] p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-display text-[15px] font-semibold">Alerts</span>
            <button onClick={() => { setOpen(false); go('reports'); }} className="link">Reports</button>
          </div>
          <div className="seg-flat mb-2">
            {FILTERS.map(([id, label]) => <button key={id} aria-selected={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          {!list.length ? <p className="px-1 py-3 text-sm text-muted">Nothing here. New alerts from the twin appear in this list.</p> : (
            <ul className="m-0 grid max-h-[60vh] list-none gap-1.5 overflow-y-auto p-0">
              {list.map((e, i) => {
                const [label, Icon, tint] = infoFor(e);
                const [bg, fg] = TINT[tint];
                const isNew = e.t_ms > before && e.severity !== 'info';
                return (
                  <li key={`${e.t_ms}-${e.type}-${i}`}>
                    <button onClick={() => { if (e.station) { setOpen(false); onOpen(e.station); } }} disabled={!e.station} className="alert-row" style={{ background: bg }}>
                      <span className="alert-icon" style={{ color: fg }}><Icon size={15} /></span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                          <span className="truncate">{label}{e.station ? `, ${e.station}` : ''}</span>
                          {isNew && <i className="h-2 w-2 shrink-0 rounded-full bg-critical" title="New" />}
                        </span>
                        <span className="block text-[12px] leading-snug text-ink-2">{e.message}</span>
                        <span className="block text-[11.5px] text-ink-2">{fmtDate(e.t_ms)}, {fmtClock(e.t_ms)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
