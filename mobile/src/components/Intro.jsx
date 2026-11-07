import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import Text from './Text';
import { tapFeel } from './motion';
import { HUB_INNER, hubY } from '../lib/dock';
import { C } from '../lib/theme';

const LOGO = 132;
const clamp = { extrapolate: 'clamp' };
const native = (value, toValue, duration, easing, delay = 0) => Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver: true });

/**
 * A drop falls and lands, the ripple becomes the logo, and the logo flies down
 * to become the round button. The opening also shows where the main control lives.
 */
export default function Intro({ ready }) {
  const { width: W, height: H } = useWindowDimensions();
  const inset = useSafeAreaInsets().bottom;
  const [done, setDone] = useState(false);
  const [v] = useState(() => ({
    drop: new Animated.Value(0), ring: new Animated.Value(0), logo: new Animated.Value(0), mark: new Animated.Value(0),
    word: new Animated.Value(0), fly: new Animated.Value(0), sheet: new Animated.Value(1),
  }));
  const run = useRef(null);
  const cy = H * 0.42;

  useEffect(() => {
    let alive = true;
    let feel;
    const end = () => { if (alive) setDone(true); };
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduced) => {
      if (!alive) return;
      if (reduced) {
        [v.drop, v.ring, v.logo, v.mark, v.word].forEach((a) => a.setValue(1));
        run.current = native(v.sheet, 0, 260, Easing.linear, 700);
        run.current.start(end);
        return;
      }
      feel = setTimeout(tapFeel, 520);
      run.current = Animated.sequence([
        native(v.drop, 1, 520, Easing.in(Easing.quad)),
        Animated.parallel([
          native(v.ring, 1, 860, Easing.out(Easing.cubic)),
          Animated.spring(v.logo, { toValue: 1, friction: 6, tension: 95, useNativeDriver: true }),
          native(v.mark, 1, 240, Easing.out(Easing.back(2)), 150),
          native(v.word, 1, 300, Easing.out(Easing.cubic), 340),
        ]),
        Animated.parallel([
          native(v.fly, 1, 540, Easing.inOut(Easing.cubic), 180),
          native(v.word, 0, 160, Easing.linear),
          native(v.sheet, 0, 300, Easing.linear, 420),
        ]),
      ]);
      run.current.start(end);
    });
    return () => { alive = false; clearTimeout(feel); run.current?.stop(); };
  }, [v]);

  const skip = () => {
    run.current?.stop();
    native(v.sheet, 0, 180, Easing.linear).start(() => setDone(true));
  };

  if (done) return null;
  const landing = H - hubY(inset) - cy;
  const ring = (from) => ({
    opacity: v.ring.interpolate({ inputRange: [from, from + 0.03, 1], outputRange: [0, 0.5, 0], ...clamp }),
    transform: [{ scale: v.ring.interpolate({ inputRange: [from, 1], outputRange: [0.3, 2.5], ...clamp }) }],
  });
  return (
    <Pressable onPress={skip} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Skip the opening">
      <StatusBar style="dark" />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: v.sheet }]} />

      {[0, 0.16].map((from) => (
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

      <Animated.View pointerEvents="none" style={[s.words, { top: cy + LOGO / 2 + 26, opacity: v.word, transform: [{ translateY: v.word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <View key={ready ? 'fonts' : 'system'} style={{ alignItems: 'center' }}>
          <Text style={s.name}>Bulos 3D</Text>
          <Text style={s.tag}>Water quality digital twin</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  at: { position: 'absolute' },
  ring: { position: 'absolute', width: LOGO, height: LOGO, borderRadius: LOGO / 2, borderWidth: 2, borderColor: C.primary },
  words: { position: 'absolute', left: 0, right: 0 },
  name: { fontSize: 34, fontWeight: '700', color: C.ink, letterSpacing: -0.6 },
  tag: { fontSize: 15, color: C.ink2, marginTop: 4 },
});
