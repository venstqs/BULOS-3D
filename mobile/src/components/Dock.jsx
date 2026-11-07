import { useEffect, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Logo from './Logo';
import Text from './Text';
import WaterDisc from './WaterDisc';
import { tapFeel, tickFeel, useReducedMotion } from './motion';
import { useData } from '../lib/data';
import { DOCK_H, HUB, HUB_INNER, dockBottom, hubY } from '../lib/dock';
import { fmtMin, quality, stationStatus } from '../lib/format';
import { C, shadow } from '../lib/theme';
import { riverSummary, waterRgb } from '../lib/water';

const HINT_KEY = 'bulos-hub-hint-seen';
const ITEM = 78;

// The most used sections sit lowest on the dial, closest to the thumb.
const SECTIONS = [
  { name: 'index', label: 'Home', icon: 'home', at: 120 },
  { name: 'map', label: '3D map', icon: 'map', at: 60 },
  { name: 'points', label: 'Points', icon: 'water', at: 180 },
  { name: 'forecast', label: 'Forecast', icon: 'pulse', at: 0 },
  { name: 'maintenance', label: 'Tasks', icon: 'calendar', at: 240 },
  { name: 'more', label: 'More', icon: 'grid', at: 300 },
];
const offset = (at, R) => [Math.cos((at * Math.PI) / 180) * R, Math.sin((at * Math.PI) / 180) * R];

/** One live line for each section, shown in the middle of the dial. */
function factFor(name, sum, layer) {
  if (!sum) return 'Connecting to the twin';
  const n = sum.attention.length;
  switch (name) {
    case 'index': return `Water health ${sum.avg}, ${quality(sum.avg)[0].toLowerCase()}`;
    case 'map': return `Showing the ${layer === 'none' ? 'plain map' : `${layer} layer`}`;
    case 'points': return n ? `${n} of ${sum.total} need attention` : `All ${sum.total} are low risk`;
    case 'forecast': return sum.next ? `${sum.next.id} in ${fmtMin(sum.nextEta)}` : 'No arrivals in 4 hours';
    case 'maintenance': return sum.urgent.length ? `${sum.urgent.length} need doing now` : `${sum.open.length} open`;
    default: return 'Drills, alerts, reports';
  }
}

function HubRing({ pct, color }) {
  const r = HUB / 2 - 4;
  const length = 2 * Math.PI * r;
  return (
    <Svg width={HUB} height={HUB} style={StyleSheet.absoluteFill}>
      <Circle cx={HUB / 2} cy={HUB / 2} r={r} stroke="#e4ecff" strokeWidth={4} fill="none" />
      <Circle cx={HUB / 2} cy={HUB / 2} r={r} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round"
              strokeDasharray={`${length * pct} ${length}`} rotation={-90} originX={HUB / 2} originY={HUB / 2} />
    </Svg>
  );
}

/** A slow ring leaving the button, only while something on the river needs attention. */
function Alarm({ color, on, reduced }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on || reduced) return undefined;
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1700, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); a.setValue(0); };
  }, [a, on, reduced]);
  if (!on) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: HUB / 2, borderWidth: 3, borderColor: color,
      opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
  );
}

function Slot({ icon, label, value, on, onPress, alert }) {
  return (
    <Pressable onPress={onPress} style={s.slot} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} accessibilityState={{ selected: on }}>
      <Ionicons name={on ? icon : `${icon}-outline`} size={21} color={on ? C.primary : C.ink2} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[s.slotLabel, on && { color: C.primary }]} numberOfLines={1}>{label}</Text>
        <Text style={[s.slotValue, alert && { color: '#a32626' }]} numberOfLines={1}>{value}</Text>
      </View>
    </Pressable>
  );
}

