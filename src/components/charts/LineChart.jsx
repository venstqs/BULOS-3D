import { useEffect, useMemo, useRef, useState } from 'react';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(240);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function ticks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const step = 10 ** Math.floor(Math.log10(span / n));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= n) ?? step * 10;
  const out = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) out.push(+v.toFixed(6));
  return out;
}

/**
 * One y-axis line/area chart. Crosshair + tooltip on hover.
 * series: [{ id, label, color, points: [{x, y}], area?: bool, dashed?: bool }]
 * refLines: [{ y, label }]   bands: [{ x0, x1, label }]
 */
export default function LineChart({
  series, height = 150, xFormat = (x) => x, yFormat = (y) => y, yLabel, xDomain, yDomain,
  refLines = [], bands = [], markers = [], directLabels = true, legend = true,
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const m = { l: 44, r: directLabels ? 64 : 12, t: 10, b: 22 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;

  const all = series.flatMap((s) => s.points);
  const [x0, x1] = xDomain ?? [Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x))];
  const ys = all.map((p) => p.y).concat(refLines.map((r) => r.y));
  let [y0, y1] = yDomain ?? [Math.min(0, ...ys), Math.max(...ys)];
  if (!yDomain) y1 += (y1 - y0) * 0.08 || 1;
  const sx = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y) => m.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  const paths = useMemo(() => series.map((s) => {
    const pts = s.points.filter((p) => p.y != null);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    const area = s.area && pts.length
      ? `${d}L${sx(pts.at(-1).x).toFixed(1)},${sy(y0)}L${sx(pts[0].x).toFixed(1)},${sy(y0)}Z` : null;
    return { ...s, d, area, last: pts.at(-1) };
  }), [series, width, height, x0, x1, y0, y1]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = x0 + ((e.clientX - rect.left - m.l) / iw) * (x1 - x0);
    if (x < x0 || x > x1) { setHover(null); return; }
    const rows = series.map((s) => {
      let best = null;
      for (const p of s.points) if (p.y != null && (!best || Math.abs(p.x - x) < Math.abs(best.x - x))) best = p;
      return best && { ...s, p: best };
    }).filter(Boolean);
    setHover({ x: rows[0]?.p.x ?? x, rows });
  };

  // spread direct labels so they don't collide
  const labels = paths.filter((p) => p.last).map((p) => ({ ...p, ly: sy(p.last.y) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i += 1) labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 12);
  const overflow = labels.length ? labels.at(-1).ly - (m.t + ih) : 0;
  if (overflow > 0) labels.forEach((l) => { l.ly -= overflow; });

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none overflow-hidden">
      {legend && series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        {bands.map((b) => (
          <g key={b.label}>
            <rect x={sx(b.x0)} y={m.t} width={Math.max(1, sx(b.x1) - sx(b.x0))} height={ih} fill="#0b4f8a" opacity={0.05} />
            <text x={sx(b.x0) + 4} y={m.t + 11} fontSize={10} fill="#6b7a86">{b.label}</text>
          </g>
        ))}
        {ticks(y0, y1).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke="#e3e8ed" />
            <text x={m.l - 6} y={sy(t) + 3.5} fontSize={10} fill="#6b7a86" textAnchor="end" className="tabular">{yFormat(t)}</text>
          </g>
        ))}
        {ticks(x0, x1, Math.max(2, Math.floor(iw / 90))).map((t) => (
          <text key={t} x={sx(t)} y={height - 6} fontSize={10} fill="#6b7a86" textAnchor="middle" className="tabular">{xFormat(t)}</text>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={sy(y0)} y2={sy(y0)} stroke="#c3ccd4" />
        {yLabel && <text x={4} y={m.t + 2} fontSize={10} fill="#6b7a86" dominantBaseline="hanging">{yLabel}</text>}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={m.l} x2={m.l + iw} y1={sy(r.y)} y2={sy(r.y)} stroke="#6b7a86" strokeDasharray="4 4" />
            <text x={m.l + iw - 2} y={sy(r.y) - 4} fontSize={10} fill="#6b7a86" textAnchor="end">{r.label}</text>
          </g>
        ))}
        {paths.map((p) => p.area && <path key={`${p.id}-a`} d={p.area} fill={p.color} opacity={0.18} />)}
        {paths.map((p) => (
          <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round"
                strokeDasharray={p.dashed ? '5 4' : undefined} />
        ))}
        {markers.map((mk) => (
          <g key={mk.label}>
            <line x1={sx(mk.x)} x2={sx(mk.x)} y1={m.t} y2={m.t + ih} stroke={mk.color ?? '#c3ccd4'} />
            <text x={sx(mk.x) + 3} y={m.t + ih - 4} fontSize={10} fill="#4a5a66">{mk.label}</text>
          </g>
        ))}
        {directLabels && labels.map((p) => (
          <g key={`${p.id}-l`}>
            <circle cx={sx(p.last.x)} cy={sy(p.last.y)} r={3} fill={p.color} stroke="#ffffff" strokeWidth={2} />
            <text x={m.l + iw + 6} y={p.ly + 3.5} fontSize={10.5} fill="#4a5a66">{p.label}</text>
          </g>
        ))}
        {hover && (
          <g pointerEvents="none">
            <line x1={sx(hover.x)} x2={sx(hover.x)} y1={m.t} y2={m.t + ih} stroke="#4a5a66" strokeWidth={1} />
            {hover.rows.map((r) => (
              <circle key={r.id} cx={sx(r.p.x)} cy={sy(r.p.y)} r={4.5} fill={r.color} stroke="#ffffff" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-panel-2 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: Math.min(width - 170, sx(hover.x) + 10), top: 4 }}
        >
          <div className="mb-0.5 text-muted">{xFormat(hover.x)}</div>
          {hover.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
              <span className="text-ink-2">{r.label}</span>
              <span className="ml-auto pl-3 font-medium text-ink tabular">{yFormat(r.p.y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
