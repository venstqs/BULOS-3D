import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { rgbCss } from '../lib/water';
import { useReducedMotion } from './motion';

/** Two periods of a wave, drawn once and slid sideways so the motion runs on the native side. */
function wavePath(period, top, amp, height) {
  return `M0 ${top} q ${period / 4} ${-2 * amp} ${period / 2} 0 t ${period / 2} 0 t ${period / 2} 0 t ${period / 2} 0 V ${height} H 0 Z`;
}

export function Wave({ period, height, top, amp, fill, opacity = 1, duration, still, reverse }) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x, duration, still]);
  const shift = x.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-period, 0] : [0, -period] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity, transform: [{ translateX: shift }] }}>
      <Svg width={period * 2} height={height}><Path d={wavePath(period, top, amp, height)} fill={fill} /></Svg>
    </Animated.View>
  );
}

/**
 * A round sample of the river. The water is the colour the simulator says it is right now,
 * so dirty water looks dirty before anyone reads a number. It fills up when it first appears.
 */
export default function WaterDisc({ size = 160, rgb = [51, 168, 255], still = false, children, style }) {
  const reduced = useReducedMotion();
  const calm = still || reduced;
  const [fill] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (calm) { fill.setValue(1); return; }
    Animated.timing(fill, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fill, calm]);
  const top = size * 0.17;
  const amp = Math.max(1.5, size * 0.022);
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#e9f1ff' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: fill.interpolate({ inputRange: [0, 1], outputRange: [size * 0.86, 0] }) }] }]}>
        <Wave period={size} height={size} top={top} amp={amp} fill={rgbCss(rgb)} duration={5200} still={calm} reverse />
        <Wave period={size} height={size} top={top + amp * 1.6} amp={amp * 0.8} fill={rgbCss(rgb, 0.76)} duration={3800} still={calm} />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingTop: size * 0.12 }]}>{children}</View>
    </View>
  );
}
