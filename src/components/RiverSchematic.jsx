import { useEffect, useRef, useState } from 'react';
import { STATION_COLOR, fmtMin, stationStatus } from '../lib/format';

/* Water colour from turbidity excess and ORP deficit: clear blue -> sediment brown -> anoxic magenta. */
function water(te, od) {
  const t = Math.min(1, te / 60);
  const o = Math.min(1, od / 200);
  const r = Math.round(255 * Math.min(1, 0.25 + 0.55 * t + 0.25 * o));
  const g = Math.round(255 * Math.max(0, 0.75 - 0.35 * t - 0.4 * o));
  const b = Math.round(255 * Math.max(0, 1 - 0.7 * t - 0.4 * o));
  return `rgb(${r},${g},${b})`;
}

/**
 * The network at a glance: the DEM long profile as a living river from the
 * mountain source to the town, nodes with status, the plume colouring the
 * water, and forecast ETA chips above the intakes.
 */
export default function RiverSchematic({ live, forecast, staticData, selectedId, onSelect }) {
  const ref = useRef(null);
  const [w, setW] = useState(400);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(400, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (!live) return <div ref={ref} className="h-full" />;

  const ch = live.channel;
  const H = 150;
  const m = { l: 18, r: 18, t: 38, b: 34 };
  const L = ch.chainage_m.at(-1);
  const zMax = Math.max(...ch.elev_m);
  const sx = (s) => m.l + (s / L) * (w - m.l - m.r);
  const sy = (z) => m.t + (1 - Math.sqrt(Math.max(0, z) / zMax)) * (H - m.t - m.b);   // √ compresses the summit
  const pts = ch.chainage_m.map((s, i) => [sx(s), sy(ch.elev_m[i])]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${pts.at(-1)[0]},${H - m.b + 6}L${pts[0][0]},${H - m.b + 6}Z`;
  const stops = ch.chainage_m.filter((_, i) => i % 4 === 0 || i === ch.chainage_m.length - 1).map((s) => {
    const i = ch.chainage_m.indexOf(s);
    return { off: s / L, c: water(ch.turb_excess[i], ch.orp_deficit[i]) };
  });
  const raining = live.rain_mm_hr > 0.5;
  const fc = forecast?.stations ?? live.forecast.stations ?? {};
  const [srcName, townName] = (staticData?.site?.subtitle ?? 'Source → Town').split('→').map((s) => s.trim());

  return (
    <div ref={ref} className="relative h-full w-full min-w-0 overflow-hidden">
      <svg width={w} height={H} className="block">
        <defs>
          <linearGradient id="riverGrad" x1="0" x2="1" y1="0" y2="0">
            {stops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.c} />)}
          </linearGradient>
          <linearGradient id="landGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0b4f8a" stopOpacity="0.12" />
            <stop offset="1" stopColor="#0b4f8a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {raining && Array.from({ length: Math.round(w / 14) }, (_, i) => (
          <line key={i} x1={i * 14 + 6} x2={i * 14} y1={4} y2={18 + (i % 3) * 4} stroke="#5aa9ff" strokeOpacity={0.35} strokeWidth={1} />
        ))}

        <path d={area} fill="url(#landGrad)" />
        <path d={line} fill="none" stroke="url(#riverGrad)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={line} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={2} strokeLinecap="round" className="river-flow" />

        <text x={m.l} y={H - 8} fontSize={10.5} fill="#6b7a86">▲ {srcName} · {Math.round(ch.elev_m[0]).toLocaleString()} m</text>
        <text x={w - m.r} y={14} fontSize={10.5} fill="#6b7a86" textAnchor="end">{townName} · {Math.round(ch.elev_m.at(-1))} m ▼ · {(L / 1000).toFixed(1)} km</text>

        {live.stations.map((s) => {
          const x = sx(s.chainage_m);
          const y = sy(s.elevation_m);
          const st = stationStatus(s);
          const sel = s.id === selectedId;
          const f = fc[s.id];
          const eta = f && f.arrival_s > 0 ? f.arrival_s : null;
                    return (
            <g key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                            <circle cx={x} cy={y} r={sel ? 10 : 8} fill="#ffffff" stroke={st.color} strokeWidth={3} />
              <circle cx={x} cy={y} r={3.5} fill={STATION_COLOR[s.id]} />
              {s.valve && !s.valve.open && <rect x={x - 3} y={y + 12} width={6} height={6} fill="#a32626" />}
              <text x={x} y={y + (s.valve && !s.valve.open ? 30 : 24)} fontSize={11} fill={sel ? '#14212b' : '#3e4f5c'} textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontWeight={sel ? 600 : 400}>{s.id}</text>
              {eta != null && (
                <g transform={`translate(${x}, ${Math.max(14, y - 24)})`}>
                  <rect x={-34} y={-11} width={68} height={18} rx={9} fill="#f2c200" />
                  <text y={2} fontSize={10.5} fill="#14212b" textAnchor="middle" fontWeight={700}>ETA {fmtMin(eta)}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
