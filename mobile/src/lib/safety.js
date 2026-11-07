import { fmtMin } from './format';
import { waterAt, waterName } from './water';

export const VERDICT = {
  ok: { title: 'No problem seen', sub: 'The twin sees nothing unusual here right now.', icon: 'checkmark-circle', color: '#0a7a73' },
  boil: { title: 'Boil before drinking', sub: 'Something here needs care. Do not drink it untreated.', icon: 'flame', color: '#a85d0c' },
  stop: { title: 'Do not drink this water', sub: 'The twin shows this water is contaminated.', icon: 'close-circle', color: '#a82020' },
};

const LOOKS = {
  Clean: 'The water at this point looks clean',
  Muddy: 'The water here is muddy',
  Sewage: 'The water here has sewage in it',
  'Muddy and sewage': 'The water here has mud and sewage in it',
};

/**
 * A plain answer for one water point, built from the same simulated state as the rest of the app.
 * Every line it gives is a fact the twin holds, so the reasons can always be checked.
 */
export function waterVerdict(st, live, fc) {
  const [te, od] = waterAt(live, st.chainage_m);
  const name = waterName(te, od);
  const f = fc?.[st.id];
  const soon = f?.arrival_s > 0 && f.peak_risk >= 0.45;
  const fouled = st.classification === 'SENSOR_BIOFOULING' || st.edge_state === 'MAINTENANCE';
  const closed = Boolean(st.valve && !st.valve.open);

  let level = 'ok';
  if (st.classification === 'ACUTE_EVENT' || st.risk >= 0.6 || name.includes('Sewage') || name.includes('sewage')) level = 'stop';
  else if (st.risk >= 0.25 || soon || closed || fouled || name === 'Muddy') level = 'boil';

  const reasons = [
    { ok: name === 'Clean', text: LOOKS[name] },
    { ok: st.risk < 0.25, text: `Contamination risk is ${st.risk_band.toLowerCase()}` },
    f?.arrival_s === 0 ? { ok: false, text: 'Polluted water is here now' }
      : soon ? { ok: false, text: `Polluted water is expected in ${fmtMin(f.arrival_s)}` }
        : { ok: true, text: 'No new pollution is forecast in the next 4 hours' },
  ];
  if (st.valve) reasons.push({ ok: !closed, text: closed ? 'The intake is closed, so stored water is in use' : 'The intake is open' });
  if (fouled) reasons.push({ ok: false, text: 'The sensor needs cleaning, so its reading is less reliable' });

  const steps = {
    ok: ['Keep treating water the way you normally do.', 'Check again if the water changes colour or smell.'],
    boil: ['Bring water to a rolling boil for at least 1 minute.', 'If it looks cloudy, let it settle first, then boil the clear part.', 'Check again before the next use.'],
    stop: ['Do not drink this water or cook with it, even after filtering.', 'Use stored or bottled water until the barangay says it is safe.', 'Tell your barangay health worker.'],
  }[level];
  if (closed && st.tank?.reserve_h != null) steps.push(`Stored water here lasts about ${Math.round(st.tank.reserve_h)} hours.`);

  return { level, ...VERDICT[level], reasons, steps, name };
}

/** The same answer as a short message anyone can read. */
export function shareText(st, verdict) {
  return `${st.name}: ${verdict.title}. ${verdict.steps[0]} (Bulos 3D simulation for a student project, not a real water test.)`;
}
