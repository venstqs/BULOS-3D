import { useState } from 'react';
import { CircleAlert, CircleCheck, Copy, Star } from 'lucide-react';
import { Modal } from './Actions';
import WaterDisc from './WaterDisc';
import { fmtMin } from '../lib/format';
import { shareText, waterVerdict } from '../lib/safety';
import { waterAt, waterRgb } from '../lib/waterColour';

const BANDS = [['LOW', 'Low', '#12a150'], ['MODERATE', 'Moderate', '#fab219'], ['HIGH', 'High', '#ec835a'], ['SEVERE', 'Severe', '#d03b3b']];
const bandOf = (risk) => (risk >= 0.6 ? BANDS[3] : risk >= 0.45 ? BANDS[2] : risk >= 0.25 ? BANDS[1] : BANDS[0]);

/** Risk at this point for the next four hours, an hour at a time. */
function NextHours({ now, series }) {
  if (!series?.length) return null;
  const at = (h) => series.reduce((a, p) => (Math.abs(p.tau - h * 3600) < Math.abs(a.tau - h * 3600) ? p : a), series[0]).risk;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {[['Now', now], ['1 h', at(1)], ['2 h', at(2)], ['3 h', at(3)], ['4 h', at(4)]].map(([label, risk]) => {
        const [, name, color] = bandOf(risk);
        return (
          <div key={label} className="rounded-lg bg-panel-2 px-1 py-2 text-center">
            <div className="text-[12px] text-ink-2">{label}</div>
            <i className="mx-auto my-1 block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <div className="text-[12px] font-medium">{name}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A plain answer for one water point: what it looks like, why, and what to do. */
export function SafeModal({ live, forecast, initialId, myPoint, onToggleMine, onOpen, notify, onClose }) {
  const [id, setId] = useState(initialId ?? myPoint ?? 'KS-03');
  const st = live.stations.find((s) => s.id === id) ?? live.stations[0];
  const fc = forecast?.stations ?? live.forecast.stations ?? {};
  const verdict = waterVerdict(st, live, fc);
  const rgb = waterRgb(...waterAt(live, st.chainage_m));
  const mine = myPoint === st.id;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(st, verdict));
      notify(true, 'Copied. Paste it anywhere to share.');
    } catch {
      notify(false, 'This browser blocked copying. Open the site on localhost or HTTPS to use it.');
    }
  };

  return (
    <Modal title="Is my water safe?" onClose={onClose} width={720}>
      <div className="seg-flat" role="tablist" aria-label="Water point">
        {live.stations.map((s) => <button key={s.id} role="tab" aria-selected={s.id === st.id} onClick={() => setId(s.id)}>{s.id}</button>)}
      </div>

      <div key={`${st.id}-${verdict.level}`} className="verdict mt-3 flex items-center gap-4 rounded-xl p-4 text-white" style={{ background: verdict.color }}>
        <WaterDisc size={92} rgb={rgb} className="shrink-0 border-[3px] border-white"><b className="font-display text-[26px] leading-none">{st.wqhi.score}</b></WaterDisc>
        <div className="min-w-0">
          <p className="text-[13px]">{st.name}</p>
          <h3 className="font-display text-[23px] font-semibold leading-tight">{verdict.title}</h3>
          <p className="text-sm">{verdict.sub}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section>
          <h3 className="mb-2 font-display text-[15px] font-semibold">What to do</h3>
          <ol className="m-0 grid list-none gap-2 p-0">
            {verdict.steps.map((text, i) => (
              <li key={text} className="flex gap-2 text-sm leading-snug">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-civic text-[11px] font-semibold text-white">{i + 1}</span>{text}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="mb-2 font-display text-[15px] font-semibold">Why the twin says this</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {verdict.reasons.map((r) => (
              <li key={r.text} className="flex gap-2 text-sm leading-snug">
                {r.ok ? <CircleCheck size={17} className="shrink-0 text-good" /> : <CircleAlert size={17} className="shrink-0 text-serious" />}{r.text}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {fc[st.id]?.series?.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-2 font-display text-[15px] font-semibold">Next 4 hours{fc[st.id].arrival_s > 0 ? `, arrives in ${fmtMin(fc[st.id].arrival_s)}` : ''}</h3>
          <NextHours now={st.risk} series={fc[st.id].series} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => onToggleMine(st.id)} aria-pressed={mine} className="btn-ghost inline-flex items-center gap-1.5">
          <Star size={14} fill={mine ? '#f2c200' : 'none'} className={mine ? 'text-advisory' : ''} />{mine ? 'My water point' : 'Make this my water point'}
        </button>
        <button onClick={copy} className="btn-ghost inline-flex items-center gap-1.5"><Copy size={14} />Copy message</button>
        <button onClick={() => { onClose(); onOpen(st.id); }} className="btn-primary ml-auto">Full details</button>
      </div>
      <p className="mt-3 text-xs text-muted">This answer comes from a simulation for a student project. It is not a real water test. Always follow your barangay health office.</p>
    </Modal>
  );
}
