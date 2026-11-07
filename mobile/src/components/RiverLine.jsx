import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import Text from './Text';
import { tickFeel } from './motion';
import { stationStatus } from '../lib/format';
import { C } from '../lib/theme';
import { waterCss } from '../lib/water';

const HEIGHT = 112;
const TOP = 16;
const DROP = 52;    // how far the line falls on screen from source to the lowest point

/**
 * The river from the mountain down to the town, with the water points as stops on it.
 * The stops are evenly spaced so each is easy to tap; height and water colour are real.
 */
export default function RiverLine({ live, selected, onSelect, mine }) {
  const [w, setW] = useState(320);
  const ch = live?.channel;
  const stops = [...(live?.stations ?? [])].sort((a, b) => a.chainage_m - b.chainage_m);
  if (!ch || !stops.length) return <View style={{ height: HEIGHT }} />;

  const pad = 30;
  const zMax = Math.max(...ch.elev_m);
  const y = (z) => TOP + (1 - Math.sqrt(Math.max(0, z) / zMax)) * DROP;
  const stopX = stops.map((_, i) => pad + (i * (w - pad * 2)) / (stops.length - 1));
  const points = [[ch.chainage_m[0], 4], ...stops.map((st, i) => [st.chainage_m, stopX[i]]), [ch.chainage_m.at(-1), w - 4]];
  const x = (c) => {
    const i = Math.max(0, points.findIndex(([at]) => at >= c) - 1);
    const [a, xa] = points[i];
    const [b, xb] = points[i + 1];
    return xa + ((c - a) / (b - a || 1)) * (xb - xa);
  };

  const lines = [];
  for (let i = 0; i < ch.chainage_m.length - 1; i += 3) {
    const j = Math.min(i + 3, ch.chainage_m.length - 1);
    lines.push(<Line key={i} x1={x(ch.chainage_m[i])} y1={y(ch.elev_m[i])} x2={x(ch.chainage_m[j])} y2={y(ch.elev_m[j])}
                     stroke={waterCss(ch.turb_excess[i], ch.orp_deficit[i])} strokeWidth={7} strokeLinecap="round" />);
  }

  return (
    <View style={{ height: HEIGHT }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={HEIGHT} style={StyleSheet.absoluteFill}>{lines}</Svg>
      {stops.map((st, i) => {
        const on = st.id === selected;
        const status = stationStatus(st);
        const size = on ? 26 : 18;
        const left = stopX[i] - 26;
        return (
          <Pressable key={st.id} onPress={() => { tickFeel(); onSelect(st.id); }} style={[s.stop, { left }]}
                     accessibilityRole="button" accessibilityLabel={`${st.name}, ${status.label} risk`} accessibilityState={{ selected: on }}>
            <View style={[s.bead, { top: y(st.elevation_m) - size / 2, left: 26 - size / 2, width: size, height: size, borderRadius: size / 2, borderColor: on && status.label === 'Low' ? C.primary : status.color, borderWidth: on ? 6 : 4 }]} />
            <Text style={[s.label, on && s.labelOn]}>{st.id === mine ? '★ ' : ''}{st.id}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  stop: { position: 'absolute', top: 0, width: 52, height: HEIGHT },
  bead: { position: 'absolute', backgroundColor: '#fff' },
  label: { position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: C.muted },
  labelOn: { color: C.primary, fontWeight: '600' },
});
