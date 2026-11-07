import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Text from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { Contours } from '../components/Art';
import { Button, Empty, Screen, StatusBadge } from '../components/ui';
import { tickFeel, useReducedMotion } from '../components/motion';
import { useData } from '../lib/data';
import { fmt, fmtMin } from '../lib/format';
import { C, FONT, shadow } from '../lib/theme';
import { rgbCss, waterAt, waterCss, waterLabel, waterRgb } from '../lib/water';

const PANEL = 214;
const STEP = 0.125;

/** The river as a gentle S down the screen; t runs from the first stop (0) to the last. */
const curve = (t, W, top, gap) => [W / 2 + Math.min(92, W * 0.24) * Math.sin(t * 2.1 + 0.5), top + t * gap];

function Ripple({ x, y, n }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, n]);
  return (
    <Animated.View pointerEvents="none" style={[s.ripple, { left: x - 30, top: y - 30, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.8] }) }] }]} />
  );
}

export default function Journey() {
  const { live } = useData();
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [p] = useState(() => new Animated.Value(0));
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const run = useRef(0);

  useEffect(() => () => { run.current += 1; p.stopAnimation(); }, [p]);

  if (!live) return <Screen edges={['top']}><Empty text="Loading…" /></Screen>;
  const stops = [...live.stations].sort((a, b) => a.chainage_m - b.chainage_m);
  const legSeconds = (i) => live.reaches.find((r) => r.reach.startsWith(`${stops[i].id}→`))?.travel_time_s ?? 0;
  const elapsed = (i) => stops.slice(0, i).reduce((sum, _, k) => sum + legSeconds(k), 0);
  const last = stops.length - 1;
  const total = elapsed(last);
  const km = (stops[last].chainage_m - stops[0].chainage_m) / 1000;

  const top = inset.top + 96;
  const gap = (H - PANEL - inset.bottom - top - 54) / last;
  const samples = [];
  for (let t = 0; t <= last + 1e-6; t += STEP) samples.push(t);
  const dots = samples.map((t) => curve(t, W, top, gap));
  const moveX = p.interpolate({ inputRange: samples, outputRange: dots.map((d) => d[0]) });
  const moveY = p.interpolate({ inputRange: samples, outputRange: dots.map((d) => d[1]) });

  const go = async (from) => {
    const me = run.current + 1;
    run.current = me;
    setPlaying(true);
    setDone(false);
    for (let i = from; i < last; i += 1) {
      const leg = legSeconds(i);
      const ms = reduced ? 1 : Math.min(2600, Math.max(1100, leg / 5));
      await new Promise((end) => Animated.timing(p, { toValue: i + 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(end));
      if (run.current !== me) return;
      setAt(i + 1);
      tickFeel();
      await new Promise((end) => setTimeout(end, i + 1 === last ? 0 : 1300));
      if (run.current !== me) return;
    }
    setPlaying(false);
    setDone(true);
  };

  const restart = () => { p.setValue(0); setAt(0); go(0); };
  const jump = (i) => {
    run.current += 1;
    setPlaying(false);
    setDone(i === last);
    setAt(i);
    tickFeel();
    Animated.timing(p, { toValue: i, duration: reduced ? 1 : 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const st = stops[at];
  const [te, od] = waterAt(live, st.chainage_m);
  const rgb = waterRgb(te, od);
  const lines = [];
  for (let i = 0; i < dots.length - 1; i += 1) {
    const t = samples[i];
    const near = stops[Math.min(last, Math.round(t))];
    const [a, b] = waterAt(live, near.chainage_m);
    lines.push(<Line key={t} x1={dots[i][0]} y1={dots[i][1]} x2={dots[i + 1][0]} y2={dots[i + 1][1]} stroke={waterCss(a, b)} strokeWidth={13} strokeLinecap="round" />);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#e8effe' }}>
      <Contours width={W} height={H} color={C.primary} opacity={0.12} />

      <View style={[s.head, { paddingTop: inset.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={C.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={FONT.title}>Follow a drop</Text>
          <Text style={[FONT.small, { fontSize: 13 }]}>{fmt(km, 1)} km of river, about {fmtMin(total)} of flow</Text>
        </View>
      </View>

      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">{lines}</Svg>

      {stops.map((x, i) => {
        const [cx, cy] = curve(i, W, top, gap);
        const right = cx < W / 2;
        const on = i === at;
        // Keep the label in the open corner, clear of the line coming in and going out
        const leaving = curve(i + 0.2, W, top, gap)[0] - cx;
        const lift = right ? 6 : leaving < 0 ? -14 : 24;
        return (
          <Pressable key={x.id} onPress={() => jump(i)} style={[s.stop, { left: cx - 24, top: cy - 24 }]} accessibilityRole="button" accessibilityLabel={`${x.name}, ${fmt(x.elevation_m, 0)} metres`}>
            <View style={[s.bead, on && s.beadOn]} />
            <View pointerEvents="none" style={[s.tag, { top: lift }, right ? { left: 46 } : { right: 46, alignItems: 'flex-end' }]}>
              <Text style={[s.tagId, on && { color: C.primary }]}>{x.id}</Text>
              <Text style={FONT.small}>{fmt(x.elevation_m, 0)} m</Text>
            </View>
          </Pressable>
        );
      })}

      <Ripple x={curve(at, W, top, gap)[0]} y={curve(at, W, top, gap)[1]} n={at} />

      <Animated.View pointerEvents="none" style={[s.drop, { transform: [{ translateX: moveX }, { translateY: moveY }] }]}>
        <Svg width={34} height={46} viewBox="0 0 52 72" style={{ marginLeft: -17, marginTop: -30 }}>
          <Path d="M26 2C18 15 4 30 4 45a22 22 0 0 0 44 0C48 30 34 15 26 2z" fill={rgbCss(rgb, 0.85)} stroke="#fff" strokeWidth={4} />
        </Svg>
      </Animated.View>

      <View style={[s.panel, { paddingBottom: inset.bottom + 14 }]}>
        <Text style={FONT.small}>{at === 0 ? 'Start of the journey' : `${fmtMin(elapsed(at))} after ${stops[0].id}`}</Text>
        <Text style={[FONT.h2, { fontSize: 18, lineHeight: 24 }]} numberOfLines={1}>{st.name}</Text>
        <View style={s.facts}>
          <StatusBadge st={st} />
          <Text style={FONT.small}>{waterLabel(te, od)}, health {st.wqhi.score}</Text>
        </View>
        <Text style={[FONT.small, { color: C.ink2 }]}>
          {done ? `That took about ${fmtMin(total)}. A spill travels about as fast, so this is the time early warning can buy.`
            : st.population ? `${st.population.toLocaleString()} people use this water.` : 'A monitoring point on the river.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button title={done ? 'Play again' : playing ? 'Flowing…' : at === 0 ? 'Start the drop' : 'Keep going'} icon={done ? 'refresh' : 'play'} disabled={playing}
                  onPress={() => (done || at === last ? restart() : go(at))} style={{ flex: 1 }} />
          <Button title="Details" kind="ghost" icon="list" onPress={() => router.push(`/point/${st.id}`)} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  stop: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bead: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 4, borderColor: C.primary },
  beadOn: { width: 26, height: 26, borderRadius: 13, borderWidth: 7 },
  tag: { position: 'absolute', width: 90 },
  tagId: { fontSize: 13, fontWeight: '600', color: C.ink },
  ripple: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: C.primary },
  drop: { position: 'absolute', left: 0, top: 0 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: PANEL, gap: 5, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, ...shadow },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
