import Svg, { Circle, Path } from 'react-native-svg';

/** Bulos 3D mark (same as the website favicon). */
export default function Logo({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="32" fill="#2f5be7" />
      <Path d="M32 9.5C25 19 16 27.6 16 37.5a16 16 0 0 0 32 0C48 27.6 39 19 32 9.5z" fill="#fff" />
      <Path d="M22.5 40c3.2-2.6 6.3-2.6 9.5 0s6.3 2.6 9.5 0" fill="none" stroke="#2f5be7" strokeWidth={3.4} strokeLinecap="round" />
    </Svg>
  );
}
