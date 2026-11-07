import { useState } from 'react';
import { View } from 'react-native';
import Text from './Text';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { C, STATION_COLOR } from '../lib/theme';
import { fmtMin, stationStatus } from '../lib/format';
import { waterCss } from '../lib/water';

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(160, e.nativeEvent.layout.width))];
}

/**
 * One y-axis line/area chart. series: [{ id, label, color, points: [{x, y}], area? }]
 * refLines: [{ y, label }]. A legend is shown for 2+ series (identity never by colour alone).
 */
export function LineChart({ series, height = 160, yDomain, refLines = [], xFormat = (x) => x, yFormat = (y) => y }) {
  const [width, onLayout] = useWidth();
  const m = { l: 34, r: 8, t: 8, b: 20 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const all = series.flatMap((s) => s.points).filter((p) => p.y != null);
  if (!all.length) return <View onLayout={onLayout} style={{ height }} />;
  const x0 = Math.min(...all.map((p) => p.x));
  const x1 = Math.max(...all.map((p) => p.x));
  const [y0, y1] = yDomain ?? [Math.min(0, ...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)) * 1.1 || 1];
  const sx = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y) => m.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;
  const ticks = [0, 0.5, 1].map((f) => y0 + (y1 - y0) * f);
  return (
    <View onLayout={onLayout}>
      {series.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          {series.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: s.color }} />
              <Text style={{ fontSize: 11, color: C.ink2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke="#e3e9f7" />
            <SvgText x={m.l - 4} y={sy(t) + 3} fontSize={9} fill={C.muted} textAnchor="end">{yFormat(t)}</SvgText>
          </G>
        ))}
        {refLines.map((r) => (
          <G key={r.label}>
            <Line x1={m.l} x2={m.l + iw} y1={sy(r.y)} y2={sy(r.y)} stroke={C.muted} strokeDasharray="4 4" />
            <SvgText x={m.l + iw} y={sy(r.y) - 3} fontSize={9} fill={C.muted} textAnchor="end">{r.label}</SvgText>
          </G>
        ))}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.y != null);
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
          return (
            <G key={s.id}>
              {s.area && <Path d={`${d}L${sx(pts.at(-1).x)},${sy(y0)}L${sx(pts[0].x)},${sy(y0)}Z`} fill={s.color} opacity={0.12} />}
              <Path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            </G>
          );
        })}
        <SvgText x={m.l} y={height - 4} fontSize={9} fill={C.muted}>{xFormat(x0)}</SvgText>
        <SvgText x={m.l + iw} y={height - 4} fontSize={9} fill={C.muted} textAnchor="end">{xFormat(x1)}</SvgText>
      </Svg>
    </View>
  );
}

export function Spark({ values, width = 110, height = 40, color = C.primary }) {
  const v = (values ?? []).filter((x) => x != null);
  if (v.length < 2) return null;
  const lo = Math.min(...v) - 2;
  const hi = Math.max(...v) + 2;
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * width},${height - ((y - lo) / (hi - lo || 1)) * height}`).join('');
  return (
    <Svg width={width} height={height}>
      <Path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.1} />
      <Path d={d} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

const GAUGE_COLOR = { good: C.good, warning: C.warning, critical: C.critical, info: C.primary };
const GAUGE_TEXT = { good: 'within limit', warning: 'near limit', critical: 'out of limit', info: '' };

/** Semicircle gauge; status is spelled out, never colour alone. */
export function Gauge({ label, value, unit, min, max, status = 'info', digits = 1 }) {
  const t = value == null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const R = 30;
  const pt = (a) => [40 + R * Math.cos(Math.PI * (1 - a)), 38 - R * Math.sin(Math.PI * (1 - a))];
  const [xa, ya] = pt(0);
  const [xb, yb] = pt(1);
  const [xv, yv] = pt(t);
  return (
    <View style={{ alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8, flex: 1, minWidth: 96 }}>
      <Svg width={80} height={44}>
        <Path d={`M${xa},${ya} A${R},${R} 0 0 1 ${xb},${yb}`} stroke="#e3e9f7" strokeWidth={7} fill="none" strokeLinecap="round" />
        {t > 0.01 && <Path d={`M${xa},${ya} A${R},${R} 0 0 1 ${xv},${yv}`} stroke={GAUGE_COLOR[status]} strokeWidth={7} fill="none" strokeLinecap="round" />}
      </Svg>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, marginTop: -8 }}>
        {value == null ? '—' : Number(value).toFixed(digits)}<Text style={{ fontSize: 10, color: C.muted }}> {unit}</Text>
      </Text>
      <Text style={{ fontSize: 11, color: C.ink2 }}>{label}</Text>
      {GAUGE_TEXT[status] ? <Text style={{ fontSize: 10, fontWeight: '600', color: GAUGE_COLOR[status] }}>{GAUGE_TEXT[status]}</Text> : null}
    </View>
  );
}

/** The DEM long profile as a river line: polluted reaches recoloured, stations, ETA chips. */
export function RiverDiagram({ live, forecast, onSelect, height = 140 }) {
  const [width, onLayout] = useWidth();
  if (!live) return <View style={{ height }} />;
  const ch = live.channel;
  const L = ch.chainage_m.at(-1);
  const zMax = Math.max(...ch.elev_m);
  const m = { l: 12, r: 12, t: 30, b: 26 };
  const sx = (v) => m.l + (v / L) * (width - m.l - m.r);
  const sy = (z) => m.t + (1 - Math.sqrt(Math.max(0, z) / zMax)) * (height - m.t - m.b);
  const fc = forecast?.stations ?? live.forecast?.stations ?? {};
  const segs = [];
  for (let i = 0; i < ch.chainage_m.length - 1; i += 2) {
    const j = Math.min(i + 2, ch.chainage_m.length - 1);
    segs.push(
      <Line key={i} x1={sx(ch.chainage_m[i])} y1={sy(ch.elev_m[i])} x2={sx(ch.chainage_m[j])} y2={sy(ch.elev_m[j])}
            stroke={waterCss(ch.turb_excess[i], ch.orp_deficit[i])} strokeWidth={5} strokeLinecap="round" />,
    );
  }
  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        {segs}
        {live.stations.map((st) => {
          const x = sx(st.chainage_m);
          const y = sy(st.elevation_m);
          const status = stationStatus(st);
          const eta = fc[st.id]?.arrival_s > 0 ? fc[st.id].arrival_s : null;
          return (
            <G key={st.id} onPress={() => onSelect?.(st.id)}>
              <Circle cx={x} cy={y} r={9} fill="#fff" stroke={status.color} strokeWidth={3} />
              <Circle cx={x} cy={y} r={3.5} fill={STATION_COLOR[st.id]} />
              {st.valve && !st.valve.open && <Rect x={x - 3} y={y + 11} width={6} height={6} fill="#a32626" />}
              <SvgText x={x} y={height - 6} fontSize={10} fill={C.ink2} textAnchor="middle">{st.id}</SvgText>
              {eta != null && (
                <G>
                  <Rect x={x - 28} y={Math.max(2, y - 30)} width={56} height={16} rx={8} fill={C.advisory} />
                  <SvgText x={x} y={Math.max(2, y - 30) + 11.5} fontSize={9.5} fontWeight="700" fill={C.ink} textAnchor="middle">{fmtMin(eta)}</SvgText>
                </G>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
