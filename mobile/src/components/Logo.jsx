import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Bulos 3D official brand mark.
 * Integrates the geometric water drop, Mt. Isarog watershed contour waves,
 * and the digital twin telemetry core.
 */
export default function Logo({ size = 42 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#071b2f" />
          <Stop offset="0.5" stopColor="#0a2540" />
          <Stop offset="1" stopColor="#061524" />
        </LinearGradient>
        <LinearGradient id="dropWave" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#38bdf8" />
          <Stop offset="0.5" stopColor="#00f2fe" />
          <Stop offset="1" stopColor="#0ea5e9" />
        </LinearGradient>
      </Defs>

      {/* App Icon Squircle Base */}
      <Rect x="4" y="4" width="92" height="92" rx="24" fill="url(#bg)" stroke="#1e3a5f" strokeWidth="1.5" />

      {/* Contour Wave & Droplet Geometry */}
      <G>
        {/* Droplet Frame */}
        <Path
          d="M 50 16 C 41 28, 24 51, 24 68 A 26 26 0 0 0 76 68 C 76 51, 59 28, 50 16 Z"
          fill="none"
          stroke="url(#dropWave)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* Isarog Watershed Wave Contours */}
        <Path d="M 32 63 C 40 57, 50 66, 59 60 C 64 57, 68 59, 71 64" fill="none" stroke="url(#dropWave)" strokeWidth="2.4" strokeLinecap="round" />
        <Path d="M 29 73 C 38 67, 48 75, 58 70 C 65 66, 69 69, 73 72" fill="none" stroke="url(#dropWave)" strokeWidth="2.4" strokeLinecap="round" />

        {/* Digital Twin Sensor Node Core */}
        <Circle cx="50" cy="46" r="8" fill="none" stroke="#00f2fe" strokeWidth="1" opacity={0.5} />
        <Circle cx="50" cy="46" r="4" fill="#ffffff" />

        {/* Accent Telemetry Beacons */}
        <Circle cx="35" cy="63" r="2.2" fill="#34d399" />
        <Circle cx="66" cy="70" r="2.2" fill="#38bdf8" />
      </G>
    </Svg>
  );
}