function DialItem({ item, x, y, cx, cy, hubDy, a, active, hover, badge, onChoose, onHover }) {
  return (
    <Animated.View style={[s.item, { left: cx + x - ITEM / 2, top: cy + y - ITEM / 2, opacity: a, transform: [
      { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-x, 0] }) },
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [hubDy - y, 0] }) },
      { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
    ] }]}>
      <Pressable onPress={() => onChoose(item.name)} onPressIn={() => onHover(item.name)} onPressOut={() => onHover(null)}
                 style={[s.itemFace, active && s.itemActive, hover && s.itemHover]}
                 accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }}>
        <Ionicons name={item.icon} size={24} color={active ? '#fff' : C.primary} />
        <Text style={[s.itemLabel, active && { color: '#fff' }]}>{item.label}</Text>
      </Pressable>
      {badge > 0 && <View style={s.badge} pointerEvents="none"><Text style={s.badgeText}>{badge}</Text></View>}
    </Animated.View>
  );
}

/** Tap the round button to open or close, or slide from it onto a section and let go. */
function makeGesture(press, setHover) {
  let now = {};
  let moved = false;
  let over = null;
  const settle = () => Animated.spring(press, { toValue: 1, speed: 30, bounciness: 8, useNativeDriver: true }).start();
  const { panHandlers } = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      moved = false;
      over = null;
      Animated.spring(press, { toValue: 0.92, speed: 40, bounciness: 0, useNativeDriver: true }).start();
    },
    onPanResponderMove: (_, g) => {
      if (!moved) {
        if (Math.hypot(g.dx, g.dy) < 12) return;
        moved = true;
        if (!now.shown) now.openDial();
      }
      const next = now.track(g.moveX, g.moveY);
      if (next !== over) {
        over = next;
        setHover(next);
        if (next) tickFeel();
      }
    },
    onPanResponderRelease: () => {
      settle();
      if (!moved) { if (now.shown) now.closeDial(); else now.openDial(); return; }
      setHover(null);
      if (over) now.choose(over);
    },
    onPanResponderTerminate: () => { settle(); setHover(null); },
  });
  return { handlers: panHandlers, update: (next) => { now = next; }, now: () => now };
}

