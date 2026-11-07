import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Contours } from './Art';
import { Wave } from './WaterDisc';
import { useReducedMotion } from './motion';
import { SKY } from '../lib/theme';

const EDGE = 34;
const ORDER = ['calm', 'watch', 'alert'];

/** Which colour the top of the app should be, from the state of the whole river. */
export function moodOf(sum) {
  if (!sum?.attention.length) return 'calm';
  return sum.worst.risk >= 0.45 || sum.coming.length ? 'alert' : 'watch';
}

/** The band of water across the top of a section. Its colour follows the river; its lower edge is always moving. */
export default function Sky({ mood = 'calm', children }) {
  const { width } = useWindowDimensions();
  const [high, setHigh] = useState(200);
  const top = useSafeAreaInsets().top;
  const reduced = useReducedMotion();
  const [m] = useState(() => new Animated.Value(ORDER.indexOf(mood)));
  useEffect(() => {
    Animated.timing(m, { toValue: ORDER.indexOf(mood), duration: reduced ? 1 : 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [m, mood, reduced]);
  const show = (i) => m.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
  return (
    <View style={[s.band, { paddingTop: top + 12 }]} onLayout={(e) => setHigh(e.nativeEvent.layout.height)}>
      <View style={[s.above, { backgroundColor: SKY[mood] }]} />
      {ORDER.map((k, i) => (
        <Animated.View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: SKY[k], opacity: show(i) }]} />
      ))}
      <Contours width={width} height={high} />
      {children}
      <View pointerEvents="none" style={s.edge}>
        <Wave period={width} height={EDGE} top={16} amp={5} fill="#fff" opacity={0.35} duration={9000} still={reduced} reverse />
        <Wave period={width} height={EDGE} top={20} amp={5} fill="#fff" duration={6500} still={reduced} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  band: { paddingHorizontal: 20, paddingBottom: EDGE + 8 },
  above: { position: 'absolute', left: 0, right: 0, top: -900, height: 900 },
  edge: { position: 'absolute', left: 0, right: 0, bottom: -1, height: EDGE },
});
