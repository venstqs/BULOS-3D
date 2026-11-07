/** The Bulos 3D mark, resting on the 3D twin like a watermark. It never takes a click. */
export default function MapWatermark({ className = 'bottom-5 left-5' }) {
  return (
    <div aria-hidden="true" className={`map-watermark ${className}`}>
      <img src="/favicon.svg" alt="" />
      <b>Bulos 3D</b>
    </div>
  );
}
