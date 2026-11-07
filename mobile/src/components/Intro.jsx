import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import Text from './Text';
import { tapFeel, tickFeel } from './motion';
import { HUB_INNER, hubY } from '../lib/dock';
import { C } from '../lib/theme';

const LOGO = 132;
const RIVER_H = 44;
const STOPS = [0.12, 0.31, 0.5, 0.69, 0.88];     // the five water points, spring to town
const FALL = 780;
const RIVER_AT = 1050;                           // after the drop lands
const RIVER_MS = 1150;
const clamp = { extrapolate: 'clamp' };
const native = (value, toValue, duration, easing, delay = 0) => Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver: true });

/** How high the river sits at a point along it, from 0 to 1, falling from left to right. */
const riverY = (t) => 8 + t * 22 + Math.sin(t * 7) * 5;

/**
 * A drop falls and lands, and the ripple becomes the logo. The name rises, the river draws itself
 * from the spring to the town with its five water points, and the logo flies down to become
 * the round button. The opening also shows where the main control lives. Tap to skip it.
 */
export default function Intro({ ready }) {
  const { width: W, height: H } = useWindowDimensions();
  const inset = useSafeAreaInsets().bottom;
  const [done, setDone] = useState(false);
  const [v] = useState(() => ({
    drop: new Animated.Value(0), ring: new Animated.Value(0), logo: new Animated.Value(0), mark: new Animated.Value(0),
    word: new Animated.Value(0), tag: new Animated.Value(0), river: new Animated.Value(0), stops: STOPS.map(() => new Animated.Value(0)),
    fly: new Animated.Value(0), sheet: new Animated.Value(1), rest: new Animated.Value(1),
  }));
  const run = useRef(null);
  const cy = H * 0.38;
  const riverW = Math.min(W - 72, 320);

  useEffect(() => {
    let alive = true;
    const feels = [];
    const end = () => { if (alive) setDone(true); };
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduced) => {
      if (!alive) return;
      if (reduced) {
        [v.drop, v.ring, v.logo, v.mark, v.word, v.tag, v.river, ...v.stops].forEach((a) => a.setValue(1));
        run.current = native(v.sheet, 0, 260, Easing.linear, 900);
        run.current.start(end);
        return;
      }
      feels.push(setTimeout(tapFeel, FALL));
      STOPS.forEach((t) => feels.push(setTimeout(tickFeel, FALL + RIVER_AT + t * RIVER_MS)));
      run.current = Animated.sequence([
        native(v.drop, 1, FALL, Easing.in(Easing.quad)),
        Animated.parallel([
          native(v.ring, 1, 1500, Easing.out(Easing.cubic)),
          Animated.spring(v.logo, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
          native(v.mark, 1, 300, Easing.out(Easing.back(2)), 210),
          native(v.word, 1, 380, Easing.out(Easing.cubic), 480),
          native(v.tag, 1, 340, Easing.out(Easing.cubic), 720),
          native(v.river, 1, RIVER_MS, Easing.inOut(Easing.quad), RIVER_AT),
          ...v.stops.map((a, i) => Animated.spring(a, { toValue: 1, friction: 5, tension: 120, delay: RIVER_AT + STOPS[i] * RIVER_MS, useNativeDriver: true })),
        ]),
        Animated.delay(520),
        Animated.parallel([
          native(v.rest, 0, 220, Easing.linear),
          native(v.fly, 1, 640, Easing.inOut(Easing.cubic), 120),
          native(v.sheet, 0, 340, Easing.linear, 460),
        ]),
      ]);
      run.current.start(end);
    });
    return () => { alive = false; feels.forEach(clearTimeout); run.current?.stop(); };
  }, [v]);

  const skip = () => {
    run.current?.stop();
    native(v.sheet, 0, 180, Easing.linear).start(() => setDone(true));
  };

  if (done) return null;
  const landing = H - hubY(inset) - cy;
  const ring = (from) => ({
    opacity: v.ring.interpolate({ inputRange: [from, from + 0.03, 1], outputRange: [0, 0.5, 0], ...clamp }),
    transform: [{ scale: v.ring.interpolate({ inputRange: [from, 1], outputRange: [0.3, 2.9], ...clamp }) }],
  });
  const rise = (a) => ({ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] });
  let river = '';
  for (let t = 0; t <= 1.0001; t += 0.04) river += `${river ? 'L' : 'M'}${(t * riverW).toFixed(1)} ${riverY(t).toFixed(1)}`;
  const wordsTop = cy + LOGO / 2 + 24;

  return (
    <Pressable onPress={skip} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Skip the opening">
      <StatusBar style="dark" />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: v.sheet }]} />

      {[0, 0.13, 0.26].map((from) => (
        <Animated.View key={from} pointerEvents="none" style={[s.ring, { left: W / 2 - LOGO / 2, top: cy - LOGO / 2 }, ring(from)]} />
      ))}

      <Animated.View pointerEvents="none" style={[s.at, { left: W / 2 - 26, top: cy - 36, opacity: v.logo.interpolate({ inputRange: [0, 0.04], outputRange: [1, 0], ...clamp }), transform: [
        { translateY: v.drop.interpolate({ inputRange: [0, 1], outputRange: [-cy - 90, 0] }) },
        { scaleY: v.drop.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1.05, 1.28, 0.92] }) },
      ] }]}>
        <Svg width={52} height={72} viewBox="0 0 52 72">
          <Path d="M26 2C18 15 4 30 4 45a22 22 0 0 0 44 0C48 30 34 15 26 2z" fill={C.primary} />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={{ opacity: v.rest }}>
        <Animated.View style={[s.words, { top: wordsTop }, rise(v.word)]}>
          <Text key={ready ? 'fonts' : 'system'} style={s.name}>Bulos 3D</Text>
        </Animated.View>
        <Animated.View style={[s.words, { top: wordsTop + 46 }, rise(v.tag)]}>
          <Text key={ready ? 'fonts' : 'system'} style={s.tag}>Water quality digital twin</Text>
        </Animated.View>

        <View style={[s.river, { top: wordsTop + 88, left: (W - riverW) / 2, width: riverW }]}>
          <Svg width={riverW} height={RIVER_H}><Path d={river} stroke="#33a8ff" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
          {/* A white cover slides off the line, so the river appears to flow in from the spring */}
          <Animated.View style={[s.cover, { width: riverW + 8, transform: [{ translateX: v.river.interpolate({ inputRange: [0, 1], outputRange: [-4, riverW + 8] }) }] }]} />
          {STOPS.map((t, i) => (
            <Animated.View key={t} style={[s.stop, { left: t * riverW - 8, top: riverY(t) - 8, opacity: v.stops[i], transform: [{ scale: v.stops[i] }] }]} />
          ))}
        </View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[s.at, { left: W / 2 - LOGO / 2, top: cy - LOGO / 2, width: LOGO, height: LOGO, transform: [
        { translateY: v.fly.interpolate({ inputRange: [0, 1], outputRange: [0, landing] }) },
        { scale: v.fly.interpolate({ inputRange: [0, 1], outputRange: [1, HUB_INNER / LOGO] }) },
      ] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.logo.interpolate({ inputRange: [0, 0.04], outputRange: [0, 1], ...clamp }), transform: [{ scale: v.logo.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }] }]}>
          <Svg width={LOGO} height={LOGO} viewBox="0 0 64 64">
            <Circle cx="32" cy="32" r="32" fill={C.primary} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.mark, transform: [{ scale: v.mark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
          <Svg width={LOGO} height={LOGO} viewBox="0 0 64 64">
            <Path d="M32 9.5C25 19 16 27.6 16 37.5a16 16 0 0 0 32 0C48 27.6 39 19 32 9.5z" fill="#fff" />
            <Path d="M22.5 40c3.2-2.6 6.3-2.6 9.5 0s6.3 2.6 9.5 0" fill="none" stroke={C.primary} strokeWidth={3.4} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  at: { position: 'absolute' },
  ring: { position: 'absolute', width: LOGO, height: LOGO, borderRadius: LOGO / 2, borderWidth: 2, borderColor: C.primary },
  words: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  name: { fontSize: 34, lineHeight: 42, fontWeight: '700', color: C.ink, letterSpacing: -0.6 },
  tag: { fontSize: 15, lineHeight: 20, color: C.ink2 },
  river: { position: 'absolute', height: RIVER_H, overflow: 'hidden' },
  cover: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  stop: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 4, borderColor: C.primary },
});