/** Six sections in one circle. Tap the round button, or hold it and slide onto a section. */
export default function Dock({ state, navigateToTab }) {
  const { live, forecast, tasks, heatIndex } = useData();
  const { width: W, height: winH } = useWindowDimensions();
  const inset = useSafeAreaInsets().bottom;
  const reduced = useReducedMotion();
  const [areaH, setAreaH] = useState(winH);
  const [shown, setShown] = useState(false);
  const [hover, setHover] = useState(null);
  const [hint, setHint] = useState(false);
  const [typing, setTyping] = useState(false);
  const [veil] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(1));
  const [items] = useState(() => SECTIONS.map(() => new Animated.Value(0)));

  const current = state.routes[state.index].name;
  const section = SECTIONS.find((x) => x.name === current) ?? SECTIONS[0];
  const sum = riverSummary(live, forecast, tasks);
  const worstBand = sum ? stationStatus(sum.worst) : null;
  const calm = !sum || (worstBand.label === 'Low' && !sum.attention.length);
  // A plume on its way is a warning even while every point still reads low
  const ringColor = calm ? C.primary : worstBand.label === 'Low' ? C.serious : worstBand.color;

  const R = Math.min(128, (W - ITEM - 20) / 2);
  const cx = W / 2;
  const hubCy = areaH - hubY(inset);
  const cy = hubCy - HUB / 2 - 26 - R * 0.866 - ITEM / 2;
  const disc = 2 * R - ITEM - 22;

  const go = (name) => {
    const route = state.routes.find((r) => r.name === name);
    if (route && name !== current) navigateToTab(route.key);
  };

  const openDial = () => {
    setShown(true);
    setHint(false);
    AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
    tapFeel();
    Animated.timing(veil, { toValue: 1, duration: reduced ? 1 : 200, useNativeDriver: true }).start();
    if (reduced) items.forEach((a) => a.setValue(1));
    else Animated.stagger(26, items.map((a) => Animated.spring(a, { toValue: 1, speed: 15, bounciness: 7, useNativeDriver: true }))).start();
  };

  const closeDial = () => {
    setHover(null);
    Animated.parallel([
      Animated.timing(veil, { toValue: 0, duration: reduced ? 1 : 150, useNativeDriver: true }),
      ...items.map((a) => Animated.timing(a, { toValue: 0, duration: reduced ? 1 : 140, easing: Easing.in(Easing.quad), useNativeDriver: true })),
    ]).start(({ finished }) => { if (finished) setShown(false); });
  };

  const choose = (name) => { tickFeel(); go(name); closeDial(); };

  // Which section is under the finger while it slides from the button
  const track = (x, y) => {
    let best = null;
    let far = 58;
    SECTIONS.forEach((item) => {
      const [ox, oy] = offset(item.at, R);
      const d = Math.hypot(x - (cx + ox), y - (cy + oy));
      if (d < far) { far = d; best = item.name; }
    });
    return best;
  };

  // The gesture is made once; it reads the latest values through this
  const [gesture] = useState(() => makeGesture(press, setHover));
  useEffect(() => {
    gesture.update({ shown, openDial, closeDial, choose, track });
  });

  useEffect(() => {
    if (!shown) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { gesture.now().closeDial(); return true; });
    return () => sub.remove();
  }, [shown, gesture]);

  // Stay out of the way of the keyboard
  useEffect(() => {
    const on = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const off = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => { on.remove(); off.remove(); };
  }, []);

  // Teach the button once, after the opening has finished
  useEffect(() => {
    let timer;
    AsyncStorage.getItem(HINT_KEY).then((seen) => {
      if (!seen) timer = setTimeout(() => setHint(true), 5400);
    }).catch(() => {});
    return () => clearTimeout(timer);
  }, []);

  const fact = hover ? SECTIONS.find((x) => x.name === hover) : null;
  const n = sum?.attention.length ?? 0;
  const rgb = sum ? waterRgb(sum.te, sum.od) : undefined;
  const hubLabel = sum ? `Open all sections. Water health ${sum.avg}.` : 'Open all sections.';

  if (typing) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      {shown && (
        <Animated.View style={[StyleSheet.absoluteFill, s.veil, { opacity: veil }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDial} accessibilityRole="button" accessibilityLabel="Close sections" />
        </Animated.View>
      )}

      {shown && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: cx - disc / 2, top: cy - disc / 2, opacity: veil,
            transform: [{ scale: veil.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <WaterDisc size={disc} rgb={rgb}>
              {fact ? (
                <View style={s.discText}>
                  <Text style={s.discTitle}>{fact.label}</Text>
                  <Text style={s.discFact} numberOfLines={3}>{factFor(fact.name, sum, heatIndex)}</Text>
                </View>
              ) : (
                <View style={s.discText}>
                  <Text style={s.discNumber}>{calm ? sum?.avg ?? '—' : sum.worst.wqhi.score}</Text>
                  <Text style={s.discFact} numberOfLines={2}>{calm ? 'Water health' : `${sum.worst.id} health`}{'\n'}{n ? `${n} need attention` : 'in simulation'}</Text>
                </View>
              )}
            </WaterDisc>
          </Animated.View>
          {SECTIONS.map((item, i) => {
            const [x, y] = offset(item.at, R);
            const badge = item.name === 'maintenance' ? sum?.urgent.length : item.name === 'points' ? n : 0;
            return <DialItem key={item.name} item={item} x={x} y={y} cx={cx} cy={cy} hubDy={hubCy - cy} a={items[i]}
                             active={item.name === current} hover={hover === item.name} badge={badge} onChoose={choose} onHover={setHover} />;
          })}
        </View>
      )}

      {hint && !shown && (
        <Pressable onPress={() => { setHint(false); AsyncStorage.setItem(HINT_KEY, '1').catch(() => {}); }}
                   style={[s.hint, { bottom: hubY(inset) + HUB / 2 + 14 }]} accessibilityRole="button" accessibilityLabel="Dismiss tip">
          <Text style={s.hintTitle}>Everything is in this circle</Text>
          <Text style={s.hintText}>Tap it, or hold and slide to a section.</Text>
          <View style={s.hintTail} />
        </Pressable>
      )}

      <View pointerEvents="box-none" style={[s.capsule, { bottom: dockBottom(inset) }]}>
        <Slot icon="home" label="Home" value={sum ? `Health ${sum.avg}` : 'Connecting'} on={current === 'index'} onPress={() => { tickFeel(); go('index'); }} />
        <View style={{ width: HUB + 8 }} />
        <Slot icon="map" label="3D map" value={n ? `${n} alert${n > 1 ? 's' : ''}` : 'Low risk'} alert={n > 0} on={current === 'map'} onPress={() => { tickFeel(); go('map'); }} />
      </View>

      <Animated.View {...gesture.handlers} style={[s.hub, { bottom: hubY(inset) - HUB / 2, left: cx - HUB / 2, transform: [{ scale: press }] }]}
                     accessible accessibilityRole="button" accessibilityLabel={hubLabel} accessibilityState={{ expanded: shown }}
                     onAccessibilityTap={() => (shown ? closeDial() : openDial())}>
        <Alarm color={ringColor} on={!calm && !shown} reduced={reduced} />
        <View style={s.hubFace}>
          <HubRing pct={(sum?.avg ?? 100) / 100} color={ringColor} />
          <Animated.View style={{ opacity: veil.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
            {current === 'index' ? <Logo size={HUB_INNER} /> : (
              <View style={s.hubInner}><Ionicons name={section.icon} size={25} color="#fff" /></View>
            )}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[s.hubClose, { opacity: veil }]}>
            <View style={s.hubInner}><Ionicons name="close" size={28} color="#fff" /></View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  veil: { backgroundColor: 'rgba(255,255,255,0.96)' },
  capsule: { position: 'absolute', left: 14, right: 14, height: DOCK_H, borderRadius: DOCK_H / 2, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, ...shadow },
  slot: { flex: 1, height: DOCK_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 },
  slotLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  slotValue: { fontSize: 12, color: C.muted, marginTop: 1 },
  hub: { position: 'absolute', width: HUB, height: HUB },
  hubFace: { width: HUB, height: HUB, borderRadius: HUB / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  hubInner: { width: HUB_INNER, height: HUB_INNER, borderRadius: HUB_INNER / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  hubClose: { position: 'absolute', left: (HUB - HUB_INNER) / 2, top: (HUB - HUB_INNER) / 2 },
  item: { position: 'absolute', width: ITEM, height: ITEM },
  itemFace: { width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 2, ...shadow },
  itemActive: { backgroundColor: C.primary },
  itemHover: { borderWidth: 2.5, borderColor: C.primary, transform: [{ scale: 1.1 }] },
  itemLabel: { fontSize: 12, fontWeight: '600', color: C.ink },
  badge: { position: 'absolute', right: 2, top: 2, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: C.critical, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  discText: { alignItems: 'center', paddingHorizontal: 16 },
  discNumber: { fontSize: 44, fontWeight: '700', color: '#fff', lineHeight: 50 },
  discTitle: { fontSize: 19, fontWeight: '700', color: '#fff', marginBottom: 3 },
  discFact: { fontSize: 13, color: '#fff', textAlign: 'center', lineHeight: 17 },
  hint: { position: 'absolute', alignSelf: 'center', backgroundColor: C.ink, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 11, maxWidth: 280 },
  hintTitle: { fontSize: 14, fontWeight: '600', color: '#fff', textAlign: 'center' },
  hintText: { fontSize: 13, color: '#d9e3ff', marginTop: 2, textAlign: 'center' },
  hintTail: { position: 'absolute', bottom: -6, alignSelf: 'center', width: 14, height: 14, backgroundColor: C.ink, transform: [{ rotate: '45deg' }] },
});
