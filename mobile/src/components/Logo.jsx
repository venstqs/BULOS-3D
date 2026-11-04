import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/** Bulos 3D mark (same as the website favicon). */
export default function Logo({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6b7bff" />
          <Stop offset="0.55" stopColor="#2f5be7" />
          <Stop offset="1" stopColor="#2aa6f0" />
        </LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="30" fill="url(#g)" />
      <Path d="M32 12c-6 9-12 15-12 23a12 12 0 0 0 24 0c0-8-6-14-12-23z" fill="#fff" opacity={0.95} />
      <Path d="M24 36c3-2 5 1 8 0s5-2 8 0" fill="none" stroke="#2f5be7" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M26 42c2-1 4 1 6 0s4-1 6 0" fill="none" stroke="#2f5be7" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}
