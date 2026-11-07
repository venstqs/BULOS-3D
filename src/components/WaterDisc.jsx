const wave = (p, top, amp, h) => `M0 ${top} q ${p / 4} ${-2 * amp} ${p / 2} 0 t ${p / 2} 0 t ${p / 2} 0 t ${p / 2} 0 V ${h} H 0 Z`;
const shade = (rgb, k) => `rgb(${rgb.map((v) => Math.round(v * k)).join(',')})`;

/** A round sample of the river in its real simulated colour, the same as in the mobile app. */
export default function WaterDisc({ size = 112, rgb = [51, 168, 255], still = false, children, className = '' }) {
  const top = size * 0.17;
  const amp = Math.max(1.5, size * 0.022);
  return (
    <div className={`water-disc ${className}`} style={{ width: size, height: size }} data-still={still || undefined}>
      <div className="water-fill">
        <svg className="water-wave water-back" width={size * 2} height={size} aria-hidden="true"><path d={wave(size, top, amp, size)} fill={shade(rgb, 1)} /></svg>
        <svg className="water-wave water-front" width={size * 2} height={size} aria-hidden="true"><path d={wave(size, top + amp * 1.6, amp * 0.8, size)} fill={shade(rgb, 0.76)} /></svg>
      </div>
      <div className="water-text" style={{ paddingTop: size * 0.12 }}>{children}</div>
    </div>
  );
}
