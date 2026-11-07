import Svg, { Circle, Path } from 'react-native-svg';

// Small drawings for the feature tiles, in place of an icon in a circle.
const line = { fill: 'none', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function SafeArt({ color, size = 84 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Path d="M42 8C33 22 16 36 16 52a26 26 0 0 0 52 0C68 36 51 22 42 8z" fill={color} opacity={0.16} />
      <Path d="M42 8C33 22 16 36 16 52a26 26 0 0 0 52 0C68 36 51 22 42 8z" stroke={color} {...line} />
      <Path d="M30 52l9 9 16-18" stroke={color} {...line} />
    </Svg>
  );
}

export function RiverArt({ color, size = 84 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Path d="M58 4c16 12-22 20-12 34s30 12 8 42" stroke={color} {...line} strokeWidth={9} opacity={0.22} />
      <Path d="M58 4c16 12-22 20-12 34s30 12 8 42" stroke={color} {...line} />
      <Path d="M27 26c-4 6-9 11-9 17a9 9 0 0 0 18 0c0-6-5-11-9-17z" fill={color} />
    </Svg>
  );
}

export function DrillArt({ color, size = 84 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Circle cx="42" cy="42" r="35" fill={color} opacity={0.14} />
      <Circle cx="42" cy="42" r="35" stroke={color} {...line} strokeDasharray="1 11" />
      <Path d="M14 44h14l6-16 11 32 7-16h18" stroke={color} {...line} />
    </Svg>
  );
}

/** Stylised contour lines, the way a topographic map shows a mountain. Width is the screen width. */
export function Contours({ width, height, color = '#fff', opacity = 0.13 }) {
  const rows = [];
  for (let k = 0; k < 7; k += 1) {
    let d = '';
    for (let x = -10; x <= width + 10; x += 14) {
      const y = height * 0.08 + k * (height / 7.5) + 13 * Math.sin(x / 74 + k * 0.7) + 7 * Math.sin(x / 29 + k * 1.9);
      d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    rows.push(<Path key={k} d={d} stroke={color} strokeWidth={1.3} fill="none" />);
  }
  return <Svg width={width} height={height} opacity={opacity} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">{rows}</Svg>;
}
