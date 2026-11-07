import { useMemo, useState } from 'react';
import { CircleCheck, CircleX, X } from 'lucide-react';
import { fmt, fmtClock, notFitted } from '../lib/format';

export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16204a]/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="glass max-h-[88vh] w-full overflow-y-auto p-6"
           style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-panel-2 hover:text-ink"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-3 grid gap-1 text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

const toLocalInput = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ------------------------------------------------------------- water test */
export function WaterTestModal({ live, pnsdw, initialId, onClose }) {
  const [id, setId] = useState(initialId);
  const st = live.stations.find((s) => s.id === id) ?? live.stations[0];
  const r = st.reading;
  const rows = [
    ['Turbidity', `${fmt(r.turbidity, 1)} NTU`, `5 NTU or less`, r.turbidity <= pnsdw.turbidity_ntu],
    ['pH', fmt(r.ph, 2), `${pnsdw.ph_min} to ${pnsdw.ph_max}`, r.ph >= pnsdw.ph_min && r.ph <= pnsdw.ph_max],
    ['Total dissolved solids', `${fmt(r.tds, 0)} mg/L`, `${pnsdw.tds_mgL} mg/L or less`, r.tds <= pnsdw.tds_mgL],
    ['Oxidation-reduction potential', `${fmt(r.orp, 0)} mV`, `near baseline ${fmt(st.baseline.orp, 0)} mV`, r.orp >= st.baseline.orp - 100],
    ['Biological indicator (TLF)', r.bio == null ? 'no sensor' : `${fmt(r.bio, 1)} ppb`, 'below 10 ppb (faecal alert)', r.bio == null ? null : r.bio < 10],
    ['Water temperature', `${fmt(r.temp, 1)} °C`, 'for reference', null],
  ];
  const keyOf = ['turbidity', 'ph', 'tds', 'orp', 'bio', 'temp'];
  keyOf.forEach((k, i) => { if (notFitted(st, k)) rows[i] = [rows[i][0], 'not fitted', rows[i][2], null]; });
  const fails = rows.filter((x) => x[3] === false).length;
  return (
    <Modal title="Water test report" onClose={onClose} width={600}>
      <Field label="Water point">
        <select value={st.id} onChange={(e) => setId(e.target.value)}>
          {live.stations.map((s) => <option key={s.id} value={s.id}>{s.id}, {s.name}</option>)}
        </select>
      </Field>
      <p className="mb-3 text-sm text-ink-2">
        Latest sensor reading at {fmtClock(live.clock.epoch_ms)}, compared with the Philippine National Standards for Drinking Water (PNSDW 2017).
      </p>
      <div className="tile overflow-hidden">
        <table className="data">
          <thead><tr><th>Parameter</th><th>Reading</th><th>Standard</th><th>Result</th></tr></thead>
          <tbody>
            {rows.map(([name, val, std, ok]) => (
              <tr key={name}>
                <td>{name}</td><td className="num">{val}</td><td className="text-ink-2">{std}</td>
                <td>{ok == null ? <span className="pill pill-grey">info</span>
                  : ok ? <span className="pill pill-good"><CircleCheck size={12} />Pass</span>
                    : <span className="pill pill-red"><CircleX size={12} />Fail</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span>Health index <b className="font-display text-base">{st.wqhi.score}/100</b></span>
        <span>Contamination risk <b className="font-display text-base">{fmt(st.risk, 2)}</b></span>
        <span className={`pill ${fails ? 'pill-red' : 'pill-good'}`}>{fails ? `${fails} parameter${fails > 1 ? 's' : ''} outside the standard` : 'All parameters within the standard'}</span>
      </div>
      <p className="mt-3 text-xs text-muted">Raw intake water. Sensors are surrogates for bacteria; confirm suspected contamination with a lab E. coli test.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={() => window.print()} className="btn-ghost">Print report</button>
        <button onClick={onClose} className="btn-primary">Done</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- add reminder */
export function ReminderModal({ live, kinds, initialId, act, onClose }) {
  const [station, setStation] = useState(initialId);
  const [kind, setKind] = useState('LENS_CLEAN');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(toLocalInput(live.clock.epoch_ms + 86_400_000));
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act('/api/maintenance', { station_id: station, kind, title: title || null, due_ms: new Date(due).getTime() },
      (r) => r.message);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title="Add maintenance reminder" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Water point">
          <select value={station} onChange={(e) => setStation(e.target.value)}>
            {live.stations.map((s) => <option key={s.id} value={s.id}>{s.id}, {s.name}</option>)}
          </select>
        </Field>
        <Field label="Task">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        {kind === 'CUSTOM' && (
          <Field label="Describe the task">
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: replace the antenna cable" />
          </Field>
        )}
        <Field label="Due">
          <input type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">Add reminder</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------- log maintenance */
export function LogMaintenanceModal({ tasks, live, initialTaskId, act, onClose }) {
  const open = useMemo(() => (tasks ?? []).filter((t) => t.status !== 'COMPLETED'), [tasks]);
  const [taskId, setTaskId] = useState(initialTaskId ?? open[0]?.id);
  const [by, setBy] = useState('LGU field technician');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (sid) => live.stations.find((s) => s.id === sid)?.name ?? sid;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act(`/api/maintenance/${taskId}/done`, { done_by: by, note }, (r) => r.message);
    setBusy(false);
    if (ok) onClose();
  };
  if (!open.length) {
    return (
      <Modal title="Log maintenance" onClose={onClose}>
        <p className="text-sm text-ink-2">There are no open maintenance tasks. Add a reminder first.</p>
        <div className="mt-5 flex justify-end"><button onClick={onClose} className="btn-primary">Close</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Log maintenance" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Completed task">
          <select value={taskId} onChange={(e) => setTaskId(+e.target.value)}>
            {open.map((t) => (
              <option key={t.id} value={t.id}>
                {t.status === 'OVERDUE' ? 'Overdue: ' : t.urgent ? 'Urgent: ' : ''}{t.title}, {name(t.station)} (due {new Date(t.due_ms).toLocaleDateString([], { month: 'short', day: 'numeric' })})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Done by"><input type="text" required value={by} onChange={(e) => setBy(e.target.value)} /></Field>
        <Field label="Notes (optional)"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was found or replaced" /></Field>
        {open.find((t) => t.id === taskId)?.kind === 'LENS_CLEAN' && (
          <p className="mb-2 text-xs text-ink-2">Logging a probe cleaning also tells the sensor node to reset its drift check.</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">Mark as done</button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------- SMS advisory */
export function AdvisoryModal({ live, forecast, act, onClose }) {
  const fc = forecast?.stations ?? {};
  const contacts = live.stations.filter((s) => s.sms);
  const affected = contacts.filter((s) => s.risk >= 0.45 || fc[s.id]?.arrival_s > 0).map((s) => s.id);
  const [ids, setIds] = useState(affected.length ? affected : []);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act('/api/advisory', { station_ids: ids, message: message || null }, (r) => r.message);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title="Send advisory" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="mb-3 text-sm text-ink-2">
          {affected.length ? 'Water points that are affected or expecting contamination are already selected.' : 'No water point is affected right now. Choose who should receive the message.'}
        </p>
        <div className="tile mb-3 divide-y divide-line">
          {contacts.map((s) => (
            <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#2f5be7]" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} />
              <span className="flex-1">{s.name}<span className="block text-xs text-muted">to {s.sms}</span></span>
              {fc[s.id]?.arrival_s > 0 && <span className="pill pill-amber">arrives in {Math.round(fc[s.id].arrival_s / 60)} min</span>}
              {s.risk >= 0.45 && <span className="pill pill-red">contaminated</span>}
            </label>
          ))}
        </div>
        <Field label="Message (leave empty for the standard advisory)">
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300}
                    placeholder="Water advisory: do not drink untreated water; boil water for at least 1 minute." />
        </Field>
        <p className="text-xs text-muted">{live.sms_provider === 'outbox' ? 'Prototype: no phone numbers are set up, so nothing is really sent. The message is kept in Reports.' : `Sent through ${live.sms_provider}.`}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy || !ids.length} className="btn-primary">Send to {ids.length} contact{ids.length === 1 ? '' : 's'}</button>
        </div>
      </form>
    </Modal>
  );
}
