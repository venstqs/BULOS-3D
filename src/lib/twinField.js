// The twin's state at any moment on the time slider: recorded history behind "now",
// the forecast ahead of it. Between water points the river is interpolated by chainage.
export const PAST_S = 6 * 3600;
export const AHEAD_S = 4 * 3600;

const nearest = (rows, key, target) => rows.reduce((a, b) => (Math.abs(b[key] - target) < Math.abs(a[key] - target) ? b : a));

/** Per-station risk and excess at `tau` seconds from now (0 = live). */
export function stationsAt(tau, live, forecast, history) {
  const out = {};
  for (const st of live.stations) {
    const now = {
      risk: st.risk, rain: live.rain_mm_hr,
      turb: Math.max(0, (st.reading?.turbidity ?? 0) - (st.baseline?.turbidity ?? 0)),
      orp: Math.max(0, (st.baseline?.orp ?? 0) - (st.reading?.orp ?? 0)),
    };
    out[st.id] = now;
    if (tau > 0) {
      const series = forecast?.stations?.[st.id]?.series;
      if (series?.length) {
        const p = nearest(series, 'tau', tau);
        out[st.id] = { risk: p.risk, turb: p.turb_excess ?? 0, orp: p.orp_deficit ?? 0, rain: 0 };
      }
    } else if (tau < 0) {
      const rows = history?.[st.id];
      if (rows?.length) {
        const p = nearest(rows, 't', live.clock.t + tau);
        out[st.id] = {
          risk: p.risk, rain: p.rain ?? 0,
          turb: Math.max(0, p.turbidity - (st.baseline?.turbidity ?? 0)),
          orp: Math.max(0, (st.baseline?.orp ?? 0) - p.orp),
        };
      }
    }
  }
  return out;
}

/** River colour field. Live uses the model's own channel state; other times interpolate stations. */
export function riverAt(tau, live, stations) {
  const ch = live.channel;
  if (tau === 0) return { turb: ch.turb_excess, orp: ch.orp_deficit };
  const creek = live.stations.filter((s) => !s.aquifer).sort((a, b) => a.chainage_m - b.chainage_m);
  const at = (x, key) => {
    const hi = creek.findIndex((s) => s.chainage_m >= x);
    if (hi === 0) return stations[creek[0].id][key];
    if (hi < 0) return stations[creek.at(-1).id][key];
    const [a, b] = [creek[hi - 1], creek[hi]];
    const f = (x - a.chainage_m) / (b.chainage_m - a.chainage_m);
    return stations[a.id][key] * (1 - f) + stations[b.id][key] * f;
  };
  return { turb: ch.chainage_m.map((x) => at(x, 'turb')), orp: ch.chainage_m.map((x) => at(x, 'orp')) };
}

/** Who is exposed right now: people served by water points that are affected or about to be. */
export function exposure(live) {
  const fc = live.forecast?.stations ?? {};
  const hit = live.stations.filter((s) => s.risk >= 0.45 || fc[s.id]?.arrival_s > 0);
  const next = hit.map((s) => ({ id: s.id, s: fc[s.id]?.arrival_s })).filter((x) => x.s > 0).sort((a, b) => a.s - b.s)[0];
  return { people: hit.reduce((a, s) => a + (s.population ?? 0), 0), points: hit.length, next };
}

export function fmtOffset(tau) {
  const m = Math.round(Math.abs(tau) / 60);
  return `${tau < 0 ? '−' : '+'}${m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`}`;
}
