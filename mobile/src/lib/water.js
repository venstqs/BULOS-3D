import { stationStatus } from './format';

// The same rule for the colour of water as the website (src/lib/waterColour.js).
// te: turbidity above normal (NTU). od: ORP below normal (mV), which falls when sewage is present.
const TURB_FULL = 30;
const ORP_FULL = 150;
const clamp = (v) => Math.min(1, Math.max(0, v));

/** Red, green and blue from 0 to 255. Clean is blue, muddy is brown, sewage is maroon, both is red. */
export function waterRgb(te = 0, od = 0) {
  const t = clamp((te ?? 0) / TURB_FULL);
  const o = clamp((od ?? 0) / ORP_FULL);
  return [
    Math.round(255 * Math.min(1, 0.2 + 0.56 * t + 0.34 * o)),
    Math.round(255 * Math.max(0, 0.66 - 0.32 * t - 0.46 * o)),
    Math.round(255 * Math.max(0, 1 - 0.8 * t - 0.68 * o)),
  ];
}

export const rgbCss = (rgb, shade = 1) => `rgb(${rgb.map((v) => Math.round(v * shade)).join(',')})`;
export const waterCss = (te, od) => rgbCss(waterRgb(te, od));

/** What the river is carrying at a place along it, in words a person would use. */
export function waterName(te = 0, od = 0) {
  const muddy = clamp((te ?? 0) / TURB_FULL) >= 0.2;
  const sewage = clamp((od ?? 0) / ORP_FULL) >= 0.2;
  if (muddy && sewage) return 'Muddy and sewage';
  if (muddy) return 'Muddy';
  if (sewage) return 'Sewage';
  return 'Clean';
}

/** The same, as a short label that reads well on its own. */
export function waterLabel(te, od) {
  const name = waterName(te, od);
  return name === 'Clean' ? 'Clean water' : name;
}

/** Turbidity and ORP excess at one chainage on the river. */
export function waterAt(live, chainage) {
  const ch = live?.channel;
  if (!ch?.chainage_m?.length || chainage == null) return [0, 0];
  let best = 0;
  ch.chainage_m.forEach((c, i) => { if (Math.abs(c - chainage) < Math.abs(ch.chainage_m[best] - chainage)) best = i; });
  return [ch.turb_excess?.[best] ?? 0, ch.orp_deficit?.[best] ?? 0];
}

/** The state of the whole river, for anything that needs a one-line answer. */
export function riverSummary(live, forecast, tasks) {
  if (!live?.stations?.length) return null;
  const fc = forecast?.stations ?? live.forecast?.stations ?? {};
  const stations = live.stations;
  const avg = Math.round(stations.reduce((a, x) => a + x.wqhi.score, 0) / stations.length);
  const worst = stations.reduce((a, x) => (x.risk > a.risk ? x : a), stations[0]);
  const coming = stations.filter((x) => fc[x.id]?.arrival_s > 0 && fc[x.id].peak_risk >= 0.45);
  const attention = stations.filter((x) => stationStatus(x).label !== 'Low' || coming.includes(x));
  const next = stations.filter((x) => fc[x.id]?.arrival_s > 0).sort((a, b) => fc[a.id].arrival_s - fc[b.id].arrival_s)[0] ?? null;
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const urgent = open.filter((t) => t.status === 'OVERDUE' || t.urgent);
  const [te, od] = waterAt(live, worst.chainage_m);
  return { avg, worst, attention, coming, next, nextEta: next ? fc[next.id].arrival_s : null, open, urgent, te, od, total: stations.length, fc };
}
